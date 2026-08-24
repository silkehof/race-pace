import { Router } from "express";
import {
  StravaAuthError,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../services/stravaAuth.js";

export const stravaRouter = Router();

stravaRouter.post("/oauth/exchange", async (req, res, next) => {
  try {
    const { code, redirect_uri: redirectUri } = req.body as { code?: string; redirect_uri?: string };
    if (!code) {
      res.status(400).json({ error: "Missing 'code' in request body" });
      return;
    }
    const tokens = redirectUri
      ? await exchangeAuthorizationCode(code, redirectUri)
      : await exchangeAuthorizationCode(code);
    res.status(200).json(tokens);
  } catch (err) {
    if (err instanceof StravaAuthError) {
      res.status(502).json({ error: err.message });
      return;
    }
    next(err);
  }
});

stravaRouter.post("/oauth/refresh", async (req, res, next) => {
  try {
    const { refresh_token: refreshToken } = req.body as { refresh_token?: string };
    if (!refreshToken) {
      res.status(400).json({ error: "Missing 'refresh_token' in request body" });
      return;
    }
    const tokens = await refreshAccessToken(refreshToken);
    res.status(200).json(tokens);
  } catch (err) {
    if (err instanceof StravaAuthError) {
      res.status(502).json({ error: err.message });
      return;
    }
    next(err);
  }
});
