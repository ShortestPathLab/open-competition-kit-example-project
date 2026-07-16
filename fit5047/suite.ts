import { outputs, sandbox, unsafe } from "@open-competition-kit/sdk";
import { isArray } from "es-toolkit/compat";
import { upperCase } from "es-toolkit";
import { zip } from "es-toolkit";
import config, { image, questions } from "./config";

const { min, round } = Math;

/**
 * Evaluates a Pacman submission.
 *
 * Ported from the FIT5222 contest server's app/taskset/suite.ts, with two
 * changes: every run happens in a sandbox rather than in this process, and the
 * benchmarks are measured against public layouts (see ./config.ts).
 *
 * Each question runs its own container. That is slower than reusing one, and
 * deliberate: a submission that wedges its interpreter, exhausts its memory or
 * fills its disk takes nothing with it but its own container.
 */

/** Files a submission may replace. Everything else comes from the image. */
export const bindings = [
  "agents/q2Agent.py",
  "problems/q1a_problem.py",
  "problems/q1b_problem.py",
  "problems/q1c_problem.py",
  "solvers/q1a_solver.py",
  "solvers/q1b_solver.py",
  "solvers/q1c_solver.py",
];

export type Submission = Record<string, Uint8Array>;

const logToJob = (job: string, tail = 256) => {
  return async (...s: string[]) => {
    const lines = s.filter(Boolean);
    if (!lines.length) return;
    const prev = await unsafe(
      outputs.get({ reference: "open-competition-kit/tag/logs", owner: job }),
    );
    const next = isArray(prev) ? [...prev, ...lines].slice(-tail) : lines;
    await outputs.set({
      reference: "open-competition-kit/tag/logs",
      owner: job,
      value: next,
    });
  };
};

const label = (key: string) => `\n# ${upperCase(key)} \n`;

/**
 * Run one command against the submission, confined.
 *
 * Two timeouts, deliberately. `timeout` inside stops the harness the way the
 * course intends and still prints whatever it measured; the sandbox's own limit
 * sits further out and kills a container that ignored the first. Only the inner
 * one produces a score.
 */
async function isolated(
  files: Submission,
  command: string[],
  timeLimit: number,
) {
  const result = await unsafe(
    sandbox.run({
      image,
      command: [
        "timeout",
        "--kill-after=10",
        `${timeLimit + 10}`,
        ...command,
      ],
      files: Object.fromEntries(
        Object.entries(files).map(([p, body]) => [`/runner/${p}`, body]),
      ),
      cwd: "/runner",
      timeoutMs: (timeLimit + 30) * 1000,
      limits: { memoryMb: 2048, cpus: 1 },
    }),
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    elapsed: result.elapsedMs,
  };
}

/** Pull the numbers the harness prints out of a run. */
function parse(out: string, err: string, code: number) {
  const result = { err: "", cost: 0.0, expansions: 0.0, score: 0.0 };

  if (out.includes("Pacman crashed")) {
    if (
      out.includes("Agent 0 timed out!") ||
      out.includes("Agent 0 ran out of time!")
    ) {
      result.err += "Pacman ran out of planning time during play \n";
    }
    if (out.includes("Agent 0 ran out of time on startup!")) {
      result.err += "Pacman ran out of time in registerInitialState \n";
    }
    result.err += "Pacman crashed\n";
  } else if (code !== 0) {
    result.err += "Pacman ran out of time\n";
  }

  const pathMatch = out.match(/pathLength: \[(\d+)\]/);
  if (pathMatch?.[1]) result.cost = parseFloat(pathMatch[1]);

  const expMatch = out.match(/Number of node expansions: (\d+)/);
  if (expMatch?.[1]) result.expansions = parseFloat(expMatch[1]);

  const scoreMatch = out.match(/Scores:\s*(-?\d+\.\d+)/);
  if (scoreMatch?.[1]) result.score = parseFloat(scoreMatch[1]);

  if (err) result.err += err;
  return result;
}

async function runSearch(
  files: Submission,
  instance: string,
  q: string,
  timeLimit: number,
) {
  const { stdout, stderr, code, elapsed } = await isolated(
    files,
    [
      "python3",
      "pacman.py",
      "-l",
      instance,
      "-p",
      "SearchAgent",
      "-a",
      `fn=${q}_solver,prob=${q}_problem`,
      `--timeout=${timeLimit}`,
      "--quietTextGraphics",
      "--fixRandomSeed",
    ],
    timeLimit,
  );
  return { ...parse(stdout, stderr, code), elapsed };
}

async function runAgent(
  files: Submission,
  instance: string,
  q: string,
  timeLimit: number,
) {
  const { stdout, stderr, code, elapsed } = await isolated(
    files,
    [
      "python3",
      "pacman.py",
      "-l",
      instance,
      "-p",
      `${q.toUpperCase()}_Agent`,
      `--timeout=${timeLimit}`,
      "--quietTextGraphics",
      "--fixRandomSeed",
    ],
    timeLimit,
  );
  return { ...parse(stdout, stderr, code), elapsed };
}

export async function runSuite(job: string, files: Submission) {
  console.log(`Starting evaluation of submission ${job}`);

  const results = { score1: 0, score2: 0, score3: 0, score4: 0 };
  let runtime = 0;
  let warning = false;
  const log = logToJob(job);
  const asked = (q: string) => questions.includes(q);

  const finalise = async (elapsed: number, error: string) => {
    runtime += elapsed;
    if (error) {
      warning = true;
      console.error(error);
    }
    await log(error);
  };

  try {
    await log(`Running ${questions.join(", ")}...`);

    if (asked("q1a")) {
      await log(label("Q1a"));
      for (const [instance, benchmark] of config.q1InstancesAndScores) {
        const { cost, elapsed, err } = await runSearch(files, instance, "q1a", 1);
        teardown: {
          if (cost <= 0) break teardown;
          // Nothing beats an optimal path. Shorter than the benchmark means the
          // cost is not the path's, so it earns nothing.
          if (cost < benchmark) {
            await log(
              `Final path length on ${instance} was less than optimal`,
              `${instance} score = 0`,
            );
            break teardown;
          }
          const score = (benchmark * 1000) / cost;
          results.score1 += score / 1000;
          await log(`${instance} score = ${round(score) / 1000}`);
        }
        await finalise(elapsed, err);
      }
    }

    if (asked("q1b")) {
      await log(label("Q1b"));
      for (const [
        [instance, benchmark] = ["", 0],
        optimalPathLength = 0,
      ] of zip(
        config.q1bInstancesAndScores as unknown as [string, number][],
        config.q1bOptimalPathLengths as unknown as number[],
      )) {
        const { expansions, elapsed, err } = await runSearch(
          files,
          instance,
          "q1b",
          5,
        );
        teardown: {
          if (expansions <= 0) break teardown;
          if (expansions < optimalPathLength) {
            await log(
              `Number of expansions was less than optimal path length on ${instance}`,
              `${instance} score = 0`,
            );
            break teardown;
          }
          const score = min(1 * 1000, (benchmark * 1000) / expansions);
          results.score2 += score / 1000;
          await log(`${instance} score = ${round(score) / 1000}`);
        }
        await finalise(elapsed, err);
      }
    }

    if (asked("q1c")) {
      await log(label("Q1c"));
      for (const [instance, benchmark] of config.q1cInstancesAndScores) {
        const { score: raw, elapsed, err } = await runSearch(
          files,
          instance,
          "q1c",
          10,
        );
        teardown: {
          if (raw <= 0) {
            await log(`${instance} score = 0`);
            break teardown;
          }
          const score = min(1 * 1000, (raw * 1000) / benchmark);
          results.score3 += score / 1000;
          await log(`${instance} score = ${round(score) / 1000}`);
        }
        await finalise(elapsed, err);
      }
    }

    if (asked("q2")) {
      await log(label("Q2"));
      for (const [instance, benchmark] of config.q2InstancesAndScores) {
        const { score: raw, elapsed, err } = await runAgent(
          files,
          instance,
          "q2",
          30,
        );
        teardown: {
          if (raw <= 0) {
            await log(`${instance} score = 0`);
            break teardown;
          }
          const score = min(1 * 1000, (raw * 1000) / benchmark);
          results.score4 += score / 1000;
          await log(`${instance} score = ${round(score) / 1000}`);
        }
        await finalise(elapsed, err);
      }
    }
  } catch (e) {
    warning = true;
    console.error(e);
    await log(`Evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    console.log("Overall submission results:");
    console.log(results);
    console.log("Evaluation complete");
  }
  return { status: "success", results, runtime, warning };
}
