// ============================================================================
// RMIS — Bulk regret letters (spec §6.5, §9.3; MOM 2026-10-13 wording). 1..200
// application ids per batch, deduped. Skips: not found; shortlisted-stage
// (hard skip); already successfully sent (subject-prefix idempotency keys —
// the MOM subject "Application Status Update –" plus the legacy
// "Application regret" prefixes — with status sent/mock; failed/skipped
// attempts are retried). Each eligible send fans out regret email +
// "not shortlisted" SMS + in-app notification.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { stageForStatus } from "@/lib/status";
import { safeJsonParse } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";
import { sendEmail, sendSms, smsNotice, emailRegretLetter } from "@/lib/notify";

const bodySchema = z.object({
  applicationIds: z.array(z.number().int()).min(1, "At least one application id is required").max(200, "A maximum of 200 applications per batch"),
});

/** MOM 2026-10-13 subject. Idempotency/history keys match on it. */
const REGRET_PREFIX = "Application Status Update –";
/** Pre-MOM subjects — kept matching for idempotency/history. */
const REGRET_LEGACY_PREFIXES = ["Application regret:", "Application regret —"];

export const POST = handleApi(async (req: Request) => {
  const user = await requireEvaluatorFromReq(req);

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.parse(body);
  const ids = [...new Set(parsed.applicationIds)]; // dedupe

  const summary = { total: ids.length, sent: 0, alreadySent: 0, shortlisted: 0, failed: 0, notFound: 0 };
  const results: {
    applicationId: number;
    outcome: "sent" | "failed" | "already_sent" | "shortlisted" | "not_found";
    emailStatus?: string;
    smsStatus?: string;
    error?: string;
  }[] = [];

  for (const applicationId of ids) {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { include: { position: true } },
        applicant: { select: { id: true, firstName: true, lastName: true, emailAddress: true, contactNumber: true } },
      },
    });

    if (!app) {
      summary.notFound += 1;
      results.push({ applicationId, outcome: "not_found" });
      continue;
    }

    // Hard skip: regret is never sent to a shortlisted-stage application.
    if (stageForStatus(app.status) === "Shortlisted") {
      summary.shortlisted += 1;
      results.push({ applicationId, outcome: "shortlisted" });
      continue;
    }

    // Idempotency: prior successful regret email (sent/mock) blocks a resend;
    // failed/skipped attempts are retried (spec §9.3).
    const prior = await db.emailLog.findFirst({
      where: {
        relatedType: "application",
        relatedId: applicationId,
        OR: [{ subject: { startsWith: REGRET_PREFIX } }, ...REGRET_LEGACY_PREFIXES.map((p) => ({ subject: { startsWith: p } }))],
        status: { in: ["sent", "mock"] },
      },
      select: { id: true },
    });
    if (prior) {
      summary.alreadySent += 1;
      results.push({ applicationId, outcome: "already_sent" });
      continue;
    }

    const profile = safeJsonParse<{ firstName?: string | null; lastName?: string | null } | null>(
      app.snapshotProfile,
      null
    );
    const name =
      [profile?.firstName || app.applicant.firstName, profile?.lastName || app.applicant.lastName]
        .filter(Boolean)
        .join(" ") || "Applicant";
    const title = app.job.position?.positionTitle || app.job.title;

    const template = emailRegretLetter(name, title);
    const email = await sendEmail({
      to: app.applicant.emailAddress ?? "",
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      relatedType: "application",
      relatedId: applicationId,
    });
    const sms = await sendSms({
      to: app.applicant.contactNumber ?? "",
      message: smsNotice(
        `RMIS: We regret to inform you that you were not shortlisted for the position ${title}.`
      ),
      relatedType: "application",
      relatedId: applicationId,
    });

    try {
      await db.notification.create({
        data: {
          applicantId: app.applicantId,
          name: "Notice",
          description: `We regret to inform you that you were not shortlisted for ${title}.`,
        },
      });
    } catch {
      /* best-effort */
    }

    const outcome: "sent" | "failed" = email.status === "failed" ? "failed" : "sent";
    if (outcome === "sent") summary.sent += 1;
    else summary.failed += 1;

    results.push({
      applicationId,
      outcome,
      emailStatus: email.status,
      smsStatus: sms.status,
      error: email.error,
    });
  }

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "REGRET_LETTERS_BULK_SENT",
    entityType: "application",
    entityId: null,
    description: `Bulk regret letters, batch of ${summary.total}: ${summary.sent} sent, ${summary.alreadySent} already sent, ${summary.shortlisted} shortlisted (skipped), ${summary.failed} failed, ${summary.notFound} not found`,
    ipAddress: getClientIp(req),
  });

  return ok({ summary, results });
});
