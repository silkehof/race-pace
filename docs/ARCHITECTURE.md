# RacePace architecture overview

RacePace is a personal training-plan coach: it connects to Strava for training
history, builds a race training plan through a chat conversation with an LLM
coach, and adapts that plan when a workout is skipped or rescheduled.

This doc describes how the three parts of the repo fit together and what is
actually implemented today vs. scaffolded for later. See the root
[`README.md`](../README.md) for run instructions and
[`strava-app-setup.md`](./strava-app-setup.md) for the one-time Strava API app
registration.

## Repo layout

```
backend/   thin, stateless TypeScript/Node proxy (Express)
ios/       SwiftUI app, SwiftData for local storage
shared/    JSON Schema contract for the chat tool-call payloads
docs/      manual setup steps + this doc
```

The backend and iOS app never talk to each other's storage — the backend is
stateless per-request, and the only contract between them is HTTP plus the
JSON Schemas under `shared/schema/`.

## Why there's a backend at all

The app talks to two third-party APIs, and each has one operation that needs
a secret the phone can't safely hold:

- **Strava OAuth token exchange/refresh** needs `STRAVA_CLIENT_SECRET`.
- **Claude chat calls** need a Claude credential — currently a one-time
  `claude login` on the backend host (subscription auth), not an API key; see
  below.

Everything else — fetching activities, rendering the plan — happens
on-device. `ios/RacePace/Services/StravaAPIClient.swift` calls Strava's REST
API directly with the access token once the backend has minted one; the
backend is never in that path. Requests from the app to the backend are
gated by a shared secret (`x-app-secret` header, checked in
`requireAppSecret` middleware) rather than real user auth, since this is a
single-user app.

## Backend (`backend/`)

Express app, entry point `src/index.ts`:

```
app
├─ GET  /health                      (no auth)
├─ /api/strava   [requireAppSecret]
│  ├─ POST /oauth/exchange           code -> tokens
│  └─ POST /oauth/refresh            refresh_token -> tokens
└─ /api/coach    [requireAppSecret]
   └─ POST /message                  chat turn -> coach reply + tool call
```

- **`config.ts`** — reads env vars, throws at startup if a required one
  (`STRAVA_CLIENT_ID/SECRET`, `APP_SHARED_SECRET`) is missing.
  `ANTHROPIC_MODEL` defaults to `claude-sonnet-5`. Deliberately has no
  `ANTHROPIC_API_KEY` — see Claude auth below.
- **`middleware/requireAppSecret.ts`** — rejects any `/api/strava/*` or
  `/api/coach/*` request whose `x-app-secret` header doesn't match
  `APP_SHARED_SECRET`.
- **`middleware/errorHandler.ts`** — catch-all, logs and returns 500.
- **`services/stravaAuth.ts`** — wraps Strava's `/oauth/token` endpoint for
  both the authorization-code exchange and refresh-token grant.
- **`services/claudeClient.ts`** — runs the coach turn via the **Claude
  Agent SDK** (`@anthropic-ai/claude-agent-sdk`'s `query()`), not the raw
  Messages API. See "Claude auth: subscription, not API key" below for why.
  Flattens `history` + `userMessage` into one prompt string (the backend
  stays stateless — no session state on disk), sets `systemPrompt` to
  `[systemPersona, systemRules]`, disables all of Claude Code's built-in
  tools (`tools: []`), and exposes only the one or two coach tools relevant
  to the current mode via an in-process MCP server
  (`schemas/agentTools.ts`). Strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`
  from the spawned subprocess's env so a stray key can never silently switch
  billing back to metered API usage.
- **`schemas/agentTools.ts`** — builds the `create_training_plan` and
  `propose_plan_adjustment` Agent SDK tools (Zod schemas — the Agent SDK's
  `tool()` needs a Zod shape, not raw JSON Schema, so this is a **third**
  hand-synced copy of the same small contract, alongside the JSON Schema
  files and the iOS Codable mirror). Each tool's handler runs
  `planValidation.ts` and returns a tool error back to Claude on failure —
  so a hallucinated `workoutId` gets fed back for Claude to self-correct
  within the same turn, rather than failing the whole request. The last
  successfully-validated call is captured and returned to the route.
- **`services/planValidation.ts`** — validates `create_training_plan` and
  `propose_plan_adjustment` tool-call payloads against the shared JSON
  Schemas via `ajv` (the `Ajv2020` build specifically — the shared schemas
  declare `$schema: draft/2020-12`, which the plain `Ajv` core doesn't
  recognize), and additionally checks that every `workoutId` a
  `propose_plan_adjustment` payload references actually exists in the plan
  the client echoed back (a check neither schema format can express — it's
  aimed at catching Claude hallucinating an ID).
- **`routes/coach.ts`** — `POST /api/coach/message`. Body:
  `{ mode: "create_plan" | "adjust_plan", message, history?, athleteContext?, currentPlan? }`.
  Picks the mode-specific rules block and tool, builds `knownWorkoutIds` from
  `currentPlan.workouts[].id` for adjustment mode, and returns
  `{ text, toolCall }`.
- **`prompts/`** — `systemPersona` (coach tone and philosophy — consistency
  over a perfect plan on paper, ≤10%/week long-run growth, always taper) plus
  two mode-specific rule blocks: `planGenerationRules` (building a plan from
  scratch) and `adjustmentRules` (responding to a skip/reschedule).

`backend/test/` is still empty — none of this has automated test coverage
yet, only the manual/curl verification described in the README.

### Claude auth: subscription, not API key

The chat coach intentionally does **not** use `ANTHROPIC_API_KEY` / the raw
Anthropic Messages API. It authenticates via the Claude Agent SDK, which
spawns a bundled Claude Code binary that reads the same local credentials as
running `claude login` interactively — billing against a Claude Pro/Max
subscription's included usage instead of metered per-token API cost. This
was a deliberate trade, not a default:

- The **backend host** needs a one-time interactive `claude login` (the
  Agent SDK package itself ships no login command — that comes from the
  separately-installed `claude` CLI). If you're reading this from inside a
  Claude Code session on the same machine, it's almost certainly already
  logged in.
- Conversation history is **flattened into one prompt string**
  (`Athlete: ...` / `Coach: ...` transcript) rather than sent as
  structured, role-alternating messages — the Agent SDK's native multi-turn
  model is a persisted, resumable *session* (JSONL on disk), which would
  make the backend stateful and change what the client needs to send. This
  keeps the "thin, stateless proxy" design intent, at the cost of losing
  fine-grained prompt-cache control (`cache_control` breakpoints) that the
  old Messages-API-based client had — the harness manages its own caching
  instead.
- Pro/Max included usage is a weekly quota, not metered dollars — fine for a
  single personal user, but a different failure mode (quota exhaustion, not
  a bill) worth knowing about.
- This repo also needs **Node 22** (`backend/.nvmrc`) — the Agent SDK's
  bundled binary uses a regex feature (the `v` flag) that throws on Node
  18/20 with an opaque `SyntaxError: Invalid flags supplied to RegExp
  constructor`.

## Shared schema contract (`shared/schema/`)

Hand-maintained JSON Schema, not generated:

- `workout.schema.json` — the shape of a single workout (date, `type` enum,
  optional distance/duration/pace targets, description, coach notes).
- `training-plan.schema.json` — the `create_training_plan` tool payload:
  race goal, plan date range, a list of workouts, and a rationale string
  shown to the athlete.
- `plan-adjustment.schema.json` — the `propose_plan_adjustment` tool
  payload: the triggering skip/reschedule event, a rationale, and a list of
  changes (`modify`/`insert`/`remove`) each with a `before`/`after` workout.

The backend consumes these directly (`planValidation.ts` via `ajv`). The
Agent SDK's tools (`schemas/agentTools.ts`) need a hand-written Zod mirror
instead, since `ajv`-style raw JSON Schema isn't accepted there. The iOS app
hand-mirrors the same shapes again as `Codable` structs under
`ios/RacePace/Models/DTOs/`. Per `shared/README.md`, codegen (e.g.
`quicktype`) was deliberately skipped for v1 since the contract is small and
changes rarely — now hand-synced in three places instead of two, which is
worth watching if the contract starts changing often.

## iOS app (`ios/`)

SwiftUI app, generated via `xcodegen` from `ios/project.yml` (re-run
`xcodegen generate` after adding/removing source files — the `.xcodeproj` is
derived, not hand-edited). Custom URL scheme `racepace://` is registered for
the Strava OAuth callback.

```
App/            entry point, DI container, gitignored AppSecrets.swift
Models/         SwiftData model + hand-mirrored backend DTOs
Services/       Keychain, Strava OAuth + REST client, backend HTTP client
ViewModels/     StravaConnectViewModel (only view model so far)
Views/
  Onboarding/   Welcome -> Strava connect  (built)
  Debug/        ActivityListView — throwaway proof-of-data-flow
  Chat/         empty — chat UI not started
  Plan/         empty — plan display not started
  WorkoutDetail/ empty
  Settings/     empty
```

### Data flow implemented so far

1. `WelcomeView` -> `StravaConnectView`, backed by `StravaConnectViewModel`.
2. `StravaAuthService.connect()` opens an `ASWebAuthenticationSession`
   against Strava's authorize URL, and pulls `code` off the
   `racepace://strava-callback` redirect.
3. That code goes to the backend (`BackendAPIClient.exchangeStravaCode`,
   `POST /api/strava/oauth/exchange`), which does the secret-bearing token
   exchange and returns access/refresh tokens.
4. Tokens are stored in the Keychain only (`KeychainStore`) — explicitly
   never in SwiftData or `UserDefaults`, per a comment in
   `StravaAuthService.swift` referencing an architecture decision.
5. `StravaAuthService.validAccessToken()` transparently refreshes (via the
   backend, `POST /api/strava/oauth/refresh`) when the cached token is
   within 60s of expiry.
6. `StravaAPIClient` calls Strava's `/athlete/activities` directly from the
   device using that access token — the backend is not involved once a
   token is minted.
7. `ActivityListView` (under `Views/Debug/`) renders the result as a
   proof-of-concept; it's explicitly marked as throwaway, to be replaced by
   real activity display/matching UI later.

`CachedStravaActivity` (SwiftData `@Model`) exists as local storage for
synced activities but nothing currently writes to it — `ActivityListView`
fetches from the network each time rather than reading the cache.

### Not yet built

No chat UI, no plan display, no workout detail, no settings screen — these
correspond to the empty `Views/Chat`, `Views/Plan`, `Views/WorkoutDetail`,
`Views/Settings` directories, and there's no view model or service yet that
calls `POST /api/coach/message` (which now exists on the backend — see
above — but nothing on iOS talks to it yet). `RacePaceTests` and
`RacePaceUITests` targets exist in `project.yml` but currently contain no
test files.

## Current state summary

| Area | Status |
|---|---|
| Strava OAuth (backend + iOS) | Implemented end-to-end |
| Strava activity fetch (iOS, direct) | Implemented (debug view only) |
| Local activity caching (SwiftData) | Model defined, unused |
| Claude chat proxy (backend) | Implemented and exposed via `POST /api/coach/message`, using subscription auth (Claude Agent SDK) instead of API billing — curl-testable, see README |
| Plan generation / adjustment (iOS) | Not started (no UI or view model calling the backend endpoint yet) |
| Automated tests | None yet, in either backend or iOS |

The natural next step implied by the code as it stands is building the
chat UI and a corresponding view model on iOS that calls
`POST /api/coach/message`, along with somewhere on iOS to persist the
plan/adjustments that endpoint returns (SwiftData, alongside
`CachedStravaActivity`).
