// ============================================================================
// RMIS — Password reset request (QA 2026-02, sign-in item 3). APPLICANT,
// EVALUATOR and ADMIN accounts alike. POST { email } — always responds 200
// (no account enumeration): when the address exists, a purpose-scoped,
// 30-minute JWT reset link is emailed via the notification subsystem.
// Rate limited per IP (5 / 15 min). No captcha needed — the flow cannot
// reveal whether an account exists and cannot change anything by itself.
// ============================================================================

import { SignJWT } from "jose";
import { createHash } from "crypto";
import { handleApi, ok, getClientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import { getAppSecret } from "@/lib/secrets";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

// Signing key resolves through the application secret seam (lib/secrets.ts):
// NEXTAUTH_SECRET wins, dev fallback keeps the flow testable in the sandbox,
// production fails fast when the secret is unset.

/** Public origin of this deployment, from proxy/Host headers. */
function originOf(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  const fallback = process.env.APP_ORIGIN || "";
  if (proto && host) return `${proto}://${host}`;
  if (fallback) return fallback.replace(/\/$/, "");
  return "http://localhost:3000";
}

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const limit = consumeRateLimit(`pwreset:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return ok({
      sent: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    // Same envelope as the success path — do not hint at validity.
    return ok({ sent: true, message: "If an account exists for that email, a reset link has been sent." });
  }
  const { email } = parsed.data;

  const user = await db.user.findFirst({
    where: { OR: [{ email }, { username: email }] },
    select: { id: true, email: true, firstName: true, blocked: true, password: true },
  });

  if (user && !user.blocked) {
    // Bind the token to the CURRENT password hash: the moment the password
    // changes (reset completes, or the user signs in and changes it), every
    // outstanding link for that account dies — single-use by construction.
    const pwh = createHash("sha256").update(user.password).digest("hex");
    const token = await new SignJWT({ purpose: "password-reset", pwh })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(getAppSecret());

    const link = `${originOf(req)}/#/reset-password?token=${encodeURIComponent(token)}`;
    const firstName = user.firstName?.trim() || "there";

    await sendEmail({
      to: user.email,
      subject: "Reset your RMIS password",
      bodyText:
        `Hi ${firstName},\n\n` +
        `We received a request to reset the password for your RMIS account.\n` +
        `Open the link below within 30 minutes to choose a new password:\n\n${link}\n\n` +
        `If you did not request this, you can safely ignore this email; your password stays unchanged.\n\n` +
        `MIRDC Human Resources`,
      bodyHtml:
        `<p style="color:#484758;font-size:14px;line-height:1.6;">Hi ${firstName},</p>` +
        `<p style="color:#484758;font-size:14px;line-height:1.6;">We received a request to reset the password for your RMIS account. Open the link below within <strong>30 minutes</strong> to choose a new password:</p>` +
        `<p style="margin:20px 0;"><a href="${link}" style="background:#1f2025;color:#ebf0f8;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:14px;">Choose a new password</a></p>` +
        `<p style="color:#8a8a99;font-size:12px;line-height:1.6;">If the button does not work, copy this link into your browser:<br>${link}</p>` +
        `<p style="color:#484758;font-size:14px;line-height:1.6;">If you did not request this, you can safely ignore this email; your password stays unchanged.</p>` +
        `<p style="color:#8a8a99;font-size:12px;">MIRDC Human Resources</p>`,
      relatedType: "PASSWORD_RESET",
    });

    auditLog({
      userId: user.id,
      userLabel: user.email,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      description: "Password reset link requested",
      ipAddress: ip,
    });
  }

  // Constant envelope regardless of account existence.
  return ok({
    sent: true,
    message: "If an account exists for that email, a reset link has been sent. The link expires in 30 minutes.",
  });
});
