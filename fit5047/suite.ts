import { jobs, outputs, reference, unsafe } from "@open-competition-kit/sdk";
import { once, trim, upperCase } from "es-toolkit";
import { isArray } from "es-toolkit/compat";
import { $ } from "bun";
import { join } from "node:path";

const setup = once(() => $`bash ${import.meta.dir}/setup.sh`);
const bindings = [
  "/agents/q2Agent.py",
  "/problems/q1a_problem.py",
  "/problems/q1b_problem.py",
  "/problems/q1c_problem.py",
  "/solvers/q1a_solver.py",
  "/solvers/q1b_solver.py",
  "/solvers/q1c_solver.py",
];
async function runOne(source: string, s: ReturnType<typeof $>) {
  await setup();
  for (const binding of bindings) {
    await $`cp ${join(source, binding)} ${join("/runner/pacman", binding)}`;
  }
  const start = Date.now();
  const { stdout, exitCode, stderr } = await s.cwd("/runner/pacman");

  return {
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    code: exitCode,
    elapsed: Date.now() - start,
  };
}

const logToJob = (job: string, tail = 256) => {
  return async (...s: string[]) => {
    const prev = await unsafe(
      outputs.get({ reference: "open-competition-kit/tag/logs", owner: job }),
    );
    const next = isArray(prev) ? [...prev, ...s].slice(-tail) : s;
    await outputs.set({
      reference: "open-competition-kit/tag/logs",
      owner: job,
      value: next,
    });
  };
};

const config = {
  max: { score1: 4, score2: 6, score3: 10, score4: 35 },
  q1InstancesAndScores: [
    ["layouts/q1a_bigMaze.lay", 123.0],
    ["layouts/q1a_bigMaze.lay", 207.0],
    ["layouts/q1a_bigMaze.lay", 454.0],
    ["layouts/q1a_bigMaze.lay", 932.0],
  ],
} as const;
const { round } = Math;

function label(key: string) {
  return `\n# ${upperCase(key)} \n`;
}

export async function runSuite(job: string, source: string) {
  console.log(`Starting evaluation of submission ${job}`);

  // store the results
  const results = { score1: 0, score2: 0, score3: 0, score4: 0 };
  let runtime = 0;
  let warning = false;
  const log = logToJob(job);

  const finalise = async (elapsed: number, error: string) => {
    runtime += elapsed;
    if (error) {
      warning = true;
      console.error(error);
    }
    await log(error);
  };
  try {
    await log("Running validation...");
    await log("Validation passed.");

    await log(label("Q1a"));
    for (const [instance, benchmarkScore] of config.q1InstancesAndScores) {
      const { cost, elapsed, err } = await runQ1(
        source,
        instance,
        "q1a",
        1,
        job,
      );
      teardown: {
        if (cost <= 0) break teardown;
        if (cost < benchmarkScore) {
          await log(
            `Final path length on ${instance} was less than optimal`,
            `${instance} score = ${0}`,
          );
          break teardown;
        }
        const score = (benchmarkScore * 1000) / cost;
        results.score1 += score / 1000;
        await log(`${instance} score = ${round(score) / 1000}`);
      }
      await finalise(elapsed, err);
    }
  } catch (e) {
    console.error(e);
  } finally {
    console.log("Overall submission results:");
    console.log(results);
    console.log("Evaluation complete");
    return { status: "success", results, runtime, warning };
  }
}

async function runQ1(
  source: string,
  instance: string,
  q: string,
  timeLimit: number,
  job: string,
) {
  const { stdout, stderr, code, elapsed } = await runOne(
    source,
    $`python3 pacman.py -l ${instance} -p SearchAgent -a fn=${q}_solver,prob=${q}_problem --timeout ${timeLimit} --quietTextGraphics --fixRandomSeed`,
  );
  const out = stdout;
  const err = stderr;

  const result = { err: "", cost: 0.0, expansions: 0.0, score: 0.0, elapsed };

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
  } else {
    const pathMatch = out.match(/pathLength: \[(\d+)\]\n/);
    if (pathMatch?.[1]) result.cost = parseFloat(pathMatch[1]);

    const expMatch = out.match(/Number of node expansions: (\d+)\n/);
    if (expMatch?.[1]) result.expansions = parseFloat(expMatch[1]);

    const scoreMatch = out.match(/Scores:\s*(\d+\.\d+)\n/);
    if (scoreMatch?.[1]) result.score = parseFloat(scoreMatch[1]);
  }

  if (err) result.err += err;

  return result;
}
