// ============================================================================
// RMIS — Bulk interview / skills-exam invitations (MOM 2026-10-13). Bulk-send
// email feature for SHORTLISTED applicants of specific job listings: 1..200
// application ids per batch, deduped, with one shared notice payload (date,
// time, setup mode face-to-face/online + meeting link, HR contact, and the
// long-text "Invitation Details"). Skips: not found; non-shortlisted stage
// (hard skip); already successfully sent for the SAME notice type
// (subject-prefix idempotency — failed attempts are retried). Each eligible
// send fans out email + companion SMS + in-app notification + audit.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { stageForStatus } from "@/lib/status";
import { bulkNoticeSchema } from "@/lib/validation";
import { safeJsonParse } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";
import { sendEmail, sendSms, smsNotice, emailInterviewInvitation, emailSkillsExam } from "@/lib/notify";

const INTERVIEW_PREFIX = "Interview invitation";
const EXAM_PREFIX = "Skills examination";

export const POST = handleApi(async (req: Request) => {
  const user = await requireEvaluatorFromReq(req);

  const body = await req.json().catch(() => ({}));
  const input = bulkNoticeSchema.parse(body);
  if (input.type === "regret") {
    throw new ApiError("Use the regret-letter flow for rejection notices.", 400);
  }
  const ids = [...new Set(input.applicationIds)]; // dedupe
  const mode: "face_to_face" | "online" = input.mode === "online" ? "online" : "face_to_face";

  // Shared-payload guards (same doctrine as the single-notice route).
  if (!input.date?.trim() || !input.time?.trim()) {
    throw new ApiError("Date and time are required.", 400);
  }
  if (mode === "online" && !input.meetingLink?.trim()) {
    throw new ApiError("A meeting link is required for an online invitation.", 400);
  }
  if (mode === "face_to_face" && !input.venue?.trim()) {
    throw new ApiError("A venue is required for a face-to-face invitation.", 400);
  }

  const summary = {
    total: ids.length,
    sent: 0,
    alreadySent: 0,
    notShortlisted: 0,
    failed: 0,
    notFound: 0,
  };
  const results: {
    applicationId: number;
    outcome: "sent" | "failed" | "already_sent" | "not_shortlisted" | "not_found";
    emailStatus?: string;
    smsStatus?: string;
    error?: string;
  }[] = [];

  const subjectPrefix = input.type === "interview" ? INTERVIEW_PREFIX : EXAM_PREFIX;

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

    // Hard skip: interview / exam notices go ONLY to shortlisted applications.
    if (stageForStatus(app.status) !== "Shortlisted") {
      summary.notShortlisted += 1;
      results.push({ applicationId, outcome: "not_shortlisted" });
      continue;
    }

    // Idempotency: a prior successful notice of the SAME type blocks a resend
    // (use the single-application dialog to send updated details).
    const prior = await db.emailLog.findFirst({
      where: {
        relatedType: "application",
        relatedId: applicationId,
        subject: { startsWith: subjectPrefix },
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
    // The office's real emails cite the position WITH its item number.
    const pos = app.job.position;
    const title = pos?.positionTitle
      ? `${pos.positionTitle}${pos.itemNumber ? ` (${pos.itemNumber})` : ""}`
      : app.job.title;

    const details = {
      date: input.date,
      time: input.time,
      venue: input.venue ?? undefined,
      contact: input.contact ?? undefined,
      notes: input.notes ?? undefined,
      examType: input.type === "skills_exam" ? input.examType ?? undefined : undefined,
      mode,
      meetingLink: input.meetingLink ?? undefined,
      // One-day process: stage 1 from the main fields, 2..N from extraStages.
      stages: [
        {
          title:
            input.type === "interview"
              ? mode === "online"
                ? "Online Interview"
                : "Face-to-face Interview"
              : `Skills Examination${input.examType ? ` — ${input.examType}` : ""}`,
          time: input.time,
          venue: input.venue ?? undefined,
        },
        ...(input.extraStages ?? []).map((s) => ({
          title: s.title,
          time: s.time || undefined,
          venue: s.venue || undefined,
        })),
      ],
    };

    const template =
      input.type === "interview"
        ? emailInterviewInvitation(name, title, details)
        : emailSkillsExam(name, title, details);

    const email = await sendEmail({
      to: app.applicant.emailAddress ?? "",
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      relatedType: "application",
      relatedId: applicationId,
    });
    const smsText = `You are invited to ${input.type === "interview" ? "an interview" : "a skills examination"} for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`;
    const sms = await sendSms({
      to: app.applicant.contactNumber ?? "",
      message: smsNotice(smsText),
      relatedType: "application",
      relatedId: applicationId,
    });

    try {
      await db.notification.create({
        data: {
          applicantId: app.applicantId,
          name: "Notice",
          description: `${input.type === "interview" ? "Interview invitation" : "Skills examination notice"} sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`,
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
    action: "NOTICES_BULK_SENT",
    entityType: "application",
    entityId: null,
    description: `Bulk ${input.type === "interview" ? "interview invitations" : "skills-exam notices"}, batch of ${summary.total}: ${summary.sent} sent, ${summary.alreadySent} already sent, ${summary.notShortlisted} not shortlisted (skipped), ${summary.failed} failed, ${summary.notFound} not found`,
    ipAddress: getClientIp(req),
  });

  return ok({ summary, results });
});
