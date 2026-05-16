import type { SnapshotSource } from "../types";

const millisPerHour = 60 * 60 * 1000;

export type CacheMode = "default" | "refresh" | "offline";

export function cacheAgeHours(cachedAt: string, now = new Date()): number {
  const date = new Date(cachedAt);

  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now.getTime() - date.getTime()) / millisPerHour);
}

export function isFreshCache(cachedAt: string, maxCacheHours: number, now = new Date()): boolean {
  return cacheAgeHours(cachedAt, now) <= maxCacheHours;
}

export function cacheSource(cachedAt: string, maxCacheHours: number, now = new Date()): SnapshotSource {
  const ageHours = cacheAgeHours(cachedAt, now);

  return isFreshCache(cachedAt, maxCacheHours, now)
    ? { kind: "cache", cachedAt, ageHours }
    : { kind: "stale-cache", cachedAt, ageHours };
}
