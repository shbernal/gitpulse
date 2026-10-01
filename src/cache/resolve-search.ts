import type { GitHubClient } from "../github/client";
import { collectSearchRepositories } from "../metrics/search";
import type {
  SearchRepositoriesWithSource,
  SearchRepositoryList,
  SearchRepositoryOrder,
  SearchRepositorySort,
} from "../types";
import { resolveCacheFirst, type CachePolicyOptions } from "./cache-first";
import { readCachedSearchRepositories, writeCachedSearchRepositories } from "./search-store";

type Env = Record<string, string | undefined>;

export type SearchRepositoriesResolverOptions = CachePolicyOptions & {
  query: string;
  sort: SearchRepositorySort;
  order: SearchRepositoryOrder;
  limit: number;
  env?: Env;
};

export async function resolveSearchRepositories(
  client: GitHubClient,
  options: SearchRepositoriesResolverOptions,
): Promise<SearchRepositoriesWithSource> {
  const key = { query: options.query, sort: options.sort, order: options.order, limit: options.limit };

  return resolveCacheFirst<SearchRepositoryList, SearchRepositoriesWithSource["result"]>(options, {
    label: "cached repository search results",
    read: async () => {
      const entry = await readCachedSearchRepositories(key, options.env);
      return entry ? { cachedAt: entry.cachedAt, value: entry.list } : null;
    },
    write: (list, now) => writeCachedSearchRepositories(key, list, now, options.env),
    fetch: async (now) => {
      const result = await collectSearchRepositories(client, now, key);
      return result.ok ? { ok: true, value: result.list } : result;
    },
    succeed: (list) => ({ ok: true, list }),
    fail: (error) => ({ ok: false, error }),
  });
}
