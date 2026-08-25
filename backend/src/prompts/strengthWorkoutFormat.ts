/** Shared between planGenerationRules and adjustmentRules so the convention can't drift between
 * the two mutually-exclusive prompt paths (routes/coach.ts sends exactly one per request). */
export const strengthWorkoutFormat = `For any workout with \`type: "strength"\`, the \`description\` must follow this exact line-based structure so the app can render it as a structured routine rather than a paragraph — do not write a strength description as free-flowing prose:
\`\`\`
Warm-up: <2-5 min of light activity or dynamic stretches>
Main: <exercise> <sets>x<reps>, <exercise> <sets>x<reps>, ...
Cooldown: <brief stretch or easy movement>
\`\`\`
- \`Warm-up:\` and \`Main:\` are required; omit the \`Cooldown:\` line entirely if there's nothing worth calling out.
- \`Main:\` must be a comma-separated list of exercises, each with sets x reps (or a duration for holds, e.g. "Plank 3x30s") — pick exercises that support running (posterior chain, core, single-leg stability) rather than a generic gym split.
- Use coachNotes for anything that doesn't fit that structure (form cues, load progression, substitutions for an injury).`;
