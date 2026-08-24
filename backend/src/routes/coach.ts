import { Router } from "express";
import { callClaude, type ChatTurn } from "../services/claudeClient.js";
import { systemPersona } from "../prompts/systemPrompt.js";
import { planGenerationRules } from "../prompts/planGenerationRules.js";
import { adjustmentRules } from "../prompts/adjustmentRules.js";

export const coachRouter = Router();

interface MessageRequestBody {
  mode?: "create_plan" | "adjust_plan";
  history?: ChatTurn[];
  message?: string;
  /** Free-form recent-training summary for create_plan mode (see planGenerationRules). */
  athleteContext?: unknown;
  /** The athlete's current plan for adjust_plan mode. `workouts[].id` builds the set of workout
   * IDs propose_plan_adjustment is allowed to reference; the whole object is also echoed into the
   * prompt (see userMessage below) so Claude can actually see what those workouts are, not just
   * that their IDs exist. */
  currentPlan?: { workouts?: Array<{ id?: string }> } & Record<string, unknown>;
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
    const knownWorkoutIds = new Set(
      (body.currentPlan?.workouts ?? []).map((w) => w.id).filter((id): id is string => Boolean(id)),
    );

    const userMessage =
      body.mode === "create_plan" && body.athleteContext
        ? `${body.message}\n\n(athleteContext: ${JSON.stringify(body.athleteContext)})`
        : body.mode === "adjust_plan" && body.currentPlan
          ? `${body.message}\n\n(currentPlan: ${JSON.stringify(body.currentPlan)})`
          : body.message;

    const result = await callClaude({
      systemPersona,
      systemRules,
      history: body.history ?? [],
      userMessage,
      knownWorkoutIds,
      enabledTools: [...enabledTools],
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
