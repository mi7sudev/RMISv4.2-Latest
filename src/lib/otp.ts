// ============================================================================
// RMIS — Email OTP (Task 30-b): 6-digit verification codes for applicant
// signup (purpose "SIGNUP"). Codes are generated with crypto.randomInt and
// stored ONLY as sha256(code:pepper) — the plaintext exists solely in
// issueOtp()'s return value (and the outgoing email). One ACTIVE row per
// email+purpose: issuing a new code invalidates every unconsumed previous
// one. TTL 10 minutes (OTP_TTL_MINUTES); 5 wrong attempts lock the code
// (OTP_MAX_ATTEMPTS) until a fresh one is requested.
// ============================================================================

import { createHash, randomInt } from "crypto";
import { db } from "@/lib/db";
import { getAppSecretText } from "@/lib/secrets";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/**
 * OTP pepper — resolves through the application secret seam (lib/secrets.ts):
 * NEXTAUTH_SECRET wins, dev fallback keeps the flow testable in the sandbox,
 * production fails fast when the secret is unset. One contract, one file.
 */
export function otpPepper(): string {
  return getAppSecretText();
}

/** sha256 hex of `code:pepper` — what the EmailOtp row stores. */
export function hashOtp(code: string): string {
  return createHash("sha256").update(`${code}:${otpPepper()}`).digest("hex");
}

/** Uniformly random 000000–999999, zero-padded to 6 digits. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issue a fresh code for email+purpose: previous unconsumed rows for the same
 * email+purpose are deleted first (one active code at a time), then the new
 * row is created with a 10-minute expiry. Returns the PLAINTEXT code — the
 * only place it exists outside the email itself.
 */
export async function issueOtp(
  email: string,
  purpose: string = "SIGNUP"
): Promise<{ code: string; expiresAt: Date }> {
  await db.emailOtp.deleteMany({ where: { email, purpose, consumedAt: null } });
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  await db.emailOtp.create({
    data: { email, purpose, codeHash: hashOtp(code), expiresAt },
  });
  return { code, expiresAt };
}

export type OtpVerifyResult = "ok" | "invalid" | "expired" | "locked";

/**
 * Verify a submitted code against the LATEST unconsumed row for email+purpose.
 *   - no row / lapsed row            → "expired"
 *   - attempts already at the cap    → "locked"
 *   - hash mismatch                  → attempts incremented, "invalid"
 *   - match                          → row consumed, "ok"
 */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: string = "SIGNUP"
): Promise<OtpVerifyResult> {
  const row = await db.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // Nothing outstanding, or the newest code has lapsed → same verdict either
  // way (the caller answers both with one message — no oracle).
  if (!row || row.expiresAt.getTime() <= Date.now()) return "expired";

  if (row.attempts >= OTP_MAX_ATTEMPTS) return "locked";

  if (row.codeHash !== hashOtp(code)) {
    await db.emailOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return "invalid";
  }

  await db.emailOtp.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return "ok";
}
