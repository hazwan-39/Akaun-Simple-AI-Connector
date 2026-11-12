import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { PilotKey } from "../config.js";
import { AppError } from "../errors.js";

/**
 * Minimal MVP access control: each pilot user receives a random access key.
 * Only its SHA-256 hash is stored on the server (PILOT_ACCESS_KEYS). The
 * add-in sends the key as `Authorization: Bearer <key>`.
 */
export const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest();

export function findPilotKey(presented: string, keys: PilotKey[]): PilotKey | null {
  if (presented.length < 20 || presented.length > 200) return null;
  const digest = hashKey(presented);
  let match: PilotKey | null = null;
  // Compare against every key to keep timing independent of position.
  for (const k of keys) {
    if (k.sha256.length === digest.length && timingSafeEqual(k.sha256, digest)) match = k;
  }
  return match;
}

declare module "express-serve-static-core" {
  interface Request {
    pilotKeyLabel?: string;
    requestId?: string;
  }
}

export function requirePilotKey(keys: PilotKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? "";
    const m = /^Bearer\s+([A-Za-z0-9_\-.]+)$/.exec(header);
    const key = m ? findPilotKey(m[1]!, keys) : null;
    if (!key) return next(new AppError("UNAUTHORIZED"));
    req.pilotKeyLabel = key.label;
    next();
  };
}
