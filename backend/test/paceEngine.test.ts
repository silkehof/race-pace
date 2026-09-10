import { describe, expect, it } from "vitest";
import {
  assessGoal,
  buildPrescription,
  formatPrescription,
  paceZonesFor,
  pickBenchmark,
  raceTimeForVdot,
  noBenchmarkGuidance,
  riegelSeconds,
  vdotFor,
  type BenchmarkEffort,
} from "../src/services/paceEngine.js";

const TODAY = "2026-08-29";

function effort(overrides: Partial<BenchmarkEffort> = {}): BenchmarkEffort {
  return {
    date: "2026-08-15",
    name: "Morning run",
    distanceMeters: 5000,
    durationSeconds: 20 * 60,
    ...overrides,
  };
}

describe("VDOT", () => {
  // Spot-checked against Daniels' published tables. These are the numbers every prescribed pace in
  // a plan now rests on, so a silent drift in the constants would mis-pace every workout the app
  // ever writes — worth pinning even though the formula itself is unlikely to change.
  it("matches Daniels' table for a 20-minute 5K", () => {
    expect(vdotFor(5000, 20 * 60)).toBeCloseTo(49.8, 1);
  });

  it("rates a slower runner lower and a faster one higher", () => {
    expect(vdotFor(5000, 25 * 60)).toBeLessThan(vdotFor(5000, 20 * 60));
    expect(vdotFor(5000, 17 * 60)).toBeGreaterThan(vdotFor(5000, 20 * 60));
  });

  it("derives training paces in the right order and near Daniels' published values", () => {
    const paces = paceZonesFor(vdotFor(5000, 20 * 60));
    const [easySlow, easyFast] = paces.easySecPerKm;
    expect(easySlow).toBeGreaterThan(easyFast);
    expect(easyFast).toBeGreaterThan(paces.marathonSecPerKm);
    expect(paces.marathonSecPerKm).toBeGreaterThan(paces.thresholdSecPerKm);
    expect(paces.thresholdSecPerKm).toBeGreaterThan(paces.intervalSecPerKm);
    expect(paces.intervalSecPerKm).toBeGreaterThan(paces.repetitionSecPerKm);
    // Daniels puts threshold for VDOT 50 at about 4:15/km.
    expect(paces.thresholdSecPerKm).toBeCloseTo(256, -1);
  });

  it("round-trips a race time back to the VDOT it came from", () => {
    const vdot = vdotFor(10000, 42 * 60);
    expect(raceTimeForVdot(vdot, 10000)).toBeCloseTo(42 * 60, 0);
  });
});

describe("Riegel", () => {
  it("predicts a 10K from a 5K at roughly the textbook 2.08x", () => {
    expect(riegelSeconds(5000, 20 * 60, 10000)).toBeCloseTo(20 * 60 * Math.pow(2, 1.06), 0);
  });

  // Riegel is known to be over-optimistic extrapolating a marathon from a short race for a
  // recreational runner, so the marathon prediction carries a buffer rather than being taken flat.
  it("adds a buffer when extrapolating to the marathon from a short race", () => {
    const flat = 20 * 60 * Math.pow(42195 / 5000, 1.06);
    expect(riegelSeconds(5000, 20 * 60, 42195)).toBeGreaterThan(flat);
  });

  it("does not buffer an equivalence between adjacent distances", () => {
    expect(riegelSeconds(10000, 42 * 60, 21097)).toBeCloseTo(42 * 60 * Math.pow(21097 / 10000, 1.06), 0);
  });
});

describe("pickBenchmark", () => {
  it("prefers the better performance, not the faster pace", () => {
    const sprint = effort({ name: "Quick 5k", distanceMeters: 5000, durationSeconds: 22 * 60 });
    const strongLongRun = effort({ name: "Half marathon", distanceMeters: 21097, durationSeconds: 92 * 60 });
    // The 5K is a full minute per km faster, but the half is by far the better run — comparing on
    // pace alone would throw away the athlete's actual best performance.
    expect(pickBenchmark([sprint, strongLongRun], TODAY)).toBe(strongLongRun);
  });

  // A downhill run wins its distance band on pace and would prescribe training paces the athlete
  // can't hold on the flat — the one error direction the audit ties to injury risk.
  it("rejects a net-downhill effort but keeps a hilly one", () => {
    const downhill = effort({ name: "Mountain descent", elevationGainMeters: 20, elevationRangeMeters: 400 });
    expect(pickBenchmark([downhill], TODAY)).toBeNull();

    // A loop climbs everything it descends, so gain meets or exceeds the range and nothing is
    // subtracted; a climb-heavy effort understates fitness, which is the safe direction.
    const hillyLoop = effort({ name: "Hilly loop", elevationGainMeters: 220, elevationRangeMeters: 120 });
    expect(pickBenchmark([hillyLoop], TODAY)).toBe(hillyLoop);
  });

  // A treadmill effort is real training and counts fully toward volume, but its distance is
  // device-estimated and its pace flatters road fitness, so it can't set road paces.
  it("rejects a treadmill effort however good it looks", () => {
    const treadmill = effort({ name: "Gym intervals", durationSeconds: 17 * 60, isTreadmill: true });
    const road = effort({ name: "Saturday parkrun", durationSeconds: 22 * 60 });
    expect(pickBenchmark([treadmill], TODAY)).toBeNull();
    expect(pickBenchmark([treadmill, road], TODAY)).toBe(road);
  });

  it("ignores efforts too short, too long, or too old to mean anything", () => {
    expect(pickBenchmark([effort({ distanceMeters: 2000, durationSeconds: 9 * 60 })], TODAY)).toBeNull();
    expect(pickBenchmark([effort({ durationSeconds: 60 })], TODAY)).toBeNull();
    expect(pickBenchmark([effort({ date: "2025-01-01" })], TODAY)).toBeNull();
    expect(pickBenchmark([], TODAY)).toBeNull();
  });
});

describe("buildPrescription", () => {
  it("marks a race-titled effort as a maximal benchmark and a training run as a floor", () => {
    expect(buildPrescription([effort({ name: "Saturday parkrun" })], TODAY, 10000)?.confidence).toBe("race");
    expect(buildPrescription([effort({ name: "Tuesday session" })], TODAY, 10000)?.confidence).toBe(
      "training_effort",
    );
  });

  it("says when the benchmark was hilly, since that makes the paces conservative", () => {
    const p = buildPrescription(
      [effort({ name: "Hill race", elevationGainMeters: 300, elevationRangeMeters: 150 })],
      TODAY,
      10000,
    );
    expect(formatPrescription(p!)).toContain("climbed 300m");
  });

  it("pairs every pace with an effort cue and says when pace stops applying", () => {
    // Assumption 29: pace is fine as the prescription unit but needs a fallback for hills, heat
    // and treadmills, where the number stops describing the intended effort.
    const text = formatPrescription(buildPrescription([effort({ name: "parkrun" })], TODAY, 10000)!);
    expect(text).toContain("conversational");
    expect(text).toContain("about 5K race effort");
    expect(text).toContain("run the effort instead");
  });

  it("returns null when nothing in the history can serve as a benchmark", () => {
    // The caller's cue to tell Claude not to invent paces, rather than quietly falling back to
    // making numbers up — which is the defect this module exists to fix.
    expect(buildPrescription([effort({ date: "2024-03-01" })], TODAY, 10000)).toBeNull();
  });

  it("reports no race equivalent when the goal distance isn't known", () => {
    // Falling back to the benchmark's own distance would restate the athlete's parkrun time as an
    // "equivalent time for the goal race distance" — a number the coach would then act on.
    const p = buildPrescription([effort({ name: "parkrun" })], TODAY);
    expect(p?.predictedRaceSeconds).toBeNull();
    expect(formatPrescription(p!)).not.toContain("Equivalent time");
    expect(formatPrescription(p!)).toContain("No goal race distance was supplied");
  });

  it("takes the more conservative of the two race-time models", () => {
    const p = buildPrescription([effort({ name: "parkrun" })], TODAY, 42195);
    expect(p).not.toBeNull();
    expect(p!.predictedRaceSeconds!).toBeGreaterThanOrEqual(raceTimeForVdot(p!.vdot, 42195));
    expect(p!.predictedRaceSeconds!).toBeGreaterThanOrEqual(riegelSeconds(5000, 1200, 42195));
  });
});

describe("noBenchmarkGuidance", () => {
  it("names the reason when every candidate was rejected for how it was run", () => {
    const treadmill = noBenchmarkGuidance([effort({ isTreadmill: true })], TODAY);
    expect(treadmill).toContain("on a treadmill");
    expect(treadmill).toContain("Do not invent pace numbers");

    const downhill = noBenchmarkGuidance(
      [effort({ elevationGainMeters: 10, elevationRangeMeters: 300 })],
      TODAY,
    );
    expect(downhill).toContain("net-downhill");
  });

  it("falls back to plain absence when there was genuinely nothing to work with", () => {
    // An effort too old or too short was never a candidate, so there is no reason to explain.
    expect(noBenchmarkGuidance([effort({ date: "2024-01-01" })], TODAY)).toContain(
      "No usable recent performance was found",
    );
    expect(noBenchmarkGuidance([], TODAY)).toContain("No usable recent performance was found");
  });
});

describe("assessGoal", () => {
  it("separates a goal already within reach from one a single block will not deliver", () => {
    expect(assessGoal(3600, 3570, 10000).verdict).toBe("in_reach");
    expect(assessGoal(3600, 3400, 10000).verdict).toBe("ambitious");
    expect(assessGoal(3600, 3000, 10000).verdict).toBe("unrealistic");
  });

  it("reports goal race pace so race-pace work can be prescribed against it", () => {
    expect(assessGoal(3600, 3000, 10000).goalRacePaceSecPerKm).toBe(300);
  });
});
