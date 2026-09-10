import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The shared schemas declare $schema: draft/2020-12 — the plain `Ajv` core only understands
// draft-07 and throws "no schema with key or ref" for the 2020-12 meta-schema, so this needs the
// dedicated 2020-12 build.
import { Ajv2020 as Ajv, type ErrorObject } from "ajv/dist/2020.js";
// ajv-formats only ships a default export, which NodeNext module resolution mishandles for this
// package's dual CJS/ESM build — import the namespace and pull `.default` off it instead.
import * as ajvFormatsModule from "ajv-formats";
import type { PlanBaseline } from "./athleteContext.js";
import type { PaceZones } from "./paceEngine.js";
const addFormats = (ajvFormatsModule as unknown as { default: typeof import("ajv-formats").default })
  .default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(__dirname, "../../../shared/schema");

function loadSchema(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(schemaDir, fileName), "utf-8"));
}

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validateTrainingPlanSchema = ajv.compile(loadSchema("training-plan.schema.json"));
const validatePlanAdjustmentSchema = ajv.compile(loadSchema("plan-adjustment.schema.json"));

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /** Training-science observations (see computeAdvisories below) — informational only, never a
   * reason for `valid` to be false. A create_training_plan result carries the full set; a
   * propose_plan_adjustment result carries the two that a reshuffle can actually break (see
   * computeAdjustmentAdvisories). */
  advisories?: string[];
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());
}

interface PlanWorkout {
  date: string;
  type: string;
  targetDistanceMeters?: number | null;
  targetDurationSeconds?: number | null;
  targetPaceSecPerKm?: number | null;
  description?: string;
}

interface PlanPayload {
  /** `distanceMeters` is required by training-plan.schema.json, so it is always present by the
   * time advisories run — the taper expectations depend on it. */
  goal: { raceDate: string; distanceMeters: number };
  planStartDate: string;
  planEndDate: string;
  workouts: PlanWorkout[];
}

/** One day of the plan, so load can be summed over rolling windows rather than calendar weeks. */
interface DayLoad {
  date: string;
  runMeters: number;
  longRunMeters: number;
  /** Estimated running time, the denominator of the intensity ratio. */
  runSeconds: number;
  /** Of which, time at quality effort. */
  hardSeconds: number;
  /** Running time in quality sessions whose `Main:` line carried nothing measurable. Dropped from
   * the ratio rather than guessed at. */
  unresolvedSeconds: number;
  /** Session-RPE surrogate: minutes x an intensity weight. See SESSION_RPE_WEIGHTS. */
  trainingLoad: number;
  qualitySessions: number;
  isRunDay: boolean;
  hasRestOrRecovery: boolean;
}

/** A rolling 7-day window, labelled by the day it ends on. */
interface LoadWindow {
  endDate: string;
  meters: number;
  trainingLoad: number;
  qualitySessions: number;
  runDays: number;
}

const INTENSITY_HARD_TYPES = new Set(["tempo", "interval", "race_pace"]);
// Same "hard session" definition adjustmentRules.ts uses for back-to-back spacing.
const HARD_ADJACENCY_TYPES = new Set(["tempo", "interval", "race_pace", "long_run"]);
// Types that are running, and so belong in the intensity-distribution denominator. Strength and
// cross-training are training load but not running intensity — Seiler's distribution is about the
// endurance discipline itself, and folding a gym session into it would dilute the ratio.
const RUN_TYPES = new Set([
  "easy_run",
  "long_run",
  "tempo",
  "interval",
  "race_pace",
  "recovery",
  "race",
]);

/**
 * Fallback paces (sec/km) used only to convert a prescribed distance into time when the workout
 * carries no duration and no target pace of its own. They exist so the intensity ratio can be
 * computed in the unit the evidence actually uses; they are a coarse mid-recreational assumption,
 * not a prescription, and any workout that states its own pace uses that instead.
 */
const ASSUMED_EASY_PACE_SEC_PER_KM = 360;
const ASSUMED_HARD_PACE_SEC_PER_KM: Record<string, number> = {
  tempo: 285,
  interval: 255,
  race_pace: 300,
};

/**
 * Session-RPE surrogate weights on a CR10-like scale, applied to minutes.
 *
 * The load literature favours internal load (session-RPE, TRIMP) over distance, and session-RPE
 * tracks as well as HR-derived TRIMP — but the athlete never reports an RPE here, and HR isn't
 * reliably available, so the session's own type stands in for how hard it felt. This is used for
 * the cutback check, where the question is genuinely "did total stress come down": a week that
 * trades an easy hour for an interval session is not a recovery week even if the kilometres fell.
 * Distance remains the unit for the taper, because the taper evidence measures volume specifically.
 */
const SESSION_RPE_WEIGHTS: Record<string, number> = {
  recovery: 3,
  easy_run: 3.5,
  long_run: 4,
  tempo: 6.5,
  race_pace: 7,
  interval: 8.5,
  race: 9,
};

function pctLabel(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function km(meters: number): string {
  return `${(meters / 1000).toFixed(1)}km`;
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function isNextCalendarDay(a: string, b: string): boolean {
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime() === msPerDay;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / msPerDay,
  );
}

interface MainSet {
  /** Distance of the quality portion, when the line states one. */
  meters: number | null;
  /** Duration of the quality portion, for a main set written in minutes rather than metres. Only
   * consulted when no distance was found — a line stating both ("6x800m with 2 min jog") means
   * the minutes are recovery, not work. */
  seconds: number | null;
}

const RECOVERY_WORDS = /recover|jog|walk|rest|float|easy/i;

/**
 * Splits a `Main:` line into the segments that describe actual work, discarding the recovery
 * between reps.
 *
 * This has to happen before either unit is parsed. "6x800m at 5K effort with 400m jog recovery"
 * states 4.8km of work, not 5.2km, and "5 x 3 min at 5K effort with 3 min jog recovery" states 15
 * minutes, not 30 — counting the recovery inflates a session's measured intensity by up to half
 * again, which trips the intensity advisory on a plan that was correctly written. Filtering only
 * one of the two units, as this originally did, is worse than filtering neither: it made the
 * measurement depend on whether the coach happened to write the recovery in metres or in seconds.
 *
 * A whole segment naming recovery goes ("3km at tempo, 90s jog recovery"), and so does the tail of
 * a segment from `with` onwards when what follows is recovery. A segment describing easy running
 * inside a broken tempo ("3km at tempo, 1km easy, 3km at tempo") is dropped for the same reason —
 * it isn't quality work either.
 */
function workSegments(body: string): string[] {
  return body
    .split(/[,;]/)
    .map((segment) => {
      const withIndex = segment.search(/\bwith\b/i);
      return withIndex >= 0 && RECOVERY_WORDS.test(segment.slice(withIndex))
        ? segment.slice(0, withIndex)
        : segment;
    })
    .filter((segment) => !RECOVERY_WORDS.test(segment));
}

/**
 * Pulls the quality portion out of a workout description's `Main:` line.
 *
 * runPhaseFormat.ts requires every tempo/interval/race_pace session to be written as
 * Warm-up/Main/(Cooldown), so the session's `targetDistanceMeters` covers easy running on either
 * side of the hard portion. Counting all of it as "hard" overstates plan intensity by 2-3x: a
 * 40km week holding one 8km tempo (4km at threshold) and one 8km interval session (3km hard)
 * measures as 40% hard against a ~20% guideline, when the true figure is 17.5% — so a correctly
 * distributed plan trips the advisory and Claude is told to fix what wasn't broken.
 *
 * Returns nulls when the line carries nothing quantifiable at all, and the caller drops those
 * sessions from the ratio rather than guessing at a number.
 */
function parseMainSet(description: string | undefined): MainSet {
  const mainLine = (description ?? "").split("\n").find((line) => /^\s*Main:/i.test(line));
  if (!mainLine) return { meters: null, seconds: null };

  const segments = workSegments(mainLine.replace(/^\s*Main:/i, ""));
  const meters = parseMainSetMeters(segments);
  // Distance wins when both are stated: a line reading "6x800m in 3:10" is describing pace, not a
  // separate block of timed work.
  return meters !== null
    ? { meters, seconds: null }
    : { meters: null, seconds: parseMainSetSeconds(segments) };
}

function parseMainSetMeters(segments: readonly string[]): number | null {
  let total = 0;
  let matched = false;

  for (const segment of segments) {
    // Rep sets first ("6x400m", "3 x 1.5km"), recording the spans they consume so the
    // single-distance pass below doesn't also count each rep's distance on its own.
    const consumed: Array<[number, number]> = [];
    for (const match of segment.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(km|m)\b/gi)) {
      const start = match.index ?? 0;
      total += Number(match[1]) * Number(match[2]) * (match[3].toLowerCase() === "km" ? 1000 : 1);
      matched = true;
      consumed.push([start, start + match[0].length]);
    }

    // A trailing \b keeps "10 min" and "2 miles" from reading as metres, and requiring digits
    // immediately before the unit keeps a pace like "~5:00/km" from reading as a distance.
    for (const match of segment.matchAll(/(\d+(?:\.\d+)?)\s*(km|m)\b/gi)) {
      const start = match.index ?? 0;
      if (consumed.some(([from, to]) => start >= from && start < to)) continue;
      total += Number(match[1]) * (match[2].toLowerCase() === "km" ? 1000 : 1);
      matched = true;
    }
  }

  return matched ? total : null;
}

/** Duration of a main set written in time ("20 minutes at threshold", "6 x 3 min at 5K effort"). */
function parseMainSetSeconds(segments: readonly string[]): number | null {
  let total = 0;
  let matched = false;
  for (const segment of segments) {
    const consumed: Array<[number, number]> = [];
    for (const match of segment.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(min|minutes?|s|sec|seconds?)\b/gi)) {
      const start = match.index ?? 0;
      total += Number(match[1]) * Number(match[2]) * (/^s/i.test(match[3]) ? 1 : 60);
      matched = true;
      consumed.push([start, start + match[0].length]);
    }
    for (const match of segment.matchAll(/(\d+(?:\.\d+)?)\s*(min|minutes?|s|sec|seconds?)\b/gi)) {
      const start = match.index ?? 0;
      if (consumed.some(([from, to]) => start >= from && start < to)) continue;
      total += Number(match[1]) * (/^s/i.test(match[2]) ? 1 : 60);
      matched = true;
    }
  }
  return matched ? total : null;
}


interface SessionTime {
  /** Estimated total running time for the session. */
  totalSeconds: number;
  /** Of which, time at quality effort. */
  hardSeconds: number;
  /** True when the session is quality but its main set stated no measurable work, so neither
   * figure above can be trusted and the session should leave the ratio entirely. */
  unresolved: boolean;
}

/**
 * Estimates how long a prescribed session takes, and how much of that is at quality effort.
 *
 * Time, not distance, is the unit here. The intensity-distribution literature defines the easy/hard
 * split by time in zone, and the two measures disagree systematically because easy running covers
 * less ground per minute: enforcing 80/20 *by distance* delivers about 85/15 by time, under-dosing
 * quality work by 5-6 percentage points (research_output.md section B). Measuring in the unit the
 * guideline is stated in is the whole point.
 */
function sessionTime(w: PlanWorkout, paces?: PaceZones): SessionTime {
  const meters = w.targetDistanceMeters ?? 0;
  const declaredTotal = w.targetDurationSeconds ?? null;
  // Prefer the athlete's own paces, derived from a real performance, over the coarse defaults.
  // The ratio is fairly insensitive to this — scaling every pace by the same factor leaves it
  // unchanged — but there is no reason to assume a mid-pack runner when we know who this is.
  const easyPace = paces ? paces.easySecPerKm[1] : ASSUMED_EASY_PACE_SEC_PER_KM;

  if (!INTENSITY_HARD_TYPES.has(w.type)) {
    const pace = w.targetPaceSecPerKm ?? easyPace;
    return { totalSeconds: declaredTotal ?? (meters / 1000) * pace, hardSeconds: 0, unresolved: false };
  }

  const main = parseMainSet(w.description);
  // A workout's stated pace describes its main set, not the easy running wrapped around it.
  const derivedHardPace = paces
    ? { tempo: paces.thresholdSecPerKm, interval: paces.intervalSecPerKm, race_pace: paces.marathonSecPerKm }[w.type]
    : undefined;
  const hardPace =
    w.targetPaceSecPerKm ?? derivedHardPace ?? ASSUMED_HARD_PACE_SEC_PER_KM[w.type] ?? easyPace;

  if (main.meters !== null) {
    // A main set longer than the session's own total means description and target disagree; take
    // the smaller so the hard share can't exceed the session.
    const hardMeters = meters > 0 ? Math.min(main.meters, meters) : main.meters;
    const hardSeconds = (hardMeters / 1000) * hardPace;
    const easySeconds = (Math.max(meters - hardMeters, 0) / 1000) * easyPace;
    return {
      totalSeconds: declaredTotal ?? hardSeconds + easySeconds,
      hardSeconds,
      unresolved: false,
    };
  }

  if (main.seconds !== null) {
    // Distance is known but the split between hard and easy running inside it isn't, so the
    // session's total is estimated at easy pace throughout. That overstates the total slightly and
    // so understates the hard share — the safe direction, since a spurious intensity advisory
    // makes Claude "fix" a plan that was already right.
    const easySeconds = meters > 0 ? Math.max((meters / 1000) * easyPace - main.seconds, 0) : 0;
    return {
      totalSeconds: declaredTotal ?? main.seconds + easySeconds,
      hardSeconds: main.seconds,
      unresolved: false,
    };
  }

  return {
    totalSeconds: declaredTotal ?? (meters / 1000) * easyPace,
    hardSeconds: 0,
    unresolved: true,
  };
}

/**
 * Lays the plan out day by day so load can be summed over rolling windows.
 *
 * Calendar weeks are how the athlete reads a plan, and the Plan tab still groups by Monday — but
 * they are the wrong unit for judging load. A big Sunday long run and a big Monday run land in
 * different calendar weeks despite being back to back, so a genuinely hard stretch can read as two
 * moderate weeks and a real deload can be split across the boundary and disappear. The load
 * literature uses rolling windows for exactly this reason.
 *
 * Race day is excluded from distance and load: its distance is the point of the taper, not
 * additional training, and counting it would make every race week look like a volume spike instead
 * of a drop. Only running counts — a cross-training entry may legitimately carry a distance, but
 * every guideline these totals feed is stated in running kilometres.
 */
function buildDayLoads(workouts: PlanWorkout[], span: { from: string; to: string }, paces?: PaceZones): DayLoad[] {
  const byDate = new Map<string, DayLoad>();
  for (let date = span.from; date <= span.to; date = addDays(date, 1)) {
    byDate.set(date, {
      date,
      runMeters: 0,
      longRunMeters: 0,
      runSeconds: 0,
      hardSeconds: 0,
      unresolvedSeconds: 0,
      trainingLoad: 0,
      qualitySessions: 0,
      isRunDay: false,
      hasRestOrRecovery: false,
    });
  }

  for (const w of workouts) {
    const day = byDate.get(w.date);
    if (!day) continue;
    if (w.type === "rest" || w.type === "recovery") day.hasRestOrRecovery = true;
    if (w.type === "race" || !RUN_TYPES.has(w.type)) continue;

    const meters = w.targetDistanceMeters ?? 0;
    day.runMeters += meters;
    if (w.type === "long_run") day.longRunMeters += meters;
    if (meters > 0) day.isRunDay = true;

    const time = sessionTime(w, paces);
    day.runSeconds += time.totalSeconds;
    if (time.unresolved) day.unresolvedSeconds += time.totalSeconds;
    else day.hardSeconds += time.hardSeconds;
    day.trainingLoad += (time.totalSeconds / 60) * (SESSION_RPE_WEIGHTS[w.type] ?? 3.5);
    if (INTENSITY_HARD_TYPES.has(w.type)) day.qualitySessions++;
  }

  return [...byDate.values()];
}

const LOAD_WINDOW_DAYS = 7;

/** Every rolling 7-day window in the plan, labelled by its last day. Partial windows at the start
 * of the plan are skipped — a plan's first three days are not a light week, they are three days. */
function rollingWindows(days: readonly DayLoad[]): LoadWindow[] {
  const windows: LoadWindow[] = [];
  for (let end = LOAD_WINDOW_DAYS - 1; end < days.length; end++) {
    const slice = days.slice(end - LOAD_WINDOW_DAYS + 1, end + 1);
    windows.push({
      endDate: days[end].date,
      meters: slice.reduce((sum, d) => sum + d.runMeters, 0),
      trainingLoad: slice.reduce((sum, d) => sum + d.trainingLoad, 0),
      qualitySessions: slice.reduce((sum, d) => sum + d.qualitySessions, 0),
      runDays: slice.filter((d) => d.isRunDay).length,
    });
  }
  return windows;
}

// --- Guideline thresholds ---------------------------------------------------------------------
// Every number here traces to docs/research/research_output.md. Where the audit graded a claim as
// convention rather than evidence, the advisory text says so, because the coach reads these and
// will otherwise treat folklore and findings as equally authoritative.

/** A single run beyond this multiple of the longest run in the prior 30 days is the one load
 * pattern with strong evidence behind it: >2x carried a 2.28x overuse-injury hazard (Frandsen et
 * al., Br J Sports Med 2025, 5,205 runners). 1.5x is the softer warning tier. */
const SPIKE_STRONG_RATIO = 2.0;
const SPIKE_SOFT_RATIO = 1.5;
const SPIKE_WINDOW_DAYS = 30;
/** Below this a "spike" is arithmetic, not stress — doubling a 2km shakeout is not a risk event. */
const SPIKE_MIN_METERS = 8000;
/** Long advisory lists get skimmed; the worst few spikes carry the same message as all of them. */
const MAX_SPIKE_ADVISORIES = 3;

/** The audit's recommended long-run share: 20-35% is normal, and above a third the correct read is
 * that the rest of the week is under-built, not that the long run is too long. */
const LONG_RUN_SHARE_CEILING = 0.35;

/** Deload cadence is coaching convention with no RCT behind it; the audit's parameter if used at
 * all is every 3-5 weeks at -20-30%. Measured on the session-RPE surrogate rather than distance,
 * because a recovery week is about total stress coming down, not only kilometres. */
const CUTBACK_DROP_RATIO = 0.8;
const CUTBACK_REFERENCE_WINDOW_DAYS = 28;
const MAX_DAYS_WITHOUT_CUTBACK = 35;

/** Bosquet et al. 2007 meta-analysis: reduce volume BY 41-60% from peak, i.e. race week lands at
 * 40-59% of peak, progressively rather than in one step, holding intensity and frequency. */
const TAPER_FLOOR_OF_PEAK = 0.4;
const TAPER_CEILING_OF_PEAK = 0.6;
/**
 * The taper evidence is built on events carrying real accumulated fatigue. Below roughly half
 * marathon distance the benefit is small and a multi-week taper may be unnecessary — a few easy
 * days suffice — so a short race is held only to the much weaker expectation that race week eases
 * off at all, rather than being told a 75%-of-peak week is wrong when it is perfectly sensible.
 */
const FULL_TAPER_MIN_RACE_METERS = 20000;
const SHORT_RACE_TAPER_CEILING = 0.9;
/** The taper studies cluster on 8-14 days, so a half or marathon taper that only begins in the
 * final few days is shorter than anything the evidence covers. Measured as the gap between race
 * day and the last day still carrying near-peak load. */
const MIN_TAPER_DAYS = 8;
const NEAR_PEAK_RATIO = 0.9;

/** ~80% of running time easy, with tolerance — this is a principle, not a target to hit exactly,
 * and the audit explicitly warns against enforcing strict polarization on recreational runners. */
const HARD_TIME_SHARE_CEILING = 0.25;
/** Below this share of the plan measurable, the remaining sample isn't worth judging. */
const MAX_UNRESOLVED_SHARE = 0.25;

/** A third quality session is rarely warranted below this weekly volume — at recreational mileage
 * two hard sessions already reach the 20%-by-time ceiling. */
const THIRD_QUALITY_SESSION_MIN_WEEKLY_METERS = 50000;

/** How far a plan's opening week may exceed the athlete's established weekly volume before it is
 * worth naming. Starting load should match established chronic load (audit assumption 5); the
 * generous margin reflects that week-to-week percentage growth itself does *not* predict injury. */
const OPENING_WEEK_JUMP_RATIO = 1.4;
/** Frequency is the other half of "start from where the athlete actually is": asking someone who
 * runs three days a week for six is an adherence problem before it is a physiological one. Allows
 * a day and a half of rounding before saying anything. */
const OPENING_RUN_DAYS_MARGIN = 1.5;

/** Below this share of running time at quality effort, a plan for a goal race has essentially no
 * hard work in it. Set well under the ~20% guideline so it only fires on plans that are quality-
 * free rather than merely conservative — and only on blocks long enough for it to be a choice. */
const MIN_HARD_TIME_SHARE = 0.06;
const MIN_WEEKS_FOR_INTENSITY_FLOOR = 6;

/**
 * Names one representative window and counts the rest.
 *
 * A guideline the plan crosses in week two usually stays crossed for the rest of the block, and
 * repeating a near-identical line eight times buries the other advisories — the coach reads this
 * list, and a wall of the same sentence is worse than one sentence that says how widespread the
 * pattern is. Overlapping rolling windows make this essential rather than merely tidy: one
 * badly-shaped week produces up to seven consecutive matches.
 */
function windowSummary(matchCount: number, worstEndDate: string): string {
  const days = matchCount > 1 ? ` (and ${matchCount - 1} other 7-day window${matchCount === 2 ? "" : "s"})` : "";
  return `The 7 days to ${worstEndDate}${days}`;
}

/** Collapses a run of overlapping windows into the distinct stretches they cover, so "7 windows"
 * doesn't overstate a single bad week that simply appears in seven of them. */
function distinctStretches(endDates: readonly string[]): number {
  let stretches = 0;
  let previous: string | null = null;
  for (const date of endDates) {
    if (previous === null || daysBetween(previous, date) > 1) stretches++;
    previous = date;
  }
  return stretches;
}

/**
 * Two hard sessions on consecutive days. `onlyTouching`, when given, restricts reporting to pairs
 * involving one of those dates — used after an adjustment, where a pre-existing pair elsewhere in
 * the plan isn't something the reshuffle caused or should be blamed for.
 */
function computeAdjacencyAdvisories(
  workouts: PlanWorkout[],
  onlyTouching?: ReadonlySet<string>,
): string[] {
  const advisories: string[] = [];
  const sorted = [...workouts]
    .filter((w) => w.type !== "race")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (
      HARD_ADJACENCY_TYPES.has(prev.type) &&
      HARD_ADJACENCY_TYPES.has(cur.type) &&
      isNextCalendarDay(prev.date, cur.date) &&
      (!onlyTouching || onlyTouching.has(prev.date) || onlyTouching.has(cur.date))
    ) {
      advisories.push(
        `${prev.date} (${prev.type}) and ${cur.date} (${cur.type}) are two hard sessions on consecutive days (spacing them out is coaching convention rather than an evidence-based rule, but it is a sensible default).`,
      );
    }
  }
  return advisories;
}

/**
 * The single-session distance spike — the audit's headline replacement for the 10% rule.
 *
 * The 10% rule failed its only RCT (Buist et al. 2008: 20.8% vs 20.3% injury incidence) and
 * week-to-week ratios showed no relationship with injury in the largest running dataset assembled.
 * What did: a single run more than twice the longest run of the prior 30 days. So this walks a
 * rolling 30-day window rather than comparing calendar weeks, and seeds it from the athlete's real
 * Strava history so the plan's opening weeks — where a spike is most likely, because the model is
 * guessing at a starting point — are covered too.
 */
function computeSpikeAdvisories(
  workouts: PlanWorkout[],
  baseline: PlanBaseline,
  today: string,
): string[] {
  const runs = workouts
    .filter((w) => RUN_TYPES.has(w.type) && (w.targetDistanceMeters ?? 0) > 0)
    .map((w) => ({ date: w.date, type: w.type, meters: w.targetDistanceMeters as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const found: Array<{ ratio: number; text: string }> = [];
  for (const [index, run] of runs.entries()) {
    if (run.meters < SPIKE_MIN_METERS) continue;
    // A run already in the past is done; flagging it is noise. It still counts as a prior for the
    // runs that follow, which is what `runs.slice(0, index)` below reads.
    if (run.date < today) continue;
    const windowStart = addDays(run.date, -SPIKE_WINDOW_DAYS);

    // The window is anchored on today, not on the plan, because the two disagree whenever a plan
    // is being adjusted rather than created. For the stretch of the window that has already
    // happened, Strava records what the athlete *did*; the plan only records what was asked of
    // them, and a skipped 20km run would otherwise stand in as evidence of a base they never
    // built — precisely the case that prompts most adjustments. So where the baseline covers the
    // past, it replaces the plan's own past rather than competing with it.
    const pastCovered = baseline.longestRecentRunMeters !== undefined && windowStart < today;
    const priorInPlan = runs
      .slice(0, index)
      .filter((prior) => prior.date >= windowStart && (!pastCovered || prior.date >= today))
      .map((prior) => prior.meters);
    const seed = pastCovered ? [baseline.longestRecentRunMeters as number] : [];
    const priorLongest = Math.max(...priorInPlan, ...seed, 0);
    if (priorLongest <= 0) continue;

    const ratio = run.meters / priorLongest;
    if (ratio <= SPIKE_SOFT_RATIO) continue;
    const strong = ratio >= SPIKE_STRONG_RATIO;
    // Race day can't be moved, shortened, or built up to gradually — the same ratio that means
    // "this long run is too big a jump" means "the plan never built far enough toward the race",
    // which is a different problem with a different fix.
    const advice =
      run.type === "race"
        ? ` — the plan never builds close enough to race distance. Race day can't be shortened, so raise the longest run over the block (or discuss whether the goal fits the time available).`
        : strong
          ? ` — past the 2x single-session spike associated with a 2.28x overuse-injury hazard. Build toward it over more weeks, or shorten it.`
          : ` — approaching the 2x single-session spike threshold. Worth a look.`;
    found.push({
      ratio,
      text: `${run.date} (${run.type}, ${km(run.meters)}) is ${ratio.toFixed(1)}x the longest run of the prior 30 days (${km(priorLongest)})${advice}`,
    });
  }

  return found
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, MAX_SPIKE_ADVISORIES)
    .map((f) => f.text);
}

/**
 * Observations mirroring the numeric guidelines in planGenerationRules.ts. These never block the
 * tool call — the athlete is the one training, and an experienced runner returning from a break,
 * front-loading a key block, or skipping a taper before a low-priority tune-up race all have
 * legitimate reasons to push past a generic guideline. Surfacing the actual numbers lets the coach
 * (and, via the rationale, the athlete) see the deviation and judge it, rather than an algorithm
 * silently blocking or rubber-stamping it. Only schema shape and referential integrity (a
 * hallucinated workoutId, malformed dates) are hard errors — those aren't judgment calls, they're
 * bugs.
 */
function computeAdvisories(
  workouts: PlanWorkout[],
  days: DayLoad[],
  baseline: PlanBaseline,
  today: string,
  raceDistanceMeters: number,
): string[] {
  const advisories: string[] = [...computeSpikeAdvisories(workouts, baseline, today)];
  advisories.push(...computeAdjacencyAdvisories(workouts));

  if (days.length > 7 && !days.some((d) => d.hasRestOrRecovery)) {
    advisories.push("No rest or recovery day anywhere across the plan's full span.");
  }
  advisories.push(...intensityAdvisories(days));

  // Everything below is about weekly load, which a plan shorter than a week simply doesn't have.
  const windows = rollingWindows(days);
  if (windows.length > 0) {
    advisories.push(...openingLoadAdvisories(windows[0], baseline));
    advisories.push(...longRunShareAdvisories(days, windows));
    advisories.push(...qualityDensityAdvisories(windows));
    advisories.push(...cutbackAdvisories(windows));
    advisories.push(...taperAdvisories(windows, raceDistanceMeters));
  }

  return advisories;
}

/** Assumption 5: a plan's starting load and frequency should continue what the athlete is already
 * doing, not a template. Both halves matter — volume is the physiological one, frequency is mostly
 * an adherence one, and a plan that gets either badly wrong tends to be abandoned rather than
 * completed. The first window is the plan's opening 7 days. */
function openingLoadAdvisories(opening: LoadWindow, baseline: PlanBaseline): string[] {
  const advisories: string[] = [];
  const { recentWeeklyVolumeMeters, establishedRunDaysPerWeek } = baseline;

  if (recentWeeklyVolumeMeters !== undefined && opening.meters > recentWeeklyVolumeMeters * OPENING_WEEK_JUMP_RATIO) {
    advisories.push(
      `The plan opens at ${km(opening.meters)} in its first 7 days against the athlete's recent ${km(recentWeeklyVolumeMeters)}/week — starting load should track what they are actually already doing.`,
    );
  }
  if (
    establishedRunDaysPerWeek !== undefined &&
    opening.runDays > establishedRunDaysPerWeek + OPENING_RUN_DAYS_MARGIN
  ) {
    advisories.push(
      `The plan opens with ${opening.runDays} running days in its first 7, against the ${establishedRunDaysPerWeek.toFixed(1)} days a week the athlete currently runs. Adding days is how a plan stops getting followed; build frequency gradually if it needs to rise at all.`,
    );
  }
  return advisories;
}

/**
 * A long run that dominates its week (audit assumption 4). The denominator is the largest 7-day
 * window the run falls in, which is deliberately the most forgiving framing available — the point
 * is to catch a long run that is oversized under *any* reasonable reading of the week, not to
 * penalise one for sitting near a window boundary.
 */
function longRunShareAdvisories(days: readonly DayLoad[], windows: readonly LoadWindow[]): string[] {
  const byEndDate = new Map(windows.map((w) => [w.endDate, w]));
  const matches: Array<{ endDate: string; share: number }> = [];

  for (const [index, day] of days.entries()) {
    if (day.longRunMeters <= 0) continue;
    let widest = 0;
    for (let offset = 0; offset < LOAD_WINDOW_DAYS; offset++) {
      const window = byEndDate.get(days[index + offset]?.date ?? "");
      if (window) widest = Math.max(widest, window.meters);
    }
    if (widest <= 0) continue;
    const share = day.longRunMeters / widest;
    if (share > LONG_RUN_SHARE_CEILING) matches.push({ endDate: day.date, share });
  }

  if (matches.length === 0) return [];
  const worst = matches.reduce((a, b) => (b.share > a.share ? b : a));
  const others = matches.length - 1;
  return [
    `The long run on ${worst.endDate}${others > 0 ? ` (and ${others} other${others === 1 ? "" : "s"})` : ""} is ${pctLabel(worst.share)} of its week's volume (normal is 20-35%). Usually the fix is building up the rest of the week, not cutting the long run.`,
  ];
}

/** A third quality session is rarely warranted at recreational volume — two already reach the
 * ~20%-by-time ceiling. Counted over rolling windows, so three hard days spanning a Monday still
 * register. */
function qualityDensityAdvisories(windows: readonly LoadWindow[]): string[] {
  const matches = windows.filter(
    (w) => w.qualitySessions >= 3 && w.meters > 0 && w.meters < THIRD_QUALITY_SESSION_MIN_WEEKLY_METERS,
  );
  if (matches.length === 0) return [];
  const worst = matches.reduce((a, b) => (b.qualitySessions > a.qualitySessions ? b : a));
  return [
    `${windowSummary(distinctStretches(matches.map((m) => m.endDate)), worst.endDate)}: ${worst.qualitySessions} quality sessions at ${km(worst.meters)} for the week — two is the usual steady state, and a third is rarely warranted below ~50km/week.`,
  ];
}

/**
 * A long build with no deload in it.
 *
 * Measured on the session-RPE surrogate rather than distance, and against a rolling 28-day
 * reference peak rather than the previous calendar week: what makes a week a cutback is that total
 * stress fell meaningfully below the recent norm, which a single week-on-week comparison can miss
 * entirely when the build is gradual.
 */
function cutbackAdvisories(windows: readonly LoadWindow[]): string[] {
  let lastCutback = windows[0].endDate;
  for (const [index, window] of windows.entries()) {
    const referenceStart = addDays(window.endDate, -CUTBACK_REFERENCE_WINDOW_DAYS);
    const recentPeak = Math.max(
      ...windows.slice(0, index + 1).filter((w) => w.endDate >= referenceStart).map((w) => w.trainingLoad),
    );
    if (recentPeak <= 0 || window.trainingLoad <= recentPeak * CUTBACK_DROP_RATIO) {
      lastCutback = window.endDate;
      continue;
    }
    if (daysBetween(lastCutback, window.endDate) > MAX_DAYS_WITHOUT_CUTBACK) {
      return [
        `No cutback week (a 7-day stretch at least 20% below the recent peak training load) in the ${MAX_DAYS_WITHOUT_CUTBACK}+ days leading up to ${window.endDate}. Deload cadence is convention rather than a research finding, but every 3-5 weeks is the usual parameter.`,
      ];
    }
  }
  return [];
}

/** Taper depth, shape and length (Bosquet et al. 2007). Depth is measured in volume because that
 * is what the meta-analysis manipulated; intensity and frequency are meant to hold, so cutting
 * them is not what "reduce by 41-60%" refers to. */
function taperAdvisories(windows: readonly LoadWindow[], raceDistanceMeters: number): string[] {
  const advisories: string[] = [];
  const raceWindow = windows[windows.length - 1];
  const peak = Math.max(...windows.map((w) => w.meters));
  if (peak <= 0) return advisories;

  const ratio = raceWindow.meters / peak;
  const fullTaperExpected = raceDistanceMeters >= FULL_TAPER_MIN_RACE_METERS;

  if (fullTaperExpected && (ratio < TAPER_FLOOR_OF_PEAK || ratio > TAPER_CEILING_OF_PEAK)) {
    advisories.push(
      `The 7 days to race day carry ${pctLabel(ratio)} of peak volume. The taper meta-analysis supports cutting volume by 41-60% from peak — so race week lands at roughly 40-60% of it — while holding intensity and session frequency.`,
    );
  } else if (!fullTaperExpected && ratio > SHORT_RACE_TAPER_CEILING) {
    advisories.push(
      `The 7 days to race day carry ${pctLabel(ratio)} of peak volume — essentially a normal training week. A short race doesn't need the full taper a half or marathon does, but a few easy days before it still help.`,
    );
  }

  if (fullTaperExpected && ratio < TAPER_CEILING_OF_PEAK) {
    // How long the taper actually runs: the gap between race day and the last day still carrying
    // near-peak load. A plan that holds peak until the final week has a one-week taper however
    // deep the final drop is, and the studies cluster on 8-14 days.
    const lastNearPeak = [...windows].reverse().find((w) => w.meters >= peak * NEAR_PEAK_RATIO);
    const taperDays = lastNearPeak ? daysBetween(lastNearPeak.endDate, raceWindow.endDate) : Infinity;
    if (taperDays < MIN_TAPER_DAYS) {
      const dayLabel = `${taperDays} day${taperDays === 1 ? "" : "s"}`;
      advisories.push(
        `The taper is only about ${dayLabel} long — volume is still at ${pctLabel(NEAR_PEAK_RATIO)}+ of peak ${dayLabel} out, then drops at once. The evidence covers 8-14 day tapers with volume coming down progressively.`,
      );
    }
  }
  return advisories;
}

/** ~80% of running time easy, measured in time because that is how the principle is defined. */
function intensityAdvisories(days: readonly DayLoad[]): string[] {
  const totalRunning = days.reduce((sum, d) => sum + d.runSeconds, 0);
  const totalHard = days.reduce((sum, d) => sum + d.hardSeconds, 0);
  const totalUnresolved = days.reduce((sum, d) => sum + d.unresolvedSeconds, 0);
  // Quality sessions with no measurable main set drop out of both sides of the ratio rather than
  // being guessed at, and if they account for much of the plan the remaining sample isn't worth
  // judging — say nothing instead. A wrong intensity advisory is worse than no advisory here,
  // because Claude acts on it and may "fix" a plan that was already correct.
  const measuredSeconds = totalRunning - totalUnresolved;
  if (measuredSeconds <= 0 || totalUnresolved > totalRunning * MAX_UNRESOLVED_SHARE) return [];

  const hardShare = totalHard / measuredSeconds;
  if (hardShare > HARD_TIME_SHARE_CEILING) {
    return [
      `Across the plan, ${pctLabel(hardShare)} of running *time* is at tempo/interval/race-pace effort (guideline ~20%). This counts each quality session's \`Main:\` set only, not its warm-up and cooldown, and measures time rather than distance because that is how the 80/20 principle is defined.`,
    ];
  }
  // The opposite failure, and an easy one to fall into now that intensity is measured in time:
  // fixing the distance-based accounting revealed that plans built to look like 80/20 on the map
  // were nearer 85/15 in reality, so the correction runs toward too little quality, not too much.
  if (hardShare < MIN_HARD_TIME_SHARE && days.length >= MIN_WEEKS_FOR_INTENSITY_FLOOR * 7) {
    return [
      `Across the plan, only ${pctLabel(hardShare)} of running time is at tempo/interval/race-pace effort. Over a block this long that is close to no quality work at all — deliberate for a pure base phase or a return from injury, but worth saying so in the rationale if it is.`,
    ];
  }
  return [];
}

/** How far a plan may start either side of today before it reads as mis-anchored rather than
 * deliberate. Generous both ways: starting a few days out to finish the current week, or a few
 * days back to absorb training already done this week, are both normal. */
const PLAN_START_PAST_TOLERANCE_DAYS = 7;
const PLAN_START_FUTURE_TOLERANCE_DAYS = 21;

/** A quality session needs a warm-up (Fradkin et al. 2010: performance improved in 79% of
 * outcomes, little evidence of harm) and a main set naming a concrete effort. A cooldown is not
 * required: the definitive review found active cool-downs largely ineffective for recovery and
 * ineffective at preventing injury (Van Hooren & Peake 2018), so mandating one padded every
 * quality session with work the evidence does not support. Athletes who want one may still have
 * one — it is simply no longer structurally required. */
const REQUIRED_PHASE_LABELS = ["Warm-up:", "Main:"];

/**
 * Structural faults that are bugs rather than coaching judgment, and so are hard errors unlike
 * everything in computeAdvisories: a plan that omits race day, schedules workouts outside its own
 * declared span, is anchored to the wrong dates, leaves a calendar week empty, or writes a quality
 * session without the phase structure runPhaseFormat.ts mandates is broken output, not a
 * defensible training decision an athlete might have reasons for.
 *
 * The empty-week check matters most: a long plan is generated in a single tool call, and a model
 * losing steam two thirds of the way through a marathon block silently drops weeks. Nothing else
 * would catch that.
 */
function computeStructuralErrors(plan: PlanPayload, today: string): string[] {
  const errors: string[] = [];
  const { goal, planStartDate, planEndDate, workouts } = plan;

  if (!workouts.some((w) => w.type === "race" && w.date === goal.raceDate)) {
    errors.push(
      `No workout of type "race" on the goal race date ${goal.raceDate} — race day itself must appear in the plan.`,
    );
  }

  for (const w of workouts) {
    if (w.date < planStartDate || w.date > planEndDate) {
      errors.push(
        `Workout on ${w.date} falls outside the plan's own span (${planStartDate} to ${planEndDate}).`,
      );
    }
  }

  const startOffset = daysBetween(today, planStartDate);
  if (startOffset < -PLAN_START_PAST_TOLERANCE_DAYS) {
    errors.push(
      `planStartDate ${planStartDate} is ${-startOffset} days in the past (today is ${today}) — the plan would open on weeks that have already gone by.`,
    );
  } else if (startOffset > PLAN_START_FUTURE_TOLERANCE_DAYS) {
    errors.push(
      `planStartDate ${planStartDate} is ${startOffset} days away (today is ${today}) — the plan should start now or shortly after.`,
    );
  }

  const weeksWithWorkouts = new Set(workouts.map((w) => mondayOf(w.date)));
  const lastWeek = mondayOf(planEndDate);
  for (let week = mondayOf(planStartDate); week <= lastWeek; week = addDays(week, 7)) {
    if (!weeksWithWorkouts.has(week)) {
      errors.push(
        `The week of ${week} has no workouts at all — every week from planStartDate through race day needs a schedule, rest days included.`,
      );
    }
  }

  for (const w of workouts) {
    if (!INTENSITY_HARD_TYPES.has(w.type)) continue;
    const missing = REQUIRED_PHASE_LABELS.filter(
      (label) => !new RegExp(`^\\s*${label}`, "im").test(w.description ?? ""),
    );
    if (missing.length > 0) {
      errors.push(
        `Workout on ${w.date} (${w.type}) is missing its ${missing.join(" / ")} line(s) — quality sessions must use the Warm-up/Main structure.`,
      );
    }
  }

  return errors;
}

/**
 * `today` is injected rather than read from the clock so tests stay deterministic; the default is
 * the server's date, which is what the tool call uses. A timezone's worth of slop is well inside
 * the start-date tolerances above.
 *
 * `baseline` carries what the athlete has actually been running (from Strava, via athleteContext).
 * It is optional — the advisories that need it simply don't fire without it — but with it the spike
 * guard covers the plan's opening weeks and the opening load can be checked against reality.
 */
export function validateCreateTrainingPlan(
  input: unknown,
  today: string = new Date().toISOString().slice(0, 10),
  baseline: PlanBaseline = {},
): ValidationResult {
  const schemaValid = validateTrainingPlanSchema(input);
  if (!schemaValid) {
    return { valid: false, errors: formatErrors(validateTrainingPlanSchema.errors) };
  }

  const plan = input as PlanPayload;
  const structuralErrors = computeStructuralErrors(plan, today);
  if (structuralErrors.length > 0) {
    return { valid: false, errors: structuralErrors };
  }

  const days = buildDayLoads(
    plan.workouts,
    { from: plan.planStartDate, to: plan.planEndDate },
    baseline.paces,
  );

  return {
    valid: true,
    errors: [],
    advisories: computeAdvisories(plan.workouts, days, baseline, today, plan.goal.distanceMeters),
  };
}

/** A workout in the athlete's existing plan, as the client echoes it back. */
export interface CurrentPlanWorkout extends PlanWorkout {
  id: string;
}

interface PlanAdjustmentChange {
  workoutId: string | null;
  changeType: "modify" | "insert" | "remove";
  after: PlanWorkout | null;
}

interface PlanAdjustmentPayload {
  triggerEvent: { workoutId: string };
  changes: PlanAdjustmentChange[];
}

/** The plan as it would stand if the proposed changes were accepted. Keyed by workout id so a
 * `modify` replaces in place; inserts get synthetic keys, and removes drop out. */
function applyAdjustment(
  current: readonly CurrentPlanWorkout[],
  changes: readonly PlanAdjustmentChange[],
): PlanWorkout[] {
  const byKey = new Map<string, PlanWorkout>(current.map((w) => [w.id, w]));
  changes.forEach((change, index) => {
    if (change.changeType === "remove") {
      if (change.workoutId) byKey.delete(change.workoutId);
      return;
    }
    if (!change.after) return;
    const key =
      change.changeType === "modify" && change.workoutId ? change.workoutId : `inserted-${index}`;
    byKey.set(key, change.after);
  });
  return [...byKey.values()];
}

/**
 * The subset of the training-science checks worth running on an adjustment.
 *
 * An adjustment is scoped to the next week or two, so whole-plan observations — taper depth,
 * cutback cadence, long-run share — would be noise about weeks the change never touched. What a
 * reshuffle genuinely can break is the two things adjustmentRules.ts explicitly tells the coach to
 * protect: it can drop a long run next to a quality session, and it can turn an already-scheduled
 * long run into a single-session spike, because a fortnight of skipped training quietly lowers
 * what the athlete has actually built up to. Both are checked against the plan as it would stand
 * after the change, not the plan as written.
 */
function computeAdjustmentAdvisories(
  resulting: PlanWorkout[],
  changes: readonly PlanAdjustmentChange[],
  baseline: PlanBaseline,
  today: string,
): string[] {
  const touchedDates = new Set(changes.flatMap((c) => (c.after ? [c.after.date] : [])));
  return [
    ...computeSpikeAdvisories(resulting, baseline, today),
    ...computeAdjacencyAdvisories(resulting, touchedDates),
  ];
}

/**
 * Validates a propose_plan_adjustment tool-call payload against the schema, and additionally
 * checks every referenced workoutId exists in the plan the client echoed in the request —
 * this catches Claude hallucinating an ID, which the JSON schema alone can't express.
 *
 * `currentWorkouts` is that echoed plan; the ids it carries are the only ones the payload may
 * reference, and its contents are what the proposed changes are applied to for the advisories.
 */
export function validatePlanAdjustment(
  input: unknown,
  currentWorkouts: readonly CurrentPlanWorkout[],
  baseline: PlanBaseline = {},
  today: string = new Date().toISOString().slice(0, 10),
): ValidationResult {
  const schemaValid = validatePlanAdjustmentSchema(input);
  const errors = schemaValid ? [] : formatErrors(validatePlanAdjustmentSchema.errors);
  if (!schemaValid) return { valid: false, errors };

  const knownWorkoutIds = new Set(currentWorkouts.map((w) => w.id));
  const payload = input as PlanAdjustmentPayload;
  if (!knownWorkoutIds.has(payload.triggerEvent.workoutId)) {
    errors.push(
      `triggerEvent.workoutId "${payload.triggerEvent.workoutId}" does not exist in the current plan`,
    );
  }
  payload.changes.forEach((change, index) => {
    if (change.workoutId !== null && !knownWorkoutIds.has(change.workoutId)) {
      errors.push(
        `changes[${index}].workoutId "${change.workoutId}" does not exist in the current plan`,
      );
    }
  });
  if (errors.length > 0) return { valid: false, errors };

  const resulting = applyAdjustment(currentWorkouts, payload.changes);
  return {
    valid: true,
    errors: [],
    advisories: computeAdjustmentAdvisories(resulting, payload.changes, baseline, today),
  };
}
