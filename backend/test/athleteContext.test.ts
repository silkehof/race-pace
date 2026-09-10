import { describe, expect, it } from "vitest";
import { parseAthleteContext, planBaselineFrom } from "../src/services/athleteContext.js";

// This is client-supplied and free-form on the wire, so it reaches the route as `unknown`. A
// malformed summary should cost the plan its grounding, never fail the athlete's turn.
describe("parseAthleteContext", () => {
  it("reads a well-formed summary", () => {
    const ctx = parseAthleteContext({
      recentWeeklyDistanceKm: 32,
      recentRunCount: 16,
      runDaysPerWeek: 4,
      longestRunLast30DaysKm: 18,
      benchmarkCandidates: [
        { date: "2026-08-01", name: "parkrun", distanceMeters: 5000, durationSeconds: 1200 },
      ],
    });
    expect(ctx?.longestRunLast30DaysKm).toBe(18);
    expect(ctx?.benchmarkCandidates).toHaveLength(1);
  });

  it("drops malformed fields and candidates instead of throwing", () => {
    const ctx = parseAthleteContext({
      recentWeeklyDistanceKm: "loads",
      longestRunLast30DaysKm: -4,
      benchmarkCandidates: [
        { date: "2026-08-01", distanceMeters: 5000 },
        null,
        { date: "2026-08-02", name: "run", distanceMeters: 5000, durationSeconds: 1200 },
      ],
    });
    expect(ctx?.recentWeeklyDistanceKm).toBeUndefined();
    expect(ctx?.longestRunLast30DaysKm).toBeUndefined();
    expect(ctx?.benchmarkCandidates).toHaveLength(1);
  });

  it("returns null for a missing or non-object context", () => {
    expect(parseAthleteContext(undefined)).toBeNull();
    expect(parseAthleteContext("28km a week")).toBeNull();
  });
});

describe("planBaselineFrom", () => {
  it("converts to the metres the validator works in", () => {
    expect(planBaselineFrom(parseAthleteContext({ recentWeeklyDistanceKm: 32, longestRunLast30DaysKm: 18 }))).toEqual({
      recentWeeklyVolumeMeters: 32000,
      longestRecentRunMeters: 18000,
    });
  });

  it("yields an empty baseline when there's no context, switching those checks off", () => {
    expect(planBaselineFrom(null)).toEqual({});
  });
});
