# shared/schema

JSON Schema contract for the two Claude tool-call payloads (`create_training_plan`, `propose_plan_adjustment`) and the workout shape they share.

This is a **manually-synced** contract, not a generated one:
- The backend validates tool-call responses against these files at runtime (`backend/src/services/planValidation.ts`, via `ajv`'s 2020-12 build).
- The backend also hand-mirrors these shapes as Zod schemas (`backend/src/schemas/agentTools.ts`) to build the Claude Agent SDK's tool definitions, since that SDK's `tool()` needs a Zod shape rather than raw JSON Schema.
- The iOS app hand-mirrors the same shapes again as Codable structs under `ios/RacePace/Models/DTOs/`.

That's now three hand-synced copies of one small contract. Given how small and infrequently-changing it is, codegen (e.g. `quicktype`) still isn't worth the setup cost for v1 — but worth reconsidering if the schema grows or drifts often, or if a fourth consumer shows up.
