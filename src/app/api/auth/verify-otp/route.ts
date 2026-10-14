// ============================================================================
// RMIS — POST /api/auth/verify-otp (public, Task 30-b). Body { email, code }.
// Rate limit 10 / IP+email / 10 min → 429. The code is checked against the
// latest unconsumed EmailOtp row (see lib/otp.ts): locked → 400 "Too many
// incorrect attempts…"; invalid → 401 and expired → 400 share ONE message (no
// oracle between the two — only the status differs). On success the matching
// APPLICANT accounts are flipped to confirmed:true and the client continues
// into the pre-existing auto-login sequence.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const POST = handleApi(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as unknown;
  const { email, code } = bodySchema.parse(body);
  const ip = getClientIp(req);

  const rl = consumeRateLimit(`otp-verify:${ip}:${email}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    throw new ApiError(
      `Too many verification attempts. Please try again in ${rl.retryAfterMinutes ?? 10} minute(s).`,
      429
    );
  }

  const result = await verifyOtp(email, code, "SIGNUP");

  if (result === "locked") {
    throw new ApiError("Too many incorrect attempts. Request a new code.", 400);
  }
  if (result === "invalid" || result === "expired") {
    // Same message for invalid and expired — no oracle between the two
    // (only the HTTP status differs: 401 invalid / 400 expired).
    throw new ApiError(
      "That code is not valid or has expired. Request a new one if it keeps failing.",
      result === "invalid" ? 401 : 400
    );
  }

  await db.user.updateMany({
    where: { email, role: "APPLICANT" },
    data: { confirmed: true },
  });

  return ok({ verified: true });
});
