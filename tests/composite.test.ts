import { describe, expect, test } from "bun:test";
import { buildCompositeMetrics, buildCompositeMetricsAnalysis, type CompositeMetricsInput } from "../src/metrics/composite";

describe("composite metrics", () => {
  test("explains activity freshness bucket contributions", () => {
    const analysis = buildCompositeMetricsAnalysis({
      ...baseInput(),
      daysSinceLatestCommit: 31,
      daysSinceLastPush: null,
      daysSinceLatestRelease: 91,
      releaseCount: 2,
    }).activityFreshness;

    expect(analysis.score).toBe(85);
    expect(analysis.rawScore).toBe(85);
    expect(analysis.contributions).toMatchObject([
      { id: "commitOrPushFreshness", points: 45, maxPoints: 55, rule: "<= 90 days" },
      { id: "releaseFreshness", points: 20, maxPoints: 25, rule: "<= 365 days" },
      { id: "releasePresence", points: 10, maxPoints: 10 },
      { id: "archiveState", points: 10, maxPoints: 10 },
    ]);
  });

  test("explains archived activity penalties and score clamping", () => {
    const analysis = buildCompositeMetricsAnalysis({
      ...baseInput(),
      daysSinceLatestCommit: null,
      daysSinceLastPush: null,
      daysSinceLatestRelease: null,
      releaseCount: 0,
      archived: true,
    }).activityFreshness;

    expect(analysis.rawScore).toBe(-30);
    expect(analysis.score).toBe(0);
    expect(analysis.label).toBe("weak");
    expect(analysis.contributions.find((contribution) => contribution.id === "archiveState")).toMatchObject({
      points: -30,
      rule: "repository is archived",
    });
  });

  test("explains open-ended weighted popularity score", () => {
    const analysis = buildCompositeMetricsAnalysis({
      ...baseInput(),
    }).popularity;

    expect(analysis.score).toBe(2.31);
    expect(analysis.rawScore).toBe(2.31);
    expect(analysis.maxScore).toBeNull();
    expect(analysis.units).toBe(205);
    expect(analysis.label).toBeNull();
    expect(analysis.scale).toBe("index");
    expect(analysis.contributions.find((contribution) => contribution.id === "stars")).toMatchObject({
      points: 100,
      maxPoints: null,
      inputs: { value: 100, weight: 1, popularityUnits: 100 },
    });
    expect(analysis.contributions.find((contribution) => contribution.id === "forks")).toMatchObject({
      points: 80,
      maxPoints: null,
      inputs: { value: 10, weight: 8, popularityUnits: 80 },
    });
    expect(analysis.contributions.find((contribution) => contribution.id === "watchers")).toMatchObject({
      points: 25,
      maxPoints: null,
      inputs: { value: 5, weight: 5, popularityUnits: 25 },
    });
    expect(analysis.contributions.some((contribution) => contribution.id === "contributors")).toBe(false);
  });

  test("keeps existing compact metric output shape", () => {
    const metrics = buildCompositeMetrics(baseInput());

    expect(metrics.activityFreshness.inputs).toEqual({
      daysSinceLatestCommit: 10,
      daysSinceLastPush: 5,
      daysSinceLatestRelease: 20,
      releaseCount: 1,
      archived: false,
    });
    expect(metrics.popularity.inputs.watchers).toBe(5);
    expect(metrics.popularity.score).toBe(2.31);
    expect(metrics.popularity.label).toBeNull();
    expect(metrics.popularity.scale).toBe("index");
    expect(metrics.popularity.units).toBe(205);
  });
});

function baseInput(): CompositeMetricsInput {
  return {
    daysSinceLatestCommit: 10,
    daysSinceLastPush: 5,
    daysSinceLatestRelease: 20,
    releaseCount: 1,
    archived: false,
    stars: 100,
    forks: 10,
    watchers: 5,
  };
}
