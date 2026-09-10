# Evidence Audit: Exercise-Science Assumptions in an Automated Running Plan Generator

## TL;DR
- **The single most important correction:** the injury-prevention logic should stop policing week-over-week percentage growth (the "10% rule" failed its only randomized controlled trial; week-to-week ratios and the acute:chronic workload ratio do **not** predict injury in the largest running dataset ever assembled) and instead police the **single-session distance spike** — a run exceeding twice the longest run in the prior 30 days carried a 2.28× overuse-injury hazard (95% CI 1.50–3.48) in 5,205 runners (Frandsen et al., *Br J Sports Med* 2025).
- **Several rules are coaching folklore, not science:** "no hard days back-to-back," "long run counts as hard," "cutback every 3–4 weeks," and "cooldown after every quality session" have essentially no supporting evidence; the cooldown claim is contradicted by the best review (Van Hooren & Peake 2018). The taper numbers (Bosquet 2007), the 80/20 easy-training principle (Seiler), and the strength-training injury benefit (Lauersen) are the best-supported claims.
- **The biggest flaw is invisible in the assumption list:** the system prescribes paces with no goal time or performance benchmark, so paces are invented. This is fixable today with a VDOT/Riegel engine driven by a recent Strava time trial or race — the one gap that most degrades every plan.

## Summary Table

| # | Claim (abbrev.) | Verdict | Grade | Recommended parameter |
|---|---|---|---|---|
| 1 | Long run +≤10%/wk | unsupported | moderate | Drop as a rule; cap single-run spike vs 30-day longest |
| 2 | Cutback every 3–4 wks, −15–25% | heuristic | heuristic | Optional; every 3–5 wks, −20–30% if used |
| 3 | Cutback cuts total volume not just long run | partially supported | weak | Reduce total load; sensible |
| 4 | Long run 20–30% of weekly volume | heuristic | weak | 20–35%; treat >33% as under-built week |
| 5 | Start from athlete's recent training | supported | moderate | Base start on 28-day actual, not template |
| 6 | On fatigue/skips, cut volume 15–25% | heuristic | weak | Reasonable; −20% first response |
| 7 | 80/20 easy/hard (Seiler) | supported (principle) | moderate | ~80% easy, defined by time not distance |
| 8 | 1–2 quality/wk; 3 only near peak | partially supported | weak | 2 quality/wk typical; 3 rarely needed |
| 9 | No hard days back-to-back | heuristic | heuristic | Keep as soft default; ≥1 easy/rest day between |
| 10 | Long run counts as hard | heuristic | heuristic | Reasonable convention; not evidence-based |
| 11 | Easy easy makes hard productive | partially supported | weak | Plausible; mechanism not directly tested |
| 12 | ≥1 rest/recovery day/wk | heuristic | heuristic | Keep; low-risk, aids adherence |
| 13 | tempo = ~1h threshold effort | supported (definition) | moderate | ~1h race-effort / LT2 pace |
| 14 | interval = 3–5 min VO2max reps | supported (definition) | moderate | 3–5 min at ~vVO2max, ~1:1 recovery |
| 15 | race_pace = goal race pace | supported (definition) | heuristic | Definitional; needs a goal time |
| 16 | Quality needs WU/CD; easy doesn't | partially supported | weak/contested | Warm-up yes; cooldown not evidence-based |
| 17 | Paces from goal time valid | partially supported | moderate | Valid from a *recent performance*, not a goal |
| 18 | Taper always required | partially supported | moderate | Yes for HM/M; minimal for 5–10K low mileage |
| 19 | Taper scales with distance | partially supported | weak | ~1 wk 5–10K, ~2 wk HM/M |
| 20 | Progressive cut to 40–60% of peak | partially supported | strong | Reduce volume BY 41–60% from peak; keep intensity/freq |
| 21 | Frequency stays normal | supported | strong | Maintain session frequency |
| 22 | Intensity unchanged in taper | supported | strong | Maintain intensity; cut volume only |
| 23 | 2×/wk strength halves injury | partially supported | moderate | Strength ↓ overuse injury (RR 0.34); ~1–3×/wk |
| 24 | Emphasise hip/glute + single-leg | contested | weak | Reasonable but not proven superior to general |
| 25 | Recommend strength unprompted | supported | moderate | Yes, especially with injury history |
| 26 | Prioritise consistency, err conservative | supported | moderate | Sound governing principle |
| 27 | Flat list, no periodization object | supported (framing OK) | contested | Explicit mesocycles not required for soundness |
| 28 | Load = distance (m) | partially supported | moderate | Use duration as primary; distance acceptable proxy |
| 29 | Intensity as pace | partially supported | moderate | Pace OK; adjust terrain/heat; offer RPE fallback |
| 30 | 80/20 computed by distance | unsupported (method) | moderate | Compute by TIME; distance under-doses intensity ~5–6pp |
| 31 | Generate once, patch reactively | contested | weak | Rolling re-plan preferable given response variance |
| 32 | Training age/injury history ignored | unsupported | moderate | Add previous injury (strongest predictor) as input |
| 33 | Fixed workout vocabulary | partially supported | weak | Add strides/hills; progression runs, fartlek optional |
| 34 | Monday calendar weeks | partially supported | weak | Rolling 7-day windows better for load; calendar OK for UX |

---

## Full Analysis (ordered by impact on plan output)

### A. Injury-prevention load logic (assumptions 1, 6; gap: Strava injury signals)

**The 10% rule (Assumption 1).** *Claim:* long-run (and by extension weekly) distance should not rise more than ~10% week-over-week to reduce injury. **Verdict: unsupported. Grade: moderate** (a Level-1 RCT plus a large cohort). The 10% rule originates in coaching books of the 1980s, not research. Its only direct RCT test — Buist et al. (GRONORUN, *Am J Sports Med* 2008;36(1):33–39) — randomised **532 novice runners** (264 intervention / 268 control) preparing for a 4-mile (6.7 km) event to a graded 13-week program applying the 10% rule versus a standard 8-week program and found **no difference in running-related injury incidence: 20.8% in the graded 10%-rule group vs 20.3% in the standard group** (χ² non-significant). Nielsen et al. (*JOSPT* 2014, "Excessive progression…") found injury risk rose when weekly distance increased >30%; Nielsen et al. (*J Strength Cond Res* 2013) found injured runners had progressed ~31.6% vs ~22.1% in healthy runners — i.e., the danger zone is well above 10%. **Strongest counter-evidence to keeping the rule:** in the largest dataset ever assembled (Garmin-RUNSAFE; Frandsen et al., *Br J Sports Med* 2025;59(17):1203–1210, 5,205 runners, 588,071 sessions), "*A negative dose-response relationship was observed for the ACWR. No relationship was identified for the week-to-week ratio.*" **Operational definition (replacement):** compute `spike_ratio = session_distance / max(session_distance over prior rolling 30 days)`. The paper's tiers (adjusted hazard rate ratios, adjusted for age, BMI, sex, previous problems, running experience): >10–30% increase → HRR 1.64 (95% CI 1.31–2.05); >30–100% → HRR 1.52 (1.16–2.00); **>100% ("large spike," i.e. more than doubling) → HRR 2.28 (1.50–3.48), p<0.01.** **What changes if this is wrong:** the validator currently throttles sensible mileage jumps for low-mileage runners (10% of 20 km is 2 km — absurdly conservative) while permitting a dangerous single long-run spike as long as the weekly total looks smooth. Replacing the weekly-percentage rule with a single-session spike guard is the highest-value fix in this audit.

**Reducing volume on fatigue/skips (Assumption 6).** *Claim:* when the athlete repeatedly skips or reports fatigue, cut plan volume 15–25%. **Verdict: heuristic (sensible). Grade: weak.** No RCT tests this specific rule, but it aligns with the consistency-over-ideal-plan principle (26) and with the fact that sudden load changes — including sharp *increases* after a gap — drive injury. **Recommended parameter:** −20% as a first response is defensible. **Population applicability:** universal; low downside — this is a safety valve.

**Gap — Strava-computable injury signals.** The strongest single computable signal is the **single-session distance spike** above. Additional evidence-supported, Strava-derivable signals: (a) **absolute weekly volume** (higher mileage → higher risk, but also higher fitness — a genuine "training–injury paradox"); (b) **return-from-layoff spikes** — after any gap, chronic load has decayed, so resuming at the pre-gap level is itself a spike; (c) **previous injury** is the strongest predictor overall (OR up to ~10, typically 2–3×; Correia et al. umbrella review 2024; Saragiotto; Senthil et al. 2026 report OR range 1.36–10.19 for prior injury) but is *not* in Strava — must be asked. Signals the system should **not** trust: ACWR (see Contested Constructs) and week-to-week percentage growth.

### B. Intensity distribution and the 80/20 computation error (assumptions 7, 8, 30)

**80/20 polarized (Assumption 7).** *Claim:* ~80% easy, ~20% hard, attributed to Seiler. **Verdict: supported as a principle; the specific "polarized" label is partially supported/contested. Grade: moderate.** Seiler & Kjerland (*Scand J Med Sci Sports* 2006) described elite endurance athletes clustering near 80% low-intensity by session-goal classification. The principle that most training should be genuinely easy is robust. However, "polarized" (little middle-zone work) being *superior* is contested: Rosenblat, Perrotta & Vicenzino (*J Strength Cond Res* 2019;33(12):3491–3500) and Oliveira, Boppré & Fonseca (*Sports Medicine* 2024, 17 studies, n=437) found polarized superior mainly for interval-type outcomes but **no superiority for many performance surrogates**. Filipas et al. (*Scand J Med Sci Sports* 2022, 60 well-trained runners, 16 wks) found **pyramidal-then-polarized** produced the greatest gains — and pyramidal (more threshold work) may suit less-experienced runners better. **Recommended parameter:** target ~80% easy; do not enforce strict "polarized" middle-zone avoidance for recreational runners — a pyramidal distribution (more tempo, less VO2max) is at least as appropriate, especially in base phase.

**The distance-vs-time computation error (Assumption 30). Verdict: unsupported method. Grade: moderate.** This is a real, quantifiable software defect. The intensity-distribution literature (Seiler) defines the split by **time in zone** (or session-goal), **never by distance**. Easy running covers less ground per unit time, so the two measures disagree systematically. **Worked example** (easy 6:00/km; hard average ~4:15/km):
- Enforcing **80/20 by distance** (52 km easy / 13 km hard of a 65 km week) yields **~85/15 by time** — i.e., *less* intensity than intended.
- A true **80/20 by time** corresponds to only **~74/26 by distance**.

So a plan built to hit 80/20 *by distance* under-doses hard work by roughly 5–6 percentage points of time relative to the Seiler standard. **Operational definition (correct method):** compute intensity share by **moving time**, not distance: `easy_share = Σ(easy session durations) / Σ(all session durations)`. Classify each session by goal (session-goal method) when duration-in-zone is unavailable — the pragmatic default with Strava data. **What changes if wrong:** plans currently look compliant but deliver slightly too little quality; switching to time-based accounting nudges plans toward marginally more or longer quality sessions.

**Quality-session frequency (Assumption 8).** *Claim:* 1–2 quality sessions/week suffice; 3 only near peak. **Verdict: partially supported. Grade: weak.** Consistent with the 80/20 principle and with typical recreational volumes (at 15–40 km/week, 2 hard sessions already pushes the 20%-by-time ceiling). No RCT defines an optimal count for recreational runners. **Recommended parameter:** 2 quality/week as the steady state; a third only transiently in a build/peak block and only above ~50 km/week. The "3 only near peak" ceiling is sound for recreational volumes; elites do more but at far higher mileage.

### C. Tapering (assumptions 18–22) — the best-supported cluster

**Verdict: mostly supported. Grade: strong** (Bosquet, Montpetit, Arvisais & Mujika, *Med Sci Sports Exerc* 2007;39(8):1358–1365 meta-analysis, 27 of 182 studies included; corroborated by later meta-analyses, e.g., PLOS One 2023). Key findings, stated to resolve the brief's disambiguation request:

**The operational definition the evidence supports (Assumption 20):** the verbatim conclusion is "*A 2-wk taper during which training volume is exponentially reduced by 41–60% seems to be the most efficient strategy to maximize performance gains.*" So reduce training **volume BY 41–60%** (not "to 40–60%"), against a **peak/pre-taper weekly-volume baseline**. Effect size for the volume reduction ≈ 0.72; overall taper performance effect ≈ 0.59 (roughly a 2–3% performance improvement). Reduction should be **progressive/exponential**, not a single step. (Note: race-week volume thus ends at ~40–59% *of* peak — the two readings the brief flagged nearly coincide here, but the *evidence statement* is "reduce BY 41–60% from peak.")

- **Assumption 18 (taper always required):** partially supported. Tapers reliably help for events with meaningful accumulated fatigue (half/full marathon). For a low-mileage runner racing a 5K, the benefit is small and a full multi-week taper may be unnecessary — a few easy days suffices.
- **Assumption 19 (length scales with distance):** the evidence base is on ~2-week tapers (8–14 days largest effect); *scaling* by distance (1 wk for 5–10K, 2–3 wk for marathon) is reasonable coaching extrapolation (grade weak).
- **Assumption 21 (frequency unchanged):** supported. Reducing frequency did not improve outcomes (effect ~0.35); maintaining it is optimal.
- **Assumption 22 (intensity unchanged):** supported/strong. Maintaining intensity while cutting volume is the defining feature of an effective taper; dropping intensity blunts the effect.

**What changes if wrong:** the current "40–60%" wording is ambiguous enough to generate a plan that either cuts too little or, if read as "to 40–60% then cut further," over-tapers. Locking in "reduce volume by 41–60% from peak, progressively, holding intensity and frequency" makes taper output correct and unambiguous.

### D. Strength training and injury prevention (assumptions 23–26)

**Strength halves injury risk (Assumption 23). Verdict: partially supported. Grade: moderate.** Lauersen, Bertelsen & Andersen (*Br J Sports Med* 2014;48:871–877) meta-analysis: strength training reduced overuse injuries to less than half. The 2018 update (Lauersen, Andersen & Andersen, *Br J Sports Med* 2018;52(24):1557–1563; 6 RCTs, five interventions, 7,738 athletes) reported a cluster-adjusted intention-to-treat **RR of 0.338 (95% CI 0.238–0.480)** for injury, with a dose-response ("a 10% increase in strength training volume reduced the risk of injury by more than four percentage points"). **Strongest counter-evidence / caveats:** (a) these are mostly **not** running-specific cohorts — many are team-sport and adolescent populations, so applying RR 0.34 to a lone recreational runner is an extrapolation; (b) confidence intervals are wide and heterogeneity is real; (c) frequently-cited "50%/66%" figures blend acute and overuse outcomes. **Recommended parameter:** recommend strength training; expect a meaningful but not precisely 50% reduction in overuse-injury risk for runners specifically. Frequency: 1–3×/week (the "2×" figure is reasonable but not a precise threshold).

**Exercise selection — hip/glute + single-leg (Assumption 24). Verdict: contested. Grade: weak.** Hip-abductor/glute strengthening has RCT support for *treating* PFPS and ITBS (e.g., Khayambashi 2014 for PFPS: isolated hip strengthening beat quad strengthening; Fredericson 2000 for ITBS: 22 of 24 runners returned to pain-free running after a 6-week hip program). But evidence that hip/glute-focused work *prevents* running injury, or is superior to a general strength program, is weak — some reviewers argue the hip-weakness theory is over-sold. **Recommended parameter:** single-leg and hip/glute work is a *reasonable* default, especially for runners with a knee-injury history, but should not be presented as proven superior to general lower-body strength + plyometrics. Note: strength training's best-*evidenced* running benefit is **running economy** (Balsalobre-Fernández, Santos-Concejero & Grivas 2016 meta-analysis: large effect, SMD ≈ −1.42, 95% CI −2.23 to −0.60; Blagrove, Howatson & Hayes 2018), via heavy resistance + plyometrics — a performance rationale independent of injury.

**Recommend strength unprompted (25):** supported (moderate) given the injury and economy evidence. **Prioritise consistency, err conservative (26):** supported (moderate) — aligns with the entire injury literature that training errors and sudden changes, not ideal-plan optimisation, drive injury.

### E. Workout definitions and warm-up/cooldown (assumptions 13–17)

**Definitions (13 tempo, 14 interval, 15 race_pace):** supported as **operational definitions** consistent with Daniels and the physiology literature (tempo ≈ threshold/LT2, ~1h race effort; interval ≈ 3–5 min at ~vVO2max with ~1:1 recovery; race_pace = goal-race pace). Grade moderate for the physiology, heuristic for the exact numbers. These are conventions, not empirical claims, and are fine as written.

**Warm-up/cooldown (Assumption 16). Verdict: partially supported / the cooldown half is unsupported and likely backwards. Grade: weak–contested.** Warm-up: Fradkin, Zazryn & Smoliga (*J Strength Cond Res* 2010;24(1):140–148) meta-analysis of 32 high-quality studies found performance improved in 79% of outcomes after warm-up, with little evidence of harm — so a warm-up before quality work is justified (grade moderate). **Cooldown: this is the assumption the brief suspected is backwards, and it is.** Van Hooren & Peake (*Sports Medicine* 2018;48(7):1575–1595) — the definitive review — concluded active cool-downs are "largely ineffective" for recovery, do **not** prevent injuries, and do not attenuate (nor enhance) the long-term adaptive response. **Recommended parameter:** keep a warm-up before tempo/interval sessions; treat the cooldown as optional (athlete preference), not a required, validated component. **What changes if wrong:** removing the mandatory-cooldown rule slightly shortens prescribed quality-session durations and stops the validator flagging their absence — a minor but correctness-improving change.

**Paces from a goal time (Assumption 17). Verdict: partially supported — with a critical correction. Grade: moderate.** Training paces *can* be validly derived — but from a **recent actual performance**, not from an aspirational goal time. Deriving paces from a goal the athlete has not yet achieved will systematically prescribe paces that are too fast, raising injury and overtraining risk. The system currently captures **no** performance benchmark, so paces are effectively invented — the most consequential gap (see Gap Analysis).

### F. Volume-structure heuristics (assumptions 2–5, 9–12)

- **Assumption 2 (cutback every 3–4 weeks, −15–25%): heuristic.** No RCT establishes that a fixed deload cadence improves outcomes or reduces injury; Kiely's periodization critique applies. It is a reasonable, low-risk convention; if used, every 3–5 weeks with a −20–30% cut. Do not present as evidence-based.
- **Assumption 3 (cutback cuts total volume, not just the long run): partially supported (weak).** Sensible — the long run is only one stressor.
- **Assumption 4 (long run 20–30% of weekly volume; >⅓ means week is under-built): heuristic (weak).** No strong evidence for the exact band, but the *interpretation* is defensible: a long run that is a huge fraction of weekly volume is itself a single-session spike risk (ties to Frandsen). Fokkema et al. (*Scand J Med Sci Sports* 2020) related longest run and weekly volume to half/marathon injury and performance. **Recommended:** treat 20–35% as normal; a long run >33% of weekly volume should trigger "build the rest of the week," not "shorten the long run" — consistent with the single-session-spike evidence.
- **Assumption 5 (start from athlete's recent training): supported (moderate).** Strongly aligns with injury evidence — starting load must match the athlete's established chronic load, not a template.
- **Assumption 9 (no hard days back-to-back) and 10 (long run counts as hard): heuristic.** No direct evidence base; standard coaching practice. Low-risk defaults; keep, but label as convention, not science.
- **Assumption 11 (easy easy makes hard productive): partially supported (weak).** Physiologically plausible and consistent with the polarized rationale (moderate-intensity "grey zone" accumulates fatigue without proportional adaptation), but not directly tested as a causal recovery mechanism.
- **Assumption 12 (≥1 rest/recovery day/week): heuristic.** No RCT, but low-risk and aids adherence. Keep.

### G. Structural / framing assumptions (27–29, 31–34)

- **27 (flat list, no periodization object): framing is defensible.** Kiely (*Int J Sports Physiol Perform* 2012; *Sports Medicine* 2018) argues periodization's classical assumptions are "tradition-driven," not evidence-led, and no study cleanly shows periodized > non-periodized endurance training. Explicit mesocycle objects are **not required** for soundness — but base/build/peak *logic* (volume, then intensity, then taper) should still shape the numbers. Verdict: framing OK; grade contested.
- **28 (load = distance in metres): partially supported (moderate).** The load literature favors **duration/internal load** (TRIMP, session-RPE) over distance. Session-RPE (Foster) performs as well as HR-derived TRIMP for tracking (D'Alleva 2025; Solomon). Given Strava data, **moving time is a better primary load unit than distance** (it captures easy/hard and terrain differences better), with distance as a secondary proxy. **Best available composite proxy without reliable HR:** duration × an intensity weight by session type (a session-RPE surrogate), e.g., easy = 3–4, tempo = 6–7, interval = 8–9 on a CR10-like scale, × minutes.
- **29 (intensity as pace): partially supported (moderate).** Pace is fine as the prescription unit but must be adjusted for terrain (elevation), heat, and treadmill/road differences; offer an **RPE/effort fallback** (e.g., "easy = conversational") for days when pace targets are inappropriate. HR is unreliable here so cannot be the primary control.
- **31 (generate once, patch reactively): contested (weak).** Individual response variance (Section H) and the fact that fitness changes over an 8–20 week block argue for **rolling re-planning** (re-derive paces and volumes every 2–4 weeks from actual completed training). A fixed plan is defensible for adherence/UX but is not the physiologically optimal choice.
- **32 (training age & injury history ignored): unsupported (moderate).** Previous injury is the **strongest** predictor of future injury (OR ~2–10). Training age/experience moderates safe progression. Both should be inputs; injury history especially must be *asked* (not in Strava).
- **33 (fixed vocabulary): partially supported (weak).** Missing high-value items: **strides** (short accelerations — low risk, aid economy/neuromuscular readiness) and **hill work**. Progression runs, fartlek, and doubles are optional. Strides are the clearest omission.
- **34 (Monday calendar weeks): partially supported (weak).** The load literature uses **rolling windows** (7-day and 28-day rolling sums; the Frandsen spike metric uses a rolling 30-day window). Calendar weeks are fine for user-facing display, but load accounting and spike detection should use **rolling windows** to avoid Monday-boundary artefacts (a big Sunday long run and a big Monday run fall in different calendar weeks but are back-to-back).

## Gap Analysis

**1. Missing variables a sound plan needs.** (a) **A performance benchmark / recent race or time-trial** — without it, paces are invented (the central defect). (b) **A goal time**, to judge realism and set race pace. (c) **Injury history** (strongest injury predictor; not in Strava). (d) **Age and sex** (affect paces, recovery, taper). (e) **Days/week available and life constraints** (adherence). (f) **Terrain/heat context** for pace adjustment. (g) **Strides/neuromuscular work.** (h) **Rolling chronic-load baseline**, not just last-28-day volume.

**2. Deriving paces from a benchmark — model evaluation.**
- **VDOT (Daniels):** a **practitioner model**, not formally peer-reviewed-validated, but widely used and internally consistent; maps a race time to equivalent paces across zones. Drivable from a single Strava race/time-trial. **Best pragmatic choice** for prescribing the full pace set.
- **Riegel (1977) power law**, T2 = T1 × (D2/D1)^1.06: simple, drivable from one Strava performance, accurate for adjacent distances (5K↔10K), **over-optimistic for the marathon** (the 1.06 exponent under-predicts marathon time for recreational runners; a higher exponent or a 3–5% buffer is advisable). Use for race-equivalence.
- **Critical speed / critical velocity (Jones, Vanhatalo, Poole):** strong physiological grounding; needs **≥2 maximal efforts** at different durations — derivable from Strava if the athlete has recent hard efforts of differing lengths, but rarely clean in recreational data.
- **Recommendation:** implement a **VDOT-style engine seeded by the best recent Strava performance** (race or hard time-trial), cross-checked with Riegel for race-equivalence, with a marathon buffer. This is the highest-leverage single feature to add.

**3. Race-time prediction from training history.** Emig & Peltonen (*Nature Communications* 2020;11:4936, ≈14,000 runners, ≈1.6 million sessions, ≈20 million km) predicted race times "to within, on average, about 2 percent of the times they actually ran" using only distance and duration of training runs, extracting an aerobic-power index and an endurance index (and estimating lactate threshold) — i.e., **race prediction from Strava-type data alone is feasible and validated at scale**. Smyth and colleagues (Feely et al., RecSys 2020) similarly model recreational marathon training for prediction and pacing. **Recommendation:** the system can and should tell an athlete whether a goal is realistic, using either a Riegel/VDOT equivalence from a recent race or an Emig-style model from training history. Currently it cannot — a clear, closable gap.

**4. Injury-risk signals from Strava (see Section A):** the single-session distance spike (>2× 30-day longest = 2.28× hazard) is the headline computable signal; also absolute mileage, return-from-gap spikes, and long-run share of weekly volume. Do **not** use ACWR or week-to-week % growth.

**5. Individual response variation.** The HERITAGE Family Study (Bouchard et al., *J Appl Physiol* 1999;87(3):1003–1008) found VO2max training response to an identical 20-week program ranged from near-zero to >1.0 L/min gains, with heritability ~47% and 2.5× more variance between families than within. **Magnitude:** responses to the same dose vary several-fold. **Implication:** this is a direct argument for **adaptive re-planning** over a fixed plan — the same prescription will over- or under-shoot different athletes, and only observed response (from completed Strava sessions and periodic time-trials) reveals which. This strengthens the case against Assumption 31's fixed-plan model.

## Contested Constructs

- **Acute:Chronic Workload Ratio (ACWR).** Widely cited (Gabbett) but heavily criticised: **mathematical coupling** produces spurious correlation (Lolli et al., *Br J Sports Med* 2019;53:921–922), the ratio lacks coherent causal interpretation, and a random chronic load performs as well as the real one (Impellizzeri et al. 2020/2021, "time to dismiss ACWR"); meta-analyses are inconsistent. In the largest running dataset (Frandsen et al. 2025) ACWR ran in the **wrong direction** (higher ACWR → lower injury rate). **Do not encode ACWR as an injury guard.**
- **The 10% rule** — folklore that failed its RCT (Buist 2008). Graded contested/unsupported.
- **Polarized superiority** — real but oversold; pyramidal is competitive and may suit recreational/base-phase runners (Filipas 2022; Oliveira 2024). Encode 80/20-easy as a principle, not strict polarization.
- **Cooldowns** — popular belief outrun by evidence (Van Hooren & Peake 2018). Optional, not mandatory.
- **Hip-strength-prevents-injury** — strong for *treatment* of PFPS/ITBS, weak for *prevention*; label contested.
- **Static stretching for injury prevention** — Lauersen's meta-analyses found stretching, unlike strength work, did **not** consistently prevent injury; do not prescribe stretching as injury prevention.

## Recommendations (staged)

**Stage 1 — correctness fixes that change plan output most (do first):**
1. Replace the 10%/weekly-percentage injury rule with a **single-session spike guard**: warn when a run exceeds ~1.5× (soft) and ~2× (strong) the rolling 30-day longest run.
2. Add a **performance-benchmark input** (recent race/time-trial from Strava) and a **VDOT/Riegel pace engine**; stop inventing paces. Add a **goal-time realism check** (Riegel/VDOT or Emig-style).
3. Fix the **80/20 computation to time-based** (or session-goal), not distance.
4. Rewrite the **taper rule** unambiguously: reduce weekly volume **by 41–60% from peak**, progressively over ~1 week (5–10K) to ~2 weeks (HM/M), **holding intensity and frequency**.
5. Make the **cooldown optional**; keep the warm-up before quality sessions.

**Stage 2 — inputs and structure:**
6. Add **injury history** and **training age** as inputs; moderate progression for injury-prone/novice athletes.
7. Move load accounting to **rolling 7-/28-day windows**; keep calendar weeks only for display.
8. Prefer **duration (or a session-RPE surrogate)** over distance as the primary load unit.
9. Add **strides** to the workout vocabulary.

**Stage 3 — adaptive prescription:**
10. Move from generate-once to **rolling re-planning** (re-derive paces/volume every 2–4 weeks from completed training), justified by HERITAGE-scale response variance.

**Thresholds that would change these recommendations:** if a large running-specific RCT showed week-to-week progression predicts injury, reinstate a graded-progression rule; if a running-specific strength-prevention RCT failed to replicate RR≈0.34, downgrade Assumption 23; if adaptive re-planning showed no adherence or outcome benefit over fixed plans in this population, keep the simpler fixed-plan model.

## Caveats
- Much of the strongest performance evidence (polarized/pyramidal TID, tapering, strength-for-economy) is drawn from **well-trained or elite** athletes; applying it to a 15–70 km/week recreational runner is a real but usually modest extrapolation, flagged per assumption above.
- The strength-injury RR ≈ 0.34 (95% CI 0.238–0.480) is from **mixed-sport** populations, not runners specifically.
- HR-dependent methods (TRIMP, HR zones) are not reliably computable from the available data; all recommendations have distance/duration fallbacks.
- Race-prediction accuracy (~2% in Emig & Peltonen) is a population average with substantial individual scatter and cannot account for weather, terrain, or race-day execution.
- One citation note: the headline single-session-spike study (Frandsen et al., Garmin-RUNSAFE cohort) was published in *Br J Sports Med* in **2025** (59(17):1203–1210, doi:10.1136/bjsports-2024-109380), not 2020 as sometimes cited secondhand; its findings are otherwise as reported here.