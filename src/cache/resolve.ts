import type { GitHubClient } from "../github/client";
import { collectSnapshot, createSnapshotFailure } from "../metrics/snapshot";
import type { RepoRef, SnapshotError, SnapshotResult, SnapshotWithSource } from "../types";
import { parseRepoRef } from "../util/repo-ref";
import { cacheAgeHours, cacheSource, isFreshCache, type CacheMode } from "./policy";
import { readCachedSnapshot, writeCachedSnapshot, type CachedSnapshot } from "./store";

type Env = Record<string, string | undefined>;

export type SnapshotResolverOptions = {
  cacheEnabled: boolean;
  maxCacheHours: number;
  staleIfError: boolean;
  mode: CacheMode;
  now?: Date;
  env?: Env;
};

export async function resolveSnapshot(
  client: GitHubClient,
  input: string,
  options: SnapshotResolverOptions,
): Promise<SnapshotWithSource> {
  const now = options.now ?? new Date();
  let ref: RepoRef;

  try {
    ref = parseRepoRef(input);
  } catch (error) {
    return {
      result: createSnapshotFailure(input, error),
      source: { kind: "none" },
    };
  }

  const shouldReadCache = options.mode !== "refresh" && (options.cacheEnabled || options.mode === "offline");
  const cached = shouldReadCache ? await tryReadCache(ref, input, options.env) : { entry: null, failure: null };

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
      result: createSnapshotFailure(input, new Error(`No cached snapshot for ${input}. Run without --offline first.`)),
      source: { kind: "none" },
    };
  }

  const apiResult = await collectSnapshot(client, input, now);

  if (apiResult.ok) {
    if (options.cacheEnabled) {
      await tryWriteCache(ref, apiResult.snapshot, now, options.env);
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
  ref: RepoRef,
  snapshot: Extract<SnapshotResult, { ok: true }>["snapshot"],
  now: Date,
  env: Env | undefined,
): Promise<void> {
  try {
    await writeCachedSnapshot(ref, snapshot, now, env);
  } catch {
    // Cache writes must not prevent a live API result from being shown.
  }
}

async function tryReadCache(
  ref: RepoRef,
  input: string,
  env: Env | undefined,
): Promise<{ entry: CachedSnapshot | null; failure: SnapshotResult | null }> {
  try {
    return {
      entry: await readCachedSnapshot(ref, env),
      failure: null,
    };
  } catch (error) {
    const snapshotError = errorToSnapshotError(error);

    return {
      entry: null,
      failure: {
        ok: false,
        ref,
        input,
        error: {
          ...snapshotError,
          message: `Could not read cached snapshot for ${input}: ${snapshotError.message}`,
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
