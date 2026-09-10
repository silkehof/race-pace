import type { BenchmarkEffort, PaceZones } from "./paceEngine.js";

/**
 * Wire shape of the `athleteContext` the iOS client sends with a create_plan turn, summarised from
 * the athlete's Strava history (ios/RacePace/ViewModels/ChatViewModel.swift `summarize`).
 *
 * Everything is optional: the client sends this best-effort and the coach can still hold a
 * conversation without it, so nothing here may be assumed present. It arrives as `unknown` on the
 * request body and is narrowed by parseAthleteContext below rather than trusted.
 */
export interface AthleteContext {
  /** Mean weekly running distance over the last 28 days. */
  recentWeeklyDistanceKm?: number;
  recentRunCount?: number;
  /** Distinct days with a run in the last 28 days, divided by four — the athlete's established
   * running frequency, which a plan should broadly match rather than jump past. */
  runDaysPerWeek?: number;
  /**
   * Longest single run in the last 30 days. This is the denominator of the single-session spike
   * guard that replaced the 10% rule (research_output.md section A): a run beyond twice this
   * carried a 2.28x overuse-injury hazard in the Garmin-RUNSAFE cohort. Without it the guard has
   * no baseline for the plan's opening weeks, which is exactly when a spike is most likely.
   */
  longestRunLast30DaysKm?: number;
  /** Recent hard efforts, one per distance band plus anything race-titled, from which the pace
   * engine picks the best performance. The client does the data reduction, the backend does the
   * physiology — see paceEngine.pickBenchmark. */
  benchmarkCandidates?: BenchmarkEffort[];
}

/** Baseline drawn from the athlete's actual training, against which a generated plan is judged.
 * Absent fields simply switch off the checks that need them. */
export interface PlanBaseline {
  longestRecentRunMeters?: number;
  recentWeeklyVolumeMeters?: number;
  establishedRunDaysPerWeek?: number;
  /** The athlete's own training paces, when a benchmark performance was available. Used to convert
   * prescribed distances into time for the intensity ratio — with these, that conversion is
   * specific to this runner rather than assuming a mid-pack recreational one. */
  paces?: PaceZones;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseBenchmarkCandidates(value: unknown): BenchmarkEffort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const efforts = value.flatMap((raw): BenchmarkEffort[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const { date, name, distanceMeters, durationSeconds, elevationGainMeters, elevationRangeMeters, isTreadmill } =
      raw as Record<string, unknown>;
    const meters = positiveNumber(distanceMeters);
    const seconds = positiveNumber(durationSeconds);
    if (typeof date !== "string" || meters === undefined || seconds === undefined) return [];
    return [
      {
        date,
        name: typeof name === "string" ? name : "",
        distanceMeters: meters,
        durationSeconds: seconds,
        elevationGainMeters: typeof elevationGainMeters === "number" ? elevationGainMeters : undefined,
        elevationRangeMeters: typeof elevationRangeMeters === "number" ? elevationRangeMeters : undefined,
        isTreadmill: isTreadmill === true,
      },
    ];
  });
  return efforts.length > 0 ? efforts : undefined;
}

/** Narrows the free-form request field to the parts we actually use, dropping anything malformed
 * rather than throwing — a bad summary should degrade the plan's grounding, not fail the turn. */
export function parseAthleteContext(raw: unknown): AthleteContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const ctx = raw as Record<string, unknown>;
  return {
    recentWeeklyDistanceKm: positiveNumber(ctx.recentWeeklyDistanceKm),
    recentRunCount: positiveNumber(ctx.recentRunCount),
    runDaysPerWeek: positiveNumber(ctx.runDaysPerWeek),
    longestRunLast30DaysKm: positiveNumber(ctx.longestRunLast30DaysKm),
    benchmarkCandidates: parseBenchmarkCandidates(ctx.benchmarkCandidates),
  };
}

export function planBaselineFrom(ctx: AthleteContext | null, paces?: PaceZones): PlanBaseline {
  if (!ctx) return { paces };
  return {
    longestRecentRunMeters: ctx.longestRunLast30DaysKm ? ctx.longestRunLast30DaysKm * 1000 : undefined,
    recentWeeklyVolumeMeters: ctx.recentWeeklyDistanceKm ? ctx.recentWeeklyDistanceKm * 1000 : undefined,
    establishedRunDaysPerWeek: ctx.runDaysPerWeek,
    paces,
  };
}
