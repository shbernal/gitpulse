import type { GitHubClient } from "../github/client";
import type { RepoRef, ViewerStar, ViewerStarSource } from "../types";
import { cacheAgeHours, isFreshCache, type CacheMode } from "./policy";
import { clearCachedStarredRepositories } from "./starred-store";
import {
  lookupViewerStar,
  readCachedViewerStars,
  writeViewerStarProbe,
  type ViewerStarEntry,
} from "./viewer-stars-store";

type Env = Record<string, string | undefined>;

export type ViewerStarResolverOptions = {
  cacheEnabled: boolean;
  freshnessHours: number;
  mode: CacheMode;
  now?: Date;
  env?: Env;
};

/**
 * Star state is resolved beside the snapshot rather than inside it, so it never inherits the much
 * longer snapshot cache lifetime.
 *
 * The two cached answers carry different risk. A cached "starred" stays true until the user
 * unstars, which is rare, so it is trusted at any age. A cached "not starred" is the answer that
 * goes wrong the moment the user stars a repository, so past the freshness window it is confirmed
 * with a single `GET /user/starred/{owner}/{repo}`.
 */
export async function resolveViewerStar(
  client: GitHubClient,
  ref: RepoRef,
  options: ViewerStarResolverOptions,
): Promise<ViewerStar> {
  if (!client.authenticated) {
    return { known: false, reason: "unauthenticated" };
  }

  const now = options.now ?? new Date();
  const shouldReadCache = options.mode !== "refresh" && (options.cacheEnabled || options.mode === "offline");
  const cached = shouldReadCache ? lookupViewerStar(await tryReadCache(options.env), ref) : null;

  if (options.mode === "offline") {
    return cached ? known(cached, "cache", now) : { known: false, reason: "offline" };
  }

  if (cached && options.mode !== "refresh" && (cached.starred || isFreshCache(cached.checkedAt, options.freshnessHours, now))) {
    return known(cached, "cache", now);
  }

  try {
    const starred = await client.isRepositoryStarredByAuthenticatedUser(ref);

    if (options.cacheEnabled) {
      await tryWriteCache(ref, starred, now, options.env);
    }

    return known({ starred, checkedAt: now.toISOString() }, "api", now);
  } catch {
    return cached ? known(cached, "cache", now) : { known: false, reason: "error" };
  }
}

export type ViewerStarMutationOptions = {
  cacheEnabled: boolean;
  // A no-op mutation leaves the starred lists correct, so only a real change invalidates them.
  changed: boolean;
  now?: Date;
  env?: Env;
};

/**
 * Applies a star mutation the caller already performed to local state: the per-repository entry the
 * report reads, and the starred lists, which every sort and direction of now disagree with GitHub.
 */
export async function recordViewerStarMutation(
  ref: RepoRef,
  starred: boolean,
  options: ViewerStarMutationOptions,
): Promise<void> {
  if (!options.cacheEnabled) {
    return;
  }

  const now = options.now ?? new Date();

  await tryWriteCache(ref, starred, now, options.env);

  if (!options.changed) {
    return;
  }

  try {
    await clearCachedStarredRepositories(options.env ?? process.env);
  } catch {
    // A stale starred list is a worse answer than a missing one, but neither is worth failing a
    // mutation that already succeeded on GitHub.
  }
}

function known(entry: ViewerStarEntry, source: ViewerStarSource, now: Date): ViewerStar {
  return {
    known: true,
    starred: entry.starred,
    checkedAt: entry.checkedAt,
    ageHours: cacheAgeHours(entry.checkedAt, now),
    source,
  };
}

async function tryReadCache(env: Env | undefined) {
  try {
    return await readCachedViewerStars(env);
  } catch {
    // A damaged star cache must not break the report; the probe below still answers.
    return null;
  }
}

async function tryWriteCache(ref: RepoRef, starred: boolean, now: Date, env: Env | undefined): Promise<void> {
  try {
    await writeViewerStarProbe(ref, starred, now, env);
  } catch {
    // Cache writes must not prevent a live API result from being shown.
  }
}
