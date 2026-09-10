# race-pace

A personal training-plan coach for runners. It connects to Strava for your training
history, builds a race plan through a chat conversation with an LLM coach, and adapts
that plan when you skip or reschedule a workout. 
I want to create something less "cookie-cutter-template" than the other plans out there.
The real goal: Turn this pet project in product that gets me across the finish line
of Hamburg Marathon 2027 in 3h45min.

**Status: working prototype.** Plan generation and adjustment work
end-to-end on a device — Strava OAuth, chat, plan persistence, and the Plan tab are all
real. There are no iOS tests, chat transcripts aren't persisted across a force-quit, and
plans are generated once rather than re-derived as training progresses.

## The part worth reading

While generating a usable training plan seemed simple at first, I discovered that most of what the
coach "knew" was inaccurate or even wrong.

The plan generator started out encoding standard running-community advice: the 10% rule,
cutback weeks every 3–4 weeks, never two hard days back-to-back. Auditing those
assumptions against the primary literature
([`docs/research/research_output.md`](docs/research/research_output.md)) found that
several are folklore and one is close to backwards:

- **The 10% rule failed its only randomized controlled trial**, and the acute:chronic
  workload ratio doesn't predict injury in the largest running dataset assembled. What
  *does* predict it is the single-session spike — a run exceeding twice the longest run
  of the prior 30 days carried a 2.28× overuse-injury hazard across 5,205 runners. So
  the validator stopped policing week-over-week growth and started policing that.
- **The most consequential bug wasn't in the assumption list at all.** The generator
  prescribed paces with no performance benchmark, which means every pace in every plan
  was invented. That became [`paceEngine.ts`](backend/src/services/paceEngine.ts) —
  VDOT derived from a *recent actual performance*, never from the athlete's goal time,
  since training at a speed you can't yet hold is how people get hurt.
- **Load accounting moved off calendar weeks onto rolling 7-day windows.** A Sunday long
  run and the days after it are one block of training; a Monday boundary splits them, so
  a genuinely hard stretch can read as two moderate weeks and a real deload can vanish
  entirely.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) covers how the three parts fit together,
what's implemented versus scaffolded, and the known gaps.

## Layout

- `ios/` — SwiftUI app (SwiftData for local storage)
- `backend/` — thin, stateless TypeScript/Node proxy (Strava OAuth token exchange/refresh, Claude coach chat proxy — holds the secrets the app can't)
- `shared/schema/` — JSON Schema contract for the chat tool-call payloads, used by the backend for validation and hand-mirrored as Codable DTOs on iOS
- `docs/` — architecture overview, the research audit, and one-time manual setup steps

See `docs/strava-app-setup.md` before running the backend. If you fork this, you'll need
to redeploy the OAuth redirect page under your own GitHub account — that doc explains why
and what to change.

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
npm test                 # 88 tests: pace engine, plan validation, athlete context, coach route
```

Try it once running (needs the Strava env vars above; the coach reply below will actually call
your Claude subscription):

```
curl -X POST http://localhost:3000/api/coach/message \
  -H 'Content-Type: application/json' \
  -H "x-app-secret: $APP_SHARED_SECRET" \
  -d '{"mode":"create_plan","message":"I want to train for a 10K on 2026-11-01, this is my A race."}'
```

The backend is built to run on localhost against a single user. It authenticates with one
shared secret and doesn't rate-limit, so don't put it on a public host as-is.

## iOS

Open `ios/RacePace.xcodeproj` in Xcode (generated via `xcodegen generate` from `ios/project.yml` — re-run that after adding/removing source files).
