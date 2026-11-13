import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(packageDir, ".storage-tests-"));
const testFile = path.join(tempDir, "storage.test.mjs");

try {
  await build({
    entryPoints: [path.join(packageDir, "src/routes/storage.test.ts")],
    outfile: testFile,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
  });

  const result = spawnSync(process.execPath, ["--test", testFile], {
    cwd: packageDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
