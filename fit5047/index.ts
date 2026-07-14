import {
  cast,
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

export default {
  runner: {
    run: async ({ job }) => {
      const b64 = await unsafe(
        cast<string>()(
          jobs.context.require({
            reference: reference.std.submissionSourceCodeZipB64,
            owner: job,
          }),
        ),
      );
      const results = await temporaryUnzippedTask(b64, async (source) => {
        return await runSuite(job, source);
      });
      try {
        await outputs.set({
          reference: "open-competition-kit/tag/output/default",
          owner: job,
          value: results,
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
  base64Zip: string,
  task: (s: string) => Promise<T>,
) {
  const zip = await JSZip.loadAsync(base64Zip, { base64: true });
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
