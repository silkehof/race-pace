import { Router } from "express";
import { callClaude, type ChatTurn } from "../services/claudeClient.js";
import { systemPersona } from "../prompts/systemPrompt.js";
import { planGenerationRules } from "../prompts/planGenerationRules.js";
import { adjustmentRules } from "../prompts/adjustmentRules.js";
import { parseAthleteContext, planBaselineFrom, type AthleteContext } from "../services/athleteContext.js";
import { buildPrescription, formatPrescription, noBenchmarkGuidance } from "../services/paceEngine.js";
import type { CurrentPlanWorkout } from "../services/planValidation.js";

export const coachRouter = Router();

interface MessageRequestBody {
  mode?: "create_plan" | "adjust_plan";
  history?: ChatTurn[];
  message?: string;
  /** Recent-training summary — see services/athleteContext.ts for the shape and
   * planGenerationRules for how the coach is told to use it. Sent in both modes: an adjustment
   * needs to know what the athlete has actually been running just as much as a new plan does. */
  athleteContext?: unknown;
  /** The athlete's current plan for adjust_plan mode. Its `workouts` are the only ids
   * propose_plan_adjustment may reference, and the plan the proposed changes get applied to for
   * the advisory checks; the whole object is also echoed into the prompt (see userMessage below)
   * so Claude can actually see what those workouts are, not just that their IDs exist. */
  currentPlan?: { workouts?: unknown } & Record<string, unknown>;
  /** Goal race distance in metres, when the guided intake has already established it. Used only
   * to work out the athlete's equivalent race time from their benchmark — the plan's own goal
   * comes from the conversation as before. */
  goalDistanceMeters?: number;
  /** Goal finish time in seconds, if the athlete has named one. Checked for realism against
   * current fitness; never used to derive training paces (see paceEngine). */
  goalTimeSeconds?: number;
}

/** Narrows the echoed plan to the workouts the validator can work with, dropping anything
 * malformed rather than throwing — as with athleteContext, a bad payload should cost the checks
 * their input, not fail the athlete's turn. */
function parseCurrentWorkouts(raw: unknown): CurrentPlanWorkout[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): CurrentPlanWorkout[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const w = entry as Record<string, unknown>;
    if (typeof w.id !== "string" || typeof w.date !== "string" || typeof w.type !== "string") return [];
    return [
      {
        id: w.id,
        date: w.date,
        type: w.type,
        targetDistanceMeters: typeof w.targetDistanceMeters === "number" ? w.targetDistanceMeters : null,
        targetDurationSeconds: typeof w.targetDurationSeconds === "number" ? w.targetDurationSeconds : null,
        targetPaceSecPerKm: typeof w.targetPaceSecPerKm === "number" ? w.targetPaceSecPerKm : null,
        description: typeof w.description === "string" ? w.description : "",
      },
    ];
  });
}

/** The recent-training figures the coach reasons about directly, as distinct from the raw efforts
 * that only the pace engine consumes. */
function summaryOf(context: AthleteContext): Record<string, number | undefined> {
  const { benchmarkCandidates: _candidates, ...summary } = context;
  return summary;
}

/**
 * Turns the athlete's recent Strava efforts into concrete training paces for the prompt.
 *
 * This is the fix for the audit's single most consequential finding: without a performance
 * benchmark the coach has no basis for any pace it writes, so every "~5:00/km" in a plan was
 * invented. Computing the paces here rather than asking the model to do the arithmetic keeps the
 * physiology deterministic and testable, and means the no-benchmark case gets an explicit
 * instruction not to make numbers up rather than silently reverting to the old behaviour.
 *
 * Both modes get this. An adjustment that inserts or rewrites a workout prescribes paces exactly
 * like plan creation does, so withholding it there just reopened the same hole one turn later.
 */
function coachingContext(body: MessageRequestBody) {
  const context = parseAthleteContext(body.athleteContext);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = context?.benchmarkCandidates ?? [];
  const prescription = buildPrescription(candidates, today, body.goalDistanceMeters, body.goalTimeSeconds);
  return {
    // The candidate efforts themselves are deliberately not echoed into the prompt — they exist
    // for the pace engine, and their conclusion is already in paceGuidance. Showing the raw list
    // would put the times of *rejected* efforts in front of the coach, including the downhill or
    // treadmill run the engine just refused to prescribe from, and invite it to work backwards to
    // exactly the paces the guard exists to prevent.
    athleteSummary: context ? summaryOf(context) : null,
    paceGuidance: prescription ? formatPrescription(prescription) : noBenchmarkGuidance(candidates, today),
    // The same derived paces the coach is told to prescribe from also let the validator convert
    // prescribed distances into time for this athlete rather than a generic one.
    baseline: planBaselineFrom(context, prescription?.paces),
  };
}

coachRouter.post("/message", async (req, res, next) => {
  try {
    const body = req.body as MessageRequestBody;
    if (!body.mode || !body.message) {
      res.status(400).json({ error: "Missing 'mode' or 'message' in request body" });
      return;
    }

    const systemRules = body.mode === "create_plan" ? planGenerationRules : adjustmentRules;
    const enabledTools =
      body.mode === "create_plan" ? (["create_training_plan"] as const) : (["propose_plan_adjustment"] as const);

    const { paceGuidance, baseline, athleteSummary } = coachingContext(body);

    const userMessage = [
      body.message,
      athleteSummary ? `(athleteContext: ${JSON.stringify(athleteSummary)})` : null,
      body.mode === "adjust_plan" && body.currentPlan
        ? `(currentPlan: ${JSON.stringify(body.currentPlan)})`
        : null,
      `(paceGuidance:\n${paceGuidance})`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await callClaude({
      systemPersona,
      systemRules,
      history: body.history ?? [],
      userMessage,
      currentWorkouts: parseCurrentWorkouts(body.currentPlan?.workouts),
      enabledTools: [...enabledTools],
      baseline,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
