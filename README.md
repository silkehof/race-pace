# race-pace

A personal training-plan coach: connects to Strava, builds a race training plan through a chat conversation with an LLM coach, and adapts the plan when you skip or reschedule workouts.

- `ios/` — SwiftUI app (SwiftData for local storage)
- `backend/` — thin, stateless TypeScript/Node proxy (Strava OAuth token exchange/refresh, Claude coach chat proxy — holds the secrets the app can't)
- `shared/schema/` — JSON Schema contract for the chat tool-call payloads, used by the backend for validation and hand-mirrored as Codable DTOs on iOS
- `docs/` — one-time manual setup steps (Strava API app registration)

See `docs/strava-app-setup.md` before running the backend.

## Backend

Requires Node 22 (see `backend/.nvmrc` — `nvm use` if you have nvm installed; the Claude Agent
SDK dependency uses newer JS runtime features that throw a cryptic `RegExp` error on Node 18/20).

```
cd backend
nvm use                 # or otherwise ensure Node 22
cp .env.example .env    # fill in STRAVA_CLIENT_ID/SECRET, APP_SHARED_SECRET
npm install
claude login             # one-time: authenticates the chat coach against your Claude Pro/Max
                          # subscription's included usage instead of metered API billing — see
                          # backend/src/services/claudeClient.ts. Requires the `claude` CLI
                          # (@anthropic-ai/claude-code); already logged in if you're reading this
                          # from inside a Claude Code session on this machine.
npm run dev              # serves http://localhost:3000
```

Try it once running (needs the Strava env vars above; the coach reply below will actually call
your Claude subscription):

```
curl -X POST http://localhost:3000/api/coach/message \
  -H 'Content-Type: application/json' \
  -H "x-app-secret: $APP_SHARED_SECRET" \
  -d '{"mode":"create_plan","message":"I want to train for a 10K on 2026-11-01, this is my A race."}'
```

## iOS

Open `ios/RacePace.xcodeproj` in Xcode (generated via `xcodegen generate` from `ios/project.yml` — re-run that after adding/removing source files).
