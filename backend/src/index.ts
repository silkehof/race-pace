// Must run before ./config.js is imported below — config.ts reads process.env at module-eval
// time, so .env has to be loaded into process.env first.
import "dotenv/config";

import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAppSecret } from "./middleware/requireAppSecret.js";
import { coachRouter } from "./routes/coach.js";
import { stravaRouter } from "./routes/strava.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/strava", requireAppSecret, stravaRouter);
app.use("/api/coach", requireAppSecret, coachRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`race-pace backend listening on :${config.port}`);
});
