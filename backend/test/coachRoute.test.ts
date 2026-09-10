import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallClaudeParams } from "../src/services/claudeClient.js";

// The route's job is assembling one turn's context; what the model does with it is not this
// test's business, so the client is stubbed and the captured params are the assertion surface.
const captured: CallClaudeParams[] = [];
vi.mock("../src/services/claudeClient.js", () => ({
  callClaude: async (params: CallClaudeParams) => {
    captured.push(params);
    return { text: "ok", toolCall: null };
  },
}));

const { coachRouter } = await import("../src/routes/coach.js");

const athleteContext = {
  recentWeeklyDistanceKm: 12,
  recentRunCount: 4,
  runDaysPerWeek: 2,
  longestRunLast30DaysKm: 6,
  benchmarkCandidates: [
    { date: "2026-07-05", name: "Summer 10K race", distanceMeters: 10000, durationSeconds: 2700 },
  ],
};

const currentPlan = {
  raceName: "Autumn Half",
  raceDate: "2026-10-25",
  workouts: [
    { id: "w1", date: "2026-09-05", type: "easy_run", targetDistanceMeters: 8000, description: "Easy" },
    { id: "w2", date: "2026-09-12", type: "long_run", targetDistanceMeters: 18000, description: "Long run" },
  ],
};

let server: Server | undefined;

async function post(body: unknown): Promise<CallClaudeParams> {
  const app = express();
  app.use(express.json());
  app.use("/api/coach", coachRouter);
  server = app.listen(0);
  const { port } = server.address() as { port: number };
  await fetch(`http://localhost:${port}/api/coach/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return captured[captured.length - 1];
}

afterEach(() => server?.close());

describe("POST /api/coach/message", () => {
  // The regression this pins: athleteContext was sent by the app on every turn but only read in
  // create_plan mode, so an adjustment ran with no pace guidance and no load baseline — while the
  // adjustment prompt told the coach to check the long run against recent training it couldn't see.
  it.each(["create_plan", "adjust_plan"] as const)(
    "gives %s mode the athlete's baseline and derived paces",
    async (mode) => {
      const params = await post({ mode, message: "hi", athleteContext, currentPlan });
      expect(params.baseline).toMatchObject({
        longestRecentRunMeters: 6000,
        recentWeeklyVolumeMeters: 12000,
        establishedRunDaysPerWeek: 2,
      });
      // The paces the coach is told to prescribe from are the same ones the validator measures
      // with, so a plan is never judged against a runner it isn't for.
      expect(params.baseline?.paces?.thresholdSecPerKm).toBeGreaterThan(0);
      expect(params.userMessage).toContain("tempo (threshold)");
      expect(params.userMessage).toContain("longestRunLast30DaysKm");
    },
  );

  it("passes the echoed plan's workouts through for the adjustment checks", async () => {
    const params = await post({ mode: "adjust_plan", message: "hi", athleteContext, currentPlan });
    expect(params.currentWorkouts.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(params.userMessage).toContain("currentPlan");
  });

  // Gap closed: assessGoal existed and was tested, but nothing ever supplied a goal time, so the
  // coach had to eyeball the comparison — the arithmetic the pace engine exists to take over.
  it("checks a goal time from the intake against what recent running implies", async () => {
    const params = await post({
      mode: "create_plan",
      message: "hi",
      athleteContext,
      goalDistanceMeters: 10000,
      goalTimeSeconds: 39 * 60,
    });
    // Their 45:00 10K says 39:00 is well out of reach for this block; the coach is told to say so
    // and to keep prescribing from current fitness regardless.
    expect(params.userMessage).toContain("more than a single block usually delivers");
  });

  // The elevation and treadmill fields have to survive request parsing to reach the pace engine.
  // They did not, at first: parseAthleteContext dropped every field it wasn't explicitly reading,
  // so the benchmark guards were dead through the route while passing their own unit tests.
  it("carries the elevation and treadmill flags through to benchmark selection", async () => {
    const params = await post({
      mode: "create_plan",
      message: "hi",
      goalDistanceMeters: 10000,
      athleteContext: {
        benchmarkCandidates: [
          // Faster than the parkrun, but run down a hill — must not become the benchmark.
          { date: "2026-07-20", name: "Downhill blast", distanceMeters: 5000, durationSeconds: 1080, elevationGainMeters: 10, elevationRangeMeters: 300 },
          { date: "2026-07-05", name: "Saturday parkrun", distanceMeters: 5000, durationSeconds: 1345, elevationGainMeters: 30, elevationRangeMeters: 25 },
        ],
      },
    });
    expect(params.userMessage).toContain("Saturday parkrun");
    expect(params.userMessage).not.toContain("Downhill blast");
  });

  it("explains that treadmill efforts can't be converted into road paces", async () => {
    const params = await post({
      mode: "create_plan",
      message: "hi",
      athleteContext: {
        benchmarkCandidates: [
          { date: "2026-07-20", name: "Gym session", distanceMeters: 8000, durationSeconds: 2400, isTreadmill: true },
        ],
      },
    });
    // Telling a treadmill runner that nothing was found would be both untrue and confusing.
    expect(params.userMessage).toContain("on a treadmill");
    expect(params.userMessage).not.toContain("No usable recent performance was found");
    expect(params.userMessage).toContain("Do not invent pace numbers");
  });

  it("tells the coach not to invent paces when there's no usable benchmark", async () => {
    const params = await post({ mode: "create_plan", message: "hi" });
    expect(params.userMessage).toContain("Do not invent pace numbers");
    expect(params.baseline).toEqual({});
    expect(params.currentWorkouts).toEqual([]);
  });

  it("rejects a request missing mode or message", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/coach", coachRouter);
    server = app.listen(0);
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://localhost:${port}/api/coach/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(400);
  });
});
