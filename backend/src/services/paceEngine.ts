/**
 * Derives training paces and race-time equivalences from a *recent actual performance*.
 *
 * Why this exists: the coach previously prescribed paces with no performance benchmark at all, so
 * every "~5:00/km" in a plan was invented. The evidence audit (docs/research/research_output.md,
 * assumption 17 + Gap Analysis) calls this the single most consequential defect in the generator,
 * and specifically warns against the tempting alternative — deriving paces from the athlete's
 * *goal* time, which systematically prescribes paces the athlete cannot yet hold and raises injury
 * and overtraining risk. So: paces come from what they have already run; the goal time is only
 * used to sanity-check ambition (see assessGoal).
 *
 * The model is Daniels & Gilbert's VDOT (a practitioner model — widely used and internally
 * consistent, never formally validated in peer review), cross-checked for race equivalence with
 * Riegel's power law. Both are drivable from a single Strava effort, which is the only data we
 * actually have.
 */

/** One candidate performance out of the athlete's Strava history. */
export interface BenchmarkEffort {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Strava activity title — the only signal we have for "was this an actual race?". */
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Cumulative ascent, from Strava's `total_elevation_gain`. */
  elevationGainMeters?: number;
  /** Highest point minus lowest, from Strava's `elev_high`/`elev_low`. */
  elevationRangeMeters?: number;
  /** Treadmill or virtual run — Strava's `trainer` flag, or a `VirtualRun` activity type. */
  isTreadmill?: boolean;
}

/**
 * How much of the route was net descent, estimated from the two elevation figures Strava gives us
 * for an activity summary.
 *
 * There is no "net elevation change" field, but the pair implies one. A loop or an out-and-back
 * climbs everything it descends, so cumulative gain meets or exceeds the high-to-low range and
 * this comes out at zero. A point-to-point run down a hill has a large range and almost no gain,
 * and the difference approximates the drop.
 */
function netDescentMeters(effort: BenchmarkEffort): number {
  const { elevationGainMeters, elevationRangeMeters } = effort;
  if (elevationGainMeters === undefined || elevationRangeMeters === undefined) return 0;
  return Math.max(0, elevationRangeMeters - elevationGainMeters);
}

export interface PaceZones {
  /** Daniels' E band, slowest-to-fastest, in seconds per km. Easy running is a range, not a point;
   * prescribing a single easy pace tends to make easy days creep faster than intended. */
  easySecPerKm: [number, number];
  /** M pace — sustainable for a marathon; the natural target for long-run finishes and race-pace
   * work for marathoners. */
  marathonSecPerKm: number;
  /** T pace — threshold/LT2, ~1 hour race effort. This is what `type: "tempo"` means. */
  thresholdSecPerKm: number;
  /** I pace — ~vVO2max, the target for 3-5 min reps. This is what `type: "interval"` means. */
  intervalSecPerKm: number;
  /** R pace — faster than VO2max, for strides and short neuromuscular reps. */
  repetitionSecPerKm: number;
}

export type BenchmarkConfidence = "race" | "training_effort";

export interface Prescription {
  benchmark: BenchmarkEffort;
  /** "race" when the activity title looks like an actual race or time trial, in which case the
   * effort was maximal and VDOT is meaningful. Otherwise the effort was probably sub-maximal, VDOT
   * under-reads, and the derived paces are a conservative floor — which is the safe direction to
   * be wrong in, but the coach should say so and ask. */
  confidence: BenchmarkConfidence;
  vdot: number;
  paces: PaceZones;
  /**
   * Equivalent time for the goal race distance, from VDOT and from Riegel — null when the goal
   * distance wasn't supplied. Reporting the benchmark's own time back as a "race equivalent" in
   * that case would state something we don't know, and the coach would act on it.
   */
  predictedRaceSeconds: number | null;
  goal?: GoalAssessment;
}

export interface GoalAssessment {
  goalSeconds: number;
  predictedSeconds: number;
  /** How much faster than current fitness the goal is, as a fraction of the predicted time. */
  improvementNeeded: number;
  verdict: "in_reach" | "ambitious" | "unrealistic";
  goalRacePaceSecPerKm: number;
}

// --- Daniels & Gilbert ------------------------------------------------------------------------

/** Oxygen cost of running at a given velocity (m/min), in ml/kg/min. */
function vo2Cost(metersPerMin: number): number {
  return -4.6 + 0.182258 * metersPerMin + 0.000104 * metersPerMin * metersPerMin;
}

/** Inverse of vo2Cost — the velocity (m/min) an athlete holds at a given oxygen cost. */
function velocityForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** The fraction of VO2max sustainable for an all-out effort of the given duration. */
function sustainableFraction(minutes: number): number {
  return (
    0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/** VDOT implied by running `distanceMeters` in `durationSeconds` at maximal effort. */
export function vdotFor(distanceMeters: number, durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  return vo2Cost(distanceMeters / minutes) / sustainableFraction(minutes);
}

/**
 * Time to race `distanceMeters` at a given VDOT — the inverse of vdotFor, solved numerically
 * because sustainableFraction has no closed-form inverse. vdotFor is strictly decreasing in
 * duration at a fixed distance, so a bisection converges cleanly.
 */
export function raceTimeForVdot(vdot: number, distanceMeters: number): number {
  let lo = 60;
  let hi = 8 * 60 * 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFor(distanceMeters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function paceZonesFor(vdot: number): PaceZones {
  const paceAt = (fractionOfVdot: number) => 60000 / velocityForVo2(vdot * fractionOfVdot);
  return {
    // Percentages of VDOT per Daniels' zone definitions; the easy band is 62-70% rather than the
    // often-quoted 59-74% because the wider band's fast end runs closer to marathon pace than to
    // anything an athlete would recognise as conversational.
    easySecPerKm: [paceAt(0.62), paceAt(0.7)],
    marathonSecPerKm: paceAt(0.84),
    thresholdSecPerKm: paceAt(0.88),
    intervalSecPerKm: paceAt(0.975),
    repetitionSecPerKm: paceAt(1.06),
  };
}

// --- Riegel ----------------------------------------------------------------------------------

const RIEGEL_EXPONENT = 1.06;
/**
 * Riegel is accurate between adjacent distances but over-optimistic for the marathon, especially
 * extrapolating from a short race by a recreational runner (research_output.md, Gap Analysis 2).
 * A flat buffer on marathon-length extrapolations is the simplest honest correction.
 */
const MARATHON_EXTRAPOLATION_BUFFER = 1.04;
const HALF_MARATHON_METERS = 21097;
const MARATHON_METERS = 42195;

export function riegelSeconds(
  fromMeters: number,
  fromSeconds: number,
  toMeters: number,
): number {
  const raw = fromSeconds * Math.pow(toMeters / fromMeters, RIEGEL_EXPONENT);
  const extrapolatingToMarathon = toMeters >= MARATHON_METERS * 0.95 && fromMeters < HALF_MARATHON_METERS;
  return extrapolatingToMarathon ? raw * MARATHON_EXTRAPOLATION_BUFFER : raw;
}

// --- Benchmark selection ---------------------------------------------------------------------

/** Below this, the effort is too short for the VDOT curve fit to mean much. */
const MIN_BENCHMARK_METERS = 3000;
const MIN_BENCHMARK_SECONDS = 8 * 60;
const MAX_BENCHMARK_SECONDS = 4 * 60 * 60;
/** Fitness moves; a benchmark older than this describes a different athlete. */
const MAX_BENCHMARK_AGE_DAYS = 120;
/**
 * Net descent, as a fraction of distance, beyond which a time overstates flat fitness enough to
 * disqualify it as a benchmark. This is a judgment call rather than a number from the literature:
 * 1% is permissive enough to keep the gently net-downhill road races most people actually run,
 * while excluding the run down a mountain that would otherwise win its distance band on pace.
 *
 * The asymmetry is deliberate. A benchmark that *understates* fitness — a hilly run, a hard
 * training effort that wasn't maximal — yields paces that are too easy, which costs a little
 * training stimulus. One that overstates it prescribes paces the athlete cannot hold, which is the
 * error the audit specifically ties to injury risk. So climbing is tolerated and descent is not.
 */
const MAX_NET_DESCENT_FRACTION = 0.01;
/**
 * Treadmill efforts count fully as training — they are real load, and the volume and spike figures
 * include them — but they are not usable as a performance benchmark. Two independent reasons: the
 * distance is estimated by the belt or a foot pod rather than measured, so it carries a calibration
 * error of unknown size and direction; and running at a given pace indoors is easier than outdoors
 * because there is no air resistance to overcome, so the time flatters road fitness slightly.
 * Deriving road paces from one lands on the optimistic side of both, which is the error direction
 * the audit ties to injury risk — the same reasoning that rejects a net-downhill effort.
 */
/** Above this fraction of distance climbed, the pace materially understates the effort; worth
 * telling the coach, since it means the derived paces are on the conservative side. */
const HILLY_GAIN_FRACTION = 0.015;

const RACE_TITLE_PATTERN =
  /\b(race|parkrun|park run|time ?trial|\btt\b|championship|marathon|half|10k|5k|competition|event)\b/i;

/** Long enough, recent enough, and not absurd — i.e. the effort is the right *shape* to reason
 * about, before asking whether the conditions it was run in make its time trustworthy. */
function isWellFormed(effort: BenchmarkEffort, today: string): boolean {
  const ageDays =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${effort.date}T00:00:00Z`)) / 86_400_000;
  return (
    effort.distanceMeters >= MIN_BENCHMARK_METERS &&
    effort.durationSeconds >= MIN_BENCHMARK_SECONDS &&
    effort.durationSeconds <= MAX_BENCHMARK_SECONDS &&
    ageDays >= 0 &&
    ageDays <= MAX_BENCHMARK_AGE_DAYS
  );
}

function isDownhillAided(effort: BenchmarkEffort): boolean {
  return netDescentMeters(effort) > effort.distanceMeters * MAX_NET_DESCENT_FRACTION;
}

function isPlausible(effort: BenchmarkEffort, today: string): boolean {
  return isWellFormed(effort, today) && !effort.isTreadmill && !isDownhillAided(effort);
}

/**
 * Picks the effort that implies the highest VDOT. Comparing on VDOT rather than on raw pace is the
 * whole point: a hard 5km and a strong 16km are not comparable on pace, but they are on VDOT, so
 * this correctly prefers whichever was actually the better performance.
 */
export function pickBenchmark(
  candidates: readonly BenchmarkEffort[],
  today: string,
): BenchmarkEffort | null {
  const usable = candidates.filter((c) => isPlausible(c, today));
  if (usable.length === 0) return null;
  return usable.reduce((best, c) =>
    vdotFor(c.distanceMeters, c.durationSeconds) > vdotFor(best.distanceMeters, best.durationSeconds)
      ? c
      : best,
  );
}

// --- Goal realism ----------------------------------------------------------------------------

/**
 * Bands for how much improvement over current fitness a single training block can deliver. These
 * are coaching convention, not a finding from the evidence audit — the audit establishes only that
 * race time *is* predictable from training history (Emig & Peltonen 2020, ~2% mean error, with
 * substantial individual scatter), not how much an athlete can improve. They are deliberately
 * generous: the point is to catch a goal that is wildly out of reach, not to talk anyone down.
 */
const IN_REACH_IMPROVEMENT = 0.03;
const AMBITIOUS_IMPROVEMENT = 0.08;

export function assessGoal(
  predictedSeconds: number,
  goalSeconds: number,
  raceDistanceMeters: number,
): GoalAssessment {
  const improvementNeeded = (predictedSeconds - goalSeconds) / predictedSeconds;
  return {
    goalSeconds,
    predictedSeconds,
    improvementNeeded,
    verdict:
      improvementNeeded <= IN_REACH_IMPROVEMENT
        ? "in_reach"
        : improvementNeeded <= AMBITIOUS_IMPROVEMENT
          ? "ambitious"
          : "unrealistic",
    goalRacePaceSecPerKm: goalSeconds / (raceDistanceMeters / 1000),
  };
}

// --- Assembly + formatting -------------------------------------------------------------------

export function buildPrescription(
  candidates: readonly BenchmarkEffort[],
  today: string,
  raceDistanceMeters?: number,
  goalSeconds?: number,
): Prescription | null {
  const benchmark = pickBenchmark(candidates, today);
  if (!benchmark) return null;

  const vdot = vdotFor(benchmark.distanceMeters, benchmark.durationSeconds);
  // Two independent estimates of the same race time; taking the slower one keeps the plan from
  // being built on the more optimistic of two models, per the audit's conservatism principle.
  const predictedRaceSeconds =
    raceDistanceMeters === undefined
      ? null
      : Math.max(
          raceTimeForVdot(vdot, raceDistanceMeters),
          riegelSeconds(benchmark.distanceMeters, benchmark.durationSeconds, raceDistanceMeters),
        );

  return {
    benchmark,
    confidence: RACE_TITLE_PATTERN.test(benchmark.name) ? "race" : "training_effort",
    vdot,
    paces: paceZonesFor(vdot),
    predictedRaceSeconds,
    goal:
      goalSeconds !== undefined && raceDistanceMeters !== undefined && predictedRaceSeconds !== null
        ? assessGoal(predictedRaceSeconds, goalSeconds, raceDistanceMeters)
        : undefined,
  };
}

export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** The block injected into the create_plan prompt. Prose rather than JSON because it carries
 * caveats the coach needs to reason about and repeat to the athlete, not just numbers. */
export function formatPrescription(p: Prescription): string {
  const km = (p.benchmark.distanceMeters / 1000).toFixed(1);
  const lines = [
    `Derived from the athlete's own recent running — use these paces rather than inventing any.`,
    `Benchmark: ${km}km in ${formatDuration(p.benchmark.durationSeconds)} on ${p.benchmark.date} ("${p.benchmark.name}"), implying VDOT ${p.vdot.toFixed(1)}.`,
    p.confidence === "race"
      ? `That looks like a race or time trial, so treat it as a true maximal effort.`
      : `That was a training run, not a race, so it was probably not maximal — these paces are a conservative floor. Mention that to the athlete and ask whether they have a recent race or time-trial result, or would run one.`,
    `Training paces, each with the effort that goes with it:`,
    `- easy / recovery / most of the long run: ${formatPace(p.paces.easySecPerKm[1])} to ${formatPace(p.paces.easySecPerKm[0])} — conversational, full sentences`,
    `- marathon pace: ${formatPace(p.paces.marathonSecPerKm)} — steady and controlled`,
    `- tempo (threshold): ${formatPace(p.paces.thresholdSecPerKm)} — comfortably hard, about an hour's race effort`,
    `- interval (3-5 min reps at ~vVO2max): ${formatPace(p.paces.intervalSecPerKm)} — hard, about 5K race effort`,
    `- strides / short reps: ${formatPace(p.paces.repetitionSecPerKm)} — fast and relaxed, not a sprint`,
    `Give both in workout descriptions. A pace is a flat-ground, temperate-weather number: on hills, in heat, or on a treadmill it stops describing the intended physiological effort, and the athlete should run the effort instead. Pace is the prescription unit, not the point.`,
  ];

  if (
    p.benchmark.elevationGainMeters !== undefined &&
    p.benchmark.elevationGainMeters > p.benchmark.distanceMeters * HILLY_GAIN_FRACTION
  ) {
    lines.push(
      `That benchmark climbed ${Math.round(p.benchmark.elevationGainMeters)}m, so the effort was harder than its pace suggests and these paces sit on the conservative side.`,
    );
  }

  if (p.predictedRaceSeconds !== null) {
    lines.push(
      `Equivalent time for the goal race distance at current fitness: ${formatDuration(p.predictedRaceSeconds)}.`,
    );
  }

  if (p.goal) {
    const pct = `${Math.abs(p.goal.improvementNeeded * 100).toFixed(1)}%`;
    const goalLine =
      p.goal.verdict === "in_reach"
        ? `The athlete's goal of ${formatDuration(p.goal.goalSeconds)} (${formatPace(p.goal.goalRacePaceSecPerKm)}) is roughly where their current fitness already sits — build the plan around it.`
        : p.goal.verdict === "ambitious"
          ? `The athlete's goal of ${formatDuration(p.goal.goalSeconds)} (${formatPace(p.goal.goalRacePaceSecPerKm)}) needs about ${pct} off their current equivalent — ambitious but a realistic target for a full block. Say so, and build race-pace work at goal pace.`
          : `The athlete's goal of ${formatDuration(p.goal.goalSeconds)} (${formatPace(p.goal.goalRacePaceSecPerKm)}) needs about ${pct} off their current equivalent, which is more than a single block usually delivers. Tell them plainly, suggest a realistic target time, and prescribe training paces from current fitness regardless — do not train them at a pace they cannot yet hold.`;
    lines.push(goalLine);
  } else if (p.predictedRaceSeconds !== null) {
    lines.push(
      `The athlete has not given a goal time. If one would help shape race-pace work, ask for it — and check it against the equivalent time above rather than accepting it uncritically.`,
    );
  } else {
    lines.push(
      `No goal race distance was supplied, so there's no equivalent race time to compare against. If the athlete names a goal time, sanity-check it against these paces rather than accepting it uncritically.`,
    );
  }

  return lines.join("\n");
}

const NO_BENCHMARK_BASE = `Do not invent pace numbers. Instead:
- Prescribe by effort in workout descriptions ("conversational", "comfortably hard, ~1h race effort", "5K effort"), and leave targetPaceSecPerKm null.
- Tell the athlete that paces are effort-based for now, and suggest a benchmark early in the plan — a parkrun, a local race, or a 20-minute time trial — so the plan can be re-paced from a real result.
- Schedule that benchmark effort as a workout if it fits the block.`;

/**
 * What to tell the coach when no usable benchmark exists — as important as the happy path, since
 * silently falling back to invented paces is the exact defect this module was added to fix.
 *
 * When the athlete does have recent hard efforts and every one was rejected, "nothing found" would
 * be wrong twice over: it isn't true, and the coach would repeat it to someone who knows perfectly
 * well what they have been running. So the reason gets named instead.
 */
export function noBenchmarkGuidance(candidates: readonly BenchmarkEffort[], today: string): string {
  const wellFormed = candidates.filter((c) => isWellFormed(c, today));
  const reasons: string[] = [];
  if (wellFormed.some((c) => c.isTreadmill)) {
    reasons.push(
      "their recent hard efforts were on a treadmill, where the distance is device-estimated and a given pace is easier than it would be outdoors, so the time can't be converted into road paces",
    );
  }
  if (wellFormed.some((c) => isDownhillAided(c))) {
    reasons.push(
      "their fastest recent run was substantially net-downhill, so its pace overstates what they could hold on the flat",
    );
  }

  const opening =
    reasons.length > 0
      ? `No usable performance benchmark: ${reasons.join("; and ")}. Say so if it comes up, rather than telling them nothing was found — they have obviously been training.`
      : `No usable recent performance was found in the athlete's Strava history (a race, parkrun, or hard time trial of 3km or more in the last few months), so there is no basis for prescribing specific paces.`;

  return `${opening}\n\n${NO_BENCHMARK_BASE}`;
}
