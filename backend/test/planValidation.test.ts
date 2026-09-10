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

/** Quality sessions must carry the Warm-up/Main structure runPhaseFormat.ts mandates, and the
 * `Main:` line is what the intensity advisory measures — so fixtures for tempo/interval work have
 * to be written the way the coach is told to write them. A cooldown is optional (see
 * REQUIRED_PHASE_LABELS) but included here, since that is still the common shape. */
function qualityWorkout(overrides: Partial<Record<string, unknown>> = {}) {
  const { mainSet = "4km at tempo pace", ...rest } = overrides as { mainSet?: string };
  return validWorkout({
    type: "tempo",
    targetDistanceMeters: 8000,
    description: `Warm-up: 2km easy\nMain: ${mainSet}\nCooldown: 2km easy`,
    ...rest,
  });
}

/** Fixed so tests don't drift as real time passes — see validateCreateTrainingPlan's `today`. */
const TODAY = "2026-08-24";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validate(plan: unknown) {
  return validateCreateTrainingPlan(plan, TODAY);
}

/**
 * Scaffolds the structural requirements computeStructuralErrors enforces — a race workout on race
 * day, and a span bracketing the workouts — around whatever the test actually cares about, so each
 * case can pass just the workouts under test instead of restating a whole valid plan. Overrides
 * are applied last, so a test can still deliberately break one of them.
 */
function validPlan(overrides: Partial<Record<string, unknown>> = {}) {
  const { workouts: overrideWorkouts, ...rest } = overrides;
  const workouts = (overrideWorkouts as Array<Record<string, unknown>> | undefined) ?? [validWorkout()];

  const dates = workouts.map((w) => w.date as string).sort();
  const planStartDate = dates[0] ?? "2026-09-01";
  const planEndDate = dates[dates.length - 1] ?? "2026-09-01";
  const scaffolded =
    workouts.length === 0 || workouts.some((w) => w.type === "race")
      ? workouts
      : [
          ...workouts,
          validWorkout({ date: planEndDate, type: "race", targetDistanceMeters: 10000, description: "Race day" }),
        ];

  return {
    goal: {
      raceName: "City 10K",
      raceDate: planEndDate,
      distanceMeters: 10000,
      priority: "A",
    },
    planStartDate,
    planEndDate,
    workouts: scaffolded,
    rationale: "Build aerobic base then sharpen with race-pace work.",
    ...rest,
  };
}

describe("validateCreateTrainingPlan", () => {
  it("accepts a well-formed plan", () => {
    const result = validate(validPlan());
    expect(result).toEqual({ valid: true, errors: [], advisories: [] });
  });

  it("rejects a plan missing a required top-level field", () => {
    const { rationale, ...withoutRationale } = validPlan();
    const result = validate(withoutRationale);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an unknown workout type", () => {
    const plan = validPlan({ workouts: [validWorkout({ type: "yoga" })] });
    const result = validate(plan);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty workouts array", () => {
    const plan = validPlan({ workouts: [] });
    const result = validate(plan);
    expect(result.valid).toBe(false);
  });

  it("rejects an unrecognized top-level property", () => {
    const plan = validPlan({ notes: "extra" });
    const result = validate(plan);
    expect(result.valid).toBe(false);
  });

  // Nothing about training-science judgment (progression rate, taper depth, rest-day cadence,
  // back-to-back hard days) blocks the tool call — only schema shape and referential integrity
  // do. An experienced athlete may have good reason to push past any of these guidelines, so they
  // surface as advisory text instead of a rejection. See computeAdvisories in planValidation.ts.
  describe("advisories (guidelines are surfaced, never enforced)", () => {
    it("never rejects for training-science reasons, however far the plan deviates from the guidelines", () => {
      const plan = validPlan({
        workouts: [
          qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 8000 }),
          qualityWorkout({ date: "2026-09-02", type: "interval", targetDistanceMeters: 6000, mainSet: "6x500m at 5K effort" }),
          validWorkout({ date: "2026-09-08", type: "long_run", targetDistanceMeters: 30000 }),
          validWorkout({ date: "2026-09-15", type: "long_run", targetDistanceMeters: 40000 }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("flags two hard sessions on consecutive days as advisory", () => {
      const plan = validPlan({
        workouts: [
          qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 8000 }),
          qualityWorkout({ date: "2026-09-02", type: "interval", targetDistanceMeters: 6000, mainSet: "6x500m at 5K effort" }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("consecutive days"))).toBe(true);
    });

    // The 10% rule failed its only RCT and week-to-week ratios showed no relationship with injury
    // in the largest running dataset assembled; the single-session spike did. So ordinary weekly
    // growth passes silently and the guard watches individual runs against a rolling 30-day
    // window instead. See computeSpikeAdvisories in planValidation.ts.
    describe("single-session spike guard (replaces the 10% rule)", () => {
      it("says nothing about week-over-week long-run growth well past 10%", () => {
        const plan = validPlan({
          workouts: [
            validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 10000 }),
            validWorkout({ date: "2026-09-03", type: "rest", targetDistanceMeters: null, description: "Rest day" }),
            validWorkout({ date: "2026-09-08", type: "long_run", targetDistanceMeters: 11800 }),
            validWorkout({ date: "2026-09-15", type: "long_run", targetDistanceMeters: 13000 }),
          ],
        });
        const result = validate(plan);
        expect(result.valid).toBe(true);
        expect(result.advisories?.some((a) => a.includes("longest run of the prior 30 days"))).toBe(false);
      });

      it("flags a single run past twice the longest run of the prior 30 days", () => {
        const plan = validPlan({
          workouts: [
            validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 10000 }),
            validWorkout({ date: "2026-09-08", type: "long_run", targetDistanceMeters: 22000 }),
          ],
        });
        const result = validate(plan);
        expect(result.valid).toBe(true);
        expect(result.advisories?.some((a) => a.includes("2.2x the longest run of the prior 30 days"))).toBe(true);
      });

      it("uses the athlete's real Strava history to guard the plan's opening weeks", () => {
        const plan = validPlan({
          workouts: [
            validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 24000 }),
            validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 8000 }),
          ],
        });
        // Nothing inside the plan precedes that opening long run, so without the baseline the
        // first — and likeliest — spike is invisible.
        expect(
          validate(plan).advisories?.some((a) => a.includes("longest run of the prior 30 days")),
        ).toBe(false);
        const withBaseline = validateCreateTrainingPlan(plan, TODAY, {
          longestRecentRunMeters: 10000,
        });
        expect(withBaseline.valid).toBe(true);
        expect(
          withBaseline.advisories?.some((a) => a.includes("2.4x the longest run of the prior 30 days")),
        ).toBe(true);
      });

      it("ignores a doubling of a run too short for the jump to mean anything", () => {
        const plan = validPlan({
          workouts: [
            validWorkout({ date: "2026-09-01", type: "recovery", targetDistanceMeters: 3000 }),
            validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 7000 }),
          ],
        });
        const result = validate(plan);
        expect(result.advisories?.some((a) => a.includes("longest run of the prior 30 days"))).toBe(false);
      });
    });

    it("flags an opening week well beyond what the athlete has actually been running", () => {
      const plan = validPlan({
        workouts: [
          validWorkout({ date: "2026-08-25", type: "easy_run", targetDistanceMeters: 20000 }),
          validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 20000 }),
        ],
      });
      const result = validateCreateTrainingPlan(plan, TODAY, { recentWeeklyVolumeMeters: 12000 });
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("The plan opens at 20.0km"))).toBe(true);
    });

    it("flags a multi-week plan with no rest or recovery day anywhere as advisory", () => {
      const plan = validPlan({
        workouts: [
          validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 8000 }),
          validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 8500 }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("rest or recovery"))).toBe(true);
    });

    it("flags a race week that never eases off at all", () => {
      const plan = validPlan({
        workouts: [
          validWorkout({ date: "2026-08-25", type: "easy_run", targetDistanceMeters: 20000 }),
          validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 28000 }),
          validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 32000 }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("7 days to race day carry 100%"))).toBe(true);
    });

    // Bosquet et al. 2007: volume down by 41-60% from peak, reduced progressively, with intensity
    // and frequency held. A plan that holds peak volume until the final week satisfies the depth
    // check while missing the shape the evidence actually describes.
    it("flags a taper too short for the window the evidence covers", () => {
      const plan = validPlan({
        // Half marathon: far enough to have accumulated the fatigue a taper exists to shed.
        goal: { raceName: "Autumn Half", raceDate: "2026-09-08", distanceMeters: 21097, priority: "A" },
        workouts: [
          validWorkout({ date: "2026-08-25", type: "easy_run", targetDistanceMeters: 40000 }),
          validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 40000 }),
          validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 20000 }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("taper is only about 1 day long"))).toBe(true);
    });

    // Assumption 18: the taper evidence is built on events carrying real accumulated fatigue. A
    // 5K off modest mileage needs a few easy days, not a 41-60% cut, so holding it to the full
    // standard was telling the coach to fix a perfectly sensible race week.
    it("does not impose a half-marathon taper on a 5K", () => {
      const workouts = [
        validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 20000 }),
        validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 15000 }),
        validWorkout({ date: "2026-09-12", type: "race", targetDistanceMeters: 5000, description: "Race day" }),
      ];
      const shortRace = validate(
        validPlan({ goal: { raceName: "Park 5K", raceDate: "2026-09-12", distanceMeters: 5000, priority: "A" }, workouts }),
      );
      expect(shortRace.advisories?.some((a) => a.includes("7 days to race day"))).toBe(false);

      // The same 75%-of-peak race week before a marathon is a genuine problem.
      const longRace = validate(
        validPlan({
          goal: { raceName: "City Marathon", raceDate: "2026-09-12", distanceMeters: 42195, priority: "A" },
          workouts: [...workouts.slice(0, 2), validWorkout({ date: "2026-09-12", type: "race", targetDistanceMeters: 42195, description: "Race day" })],
        }),
      );
      expect(longRace.advisories?.some((a) => a.includes("7 days to race day carry 75%"))).toBe(true);
    });

    it("counts only running toward weekly volume, not a cross-training distance", () => {
      // A 60km bike ride would otherwise turn a 14km long run from 64% of a 22km running week
      // into 17% of a "78km week", silencing the advisory and skewing the taper ratio with it.
      const plan = validPlan({
        workouts: [
          validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 14000 }),
          validWorkout({ date: "2026-09-02", type: "cross_train", targetDistanceMeters: 60000, description: "60km bike" }),
          validWorkout({ date: "2026-09-03", type: "easy_run", targetDistanceMeters: 8000 }),
          validWorkout({ date: "2026-09-08", type: "race", targetDistanceMeters: 10000, description: "Race day" }),
        ],
      });
      expect(validate(plan).advisories?.some((a) => a.includes("is 64% of its week's volume"))).toBe(true);
    });

    // The same session written two ways must measure the same. Filtering recovery out of only one
    // of the two units made the reading depend on whether the coach wrote "90s" or "400m".
    it("excludes recovery from the main set whichever unit it is written in", () => {
      const withSeconds = validPlan({
        workouts: [qualityWorkout({ date: "2026-09-01", type: "interval", targetDistanceMeters: 6000, mainSet: "4x400m at 5K effort with 90s jog recovery" })],
      });
      const withMetres = validPlan({
        workouts: [qualityWorkout({ date: "2026-09-01", type: "interval", targetDistanceMeters: 6000, mainSet: "4x400m at 5K effort with 400m jog recovery" })],
      });
      expect(validate(withMetres).advisories).toEqual(validate(withSeconds).advisories);
      expect(validate(withMetres).advisories?.some((a) => a.includes("of running *time*"))).toBe(false);
    });

    it("tells the coach to build up to race distance rather than to shorten the race", () => {
      const plan = validPlan({
        goal: { raceName: "City Marathon", raceDate: "2026-09-13", distanceMeters: 42195, priority: "A" },
        workouts: [
          validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 18000 }),
          validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 8000 }),
          validWorkout({ date: "2026-09-13", type: "race", targetDistanceMeters: 42195, description: "Race day" }),
        ],
      });
      const raceAdvisory = validate(plan).advisories?.find((a) => a.includes("(race,"));
      expect(raceAdvisory).toContain("never builds close enough to race distance");
      expect(raceAdvisory).not.toContain("shorten it");
    });

    // The artefact the load literature objects to in calendar-week accounting: a Sunday long run
    // and the days that follow it belong to the same block of training, but a Monday boundary
    // splits them, leaving the long run alone in a "week" it necessarily dominates.
    it("does not read a Sunday long run as its own week", () => {
      const plan = validPlan({
        workouts: [
          validWorkout({ date: "2026-08-30", type: "long_run", targetDistanceMeters: 14000 }),
          validWorkout({ date: "2026-08-31", type: "easy_run", targetDistanceMeters: 9000 }),
          validWorkout({ date: "2026-09-01", type: "easy_run", targetDistanceMeters: 9000 }),
          validWorkout({ date: "2026-09-02", type: "easy_run", targetDistanceMeters: 9000 }),
          validWorkout({ date: "2026-09-08", type: "race", targetDistanceMeters: 10000, description: "Race day" }),
        ],
      });
      // Monday-anchored, that long run is 100% of the week of 2026-08-24. Over the 7 days it
      // actually sits in, it is 34% — an ordinary long run.
      expect(validate(plan).advisories?.some((a) => a.includes("of its week's volume"))).toBe(false);
    });

    it("flags an opening week that adds running days the athlete doesn't currently run", () => {
      const plan = validPlan({
        workouts: [
          ...["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((date) =>
            validWorkout({ date, type: "easy_run", targetDistanceMeters: 5000 }),
          ),
          validWorkout({ date: "2026-09-08", type: "race", targetDistanceMeters: 10000, description: "Race day" }),
        ],
      });
      const result = validateCreateTrainingPlan(plan, TODAY, {
        recentWeeklyVolumeMeters: 30000,
        establishedRunDaysPerWeek: 3,
      });
      // Volume is fine; it's the jump from three running days to six that won't get followed.
      expect(result.advisories?.some((a) => a.includes("The plan opens at"))).toBe(false);
      expect(result.advisories?.some((a) => a.includes("6 running days in its first 7"))).toBe(true);
    });

    it("flags a long build with no deload anywhere in it", () => {
      const workouts = Array.from({ length: 8 }, (_, week) =>
        [0, 2, 5].map((offset) =>
          validWorkout({
            date: addDays("2026-08-31", week * 7 + offset),
            type: offset === 5 ? "long_run" : "easy_run",
            targetDistanceMeters: offset === 5 ? 12000 + week * 500 : 9000 + week * 250,
          }),
        ),
      ).flat();
      const plan = validPlan({
        workouts: [...workouts, validWorkout({ date: "2026-10-25", type: "race", targetDistanceMeters: 10000, description: "Race day" })],
      });
      expect(validate(plan).advisories?.some((a) => a.includes("No cutback week"))).toBe(true);
    });

    // The mirror of the too-hard check, and a live risk now that intensity is measured in time:
    // correcting the distance-based accounting runs toward under-prescribing quality, not over.
    it("flags a long block with essentially no quality work in it", () => {
      const workouts = Array.from({ length: 8 }, (_, week) =>
        [0, 2, 5].map((offset) =>
          validWorkout({
            date: addDays("2026-08-31", week * 7 + offset),
            type: offset === 5 ? "long_run" : "easy_run",
            targetDistanceMeters: 10000,
          }),
        ),
      ).flat();
      const plan = validPlan({
        workouts: [...workouts, validWorkout({ date: "2026-10-25", type: "race", targetDistanceMeters: 10000, description: "Race day" })],
      });
      expect(validate(plan).advisories?.some((a) => a.includes("only 0% of running time"))).toBe(true);
    });

    it("flags a third quality session in a week too small to carry one", () => {
      const plan = validPlan({
        workouts: [
          qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 8000 }),
          qualityWorkout({ date: "2026-09-03", type: "interval", targetDistanceMeters: 8000, mainSet: "5x800m at 5K effort" }),
          qualityWorkout({ date: "2026-09-05", type: "race_pace", targetDistanceMeters: 8000, mainSet: "5km at race pace" }),
          validWorkout({ date: "2026-09-06", type: "easy_run", targetDistanceMeters: 6000 }),
          validWorkout({ date: "2026-09-08", type: "race", targetDistanceMeters: 10000, description: "Race day" }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      expect(result.advisories?.some((a) => a.includes("3 quality sessions"))).toBe(true);
    });

    it("excludes race-day distance from volume so race week doesn't look like a taper blowup", () => {
      const plan = validPlan({
        // A marathon, so the full taper expectation applies — a 5K's race week is held to a much
        // weaker standard (see FULL_TAPER_MIN_RACE_METERS).
        goal: { raceName: "City Marathon", raceDate: "2026-09-08", distanceMeters: 42195, priority: "A" },
        workouts: [
          validWorkout({ date: "2026-09-01", type: "long_run", targetDistanceMeters: 20000 }),
          validWorkout({ date: "2026-09-03", type: "recovery", targetDistanceMeters: 3000 }),
          validWorkout({ date: "2026-09-08", type: "easy_run", targetDistanceMeters: 5000 }),
          validWorkout({ date: "2026-09-08", type: "race", targetDistanceMeters: 42195 }),
        ],
      });
      const result = validate(plan);
      expect(result.valid).toBe(true);
      // Counting the marathon itself, race week would come out at 100% of peak — a real taper
      // reported as no taper at all. Excluded, it reads as the 35% cut it actually is.
      expect(result.advisories?.some((a) => a.includes("100%"))).toBe(false);
      expect(result.advisories?.some((a) => a.includes("carry 35% of peak volume"))).toBe(true);
    });

    // Two things this ratio has to get right. It counts each quality session's `Main:` set rather
    // than the whole session — runPhaseFormat.ts wraps quality work in easy running, so charging
    // that to the hard column overstated intensity by 2-3x and flagged plans that were already
    // correct, which Claude then "fixes". And it measures time, not distance: easy running covers
    // less ground per minute, so 80/20 by distance is really about 85/15 by time.
    describe("intensity distribution counts the main set, measured in time", () => {
      it("does not flag a correctly balanced week whose quality sessions have warm-ups", () => {
        const plan = validPlan({
          workouts: [
            qualityWorkout({
              date: "2026-09-01",
              type: "tempo",
              targetDistanceMeters: 8000,
              mainSet: "4km at tempo pace (comfortably hard, ~5:00/km)",
            }),
            validWorkout({ date: "2026-09-02", targetDistanceMeters: 12000 }),
            qualityWorkout({
              date: "2026-09-03",
              type: "interval",
              targetDistanceMeters: 8000,
              mainSet: "6x500m at 5K effort with 90s jog recovery",
            }),
            validWorkout({ date: "2026-09-04", targetDistanceMeters: 12000 }),
          ],
        });
        // 40km total, 7km of it genuinely hard. Charging both full sessions to the hard column
        // instead reads as 40% and trips the guideline. The pace "~5:00/km" and the "90s"
        // recovery must not read as distances either, or the numbers move again.
        const result = validate(plan);
        expect(result.valid).toBe(true);
        expect(result.advisories?.some((a) => a.includes("of running *time*"))).toBe(false);
      });

      it("still flags a plan that is genuinely too hard", () => {
        const plan = validPlan({
          workouts: [
            qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 8000, mainSet: "6km at tempo pace" }),
            validWorkout({ date: "2026-09-02", targetDistanceMeters: 6000 }),
          ],
        });
        const result = validate(plan);
        expect(result.advisories?.some((a) => a.includes("of running *time*"))).toBe(true);
      });

      it("measures a main set written in minutes rather than metres", () => {
        const plan = validPlan({
          workouts: [
            qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 10000, mainSet: "35 minutes at threshold effort" }),
            validWorkout({ date: "2026-09-02", targetDistanceMeters: 5000 }),
          ],
        });
        // A time-based main set is a legitimate way to write a tempo, and now that the ratio is
        // computed in time it needs no conversion at all — 35 min of a ~90 min running week.
        const result = validate(plan);
        expect(result.advisories?.some((a) => a.includes("of running *time*"))).toBe(true);
      });

      it("does not count recovery jogs between reps as quality work", () => {
        const plan = validPlan({
          workouts: [
            qualityWorkout({
              date: "2026-09-01",
              type: "interval",
              targetDistanceMeters: 9000,
              mainSet: "5 x 3 min at 5K effort with 3 min jog recovery",
            }),
            validWorkout({ date: "2026-09-02", targetDistanceMeters: 10000 }),
            validWorkout({ date: "2026-09-04", targetDistanceMeters: 10000 }),
          ],
        });
        // 15 min of work, not the 30 min the line would read as if the jogs counted — which would
        // roughly double the measured intensity of every interval session in a plan.
        const result = validate(plan);
        expect(result.advisories?.some((a) => a.includes("of running *time*"))).toBe(false);
      });

      it("stays silent rather than guessing when the main set states no measurable work", () => {
        const plan = validPlan({
          workouts: [
            qualityWorkout({ date: "2026-09-01", type: "tempo", targetDistanceMeters: 8000, mainSet: "threshold effort, by feel" }),
            validWorkout({ date: "2026-09-02", targetDistanceMeters: 2000 }),
          ],
        });
        const result = validate(plan);
        expect(result.advisories?.some((a) => a.includes("of running *time*"))).toBe(false);
      });
    });
  });

  // Unlike the guidelines above, these are bugs rather than coaching judgment — broken output no
  // athlete would have a reason to want. See computeStructuralErrors in planValidation.ts.
  describe("structural errors (broken output, hard-rejected)", () => {
    it("rejects a plan that never schedules race day", () => {
      const plan = validPlan({
        goal: { raceName: "City 10K", raceDate: "2026-09-08", distanceMeters: 10000, priority: "A" },
      });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("on the goal race date"))).toBe(true);
    });

    it("rejects a workout scheduled outside the plan's own span", () => {
      const plan = validPlan({
        workouts: [validWorkout({ date: "2026-09-01" }), validWorkout({ date: "2026-09-20" })],
        planEndDate: "2026-09-01",
      });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("outside the plan's own span"))).toBe(true);
    });

    it("rejects a plan anchored weeks before today", () => {
      const plan = validPlan({ workouts: [validWorkout({ date: "2026-08-01" })] });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("days in the past"))).toBe(true);
    });

    it("rejects a plan that does not start until long after today", () => {
      const plan = validPlan({ workouts: [validWorkout({ date: "2026-11-01" })] });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("days away"))).toBe(true);
    });

    // The likeliest failure mode of generating a whole marathon block in one tool call: the model
    // loses steam partway and silently drops weeks. Nothing else would catch it.
    it("rejects a plan with a calendar week containing nothing at all", () => {
      const plan = validPlan({
        workouts: [validWorkout({ date: "2026-09-01" }), validWorkout({ date: "2026-09-21" })],
      });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("has no workouts at all"))).toBe(true);
    });

    it("rejects a quality session written without the mandated phase structure", () => {
      const plan = validPlan({ workouts: [validWorkout({ date: "2026-09-01", type: "tempo" })] });
      const result = validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Warm-up:"))).toBe(true);
    });

    // Warm-ups are well supported; cooldowns are not (Van Hooren & Peake 2018 found active
    // cool-downs largely ineffective for both recovery and injury prevention), so requiring one
    // was padding every quality session with work the evidence doesn't back.
    it("accepts a quality session with no cooldown", () => {
      const plan = validPlan({
        workouts: [
          validWorkout({
            date: "2026-09-01",
            type: "tempo",
            description: "Warm-up: 2km easy\nMain: 4km at tempo pace",
          }),
        ],
      });
      expect(validate(plan).valid).toBe(true);
    });
  });
});

describe("validatePlanAdjustment", () => {
  /** The plan the client echoes back: the ids an adjustment may reference, and the plan the
   * proposed changes are applied to before the advisories run. */
  const currentWorkouts = [
    { id: "w1", date: "2026-09-01", type: "easy_run", targetDistanceMeters: 10000, description: "Easy 10k" },
    { id: "w2", date: "2026-09-08", type: "long_run", targetDistanceMeters: 13000, description: "Long run" },
  ];

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
    const result = validatePlanAdjustment(validAdjustment(), currentWorkouts, {}, TODAY);
    expect(result).toEqual({ valid: true, errors: [], advisories: [] });
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
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
    expect(result).toEqual({ valid: true, errors: [], advisories: [] });
  });

  it("flags a hallucinated triggerEvent.workoutId even though the schema itself is satisfied", () => {
    const adjustment = validAdjustment({
      triggerEvent: { type: "skip", workoutId: "does-not-exist", details: "Sick today" },
    });
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
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
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'changes[0].workoutId "does-not-exist" does not exist in the current plan',
    ]);
  });

  // An adjustment is where the spike guard earns most of its keep: the athlete asks for a change
  // because training went sideways, and what the plan still has scheduled was sized for a base
  // they no longer have. See computeAdjustmentAdvisories in planValidation.ts.
  it("measures an inserted long run against real recent training, not just the plan", () => {
    const adjustment = validAdjustment({
      changes: [
        {
          workoutId: null,
          changeType: "insert",
          before: null,
          after: validWorkout({ date: "2026-08-26", type: "long_run", targetDistanceMeters: 16000 }),
        },
      ],
    });
    // Nothing in the plan precedes that date, so the only evidence of what the athlete can
    // currently handle is their Strava history — without it the check has no denominator at all.
    expect(validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY).advisories).toEqual([]);

    const withBaseline = validatePlanAdjustment(
      adjustment,
      currentWorkouts,
      { longestRecentRunMeters: 6000 },
      TODAY,
    );
    expect(withBaseline.valid).toBe(true);
    expect(withBaseline.advisories?.some((a) => a.includes("2.7x the longest run"))).toBe(true);
  });

  it("evaluates the plan the changes would produce, not the plan as written", () => {
    const adjustment = validAdjustment({
      changes: [
        { workoutId: "w2", changeType: "remove", before: validWorkout({ date: "2026-09-08" }), after: null },
        {
          workoutId: null,
          changeType: "insert",
          before: null,
          after: validWorkout({ date: "2026-09-12", type: "long_run", targetDistanceMeters: 25000 }),
        },
      ],
    });
    // Dropping the 13km long run leaves the 10km easy run as the longest thing preceding it, so
    // the new session reads as 2.5x rather than the 1.9x it would against the plan as written.
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
    expect(result.advisories?.some((a) => a.includes("2.5x the longest run"))).toBe(true);
  });

  it("flags a hard session moved onto the day before another one", () => {
    const adjustment = validAdjustment({
      changes: [
        {
          workoutId: "w1",
          changeType: "modify",
          before: validWorkout({ date: "2026-09-01", type: "easy_run" }),
          after: validWorkout({
            date: "2026-09-07",
            type: "tempo",
            targetDistanceMeters: 10000,
            description: "Warm-up: 2km easy\nMain: 4km at tempo",
          }),
        },
      ],
    });
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
    expect(result.advisories?.some((a) => a.includes("consecutive days"))).toBe(true);
  });

  it("stays quiet about a back-to-back pair the adjustment did not touch", () => {
    const alreadyStacked = [
      ...currentWorkouts,
      { id: "w3", date: "2026-09-09", type: "tempo", targetDistanceMeters: 10000, description: "Warm-up: 2km\nMain: 4km at tempo" },
    ];
    // w2 and w3 sit on consecutive days in the plan as it stands; moving an unrelated easy run is
    // not the moment to relitigate that.
    const adjustment = validAdjustment({
      changes: [
        {
          workoutId: "w1",
          changeType: "modify",
          before: validWorkout({ date: "2026-09-01" }),
          after: validWorkout({ date: "2026-09-02" }),
        },
      ],
    });
    const result = validatePlanAdjustment(adjustment, alreadyStacked, {}, TODAY);
    expect(result.advisories?.some((a) => a.includes("consecutive days"))).toBe(false);
  });

  it("does not run the workoutId cross-check when the payload fails schema validation", () => {
    const adjustment = validAdjustment({ changes: [] });
    const result = validatePlanAdjustment(adjustment, currentWorkouts, {}, TODAY);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not exist in the current plan"))).toBe(
      false,
    );
  });
});
