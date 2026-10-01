import { describe, expect, test } from "bun:test";
import { resolveCacheFirst, type CacheFirstSource, type CachePolicyOptions } from "../src/cache/cache-first";
import type { SnapshotError } from "../src/types";

const now = new Date("2026-06-01T00:00:00.000Z");
const freshAt = "2026-05-31T12:00:00.000Z";
const staleAt = "2026-05-01T00:00:00.000Z";
const outage: SnapshotError = { message: "GitHub is down.", code: "github_error" };

type Result = { ok: true; value: string } | { ok: false; error: SnapshotError };

function fakeSource(
  options: {
    cached?: { cachedAt: string; value: string } | Error | null;
    fetched?: string | SnapshotError;
    reusable?: boolean;
    writeFails?: boolean;
  } = {},
) {
  const calls = { read: 0, fetch: 0, write: [] as string[] };
  const source: CacheFirstSource<string, Result> = {
    label: "cached thing",
    read: async () => {
      calls.read += 1;
      if (options.cached instanceof Error) {
        throw options.cached;
      }
      return options.cached ?? null;
    },
    write: async (value) => {
      if (options.writeFails) {
        throw new Error("disk full");
      }
      calls.write.push(value);
    },
    fetch: async () => {
      calls.fetch += 1;
      const fetched = options.fetched ?? "live";
      return typeof fetched === "string" ? { ok: true, value: fetched } : { ok: false, error: fetched };
    },
    reusable: options.reusable === undefined ? undefined : () => options.reusable!,
    succeed: (value) => ({ ok: true, value }),
    fail: (error) => ({ ok: false, error }),
  };

  return { source, calls };
}

function policy(overrides: Partial<CachePolicyOptions> = {}): CachePolicyOptions {
  return { cacheEnabled: true, maxCacheHours: 24, staleIfError: true, mode: "default", now, ...overrides };
}

describe("cache-first resolution", () => {
  test("serves a fresh entry without fetching", async () => {
    const { source, calls } = fakeSource({ cached: { cachedAt: freshAt, value: "cached" } });

    const resolved = await resolveCacheFirst(policy(), source);

    expect(resolved.result).toEqual({ ok: true, value: "cached" });
    expect(resolved.source.kind).toBe("cache");
    expect(calls.fetch).toBe(0);
  });

  test("refetches a fresh entry collected under other options", async () => {
    const { source, calls } = fakeSource({ cached: { cachedAt: freshAt, value: "cached" }, reusable: false });

    const resolved = await resolveCacheFirst(policy(), source);

    expect(resolved.result).toEqual({ ok: true, value: "live" });
    expect(calls.write).toEqual(["live"]);
  });

  test("falls back to a stale entry when the refresh fails and staleIfError is on", async () => {
    const { source } = fakeSource({ cached: { cachedAt: staleAt, value: "cached" }, fetched: outage });

    const resolved = await resolveCacheFirst(policy(), source);

    expect(resolved.result).toEqual({ ok: true, value: "cached" });
    expect(resolved.source).toEqual({ kind: "stale-cache", cachedAt: staleAt, ageHours: 744, refreshError: outage });
  });

  test("reports the refresh failure when staleIfError is off", async () => {
    const { source } = fakeSource({ cached: { cachedAt: staleAt, value: "cached" }, fetched: outage });

    const resolved = await resolveCacheFirst(policy({ staleIfError: false }), source);

    expect(resolved).toEqual({ result: { ok: false, error: outage }, source: { kind: "api" } });
  });

  test("refresh mode skips the cache entirely, including the stale fallback", async () => {
    const { source, calls } = fakeSource({ cached: { cachedAt: freshAt, value: "cached" }, fetched: outage });

    const resolved = await resolveCacheFirst(policy({ mode: "refresh" }), source);

    expect(resolved.result).toEqual({ ok: false, error: outage });
    expect(calls.read).toBe(0);
  });

  test("offline mode serves a stale entry without fetching", async () => {
    const { source, calls } = fakeSource({ cached: { cachedAt: staleAt, value: "cached" } });

    const resolved = await resolveCacheFirst(policy({ mode: "offline" }), source);

    expect(resolved.result).toEqual({ ok: true, value: "cached" });
    expect(resolved.source.kind).toBe("stale-cache");
    expect(calls.fetch).toBe(0);
  });

  test("offline mode with nothing cached fails without fetching", async () => {
    const { source, calls } = fakeSource();

    const resolved = await resolveCacheFirst(policy({ mode: "offline", cacheEnabled: false }), source);

    expect(resolved).toEqual({
      result: {
        ok: false,
        error: { message: "No cached thing. Run without --offline first.", code: "missing_cache" },
      },
      source: { kind: "none" },
    });
    expect(calls.read).toBe(1);
    expect(calls.fetch).toBe(0);
  });

  test("offline mode reports an unreadable cache entry", async () => {
    const { source } = fakeSource({ cached: new SyntaxError("Unexpected end of JSON input") });

    const resolved = await resolveCacheFirst(policy({ mode: "offline" }), source);

    expect(resolved.result).toEqual({
      ok: false,
      error: { message: "Could not read cached thing: Unexpected end of JSON input", code: "SyntaxError" },
    });
  });

  test("an unreadable cache entry is refetched when online", async () => {
    const { source } = fakeSource({ cached: new SyntaxError("Unexpected end of JSON input") });

    const resolved = await resolveCacheFirst(policy(), source);

    expect(resolved).toEqual({ result: { ok: true, value: "live" }, source: { kind: "api" } });
  });

  test("a failed cache write still returns the live result", async () => {
    const { source } = fakeSource({ writeFails: true });

    const resolved = await resolveCacheFirst(policy(), source);

    expect(resolved).toEqual({ result: { ok: true, value: "live" }, source: { kind: "api" } });
  });

  test("a disabled cache is neither read nor written", async () => {
    const { source, calls } = fakeSource({ cached: { cachedAt: freshAt, value: "cached" } });

    const resolved = await resolveCacheFirst(policy({ cacheEnabled: false }), source);

    expect(resolved.result).toEqual({ ok: true, value: "live" });
    expect(calls.read).toBe(0);
    expect(calls.write).toEqual([]);
  });
});
