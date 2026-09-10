/** Shared between planGenerationRules and adjustmentRules so the convention can't drift between
 * the two mutually-exclusive prompt paths (routes/coach.ts sends exactly one per request). */
export const runPhaseFormat = `For any workout with \`type: "tempo"\`, \`"interval"\`, or \`"race_pace"\`, the \`description\` must follow this exact line-based structure so the app can render it as distinct phases rather than one paragraph — do not write it as free-flowing prose:
\`\`\`
Warm-up: <duration or distance, easy effort>
Main: <the quality portion — distance/reps and the target pace or effort, e.g. "3km at tempo pace (comfortably hard, ~5:00/km)" or "6x400m at 5K effort with 90s jog recovery">
Cooldown: <duration or distance, easy effort — optional>
\`\`\`
- \`Warm-up:\` and \`Main:\` are required for these types. A warm-up before hard work is well supported; a cooldown is not — the best review found active cool-downs largely ineffective for both recovery and injury prevention — so include a \`Cooldown:\` line when the athlete wants one or it genuinely helps them, and leave it out otherwise rather than adding it by reflex.
- \`Main:\` should name a concrete effort or pace, not just "hard" — the athlete needs something to aim for. Use the paces from \`paceGuidance\` when they're available; otherwise name the effort ("5K effort", "comfortably hard").
- Easy runs, long runs, recovery runs, and rest/race days stay a single plain-text \`description\` as before — they're one continuous effort, so a phase breakdown doesn't apply.`;
