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
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());
}

export function validateCreateTrainingPlan(input: unknown): ValidationResult {
  const valid = validateTrainingPlanSchema(input);
  return { valid, errors: valid ? [] : formatErrors(validateTrainingPlanSchema.errors) };
}

interface PlanAdjustmentPayload {
  triggerEvent: { workoutId: string };
  changes: Array<{ workoutId: string | null }>;
}

/**
 * Validates a propose_plan_adjustment tool-call payload against the schema, and additionally
 * checks every referenced workoutId exists in the plan the client echoed in the request —
 * this catches Claude hallucinating an ID, which the JSON schema alone can't express.
 */
export function validatePlanAdjustment(
  input: unknown,
  knownWorkoutIds: ReadonlySet<string>,
): ValidationResult {
  const schemaValid = validatePlanAdjustmentSchema(input);
  const errors = schemaValid ? [] : formatErrors(validatePlanAdjustmentSchema.errors);

  if (schemaValid) {
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
  }

  return { valid: errors.length === 0, errors };
}
