// ============================================================================
// RMIS — Direct HR email to an applicant (spec §6.5, §7.9, §10, §12.1).
//   GET  — history: last 50 email_logs rows for relatedType "application-direct".
//   POST — JSON { subject?, message } OR multipart with "attachments" files.
//          ≤3 files, ≤5 MB each, ≤10 MB total, extension allowlist, filenames
//          sanitized. Recipient is ALWAYS resolved server-side from the live
//          applicant record (no arbitrary destinations). 20 sends/user/10 min.
// ============================================================================

import { db } from "@/lib/db";
import { ok, err, ApiError, handleApi, getClientIp, parseId } from "@/lib/api";
import { requireEvaluatorFromReq, type AuthedUser } from "@/lib/auth";
import { directEmailSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";
import { sendEmail, emailDirect } from "@/lib/notify";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "png", "jpg", "jpeg", "webp",
]);
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB total


/** Path flattening, control-char strip, ≤120 chars (spec §10). */
function sanitizeFileName(raw: string): string {
  const flat = (raw || "file").split(/[\\/]+/).pop() || "file";
  const clean = flat.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "file").slice(0, 120);
}

function senderLabel(user: AuthedUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

// ── GET — direct email history ──────────────────────────────────────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({ where: { id }, select: { id: true } });
  if (!app) throw new ApiError("Application not found", 404);

  const logs = await db.emailLog.findMany({
    where: { relatedType: "application-direct", relatedId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok({
    directEmails: logs.map((log) => ({
      id: log.id,
      to: log.to,
      subject: log.subject,
      status: log.status,
      provider: log.provider,
      error: log.error,
      attachments: log.attachments,
      createdAt: log.createdAt,
    })),
  });
});

// ── POST — send a direct email ──────────────────────────────────────────────

export const POST = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  // Rate limit: 20 per user per 10 minutes (spec §12.1).
  const limit = consumeRateLimit(`direct-email:${user.id}`, 20, 600_000);
  if (!limit.allowed) {
    throw new ApiError(
      `Too many emails sent. Please try again in ${limit.retryAfterMinutes ?? 10} minute(s).`,
      429
    );
  }

  const app = await db.application.findUnique({
    where: { id },
    include: {
      applicant: { select: { id: true, emailAddress: true } },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  // Recipient always resolved server-side from the live applicant record.
  const recipient = app.applicant.emailAddress ?? "";
  if (!recipient) {
    throw new ApiError("No email address on record; contact the applicant directly.", 400);
  }

  let subject: string | undefined;
  let message: string;
  let attachments: { name: string; bytes: number; content?: string; contentType?: string }[] = [];

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);

    if (files.length > MAX_FILES) {
      throw new ApiError(`A maximum of ${MAX_FILES} attachments is allowed.`, 400);
    }

    let totalBytes = 0;
    for (const file of files) {
      const name = sanitizeFileName(file.name);
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new ApiError(
          `"${name}" has an unsupported file type. Allowed: pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, jpeg, webp.`,
          400
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new ApiError(`"${name}" exceeds the 5 MB per-file attachment limit.`, 400);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new ApiError("Attachments exceed the 10 MB total limit.", 400);
      }
      // Encode the file for the ACTIVE email provider (base64). Metadata
      // (name + bytes) is what gets persisted to email_logs; the bytes go
      // to the middleware/resend only — never to the database.
      const mime =
        file.type && file.type !== "application/octet-stream"
          ? file.type
          : MIME_BY_EXTENSION[ext];
      const bytes = Buffer.from(await file.arrayBuffer());
      attachments.push({ name, bytes: file.size, content: bytes.toString("base64"), contentType: mime });
    }

    const parsed = directEmailSchema.parse({
      subject: (formData.get("subject") as string | null) || undefined,
      message: (formData.get("message") as string | null) ?? "",
    });
    subject = parsed.subject ?? undefined;
    message = parsed.message;
  } else {
    const body = await req.json().catch(() => ({}));
    const parsed = directEmailSchema.parse(body);
    subject = parsed.subject ?? undefined;
    message = parsed.message;
  }

  const template = emailDirect(senderLabel(user), subject || "Message from MIRDC HR", message);
  const email = await sendEmail({
    to: recipient,
    subject: template.subject,
    bodyText: template.bodyText,
    bodyHtml: template.bodyHtml,
    relatedType: "application-direct",
    relatedId: id,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "DIRECT_EMAIL_SENT",
    entityType: "application",
    entityId: id,
    description: `Direct email sent for application ${id} (status: ${email.status}, attachments: ${attachments.length})`,
    ipAddress: getClientIp(req),
  });

  if (email.status === "failed") {
    return err("Email delivery failed", 502);
  }

  return ok({ email, attachments: attachments.length });
});
