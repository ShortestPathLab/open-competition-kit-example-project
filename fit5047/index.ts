import {
  cast,
  files,
  isFile,
  jobs,
  outputs,
  reference,
  unsafe,
  type Package,
} from "@open-competition-kit/sdk";
import JSZip from "jszip";
import { bindings, runSuite, type Submission } from "./suite";

/**
 * The submission archive, however the integration handed it over.
 *
 * Prefers a `FileRef`, which is what `github-classic` now writes: the bytes live
 * in the large-file backend and stream out of it, so an archive is no longer
 * capped by what will fit in a database row. Falls back to the legacy base64
 * context value so jobs created before that migration still run.
 */
async function resolveArchive(job: string): Promise<Uint8Array | string> {
  const ref = await cast<unknown>()(
    jobs.context.get({
      owner: job,
      reference: reference.std.submissionSource,
    }),
  );

  if (!ref.error && isFile(ref.value)) {
    const stream = await unsafe(files.read(ref.value));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return await unsafe(
    cast<string>()(
      jobs.context.require({
        reference: reference.std.submissionSourceCodeZipB64,
        owner: job,
      }),
    ),
  );
}

/**
 * Take only the files a submission is allowed to change.
 *
 * The harness itself lives in the image, so nothing else in the archive is read
 * — a submission cannot smuggle in an edited pacman.py, a rewritten layout, or a
 * sitecustomize.py that runs before the evaluation does. It is also why the
 * archive never touches a disk here: seven files are read out of it in memory
 * and handed to the sandbox.
 *
 * GitHub archives are wrapped in a single top-level directory, so paths are
 * matched by suffix rather than assuming its name.
 */
async function readSubmission(
  archive: Uint8Array | string,
): Promise<Submission> {
  const zip = await JSZip.loadAsync(archive, {
    // A string is the legacy base64 payload; raw bytes come from a FileRef.
    base64: typeof archive === "string",
  });

  const submission: Submission = {};
  const missing: string[] = [];

  for (const binding of bindings) {
    const entry = zip.file(new RegExp(`(^|/)${binding}$`))[0];
    if (!entry) {
      missing.push(binding);
      continue;
    }
    submission[binding] = new Uint8Array(await entry.async("arraybuffer"));
  }

  if (missing.length) {
    throw new Error(`Submission is missing: ${missing.join(", ")}`);
  }
  return submission;
}

export default {
  runner: {
    run: async ({ job }) => {
      try {
        const archive = await resolveArchive(job);
        const submission = await readSubmission(archive);
        const { results, ...outcome } = await runSuite(job, submission);

        // Flat, and with the question scores totalled.
        //
        // A leaderboard builds a row from an output's top-level keys and
        // stringifies anything that is not a scalar. Nested, `results` arrived as
        // a JSON blob in a single cell that nothing could rank on, and there was
        // no one number to rank by regardless.
        const total = Object.values(results).reduce((sum, s) => sum + s, 0);

        await outputs.set({
          reference: "open-competition-kit/tag/output/default",
          owner: job,
          value: { ...outcome, ...results, total },
        });
      } catch (e) {
        // A submission that cannot be read, or an evaluation that fell over, is
        // the job's failure — not the runner's. Record it and move on, or one
        // bad archive stops every job behind it.
        console.error(`[fit5047] job ${job} failed:`, e);
        await outputs
          .set({
            reference: "open-competition-kit/tag/logs",
            owner: job,
            value: [e instanceof Error ? e.message : String(e)],
          })
          .catch(() => undefined);
        await jobs.update({ id: job, status: "error" });
        return { status: "error" };
      }

      await jobs.update({ id: job, status: "done" });
      return { status: "done" };
    },
  },
} as Package;
