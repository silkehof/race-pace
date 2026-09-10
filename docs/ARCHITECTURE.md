# RacePace architecture overview

RacePace is a personal training-plan coach: it connects to Strava for training
history, builds a race training plan through a chat conversation with an LLM
coach, and adapts that plan when a workout is skipped or rescheduled — or on
a plain direct request (e.g. "relabel that as strength").

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
- **`services/paceEngine.ts`** — derives training paces from a *recent actual
  performance* of the athlete's (Daniels/Gilbert VDOT, cross-checked against
  Riegel for race equivalence, with a buffer on marathon extrapolations).
  Added after an evidence audit (`docs/research/research_output.md`) found
  the generator's single most consequential defect was prescribing paces with
  no performance benchmark at all — every pace in a plan was invented. Paces
  are deliberately **never** derived from the athlete's goal time, which would
  prescribe training at a speed they cannot yet hold; the goal time is only
  checked for realism against the benchmark. When no usable benchmark exists
  the coach is told so explicitly and instructed to prescribe by effort,
  rather than silently reverting to making numbers up.
- **`services/athleteContext.ts`** — types and narrows the free-form
  `athleteContext` the app sends, and extracts the training baseline the plan
  validator judges a generated plan's opening load against.
- **`services/planValidation.ts`** — load accounting runs on **rolling 7-day
  windows**, not calendar weeks. Calendar weeks are how the athlete reads a
  plan (and the Plan tab still groups by Monday), but they are the wrong unit
  for judging load: a Sunday long run and the days after it are one block of
  training, and a Monday boundary splits them, so a hard stretch can read as
  two moderate weeks and a real deload can vanish across the boundary. The
  cutback check additionally works on a session-RPE surrogate (minutes × an
  intensity weight per session type) rather than distance, since a recovery
  week is about total stress coming down; the taper check stays on distance,
  because that is what the taper meta-analysis manipulated. It also validates
  `create_training_plan` and
  `propose_plan_adjustment` tool-call payloads against the shared JSON
  Schemas via `ajv` (the `Ajv2020` build specifically — the shared schemas
  declare `$schema: draft/2020-12`, which the plain `Ajv` core doesn't
  recognize), and additionally checks that every `workoutId` a
  `propose_plan_adjustment` payload references actually exists in the plan
  the client echoed back (a check neither schema format can express — it's
  aimed at catching Claude hallucinating an ID). An adjustment is then applied
  to that echoed plan and the result checked for the two things a reshuffle
  can actually break: a hard session landing next to another one, and an
  already-scheduled long run that has become a single-session spike because a
  gap in training lowered what the athlete has really built up to. Whole-plan
  observations (taper depth, cutback cadence) are deliberately not repeated
  there — an adjustment is scoped to a week or two, so they would be noise
  about weeks the change never touched.
- **`routes/coach.ts`** — `POST /api/coach/message`. Body:
  `{ mode: "create_plan" | "adjust_plan", message, history?, athleteContext?,
  goalDistanceMeters?, goalTimeSeconds?, currentPlan? }`.
  Picks the mode-specific rules block and tool, builds `knownWorkoutIds` from
  `currentPlan.workouts[].id` for the validation cross-check, and — for
  `adjust_plan` — also JSON-stringifies the **whole** `currentPlan` (goal +
  every workout's full detail, not just ids) into the prompt, mirroring how
  `athleteContext` is appended for `create_plan`. This was a real early bug:
  without it, the coach could confirm a `workoutId` existed but had no way to
  know what that workout actually *was* — it could validate references but
  not reason about them. Both modes also get `athleteContext` and the
  `paceGuidance` block derived from it — an adjustment that inserts or
  rewrites a workout prescribes paces exactly like plan creation does, and
  needs the athlete's real recent training for the same load checks. Returns
  `{ text, toolCall }`.
The guided intake (`NewPlanIntakeView`) collects race name, date, distance and
priority, plus an optional goal time. The goal time is only ever used to tell
the athlete whether their target matches their current fitness — training paces
are derived from what they have actually run, never from what they hope to run,
since prescribing from an unachieved goal trains them at a speed they cannot
yet hold.

- **`prompts/`** — `systemPersona` (coach tone and philosophy — consistency
  over a perfect plan on paper, never inventing paces, watching the
  single-session distance spike rather than week-over-week percentage growth,
  ~80/20 easy by *time*, taper by cutting volume while holding intensity and
  frequency) plus two mode-specific rule blocks: `planGenerationRules` (building a plan from
  scratch — including "distinct same-day activities get separate workout
  entries, never folded into one description") and `adjustmentRules`
  (responding to a skip/reschedule, **or** a direct edit request with no
  skip/reschedule involved — `triggerEvent.type: "correction"` — e.g.
  "relabel that as strength").

`backend/test/` covers the deterministic pieces — plan validation (structural
errors vs. advisory training-science observations) and the pace engine's
physiology, spot-checked against Daniels' published tables. The conversational
behaviour on top of them is still only verified manually, as described in the
README.

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
  payload: the triggering event (`skip`/`reschedule`/`correction`), a
  rationale, and a list of changes (`modify`/`insert`/`remove`) each with a
  `before`/`after` workout. `type` includes 10 categories now, including
  `strength` (added mid-session, alongside `cross_train`, since generic
  "cross training" was too vague a label for the app's own UI).

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
the Strava OAuth callback — see the callback-page note below, that scheme
alone isn't actually sufficient for Strava.

```
App/             entry point, DI container, gitignored AppSecrets.swift
Models/
  DTOs/          hand-mirrored backend wire types (Strava + coach chat + plan/adjustment payloads)
  CachedStravaActivity.swift    SwiftData — synced Strava activities (model defined, unused — see below)
  StoredTrainingPlan.swift      SwiftData — the persisted plan (flattened goal fields + workouts relationship)
  StoredWorkout.swift           SwiftData — one workout; typeRawValue + computed `type`, estimatedDistanceMeters helper
Resources/       Theme.swift — app accent color + WorkoutStyle (color/SF Symbol/label per workout category)
Utilities/       PlanDateFormatting.swift — fixed UTC/Gregorian/POSIX calendar for the plain "yyyy-MM-dd" date strings
Services/        Keychain, Strava OAuth + REST client, backend HTTP client, PlanStore (SwiftData writes)
ViewModels/      StravaConnectViewModel, ChatViewModel
Views/
  Onboarding/    Welcome -> Strava connect; skips straight to MainTabView if already connected
  MainTabView.swift   Coach / Plan tabs, each its own NavigationStack
  Chat/          ChatView — the coaching conversation
  Plan/          PlanView — week/day-grouped plan overview
  WorkoutDetail/ WorkoutDetailView — full detail for one session
  Debug/         ActivityListView — throwaway proof-of-data-flow, no longer linked from primary nav
```

### Data flow

**Onboarding & Strava connect:**
1. `OnboardingFlowView` checks `StravaAuthService().isConnected` (Keychain)
   once at launch — already-connected users skip straight to `MainTabView`,
   everyone else sees `WelcomeView` -> `StravaConnectView`. A single
   `StravaAuthService` instance is threaded through this whole chain
   (`StravaConnectViewModel` no longer creates its own).
2. `StravaAuthService.connect()` opens an `ASWebAuthenticationSession`
   against Strava's authorize URL. **Strava rejects a custom-scheme
   `redirect_uri` outright** (confirmed by testing — not just a callback-domain
   mismatch), so the authorize call's `redirect_uri` actually points at a
   tiny static HTTPS page (`docs/strava-callback-page/index.html`, hosted at
   https://silkehof.github.io/racepace-strava-callback/, Authorization
   Callback Domain on Strava's side set to `silkehof.github.io`). That page's
   only job is `window.location.replace("racepace://strava-callback" + ...)`
   — the actual second hop `ASWebAuthenticationSession` is watching for via
   `callbackURLScheme`. Forking this project under a different account means
   redeploying that page and updating `StravaAuthService.redirectURI` +
   `stravaAuth.ts`'s `DEFAULT_REDIRECT_URI` + the Strava app setting to match.
3. The resulting code goes to the backend (`POST /api/strava/oauth/exchange`,
   passing no `redirect_uri` override — the backend defaults to the same
   page), which does the secret-bearing token exchange and returns tokens.
4. Tokens live in the Keychain only (`KeychainStore`) — never SwiftData or
   `UserDefaults`. `StravaAuthService.validAccessToken()` refreshes via the
   backend when within 60s of expiry.
5. `CachedStravaActivity` (SwiftData) is defined but still unused —
   `StravaAPIClient` fetches directly from Strava each time rather than
   reading/writing that cache. `ActivityListView` (`Views/Debug/`) is the
   only thing that calls it, and is no longer reachable from primary
   navigation (see below) — kept only as reference/debug scaffolding.

**Coaching chat & plan (`MainTabView`'s "Coach" tab, `ChatView`/`ChatViewModel`):**
1. On appear, `loadAthleteContext()` best-effort pulls the last 120 days of
   Strava activity into an `AthleteContextSummary` — silently skipped if it
   fails, never surfaced as a chat error. Three different windows come out of
   that one fetch, each for a different reason: 28 days for current volume and
   run frequency (what a plan's opening weeks should continue from), 30 days
   for the longest single run (the denominator of the backend's spike guard),
   and the full 120 for `benchmarkCandidates` — the fastest run in each
   distance band plus anything race-titled, each carrying its elevation gain,
   high/low range and treadmill flag so the backend can reject an effort whose
   time doesn't convert into road paces. The app deliberately doesn't rank
   those candidates itself: comparing a hard 5K against a strong 18km is a
   VDOT calculation, which lives on the backend.

   Treadmill and virtual runs are counted in full by every volume figure —
   they are real training load, and omitting them understated a treadmill
   runner's base enough to disable the spike guard, which measures against
   their longest recent run. They are separately excluded from serving as a
   *performance* benchmark, since the distance is device-estimated and a given
   pace is easier indoors; one is still sent along, flagged, so the coach can
   explain why an athlete who has obviously been training has no usable
   benchmark rather than claiming none was found. Trail runs remain outside
   both, for now.
2. Every `send()` call **auto-detects mode from persisted state**, not a UI
   toggle: it fetches the current `StoredTrainingPlan` via `FetchDescriptor`
   (not `@Query` — this is a plain `@MainActor` class, not a View). No plan
   yet -> `mode: "create_plan"`. A plan exists -> `mode: "adjust_plan"`, and
   the **full** plan (goal + every workout's full detail, with ids) is sent
   as `currentPlan` — see the backend note above on why full detail, not
   just ids.
3. The whole conversation is resent as flattened `history` each call (the
   backend is stateless — see "Claude auth" above); only the plan itself
   persists across turns/relaunches, not the chat transcript.
4. A `create_training_plan` tool call -> `PlanStore.save` (insert-only; the
   newest `StoredTrainingPlan` by `createdAt` is always "the" plan — no
   delete-existing step, so a save bug can't wipe the only copy). A
   `propose_plan_adjustment` tool call -> `PlanStore.apply`, which mutates
   the existing plan's `workouts` relationship in place
   (`modify`/`insert`/`remove`) and **propagates save errors** rather than
   swallowing them (unlike `save` — this mutates existing user data, so a
   silently dropped write would look fine for the rest of the session and
   only revert on next launch). Either way the chat shows a plain "Saved —
   check the Plan tab" confirmation; there's no more in-chat plan preview.

**Plan overview ("Plan" tab, `PlanView`/`WorkoutDetailView`):**
- `@Query`-driven straight off `StoredTrainingPlan`/`StoredWorkout` — no DTO
  in sight, so it always reflects whatever's actually persisted. Empty state
  when no plan exists yet.
- Workouts are grouped by week (`PlanDateFormatting.weekIndex`, relative to
  `planStartDate`) and then by day within each week — a day with more than
  one independent session (e.g. a run plus a strength session) shows both as
  separate rows under one date header, never merged into one entry's text.
  Each week header sums `estimatedDistanceMeters` across its workouts
  (falling back to duration÷pace when a workout has no explicit distance, so
  duration-only sessions don't silently vanish from the total).
- Each row shows a `WorkoutStyle` badge — color **and** SF Symbol, not color
  alone, since hue-only category coding is a real accessibility gap — and
  taps through to `WorkoutDetailView` for the full description, formatted
  targets, and coach notes.

### Known gaps, deliberately not built yet

- **No iOS tests** — `RacePaceTests` and `RacePaceUITests` exist as targets
  but contain no test files; the app side is still verified by hand (build +
  simulator + curl). The backend's deterministic logic is covered in
  `backend/test/`.
- **Plans are generated once, then patched reactively** — the evidence audit
  argues for rolling re-planning instead (re-deriving paces and volume every
  2-4 weeks from completed training), since individual response to an
  identical program varies several-fold. The pace engine makes this possible
  — re-running it on a fresh benchmark is all it would take — but nothing
  currently triggers it.
- **Chat history itself isn't persisted** — only the plan is. Force-quitting
  mid-conversation loses the transcript (but not the plan).
- **No Settings screen** — `BackendAPIClient.baseURL` already supports a
  `UserDefaults` override for pointing at a non-local backend, but there's no
  UI to set it.
- **`ActivityListView` is orphaned** — still present, still functional, just
  no longer linked from anywhere now that `StravaConnectView` goes straight
  to `MainTabView` once connected.

## Current state summary

| Area | Status |
|---|---|
| Strava OAuth (backend + iOS) | Implemented end-to-end, including the HTTPS-redirect-page workaround Strava's custom-scheme rejection required |
| Strava activity fetch (iOS, direct) | Implemented; feeds athleteContext for plan creation. Local caching (SwiftData) still unused |
| Claude chat proxy (backend) | Implemented — Claude Agent SDK, subscription auth, both create_plan and adjust_plan modes, full currentPlan echoed for adjustments |
| Plan generation (iOS) | Implemented end-to-end: chat -> create_training_plan -> SwiftData persistence -> Plan tab |
| Plan adjustment (iOS) | Implemented end-to-end: chat -> propose_plan_adjustment (skip/reschedule/correction) -> in-place SwiftData mutation -> Plan tab |
| Plan UI (week/day grouping, categories, detail view) | Implemented |
| Navigation (Coach/Plan switch, skip onboarding once connected) | Implemented |
| Automated tests | Backend: 88 tests across pace engine, plan validation, athlete context, coach route, auth, and Strava OAuth. iOS: none yet |

The natural next steps implied by the code as it stands: iOS test coverage
(the backend is covered, the app side is not), rolling re-planning on top of
the pace engine rather than one-shot generation, a Settings screen for the
backend-URL override that already exists in code, and deciding whether
`ActivityListView` deserves a real home in navigation or should be deleted
now that it's orphaned.
