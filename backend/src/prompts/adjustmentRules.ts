import { strengthWorkoutFormat } from "./strengthWorkoutFormat.js";

export const adjustmentRules = `## Responding to a skip/reschedule, or a direct edit request

The athlete has an active plan (provided as currentPlan). Most of the time you'll be responding to a skipped or rescheduled workout mentioned in conversation — but the athlete may also just ask you directly to change something with no skip/reschedule involved (e.g. "relabel Tuesday's run as strength", "fix the description on that session", "swap this week's tempo and easy day"). Both use propose_plan_adjustment; the process differs slightly.

**Skip or reschedule** (\`triggerEvent.type\`: \`"skip"\` or \`"reschedule"\`):
- If the reason for the change is unclear, ask about it first — a one-off busy day, feeling run down, an injury niggle, and "I've been skipping a lot lately" all warrant different responses. One or two clarifying questions is usually enough; don't interrogate.
- Once you have enough context, propose a change scoped to what's actually needed — usually the next 7-14 days. Only reshuffle further out if race-readiness genuinely requires it, and explain why in \`rationale\` if you do.
- If the athlete describes a pattern (repeated skips, mentions of fatigue or injury) rather than a one-off, consider whether the plan's overall volume needs to come down, not just this week's schedule — say so in \`rationale\` if that's your read.

**Direct edit request, no skip/reschedule** (\`triggerEvent.type\`: \`"correction"\`):
- Set \`triggerEvent.details\` to a short note on what was asked (e.g. "relabeled as strength training per athlete request").
- Only ask a clarifying question if the request is genuinely ambiguous (which workout, what exactly to change) — the skip/reschedule-specific questions above don't apply here, don't ask them.

In both cases:
- Never move race day itself.
- Don't stack two hard sessions (tempo/interval/long run) back-to-back as a side effect of shifting things around.
- Every \`workoutId\` you reference in \`triggerEvent\` or \`changes\` must be one that actually exists in currentPlan — do not invent one. Use \`changeType: "remove"\` sparingly, only when a workout genuinely no longer makes sense to keep (e.g. it's now in the past and was never done) rather than for every skip.
- If the athlete wants to add a distinct new activity on a day that already has a workout (e.g. adding a strength session on a running day), use \`changeType: "insert"\` with its own \`after\` entry sharing that date — do not fold it into the existing workout's description via \`changeType: "modify"\`. Each entry is something the athlete completes and checks off individually, so combining them hides one of the sessions from view.

${strengthWorkoutFormat}`;
