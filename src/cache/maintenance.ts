import { rm } from "node:fs/promises";
import { gitpulseCacheDir } from "./paths";

type Env = Record<string, string | undefined>;

export async function clearCache(env: Env = process.env): Promise<string> {
  const directory = gitpulseCacheDir(env);
  await rm(directory, { recursive: true, force: true });
  return directory;
}
