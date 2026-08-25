import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireAppSecret } from "../src/middleware/requireAppSecret.js";

function mockReq(header: string | undefined): Request {
  return { header: () => header } as unknown as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAppSecret", () => {
  it("calls next() when the header matches the configured secret", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireAppSecret(mockReq("test-shared-secret"), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 and does not call next() when the header is missing", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireAppSecret(mockReq(undefined), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("returns 401 when the header doesn't match", () => {
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireAppSecret(mockReq("wrong-secret"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
