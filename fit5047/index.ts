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
import { write } from "bun";
import JSZip from "jszip";
import * as path from "node:path";
import { temporaryDirectoryTask } from "tempy";
import { runSuite } from "./suite";

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

export default {
  runner: {
    run: async ({ job }) => {
      const archive = await resolveArchive(job);
      const { results, ...outcome } = await temporaryUnzippedTask(
        archive,
        async (source) => {
          return await runSuite(job, source);
        },
      );

      // Flat, and with the four question scores totalled.
      //
      // A leaderboard turns an output into a row by taking its top-level keys,
      // stringifying anything that is not a scalar. Nested, `results` arrived as
      // a JSON blob in a single cell that nothing could rank on, and there was no
      // one number to rank by in any case — only score1..score4.
      const total = Object.values(results).reduce((sum, s) => sum + s, 0);

      try {
        await outputs.set({
          reference: "open-competition-kit/tag/output/default",
          owner: job,
          value: { ...outcome, ...results, total },
        });
      } catch {
        await jobs.update({ id: job, status: "error" });
        return { status: "error" };
      }
      await jobs.update({ id: job, status: "done" });
      return { status: "done" };
    },
  },
} as Package;

export async function temporaryUnzippedTask<T>(
  archive: Uint8Array | string,
  task: (s: string) => Promise<T>,
) {
  const zip = await JSZip.loadAsync(archive, {
    // A string is the legacy base64 payload; raw bytes come from a FileRef.
    base64: typeof archive === "string",
  });
  return await temporaryDirectoryTask(async (directory: string) => {
    await Promise.all(
      Object.entries(zip.files).map(async ([name, contents]) => {
        if (!contents.dir) {
          await write(
            path.join(directory, name.split(path.sep).slice(1).join(path.sep)),
            await contents.async("arraybuffer"),
          );
        }
      }),
    );
    return await task(directory);
  });
}
