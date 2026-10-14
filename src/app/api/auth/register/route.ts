// ============================================================================
// RMIS — POST /api/auth/register (public, spec §3.4)
// Rate limit 5/IP/hour → 429. Turnstile chokepoint: the public applicant door
// must present a fresh captcha token (403 otherwise). Body { email, firstName,
// lastName, password, captchaToken? }. Duplicate email → 409. ONE
// $transaction: user (bcrypt cost 10, role APPLICANT, auto-username = email
// local part with numeric-suffix dedupe) + applicant row (firstName/lastName/
// emailAddress copied, isProfileComplete false). 201 → { id, email, role,
// applicantId }.
// Task 30-b: the user is created CONFIRMED FALSE — the emailed 6-digit OTP
// gates the first sign-in (see login route). Once the $transaction commits,
// the first code is issued and emailed FIRE-AND-FORGET: the notification
// middleware can take up to 15s, so the 201 response must not block on it
// (sendEmail never throws; any failure lands in email_logs).
// ============================================================================

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { enforceCaptcha } from "@/lib/turnstile";
import { issueOtp } from "@/lib/otp";
import { sendEmail, emailOtpCode } from "@/lib/notify";

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(`register:${ip}`, 5, 3600000);
  if (!rl.allowed) {
    throw new ApiError(
      `Too many registration attempts. Please try again in ${rl.retryAfterMinutes ?? 60} minute(s).`,
      429
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = registerSchema.parse(body);
  await enforceCaptcha(req, parsed.captchaToken);
  const email = parsed.email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new ApiError("An account with this email already exists", 409);
  }

  // Auto-username from the email local part, numeric suffix when taken.
  const local = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9._-]/g, "") || "user";
  let username = local;
  let suffix = 1;
  while (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${local}${suffix}`;
    suffix += 1;
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);

  const { user, applicant } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        password: passwordHash,
        role: "APPLICANT",
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        blocked: false,
        // OTP gates first login (Task 30-b): unconfirmed until the emailed
        // 6-digit code verifies. Seed + admin-created accounts keep the
        // schema default confirmed:true.
        confirmed: false,
      },
    });
    const applicant = await tx.applicant.create({
      data: {
        userId: user.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        emailAddress: email,
        isProfileComplete: false,
      },
    });
    return { user, applicant };
  });

  // ── Email verification (Task 30-b) — after the transaction commits. Issue
  // the first 6-digit code, then dispatch the email fire-and-forget: the
  // middleware can take 15s and the 201/OTP step must not block on it
  // (sendEmail never throws — a provider outage cannot break registration).
  // relatedId deliberately omitted: EmailLog.relatedId is an Int (applicant
  // ids) while user ids are cuid strings — type-only tagging, like
  // forgot-password.
  const { code } = await issueOtp(email, "SIGNUP");
  void sendEmail({
    to: email,
    ...emailOtpCode(parsed.firstName, code, 10),
    relatedType: "otp_signup",
  });

  return ok(
    {
      id: user.id,
      email: user.email,
      role: "APPLICANT",
      applicantId: applicant.id,
    },
    201
  );
});
