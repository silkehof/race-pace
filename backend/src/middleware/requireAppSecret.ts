import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export function requireAppSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("x-app-secret");
  if (provided !== config.appSharedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
