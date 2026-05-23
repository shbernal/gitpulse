import type { GitHubClient } from "../github/client";
import { collectUserProfileSnapshot, createUserProfileFailure } from "../metrics/user-profile";
import type { SnapshotError, UserProfileResult, UserProfileSnapshot, UserProfileWithSource } from "../types";
import { parseGitHubLogin } from "../util/github-login";
import { cacheAgeHours, cacheSource, isFreshCache, type CacheMode } from "./policy";
import {
  readCachedUserProfileSnapshot,
  writeCachedUserProfileSnapshot,
  type CachedUserProfileSnapshot,
} from "./user-store";

type Env = Record<string, string | undefined>;

export type UserProfileResolverOptions = {
  cacheEnabled: boolean;
  maxCacheHours: number;
  staleIfError: boolean;
  mode: CacheMode;
  now?: Date;
  env?: Env;
};

export async function resolveUserProfileSnapshot(
  client: GitHubClient,
  input: string,
  options: UserProfileResolverOptions,
): Promise<UserProfileWithSource> {
  const now = options.now ?? new Date();
  let login: string;

  try {
    login = parseGitHubLogin(input);
  } catch (error) {
    return {
      result: createUserProfileFailure(input, error),
      source: { kind: "none" },
    };
  }

  const shouldReadCache = options.mode !== "refresh" && (options.cacheEnabled || options.mode === "offline");
  const cached = shouldReadCache ? await tryReadCache(login, input, options.env) : { entry: null, failure: null };

  if (cached.failure && options.mode === "offline") {
    return {
      result: cached.failure,
      source: { kind: "none" },
    };
  }

  if (cached.entry) {
    const source = cacheSource(cached.entry.cachedAt, options.maxCacheHours, now);

    if (options.mode === "offline" || isFreshCache(cached.entry.cachedAt, options.maxCacheHours, now)) {
      return {
        result: { ok: true, snapshot: cached.entry.snapshot },
        source,
      };
    }
  }

  if (options.mode === "offline") {
    return {
      result: createUserProfileFailure(input, new Error(`No cached user profile snapshot for ${input}. Run without --offline first.`)),
      source: { kind: "none" },
    };
  }

  const apiResult = await collectUserProfileSnapshot(client, input, now);

  if (apiResult.ok) {
    if (options.cacheEnabled) {
      await tryWriteCache(apiResult.snapshot.profile.login, apiResult.snapshot, now, options.env);
    }

    return {
      result: apiResult,
      source: { kind: "api" },
    };
  }

  if (cached.entry && options.staleIfError && options.mode !== "refresh") {
    return {
      result: { ok: true, snapshot: cached.entry.snapshot },
      source: {
        kind: "stale-cache",
        cachedAt: cached.entry.cachedAt,
        ageHours: cacheAgeHours(cached.entry.cachedAt, now),
        refreshError: apiResult.error,
      },
    };
  }

  return {
    result: apiResult,
    source: { kind: "api" },
  };
}

async function tryWriteCache(
  login: string,
  snapshot: UserProfileSnapshot,
  now: Date,
  env: Env | undefined,
): Promise<void> {
  try {
    await writeCachedUserProfileSnapshot(login, snapshot, now, env);
  } catch {
    // Cache writes must not prevent a live API result from being shown.
  }
}

async function tryReadCache(
  login: string,
  input: string,
  env: Env | undefined,
): Promise<{ entry: CachedUserProfileSnapshot | null; failure: UserProfileResult | null }> {
  try {
    return {
      entry: await readCachedUserProfileSnapshot(login, env),
      failure: null,
    };
  } catch (error) {
    const snapshotError = errorToSnapshotError(error);

    return {
      entry: null,
      failure: {
        ok: false,
        login,
        input,
        error: {
          ...snapshotError,
          message: `Could not read cached user profile snapshot for ${input}: ${snapshotError.message}`,
        },
      },
    };
  }
}

function errorToSnapshotError(error: unknown): SnapshotError {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
    };
  }

  return {
    message: "Unknown error.",
    code: "unknown",
  };
}
