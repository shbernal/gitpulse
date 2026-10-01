import type { SnapshotError, SnapshotSource } from "../types";
import { cacheAgeHours, cacheSource, isFreshCache, type CacheMode } from "./policy";

export type CachePolicyOptions = {
  cacheEnabled: boolean;
  maxCacheHours: number;
  staleIfError: boolean;
  mode: CacheMode;
  now?: Date;
};

export type FetchOutcome<V> = { ok: true; value: V } | { ok: false; error: SnapshotError };

/** How one kind of cached GitHub data is read, written, fetched, and wrapped into its result type. */
export type CacheFirstSource<V, R> = {
  /** Completes "Could not read …" and "No … Run without --offline first.", e.g. "cached snapshot for acme/tool". */
  label: string;
  read: () => Promise<{ cachedAt: string; value: V } | null>;
  write: (value: V, now: Date) => Promise<unknown>;
  fetch: (now: Date) => Promise<FetchOutcome<V>>;
  /** A fresh entry collected under different options is refetched rather than reused. */
  reusable?: (value: V) => boolean;
  succeed: (value: V) => R;
  fail: (error: SnapshotError) => R;
};

/**
 * The cache policy shared by every cached command: a fresh entry wins, offline mode never touches
 * the network, and a failed refresh falls back to a stale entry when `staleIfError` allows it.
 */
export async function resolveCacheFirst<V, R>(
  options: CachePolicyOptions,
  source: CacheFirstSource<V, R>,
): Promise<{ result: R; source: SnapshotSource }> {
  const now = options.now ?? new Date();
  const offline = options.mode === "offline";
  let cached: { cachedAt: string; value: V } | null = null;

  if (options.mode !== "refresh" && (options.cacheEnabled || offline)) {
    try {
      cached = await source.read();
    } catch (error) {
      if (offline) {
        const cause = errorToSnapshotError(error);
        return {
          result: source.fail({ ...cause, message: `Could not read ${source.label}: ${cause.message}` }),
          source: { kind: "none" },
        };
      }
    }
  }

  if (
    cached &&
    (offline ||
      (isFreshCache(cached.cachedAt, options.maxCacheHours, now) && (source.reusable?.(cached.value) ?? true)))
  ) {
    return {
      result: source.succeed(cached.value),
      source: cacheSource(cached.cachedAt, options.maxCacheHours, now),
    };
  }

  if (offline) {
    return {
      result: source.fail({ message: `No ${source.label}. Run without --offline first.`, code: "missing_cache" }),
      source: { kind: "none" },
    };
  }

  const fetched = await source.fetch(now);

  if (fetched.ok) {
    if (options.cacheEnabled) {
      try {
        await source.write(fetched.value, now);
      } catch {
        // Cache writes must not prevent a live API result from being shown.
      }
    }

    return { result: source.succeed(fetched.value), source: { kind: "api" } };
  }

  if (cached && options.staleIfError) {
    return {
      result: source.succeed(cached.value),
      source: {
        kind: "stale-cache",
        cachedAt: cached.cachedAt,
        ageHours: cacheAgeHours(cached.cachedAt, now),
        refreshError: fetched.error,
      },
    };
  }

  return { result: source.fail(fetched.error), source: { kind: "api" } };
}

function errorToSnapshotError(error: unknown): SnapshotError {
  return error instanceof Error
    ? { message: error.message, code: error.name }
    : { message: "Unknown error.", code: "unknown" };
}
