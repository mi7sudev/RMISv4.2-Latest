// ============================================================================
// RMIS — POST /api/auth/resend-otp (public, Task 30-b). Body { email }.
// Enumeration-safe: a malformed body, an unknown address, a confirmed account
// and a blocked account ALL answer the same ok({ sent: true }) envelope —
// only an existing, unconfirmed, unblocked APPLICANT actually gets a fresh
// 6-digit code (issueOtp invalidates the previous unconsumed one) emailed via
// the notification subsystem fire-and-forget. Rate limited 3 / IP+email /
// 10 min → 429 ApiError — the ONLY error path this route can produce.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";
import { issueOtp } from "@/lib/otp";
import { sendEmail, emailOtpCode } from "@/lib/notify";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = bodySchema.safeParse(body);

  // Malformed → the success envelope, no enumeration and no rate-limit spend.
  if (!parsed.success) {
    return ok({ sent: true });
  }
  const { email } = parsed.data;

  const rl = consumeRateLimit(`otp-resend:${ip}:${email}`, 3, 10 * 60 * 1000);
  if (!rl.allowed) {
    throw new ApiError(
      `Too many resend requests. Please try again in ${rl.retryAfterMinutes ?? 10} minute(s).`,
      429
    );
  }

  const user = await db.user.findFirst({
    where: { email, role: "APPLICANT", blocked: false, confirmed: false },
    select: { email: true, firstName: true },
  });
  if (user) {
    const { code } = await issueOtp(user.email, "SIGNUP");
    void sendEmail({
      to: user.email,
      ...emailOtpCode(user.firstName?.trim() || "there", code, 10),
      relatedType: "otp_signup",
    });
  }

  // Constant envelope regardless of account existence/state — no enumeration.
  return ok({ sent: true });
});
