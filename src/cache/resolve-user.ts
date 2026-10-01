import type { GitHubClient } from "../github/client";
import { collectUserProfileSnapshot, createUserProfileFailure } from "../metrics/user-profile";
import type { UserProfileSnapshot, UserProfileWithSource } from "../types";
import { parseGitHubLogin } from "../util/github-login";
import { resolveCacheFirst, type CachePolicyOptions } from "./cache-first";
import { readCachedUserProfileSnapshot, writeCachedUserProfileSnapshot } from "./user-store";

type Env = Record<string, string | undefined>;

export type UserProfileResolverOptions = CachePolicyOptions & {
  env?: Env;
};

export async function resolveUserProfileSnapshot(
  client: GitHubClient,
  input: string,
  options: UserProfileResolverOptions,
): Promise<UserProfileWithSource> {
  let login: string;

  try {
    login = parseGitHubLogin(input);
  } catch (error) {
    return {
      result: createUserProfileFailure(input, error),
      source: { kind: "none" },
    };
  }

  return resolveCacheFirst<UserProfileSnapshot, UserProfileWithSource["result"]>(options, {
    label: `cached user profile snapshot for ${input}`,
    read: async () => {
      const entry = await readCachedUserProfileSnapshot(login, options.env);
      return entry ? { cachedAt: entry.cachedAt, value: entry.snapshot } : null;
    },
    write: (snapshot, now) => writeCachedUserProfileSnapshot(snapshot.profile.login, snapshot, now, options.env),
    fetch: async (now) => {
      const result = await collectUserProfileSnapshot(client, input, now);
      return result.ok ? { ok: true, value: result.snapshot } : result;
    },
    succeed: (snapshot) => ({ ok: true, snapshot }),
    fail: (error) => ({ ok: false, login, input, error }),
  });
}
