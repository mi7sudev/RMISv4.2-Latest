// ============================================================================
// RMIS — MOM notices (spec §6.5, §7.9, §9.3). Notice history is derived from
// email_logs subject prefixes. Sending guards (doctrine, §9.3):
//   - regret is NEVER sent to a shortlisted-stage application (409)
//   - interview / skills-exam ONLY to shortlisted-stage applications (409)
//   - non-regret notices require date + time + venue (400)
// Each send fans out email + companion SMS + in-app notification + audit.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp, parseId } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { stageForStatus } from "@/lib/status";
import { noticeSchema } from "@/lib/validation";
import { safeJsonParse } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";
import {
  sendEmail,
  sendSms,
  smsNotice,
  emailRegretLetter,
  emailInterviewInvitation,
  emailSkillsExam,
} from "@/lib/notify";

const SUBJECT_PREFIXES: [string, "regret" | "interview" | "skills_exam"][] = [
  ["Application Status Update –", "regret"],
  ["Application regret:", "regret"],
  // Pre-R-02 subjects used an em dash in the regret prefix.
  ["Application regret —", "regret"],
  ["Interview invitation", "interview"],
  ["Skills examination", "skills_exam"],
];


// ── GET — notice history from email_logs ────────────────────────────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({ where: { id }, select: { id: true } });
  if (!app) throw new ApiError("Application not found", 404);

  const logs = await db.emailLog.findMany({
    where: { relatedType: "application", relatedId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, subject: true, status: true, to: true, createdAt: true },
  });

  const notices = logs
    .map((log) => {
      const hit = SUBJECT_PREFIXES.find(([prefix]) => log.subject.startsWith(prefix));
      return hit ? { id: log.id, type: hit[1], subject: log.subject, status: log.status, to: log.to, sentAt: log.createdAt } : null;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  return ok({ notices });
});

// ── POST — send a notice (regret | interview | skills_exam) ─────────────────

export const POST = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { position: true } },
      applicant: { select: { id: true, firstName: true, lastName: true, emailAddress: true, contactNumber: true } },
    },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const body = await req.json().catch(() => ({}));
  const input = noticeSchema.parse(body);

  // ── Doctrine guards (spec §9.3) ─────────────────────────────────────────
  const stage = stageForStatus(app.status);
  const mode: "face_to_face" | "online" = input.mode === "online" ? "online" : "face_to_face";
  if (input.type === "regret" && stage === "Shortlisted") {
    throw new ApiError("This application was shortlisted; a regret letter is not applicable.", 409);
  }
  if ((input.type === "interview" || input.type === "skills_exam") && stage !== "Shortlisted") {
    throw new ApiError("Interview and skills-exam notices can only be sent to shortlisted applications.", 409);
  }
  if (input.type !== "regret") {
    if (!input.date || !input.time) {
      throw new ApiError("Date and time are required for this notice.", 400);
    }
    // MOM 2026-10-13: a face-to-face setup needs a venue; an online setup
    // needs the meeting link instead.
    if (mode === "online" && !input.meetingLink?.trim()) {
      throw new ApiError("A meeting link is required for an online notice.", 400);
    }
    if (mode === "face_to_face" && !input.venue?.trim()) {
      throw new ApiError("A venue is required for a face-to-face notice.", 400);
    }
  }

  // Applicant name prefers the frozen snapshot, falls back to the live record.
  const profile = safeJsonParse<{ firstName?: string | null; lastName?: string | null } | null>(
    app.snapshotProfile,
    null
  );
  const name =
    [profile?.firstName || app.applicant.firstName, profile?.lastName || app.applicant.lastName]
      .filter(Boolean)
      .join(" ") || "Applicant";
  const title = app.job.position?.positionTitle || app.job.title;
  const recipient = app.applicant.emailAddress ?? "";
  const mobile = app.applicant.contactNumber ?? "";

  const details = {
    date: input.date ?? undefined,
    time: input.time ?? undefined,
    venue: input.venue ?? undefined,
    contact: input.contact ?? undefined,
    notes: input.notes ?? undefined,
    examType: input.examType ?? undefined,
    mode,
    meetingLink: input.meetingLink ?? undefined,
  };

  // ── Fan out: email + companion SMS + in-app notification (§9.3) ─────────
  let emailSubject = "";
  let smsText = "";
  let notificationDescription = "";

  if (input.type === "regret") {
    const t = emailRegretLetter(name, title);
    emailSubject = t.subject;
    const email = await sendEmail({
      to: recipient,
      subject: t.subject,
      bodyText: t.bodyText,
      bodyHtml: t.bodyHtml,
      relatedType: "application",
      relatedId: id,
    });
    smsText = `RMIS: We regret to inform you that you were not shortlisted for the position ${title}.`;
    const sms = await sendSms({ to: mobile, message: smsNotice(smsText), relatedType: "application", relatedId: id });
    notificationDescription = `A regret letter was sent for your application for ${title}.`;
    await db.notification.create({
      data: { applicantId: app.applicantId, name: "Notice", description: notificationDescription },
    });
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: user.role,
      action: "NOTICE_SENT",
      entityType: "application",
      entityId: id,
      description: `Regret letter sent for application ${id} (email: ${email.status}, sms: ${sms.status})`,
      ipAddress: getClientIp(req),
    });
    return ok({ type: input.type, email, sms });
  }

  const email =
    input.type === "interview"
      ? await (async () => {
          const t = emailInterviewInvitation(name, title, details);
          emailSubject = t.subject;
          return sendEmail({
            to: recipient,
            subject: t.subject,
            bodyText: t.bodyText,
            bodyHtml: t.bodyHtml,
            relatedType: "application",
            relatedId: id,
          });
        })()
      : await (async () => {
          const t = emailSkillsExam(name, title, details);
          emailSubject = t.subject;
          return sendEmail({
            to: recipient,
            subject: t.subject,
            bodyText: t.bodyText,
            bodyHtml: t.bodyHtml,
            relatedType: "application",
            relatedId: id,
          });
        })();

  smsText =
    input.type === "interview"
      ? `You are invited to an interview for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`
      : `You are invited to a skills examination for ${title} on ${input.date} at ${input.time}.${mode === "online" ? ` Online: ${input.meetingLink}` : `, ${input.venue}`}.`;
  const sms = await sendSms({ to: mobile, message: smsNotice(smsText), relatedType: "application", relatedId: id });

  notificationDescription =
    input.type === "interview"
      ? `Interview invitation sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`
      : `Skills examination notice sent for ${title}: ${input.date} at ${input.time}${mode === "online" ? " (Online)" : `, ${input.venue}`}.`;
  await db.notification.create({
    data: { applicantId: app.applicantId, name: "Notice", description: notificationDescription },
  });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "NOTICE_SENT",
    entityType: "application",
    entityId: id,
    description: `${emailSubject || "Notice"} sent for application ${id} (email: ${email.status}, sms: ${sms.status})`,
    ipAddress: getClientIp(req),
  });

  return ok({ type: input.type, email, sms });
});
