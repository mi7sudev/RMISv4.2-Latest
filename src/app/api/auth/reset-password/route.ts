// ============================================================================
// RMIS — Password reset completion (QA 2026-02, sign-in item 3).
// POST { token, password } — verifies the purpose-scoped 30-minute JWT minted
// by /api/auth/forgot-password, then replaces the account password (bcrypt
// cost 10, same stack as login/register). Works for APPLICANT, EVALUATOR and
// ADMIN accounts. Rate limited per IP (10 / 15 min) against token grinding.
// ============================================================================

import { jwtVerify } from "jose";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";
import { getAppSecret } from "@/lib/secrets";

const bodySchema = z.object({
  token: z.string().min(10).max(4000),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

// Token verification key resolves through the application secret seam
// (lib/secrets.ts) — same contract that signed it in forgot-password.

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const limit = consumeRateLimit(`pwreset-finish:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    throw new ApiError("Too many attempts. Please try again later.", 429);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message || "Invalid request", 422);
  }
  const { token, password } = parsed.data;

  let subject: string;
  let issuedPwh: string | undefined;
  try {
    const { payload } = await jwtVerify(token, getAppSecret());
    if (payload.purpose !== "password-reset" || typeof payload.sub !== "string") {
      throw new Error("wrong purpose");
    }
    subject = payload.sub;
    issuedPwh = typeof payload.pwh === "string" ? payload.pwh : undefined;
  } catch {
    throw new ApiError("This reset link is invalid or has expired. Please request a new one.", 400);
  }

  const user = await db.user.findUnique({
    where: { id: subject },
    select: { id: true, email: true, blocked: true, password: true },
  });
  if (!user || user.blocked) {
    throw new ApiError("This reset link is invalid or has expired. Please request a new one.", 400);
  }

  // Single-use: the token must still match the account's current password
  // hash. Once the password is reset (or changed any other way after the
  // link was issued) the hash moves on and every outstanding link dies.
  if (!issuedPwh || issuedPwh !== createHash("sha256").update(user.password).digest("hex")) {
    throw new ApiError("This reset link has already been used. Please request a new one.", 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({ where: { id: user.id }, data: { password: passwordHash } });

  auditLog({
    userId: user.id,
    userLabel: user.email,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "User",
    entityId: user.id,
    description: "Password replaced via emailed reset link",
    ipAddress: ip,
  });

  return ok({ reset: true, message: "Password updated. You can now sign in with your new password." });
});
