// ============================================================================
// RMIS — Public contact requests (QA 2026-02: "Contact Requests — management
// of inquiries or requests submitted through the system"). POST { name, email,
// subject, message } — open to everyone (no session), stored as a
// ContactRequest row and surfaced in Settings → Contact Requests for staff.
// Rate limited per IP (3 / 15 min) against spam.
// ============================================================================

import { z } from "zod";
import { handleApi, ok, getClientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("A valid email is required").max(200),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(1, "Message is required").max(4000),
});

export const POST = handleApi(async (req: Request) => {
  const ip = getClientIp(req);
  const limit = consumeRateLimit(`contact:${ip}`, 3, 15 * 60 * 1000);
  if (!limit.allowed) {
    return ok({
      submitted: false,
      message: "You've sent several inquiries already. Please try again in a few minutes.",
    });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return ok({ submitted: false, message: parsed.error.issues[0]?.message || "Please review the form." });
  }
  const { name, email, subject, message } = parsed.data;

  const row = await db.contactRequest.create({
    data: { name, email, subject, message, status: "OPEN" },
  });

  auditLog({
    userLabel: email,
    action: "CONTACT_REQUEST_SUBMITTED",
    entityType: "ContactRequest",
    entityId: row.id,
    description: `Contact request: ${subject}`,
    ipAddress: ip,
  });

  return ok({
    submitted: true,
    message: "Your inquiry has been received. The MIRDC Human Resources team will get back to you through email.",
  });
});
