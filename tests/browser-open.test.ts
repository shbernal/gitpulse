import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserOpenCommand, openUrlInBrowser } from "../src/browser";

const url = "https://github.com/acme/tool";
const originalPath = process.env.PATH;
const directories: string[] = [];

afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** Replaces PATH with a directory holding only a fake platform launcher that exits with `code`. */
async function fakeLauncher(code: number | null): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "gitpulse-browser-"));
  directories.push(directory);

  if (code !== null) {
    const launcher = path.join(directory, browserOpenCommand(url).command);
    await writeFile(launcher, `#!/bin/sh\nexit ${code}\n`);
    await chmod(launcher, 0o755);
  }

  process.env.PATH = directory;
}

describe.skipIf(process.platform === "win32")("opening the browser", () => {
  test("resolves when the launcher succeeds", async () => {
    await fakeLauncher(0);

    await expect(openUrlInBrowser(url)).resolves.toBeUndefined();
  });

  test("names the exit code when the launcher fails", async () => {
    await fakeLauncher(3);
    const { command } = browserOpenCommand(url);

    await expect(openUrlInBrowser(url)).rejects.toThrow(`Could not open ${url}: ${command} exited with exit code 3.`);
  });

  test("reports a missing launcher", async () => {
    await fakeLauncher(null);

    await expect(openUrlInBrowser(url)).rejects.toThrow(`Could not open ${url}: `);
  });
});
