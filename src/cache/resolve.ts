import type { GitHubClient } from "../github/client";
import { collectSnapshot, createSnapshotFailure } from "../metrics/snapshot";
import type { RepoRef, RepoSnapshot, SnapshotWithSource } from "../types";
import { parseRepoRef } from "../util/repo-ref";
import { resolveCacheFirst, type CachePolicyOptions } from "./cache-first";
import { readCachedSnapshot, writeCachedSnapshot } from "./store";

type Env = Record<string, string | undefined>;

export type SnapshotResolverOptions = CachePolicyOptions & {
  contributorFetchLimit?: number;
  env?: Env;
};

export async function resolveSnapshot(
  client: GitHubClient,
  input: string,
  options: SnapshotResolverOptions,
): Promise<SnapshotWithSource> {
  let ref: RepoRef;

  try {
    ref = parseRepoRef(input);
  } catch (error) {
    return {
      result: createSnapshotFailure(input, error),
      source: { kind: "none" },
    };
  }

  return resolveCacheFirst<RepoSnapshot, SnapshotWithSource["result"]>(options, {
    label: `cached snapshot for ${input}`,
    read: async () => {
      const entry = await readCachedSnapshot(ref, options.env);
      return entry ? { cachedAt: entry.cachedAt, value: entry.snapshot } : null;
    },
    write: (snapshot, now) => writeCachedSnapshot(ref, snapshot, now, options.env),
    fetch: async (now) => {
      const result = await collectSnapshot(client, input, now, {
        contributorFetchLimit: options.contributorFetchLimit,
      });
      return result.ok ? { ok: true, value: result.snapshot } : result;
    },
    reusable: (snapshot) =>
      options.contributorFetchLimit === undefined || snapshot.contributors.fetchLimit === options.contributorFetchLimit,
    succeed: (snapshot) => ({ ok: true, snapshot }),
    fail: (error) => ({ ok: false, ref, input, error }),
  });
}
