// ============================================================================
// RMIS — API helpers (spec §6 conventions): response envelope, error handling,
// client IP. Every route handler is wrapped in handleApi().
//   - ok(data, status)    → payload JSON directly (200/201)
//   - err(message, status, details?) → { error, details? }
//   - ApiError            → carries its message + status through handleApi
//   - unexpected throws   → generic 500 (never leak internals)
// ============================================================================

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status }
  );
}

export type ApiCtx = { params: Promise<Record<string, string>> };

export function handleApi<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return err(e.message, e.status, e.details);
      }
      if (e instanceof ZodError) {
        return err("Validation failed", 400, e.flatten());
      }
      console.error("[API ERROR]", e);
      return err("An unexpected error occurred. Please try again.", 500);
    }
  };
}

/**
 * Client IP for audit/rate-limiting. Uses the LAST X-Forwarded-For entry —
 * the spoof-resistant form (same contract as the staff intranet gate in
 * auth.ts): the FIRST entry is client-supplied behind any proxy, so keying
 * the login lockout on it let an attacker rotate their identity per request
 * and evade the IP+identifier bucket entirely.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Parse a path id strictly — non-numeric/garbage ids are a 400 (client
 * error), never a Prisma throw surfaced as a generic 500.
 */
export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Invalid id", 400);
  return id;
}
