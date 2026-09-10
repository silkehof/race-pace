# Research brief: evidence base for automated running plan generation

## Your task

Audit the exercise-science assumptions listed in this document against the primary
research literature. Confirm, refute, or qualify each one; identify what is missing
entirely; and return findings in a form that can be encoded directly into software.

Treat every assumption below as unverified, including the ones that sound obviously
true and the ones that cite a researcher by name. They were written from practitioner
knowledge and running-community consensus, not from a literature review. Several are
probably folklore. At least one is probably backwards. Your job is to find out which.

Also question the *framing*, not just the claims — see "Structural assumptions" and
"Gap analysis" below. If the whole approach is wrong in some way, say so.

## Context: what this is for

A training-plan generator for a **single recreational runner**. An LLM coach interviews
the athlete, then emits a complete day-by-day plan from today through race day. A
deterministic validator checks the generated plan against numeric thresholds and returns
advisory notes (never blocking) that the model can act on before the plan is saved.

This matters for your recommendations in three ways:

- **Population.** Recreational, not elite or collegiate. Weekly volume plausibly
  15–70 km. Where evidence exists only in trained/elite populations, say so explicitly
  and flag the extrapolation rather than passing it through silently.
- **Distances.** 5K through marathon. Single goal race per plan.
- **Available data.** Strava activity history only: date, activity type, distance,
  moving time, elevation. Heart rate is available on some activities but not reliably.
  No lab testing, no lactate, no power, no HRV, no sleep data. A recommendation that
  requires data we cannot obtain is not useful unless you flag it as such and give a
  fallback that works with distance and duration alone.

## Assumption inventory

Each numbered item is currently asserted somewhere in the system. For each one, return
the analysis described in "Output format."

### Volume progression and load

1. Long-run distance should not increase by more than ~10% week over week.
2. A "cutback" or recovery week should be inserted every 3–4 weeks of building, with
   roughly 15–25% less total volume than the preceding week.
3. A cutback needs to reduce *total weekly volume*, not just shorten the long run.
4. The long run should be roughly 20–30% of that week's total volume, and a long run
   exceeding about one third of weekly volume indicates the rest of the week is
   under-built rather than that the long run is too long.
5. Starting volume for a new plan should be a conservative progression from the
   athlete's actual recent training rather than a template default.
6. When an athlete repeatedly skips sessions or reports fatigue, reducing overall plan
   volume by 15–25% is an appropriate first response.

### Intensity distribution

7. Roughly 80% of weekly training volume should be genuinely easy, and about 20% at
   tempo/interval/race-pace effort or harder ("polarized," attributed to Seiler).
8. One to two quality sessions per week is sufficient for nearly all recreational
   runners; three is appropriate only briefly during a peak/build phase near the race,
   never as a steady state.
9. Two hard sessions should not be scheduled on consecutive days.
10. The long run counts as a "hard" session for the purpose of assumption 9.
11. Easy days being genuinely easy is what makes hard days productive — i.e. the
    benefit of intensity discipline runs through recovery quality, not just total load.
12. Every plan should contain at least one full rest or recovery day per week.

### Workout prescription

13. `tempo` means threshold effort — "comfortably hard," pace sustainable for roughly
    one hour.
14. `interval` means VO2max-stressing efforts of roughly 3–5 minutes per repetition
    with substantial recovery between them.
15. `race_pace` means the athlete's specific goal pace for the target race distance.
16. Quality sessions (tempo/interval/race-pace) always require a distinct warm-up and
    cooldown; easy runs, long runs and recovery runs do not.
17. Training paces can be validly prescribed from a goal race time. (Note: the system
    currently captures **no** goal time and no performance benchmark at all, so paces
    are effectively invented — see gap analysis.)

### Tapering

18. A taper is always required before a race.
19. Taper length should scale with race distance: ~1 week for 5K–10K, 1.5–2 weeks for a
    half marathon, 2–3 weeks for a marathon.
20. Volume should be reduced progressively rather than in a single step, ending at
    roughly 40–60% of peak weekly volume in race week.
21. Session frequency should stay close to normal through the taper.
22. Intensity should remain essentially unchanged through the taper; a short sharpening
    effort is fine, full quality sessions are not.

**Pin down the operational definition here.** "Reduce volume by 40–60%" and "reduce
volume to 40–60% of peak" describe different plans. State unambiguously which the
evidence supports, and against what baseline (peak week? mean of the build block?).

### Injury prevention and strength

23. Two strength sessions per week roughly halve overuse injury risk (a Lauersen-type
    meta-analytic claim).
24. Strength work should emphasise single-leg and hip/glute exercises (Bulgarian split
    squats, single-leg deadlifts, calf raises) rather than a general gym split.
25. Strength training is worth recommending to runners who did not ask for it,
    particularly those with a history of niggles.
26. Injury prevention and consistency should be prioritised over hitting an ideal plan
    on paper; when uncertain, err conservative.

## Structural assumptions

These are unstated design decisions rather than explicit claims. Question them directly.

27. **A plan is a flat list of dated workouts.** There is no representation of a
    training phase, block, or mesocycle. Base/build/peak exists only implicitly in the
    volume numbers. Is explicit periodization structure necessary for a plan of this
    kind to be sound, or is it presentational?
28. **Training load is measured as distance in meters.** Not time, not TRIMP, not any
    session-RPE or composite load metric. Which metric does the evidence actually
    support for progression and injury-risk purposes, and what is the best available
    proxy given only distance, duration and intermittent HR?
29. **Intensity is prescribed as pace.** Not heart rate, not RPE, not effort ranges.
    Consider terrain, heat, fatigue and treadmill/road differences.
30. **The 80/20 split is computed by distance.** Note that the literature may define
    intensity distribution by time-in-zone or by session count instead. If so, state
    how large the discrepancy is — easy running covers less distance per unit time, so
    a distance-based measure and a time-based measure of the same training will not
    agree. Say which is correct and how to compute it from distance and duration.
31. **The full plan is generated once, up front, and then patched reactively** when the
    athlete skips or reschedules. There is no scheduled re-planning and no
    recalculation as fitness changes. Is a fixed 8–20 week plan defensible, or does the
    evidence favour rolling/adaptive prescription?
32. **Training age and injury history are not inputs.** Only the last 28 days of
    training volume are used. How strongly do these moderate safe progression rates?
33. **The workout-type vocabulary is fixed** as: easy run, long run, tempo, interval,
    race pace, recovery, cross-train, strength, rest, race. Is anything important
    missing — hill work, strides, fartlek, progression runs, doubles?
34. **Weeks are Monday-anchored calendar weeks** for all volume accounting. Does the
    training-load literature support fixed calendar weeks, or rolling windows?

## Gap analysis

Beyond auditing the list, identify what is **absent**. The inventory above can only
tell us whether what we have is right; it cannot reveal a missing concept. Specifically
address:

- What variables does a well-constructed training plan need to specify that are not
  represented anywhere above?
- Is there an established, operationalised model for deriving individual training paces
  from a performance benchmark that we could implement? Evaluate the candidates
  (VDOT/Daniels, critical speed, Riegel-type equivalences, others) on evidence quality
  and on whether they can be driven by Strava data alone.
- What is the evidence on **race-time prediction** from recent training and performance
  history? We would like to tell an athlete whether their goal is realistic, and
  currently cannot.
- Are there well-supported injury-risk signals computable from Strava data that we
  should be watching for and are not?
- What does the evidence say about **individual response variation**? If responses vary
  widely, that is an argument for adaptive re-planning over a fixed plan, and we should
  know the magnitude.

## Contested constructs

Where a construct is popular but methodologically challenged, say so plainly and
characterise both sides. Acute:chronic workload ratio is the obvious case — it is
widely cited and has drawn substantial methodological criticism — but treat this as an
example, not an exhaustive list. Flag anything where the popular version of a finding
has outrun the evidence, and anything where the original study has failed to replicate.

We would rather encode a rule graded "contested" and know it than encode it as settled.

## Output format

For each numbered assumption, and for each gap you identify:

**Claim** — restate precisely, disambiguating any vagueness in our wording.

**Verdict** — one of: `supported` / `partially supported` / `unsupported` /
`contested` / `no evidence either way`.

**Evidence grade** — one of:
- `strong` — meta-analysis or replicated RCT
- `moderate` — consistent observational evidence, or a single good RCT
- `weak` — limited, inconsistent, or indirect evidence
- `heuristic` — coaching practice with no real evidence base
- `contested` — meaningful evidence or methodological argument on both sides

**Sources** — primary literature with full citation. Prefer meta-analyses and RCTs.
Coaching books and websites may be cited as evidence of *practice*, but must be
labelled as such and never presented as research support.

**Strongest counter-evidence** — actively search for it. A claim returned with only
supporting citations will be treated as incompletely researched.

**Operational definition** — exactly how the claim should be measured and computed.
Units, baseline, and window. This is the part that gets written into code, so ambiguity
here is a defect. If the literature is itself ambiguous, say so and recommend a
defensible convention.

**Recommended parameters** — the specific numbers we should use, with ranges where the
evidence supports a range rather than a point value.

**Population applicability** — who was studied, and how much of a stretch it is to
apply this to a recreational runner at 15–70 km/week.

**What changes if this is wrong** — briefly, what a generated plan would look like
under the corrected version versus the current one. This determines what we fix first.

## Ground rules

- Primary sources over secondary. Where you cite a well-known finding, cite the study,
  not an article about the study.
- Distinguish clearly between "the research supports this," "coaches widely do this,"
  and "this is internet consensus." These get conflated constantly in this field.
- Quantify effect sizes where reported. "Reduces injury risk" is much less useful than
  a risk ratio with a confidence interval.
- Where evidence is genuinely absent, say "no evidence either way" rather than reaching
  for the nearest adjacent finding. A well-marked gap is a usable result; a confident
  answer built on an unrelated study is worse than nothing here.
- Do not soften findings to preserve our existing design. If a rule we have stated
  confidently turns out to be unsupported, say so directly — that is the single most
  valuable thing this review can produce.
- Note publication dates. Several of these areas have moved in the last decade.

## Deliverable

A structured document covering every numbered assumption plus the gap analysis, ordered
so that findings which would change plan output most are first. A summary table at the
top — claim, verdict, grade, recommended parameter — that can be read on its own.
