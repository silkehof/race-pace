import { describe, expect, it } from "vitest";
import { validateCreateTrainingPlan, validatePlanAdjustment } from "../src/services/planValidation.js";

function validWorkout(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    date: "2026-09-01",
    type: "easy_run",
    targetDistanceMeters: 8000,
    targetDurationSeconds: null,
    targetPaceSecPerKm: null,
    description: "Easy 8k",
    coachNotes: null,
    ...overrides,
  };
}

function validPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    goal: {
      raceName: "City 10K",
      raceDate: "2026-11-01",
      distanceMeters: 10000,
      priority: "A",
    },
    planStartDate: "2026-09-01",
    planEndDate: "2026-11-01",
    workouts: [validWorkout()],
    rationale: "Build aerobic base then sharpen with race-pace work.",
    ...overrides,
  };
}

describe("validateCreateTrainingPlan", () => {
  it("accepts a well-formed plan", () => {
    const result = validateCreateTrainingPlan(validPlan());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a plan missing a required top-level field", () => {
    const { rationale, ...withoutRationale } = validPlan();
    const result = validateCreateTrainingPlan(withoutRationale);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an unknown workout type", () => {
    const plan = validPlan({ workouts: [validWorkout({ type: "yoga" })] });
    const result = validateCreateTrainingPlan(plan);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty workouts array", () => {
    const plan = validPlan({ workouts: [] });
    const result = validateCreateTrainingPlan(plan);
    expect(result.valid).toBe(false);
  });

  it("rejects an unrecognized top-level property", () => {
    const plan = validPlan({ notes: "extra" });
    const result = validateCreateTrainingPlan(plan);
    expect(result.valid).toBe(false);
  });
});

describe("validatePlanAdjustment", () => {
  const knownWorkoutIds = new Set(["w1", "w2"]);

  function validAdjustment(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      triggerEvent: { type: "skip", workoutId: "w1", details: "Sick today" },
      rationale: "Push the long run back a day and shorten it slightly.",
      changes: [
        {
          workoutId: "w2",
          changeType: "modify",
          before: validWorkout({ date: "2026-09-08" }),
          after: validWorkout({ date: "2026-09-09" }),
        },
      ],
      ...overrides,
    };
  }

  it("accepts a well-formed adjustment referencing known workout ids", () => {
    const result = validatePlanAdjustment(validAdjustment(), knownWorkoutIds);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts an insert change with a null workoutId", () => {
    const adjustment = validAdjustment({
      changes: [
        {
          workoutId: null,
          changeType: "insert",
          before: null,
          after: validWorkout({ date: "2026-09-10" }),
        },
      ],
    });
    const result = validatePlanAdjustment(adjustment, knownWorkoutIds);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("flags a hallucinated triggerEvent.workoutId even though the schema itself is satisfied", () => {
    const adjustment = validAdjustment({
      triggerEvent: { type: "skip", workoutId: "does-not-exist", details: "Sick today" },
    });
    const result = validatePlanAdjustment(adjustment, knownWorkoutIds);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'triggerEvent.workoutId "does-not-exist" does not exist in the current plan',
    ]);
  });

  it("flags a hallucinated changes[].workoutId", () => {
    const adjustment = validAdjustment({
      changes: [
        {
          workoutId: "does-not-exist",
          changeType: "modify",
          before: validWorkout(),
          after: validWorkout(),
        },
      ],
    });
    const result = validatePlanAdjustment(adjustment, knownWorkoutIds);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'changes[0].workoutId "does-not-exist" does not exist in the current plan',
    ]);
  });

  it("does not run the workoutId cross-check when the payload fails schema validation", () => {
    const adjustment = validAdjustment({ changes: [] });
    const result = validatePlanAdjustment(adjustment, knownWorkoutIds);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not exist in the current plan"))).toBe(
      false,
    );
  });
});
