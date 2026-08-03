"""Scoring a Pacman submission.

The whole of the FIT5047 evaluation, as one file. The kit runs `plan` once to
find out what there is to do, `evaluate` once per instance in a container of its
own, and `reduce` once to turn the measurements into the row the leaderboard
reads.

## Where the split falls

`evaluate` measures and does not mark. It runs the harness against one layout and
reports what came back: a path length, a number of expansions, a game score. The
benchmarks it would be compared against stay in `cases.yaml`, which `plan` and
`reduce` read and `evaluate` never opens.

That is deliberate. `evaluate` shares a container with the submitted agent, so
anything it can read, a determined submission can read too. `plan` and `reduce`
run with no submission anywhere near them, which makes them the right place for
anything the competition would rather keep.

## These are not the real marking benchmarks

The real course scores against `eval_q1a_4.lay`, `eval_q1b_2.lay` and 53 more
that are withheld from students. Only the practice layouts ship, so the numbers
in `cases.yaml` were measured by running a reference solution against each
practice layout in the evaluation image. That makes them reproducible and puts
the reference at roughly 1.0 per instance. It does not make them the marking
scheme. Swap in the real layouts and numbers and nothing here changes.
"""

import os
import re
import subprocess
import time

import yaml

HARNESS = "/runner"
CASES = "cases.yaml"


def load_cases():
    """Every instance, with what it is worth.

    Read here rather than passed in through the config, because the kit has no
    opinion about what a case is: `plan` returns a list and the kit hands each
    element back to `evaluate` untouched.
    """
    with open(CASES) as handle:
        return yaml.safe_load(handle)


def plan(params):
    """One case per instance, for the questions this competition is running.

    The full suite is 43 instances and takes minutes per submission. `questions`
    in the config narrows it, which is what you want while setting a competition
    up: q1a alone is seconds.

    No benchmark travels with a case. `evaluate` is given the layout, the time
    limit and how to invoke the agent, and nothing that says what a good answer
    looks like.
    """
    asked = params.get("questions") or ["q1a"]
    cases = load_cases()

    plan = []
    for question in asked:
        for instance in cases[question]["instances"]:
            plan.append(
                {
                    "question": question,
                    "layout": instance["layout"],
                    "timeLimit": cases[question]["timeLimit"],
                    "mode": cases[question]["mode"],
                }
            )
    return plan


def parse(stdout, stderr, code):
    """The numbers the harness prints, out of the run that printed them."""
    measured = {"cost": 0.0, "expansions": 0.0, "raw": 0.0, "error": ""}

    if "Pacman crashed" in stdout:
        if "Agent 0 timed out!" in stdout or "Agent 0 ran out of time!" in stdout:
            measured["error"] += "Pacman ran out of planning time during play\n"
        if "Agent 0 ran out of time on startup!" in stdout:
            measured["error"] += "Pacman ran out of time in registerInitialState\n"
        measured["error"] += "Pacman crashed\n"
    elif code != 0:
        measured["error"] += "Pacman ran out of time\n"

    path = re.search(r"pathLength: \[(\d+)\]", stdout)
    if path:
        measured["cost"] = float(path.group(1))

    expansions = re.search(r"Number of node expansions: (\d+)", stdout)
    if expansions:
        measured["expansions"] = float(expansions.group(1))

    score = re.search(r"Scores:\s*(-?\d+\.\d+)", stdout)
    if score:
        measured["raw"] = float(score.group(1))

    if stderr:
        measured["error"] += stderr

    return measured


def command(case):
    """How to invoke the harness for this question.

    `search` runs a solver through SearchAgent; `agent` runs a reflex agent
    against ghosts. The two differ only in these arguments.
    """
    question = case["question"]
    if case["mode"] == "search":
        return [
            "-p",
            "SearchAgent",
            "-a",
            "fn=%s_solver,prob=%s_problem" % (question, question),
        ]
    return ["-p", "%s_Agent" % question.upper()]


def evaluate(case, submission):
    """Run one instance, and report what came back.

    The submission is laid over the copy of the harness in this container, which
    is thrown away with it. Nothing else from the archive is here: the kit
    dropped everything outside `submission.allow` before the container started,
    so an edited `pacman.py` or an extra `sitecustomize.py` never arrived.

    Two time limits, deliberately. The inner `--timeout` is the one the course
    intends and still prints whatever it measured; the sandbox's own limit sits
    further out and kills a container that ignored the first.
    """
    if not os.path.isdir(HARNESS):
        # An image built from the wrong Dockerfile. Worth saying once, because
        # every case would otherwise fail with a FileNotFoundError that names a
        # layout and explains nothing.
        raise RuntimeError(
            "No harness at %s. The evaluation image is built from "
            "pacman.dockerfile; this is not that image." % HARNESS
        )

    submission.copy_into(HARNESS)

    limit = case["timeLimit"]
    started = time.monotonic()
    run = subprocess.run(
        [
            "timeout",
            "--kill-after=10",
            str(limit + 10),
            "python3",
            "pacman.py",
            "-l",
            case["layout"],
            "--timeout=%d" % limit,
            "--quietTextGraphics",
            "--fixRandomSeed",
        ]
        + command(case),
        cwd=HARNESS,
        capture_output=True,
        text=True,
    )

    elapsed = (time.monotonic() - started) * 1000
    measured = parse(run.stdout, run.stderr, run.returncode)

    # Printed rather than returned: standard output is the job's log, and a
    # competitor working out why their agent crashed wants the harness's own
    # words rather than a summary of them.
    if measured["error"]:
        print("%s: %s" % (case["layout"], measured["error"].strip()))

    return {
        "layout": case["layout"],
        "question": case["question"],
        "cost": measured["cost"],
        "expansions": measured["expansions"],
        "raw": measured["raw"],
        "runtime": round(elapsed),
    }


def score(case, measured, benchmark, floor):
    """One instance's mark, from what it measured.

    Each instance is worth at most 1, so a question's maximum is its instance
    count. That is why the totals here are 10/11/11/11 rather than the course's
    4/6/10/35: different layouts, different count.
    """
    question = case["question"]

    # `.get` throughout, because a case whose container died reports an empty
    # result rather than no result. Scoring it as zero is right; raising a
    # KeyError over it would lose the other forty.
    if question == "q1a":
        # The benchmark is the optimal cost, and nothing beats optimal. A path
        # shorter than it is not a path, so it earns nothing.
        cost = measured.get("cost", 0.0)
        if cost <= 0 or cost < benchmark:
            return 0.0
        return benchmark / cost

    if question == "q1b":
        # Scored on expansions rather than cost: the point is the heuristic, and
        # a better one explores less. A search cannot expand fewer nodes than the
        # path it returns is long, so anything under the optimal path length is a
        # broken heuristic or a hardcoded answer.
        expansions = measured.get("expansions", 0.0)
        if expansions <= 0 or expansions < floor:
            return 0.0
        return min(1.0, benchmark / expansions)

    # q1c and q2 are both scored on the game's own score.
    raw = measured.get("raw", 0.0)
    if raw <= 0:
        return 0.0
    return min(1.0, raw / benchmark)


def reduce(results, cases):
    """The leaderboard row.

    Flat, and totalled. A board builds a row from an output's top-level keys and
    stringifies anything else, so a nested per-question breakdown would arrive as
    a JSON blob in one cell with nothing to rank on.

    This is where the benchmarks are read and applied, in a container with no
    submission in it.
    """
    table = load_cases()

    benchmarks = {}
    floors = {}
    for question, block in table.items():
        for instance in block["instances"]:
            benchmarks[instance["layout"]] = instance["benchmark"]
            floors[instance["layout"]] = instance.get("floor", 0)

    per_question = {}
    runtime = 0.0

    for case, measured in zip(cases, results):
        if not case or not measured:
            continue
        layout = case["layout"]
        marked = score(case, measured, benchmarks[layout], floors[layout])
        key = "score_%s" % case["question"]
        per_question[key] = per_question.get(key, 0.0) + marked
        runtime += measured.get("runtime", 0.0)

    row = {"total": round(sum(per_question.values()), 3), "runtime": round(runtime)}
    for key, value in per_question.items():
        row[key] = round(value, 3)
    return row
