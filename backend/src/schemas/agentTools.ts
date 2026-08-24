import { createSdkMcpServer, tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { validateCreateTrainingPlan, validatePlanAdjustment } from "../services/planValidation.js";

// Zod mirror of shared/schema/*.json, in the same spirit as the iOS Codable mirror described in
// shared/README.md: the Agent SDK's tool() needs a Zod shape (not raw JSON Schema) to build the
// tool definition Claude sees, so this is a third hand-synced copy of the same small contract.
// planValidation.ts (ajv against the JSON Schema files) remains the source of truth — it also
// catches things Zod can't express here, like a hallucinated workoutId.

const workoutTypeEnum = z.enum([
  "easy_run",
  "long_run",
  "tempo",
  "interval",
  "race_pace",
  "recovery",
  "cross_train",
  "strength",
  "rest",
  "race",
]);

const workoutShape = {
  date: z.string().describe("ISO date, YYYY-MM-DD"),
  type: workoutTypeEnum,
  targetDistanceMeters: z.number().min(0).nullable().optional(),
  targetDurationSeconds: z.number().min(0).nullable().optional(),
  targetPaceSecPerKm: z.number().min(0).nullable().optional(),
  description: z.string().min(1),
  coachNotes: z.string().nullable().optional(),
};
const workoutSchema = z.object(workoutShape).strict();

const createTrainingPlanShape = {
  goal: z
    .object({
      raceName: z.string().min(1),
      raceDate: z.string().describe("ISO date, YYYY-MM-DD"),
      distanceMeters: z.number().positive(),
      priority: z.enum(["A", "B", "C"]),
    })
    .strict(),
  planStartDate: z.string().describe("ISO date, YYYY-MM-DD"),
  planEndDate: z.string().describe("ISO date, YYYY-MM-DD"),
  workouts: z.array(workoutSchema).min(1),
  rationale: z.string().min(1),
};

const proposePlanAdjustmentShape = {
  triggerEvent: z
    .object({
      type: z.enum(["skip", "reschedule", "correction"]),
      workoutId: z.string().min(1),
      details: z.string(),
    })
    .strict(),
  rationale: z.string().min(1),
  changes: z
    .array(
      z
        .object({
          workoutId: z.string().nullable(),
          changeType: z.enum(["modify", "insert", "remove"]),
          before: workoutSchema.nullable(),
          after: workoutSchema.nullable(),
        })
        .strict(),
    )
    .min(1),
};

export interface CapturedToolCall {
  name: "create_training_plan" | "propose_plan_adjustment";
  input: unknown;
}

export const coachToolServerName = "race_pace_tools";

export function qualifiedToolName(name: CapturedToolCall["name"]): string {
  return `mcp__${coachToolServerName}__${name}`;
}

/**
 * Builds the two coach tools bound to one request's context, and an array that the last
 * successfully-validated call gets pushed onto. Built per-request (not module-level) because
 * propose_plan_adjustment's workoutId cross-check depends on the athlete's current plan.
 * A validation failure is returned to Claude as a tool error (not thrown) so it can self-correct
 * within the same turn instead of failing the whole request.
 */
export function buildCoachTools(
  knownWorkoutIds: ReadonlySet<string>,
  captured: CapturedToolCall[],
): Record<CapturedToolCall["name"], SdkMcpToolDefinition<any>> {
  const createTrainingPlanTool = tool(
    "create_training_plan",
    "Create the athlete's training plan for an upcoming race, based on the goal discussed in conversation and their current training context. Only call this once you know at minimum the race name, date, and distance — ask clarifying questions first if any of those are missing or ambiguous.",
    createTrainingPlanShape,
    async (input) => {
      const result = validateCreateTrainingPlan(input);
      if (!result.valid) {
        return {
          content: [{ type: "text", text: `Invalid plan, fix and retry: ${result.errors.join("; ")}` }],
          isError: true,
        };
      }
      captured.push({ name: "create_training_plan", input });
      return { content: [{ type: "text", text: "Plan accepted." }] };
    },
  );

  const proposePlanAdjustmentTool = tool(
    "propose_plan_adjustment",
    "Propose a concrete adjustment to the athlete's existing training plan in response to a skipped or rescheduled workout. Ask clarifying questions first if the reason for the change is ambiguous (one-off vs. a pattern, illness vs. being busy); only call this once you have enough context to propose a sensible, scoped change. Every workoutId you reference must be one that actually exists in the current plan provided in context.",
    proposePlanAdjustmentShape,
    async (input) => {
      const result = validatePlanAdjustment(input, knownWorkoutIds);
      if (!result.valid) {
        return {
          content: [{ type: "text", text: `Invalid adjustment, fix and retry: ${result.errors.join("; ")}` }],
          isError: true,
        };
      }
      captured.push({ name: "propose_plan_adjustment", input });
      return { content: [{ type: "text", text: "Adjustment accepted." }] };
    },
  );

  return { create_training_plan: createTrainingPlanTool, propose_plan_adjustment: proposePlanAdjustmentTool };
}

export function coachMcpServer(tools: SdkMcpToolDefinition<any>[]) {
  return createSdkMcpServer({ name: coachToolServerName, version: "1.0.0", tools });
}
