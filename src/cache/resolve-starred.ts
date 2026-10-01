import type { GitHubClient } from "../github/client";
import { collectStarredRepositories } from "../metrics/starred";
import type {
  StarredRepositoriesWithSource,
  StarredRepositoryDirection,
  StarredRepositoryList,
  StarredRepositorySort,
} from "../types";
import { resolveCacheFirst, type CachePolicyOptions } from "./cache-first";
import { readCachedStarredRepositories, writeCachedStarredRepositories } from "./starred-store";
import { syncViewerStarsFromList } from "./viewer-stars-store";

type Env = Record<string, string | undefined>;

export type StarredRepositoriesResolverOptions = CachePolicyOptions & {
  sort: StarredRepositorySort;
  direction: StarredRepositoryDirection;
  limit: number;
  env?: Env;
};

export async function resolveStarredRepositories(
  client: GitHubClient,
  options: StarredRepositoriesResolverOptions,
): Promise<StarredRepositoriesWithSource> {
  const key = { sort: options.sort, direction: options.direction };

  return resolveCacheFirst<StarredRepositoryList, StarredRepositoriesWithSource["result"]>(options, {
    label: "cached starred repository list",
    read: async () => {
      const entry = await readCachedStarredRepositories(key, options.env);
      return entry ? { cachedAt: entry.cachedAt, value: entry.list } : null;
    },
    write: async (list, now) => {
      await writeCachedStarredRepositories(key, list, now, options.env);
      // A full list is the cheapest source of truth for per-repository star state, so it seeds the
      // store `gitpulse owner/name` reads.
      await trySyncViewerStars(
        list.repositories.map((repository) => repository.fullName),
        !list.truncated,
        now,
        options.env,
      );
    },
    fetch: async (now) => {
      const result = await collectStarredRepositories(client, now, { ...key, limit: options.limit });
      return result.ok ? { ok: true, value: result.list } : result;
    },
    reusable: (list) => list.limit === options.limit,
    succeed: (list) => ({ ok: true, list }),
    fail: (error) => ({ ok: false, error }),
  });
}

async function trySyncViewerStars(
  fullNames: string[],
  complete: boolean,
  now: Date,
  env: Env | undefined,
): Promise<void> {
  try {
    await syncViewerStarsFromList(fullNames, complete, now, env);
  } catch {
    // Seeding the viewer star store is opportunistic; the starred list itself is the command output.
  }
}
