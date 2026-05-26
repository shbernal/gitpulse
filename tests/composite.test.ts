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

  test("explains logarithmic community footprint caps", () => {
    const analysis = buildCompositeMetricsAnalysis({
      ...baseInput(),
      stars: 1_000_000,
      forks: 0,
      watchers: 0,
      contributors: 100,
    }).communityFootprint;

    expect(analysis.score).toBe(60);
    expect(analysis.contributions.find((contribution) => contribution.id === "stars")).toMatchObject({
      points: 35,
      maxPoints: 35,
      inputs: { value: 1_000_000, cap: 100_000, cappedValue: 100_000 },
    });
    expect(analysis.contributions.find((contribution) => contribution.id === "contributors")).toMatchObject({
      points: 25,
      maxPoints: 25,
    });
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
    expect(metrics.communityFootprint.inputs.watchers).toBe(5);
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
    contributors: 3,
  };
}
