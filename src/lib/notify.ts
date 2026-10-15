// ============================================================================
// RMIS — Notification subsystem (spec §9). Providers: "middleware" (the
// mirdc_middleware email service on the office VM — the PRODUCTION-VERIFIED
// sender, ported from the RMISv4.1 deployment), "resend", "gateway" (legacy
// middleware contract, kept for backward compatibility), or "mock" (dev
// default); every attempt is persisted to email_logs / sms_logs.
// HARD CONTRACT: sendEmail / sendSms NEVER throw — callers fire post-success.
// Templates per spec §9.3; PH mobile normalization per §9.4.
// ============================================================================

import { db } from "@/lib/db";

export type EmailInput = {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  relatedType?: string;
  relatedId?: number;
  /**
   * Metadata is always persisted to email_logs (PII / DB-size discipline).
   * When `content` (base64 file bytes) is present, the ACTIVE provider also
   * receives the attachment — mock mode logs the metadata only.
   */
  attachments?: { name: string; bytes: number; content?: string; contentType?: string }[];
};

export type SendResult = { status: "sent" | "failed" | "mock" | "skipped"; error?: string; provider: string; providerRef?: string };

const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "mock").trim().toLowerCase();
const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock";
const EMAIL_MIDDLEWARE_URL = (process.env.EMAIL_MIDDLEWARE_URL || "").trim().replace(/\/+$/, "");
const EMAIL_MIDDLEWARE_API_KEY = (process.env.EMAIL_MIDDLEWARE_API_KEY || "").trim();
const EMAIL_MIDDLEWARE_SYSTEM = (process.env.EMAIL_MIDDLEWARE_SYSTEM || "").trim();
// MOM 2026-10-13 — outbound recruitment identity: the backend mailer sends
// AS the recruitment mailbox ("replicate the nodemailer on the backend side
// of the system's server using the recruitment email"). The From header is
// the recruitment mailbox everywhere it can be controlled; the office
// middleware relay still owns the SMTP session.
export const RECRUITMENT_EMAIL_ADDRESS = (process.env.EMAIL_FROM || "recruitment@mirdc.dost.gov.ph").trim();
export const RECRUITMENT_SENDER_NAME = "MIRDC HR Office";
// Task 14 (production) — REPLY-TO: production middlewares pin the From to
// the SMTP account (systems@…), so applicant replies currently land in the
// system mailer's inbox. Every outgoing message now carries an explicit
// Reply-To of the recruitment mailbox — applicant replies are forwarded to
// recruitment@mirdc.dost.gov.ph regardless of which account actually owns
// the SMTP session. Override with EMAIL_REPLY_TO if the office ever wants
// a different catch-all.
export const RECRUITMENT_REPLY_TO = (process.env.EMAIL_REPLY_TO || "recruitment@mirdc.dost.gov.ph").trim();

// ---------------------------------------------------------------------------
// Provider introspection — used by the admin Email panel to show the ACTIVE
// provider and whether its credentials are present (mirrors the verified
// RMISv4.1 email.ts surface, adapted to this codebase's shapes).
// ---------------------------------------------------------------------------

export function getEmailProviderId(): "middleware" | "resend" | "gateway" | "mock" {
  if (EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) return "resend";
  if (EMAIL_PROVIDER === "middleware" && EMAIL_MIDDLEWARE_URL) return "middleware";
  if (EMAIL_PROVIDER === "gateway" && process.env.EMAIL_GATEWAY_URL) return "gateway";
  return "mock";
}

export function getEmailProviderInfo(): {
  id: "middleware" | "resend" | "gateway" | "mock";
  label: string;
  configured: boolean;
  cost: string;
  setup: string;
} {
  switch (getEmailProviderId()) {
    case "resend":
      return {
        id: "resend",
        label: "Resend (HTTP API)",
        configured: !!process.env.RESEND_API_KEY,
        cost: "Free tier — 100 emails/day, 3,000/month",
        setup: "Set RESEND_API_KEY (+ optional EMAIL_FROM) in .env.",
      };
    case "gateway":
      return {
        id: "gateway",
        label: "Legacy gateway (EMAIL_GATEWAY_URL)",
        configured: !!process.env.EMAIL_GATEWAY_URL,
        cost: "Internal",
        setup: "Legacy contract — prefer EMAIL_PROVIDER=middleware.",
      };
    case "middleware":
      return {
        id: "middleware",
        label: "MIRDC Mail Middleware (office VM)",
        configured: !!EMAIL_MIDDLEWARE_URL && !!EMAIL_MIDDLEWARE_API_KEY,
        cost: "Internal — ₱0 (office mailbox systems@mirdc.dost.gov.ph)",
        setup: "Set EMAIL_MIDDLEWARE_URL + EMAIL_MIDDLEWARE_API_KEY (+ EMAIL_MIDDLEWARE_SYSTEM) in .env.",
      };
    default:
      return {
        id: "mock",
        label: "Mock (development)",
        configured: true,
        cost: "Free — emails are logged, not sent",
        setup: "Set EMAIL_PROVIDER=middleware (+ URL/key) or EMAIL_PROVIDER=resend (+ key) to deliver real email.",
      };
  }
}

export async function sendEmail(input: EmailInput): Promise<SendResult> {
  let result: SendResult;
  try {
    if (!input.to || !input.to.includes("@")) {
      result = { status: "skipped", error: "No valid recipient address", provider: EMAIL_PROVIDER };
    } else if (EMAIL_PROVIDER === "middleware" && EMAIL_MIDDLEWARE_URL) {
      // ── MIRDC Mail Middleware (PRODUCTION-VERIFIED, ported from RMISv4.1) ──
      // POST {EMAIL_MIDDLEWARE_URL}/sendMail — Express+nodemailer service on
      // the office VM. The From header is ALWAYS the office mailbox
      // systems@mirdc.dost.gov.ph (display name = EMAIL_MIDDLEWARE_SYSTEM,
      // default "DOST-MIRDC Recruitment"). Body carries the shared token as
      // `api` (validated by the VM only when it opts into MIDDLEWARE_API_KEY
      // strict mode), an HTML `message`, the plain-text part, and optional
      // base64 attachments. Older middleware ignores text/attachments — this
      // driver is safe against both versions.
      try {
        const message = input.bodyHtml ?? textToSimpleHtml(input.bodyText);
        const res = await fetch(`${EMAIL_MIDDLEWARE_URL}/sendMail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Never hang an API route on a stalled VM — the middleware normally
          // answers in well under a second.
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            api: EMAIL_MIDDLEWARE_API_KEY,
            system: EMAIL_MIDDLEWARE_SYSTEM || "DOST-MIRDC Recruitment",
            // MOM 2026-10-13 — send as the recruitment mailbox. Middlewares
            // that pin the From to the office mailbox ignore this field.
            from: `"${RECRUITMENT_SENDER_NAME}" <${RECRUITMENT_EMAIL_ADDRESS}>`,
            // Task 14 — applicant replies MUST reach the recruitment mailbox
            // even when the middleware rewrites From to its SMTP account;
            // nodemailer passes this straight through to the Reply-To header.
            replyTo: `"${RECRUITMENT_SENDER_NAME}" <${RECRUITMENT_REPLY_TO}>`,
            to: input.to,
            subject: input.subject,
            message,
            text: input.bodyText,
            ...(input.attachments && input.attachments.some((a) => a.content)
              ? {
                  attachments: input.attachments
                    .filter((a) => a.content)
                    .map((a) => ({
                      filename: a.name,
                      content: a.content,
                      encoding: "base64",
                      ...(a.contentType ? { contentType: a.contentType } : {}),
                    })),
                }
              : {}),
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          result = { status: "failed", error: `Middleware ${res.status}: ${text.slice(0, 200)}`, provider: "middleware" };
        } else {
          const json = (await res.json().catch(() => ({}))) as { messageId?: string | null };
          result = { status: "sent", provider: "middleware", providerRef: json.messageId || "middleware" };
        }
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "middleware error", provider: "middleware" };
      }
    } else if (EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) {
      // Real provider path (Resend HTTP API).
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || `${RECRUITMENT_SENDER_NAME} <${RECRUITMENT_EMAIL_ADDRESS}>`,
            to: [input.to],
            subject: input.subject,
            // Task 14 — Resend's reply-to field (list or single address).
            reply_to: RECRUITMENT_REPLY_TO,
            text: input.bodyText,
            html: input.bodyHtml,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          result = { status: "failed", error: `Provider ${res.status}: ${text.slice(0, 200)}`, provider: "resend" };
        } else {
          const json = (await res.json()) as { id?: string };
          result = { status: "sent", provider: "resend", providerRef: json.id ? String(json.id) : undefined };
        }
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "provider error", provider: "resend" };
      }
    } else if (EMAIL_PROVIDER === "gateway" && process.env.EMAIL_GATEWAY_URL) {
      // mirdc_middleware email gateway (Task 28 contract): POST /api/rmis/send
      // with X-RMIS-Key / Bearer authentication. The middleware owns SMTP
      // credentials and relays delivery logs to the Strapi audit store.
      try {
        const base = process.env.EMAIL_GATEWAY_URL.replace(/\/+$/, "");
        const res = await fetch(`${base}/api/rmis/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RMIS-Key": process.env.EMAIL_GATEWAY_KEY || "",
            Authorization: `Bearer ${process.env.EMAIL_GATEWAY_KEY || ""}`,
          },
          body: JSON.stringify({
            to: input.to,
            subject: input.subject,
            // Task 14 — legacy contract: harmless when the gateway ignores it.
            replyTo: RECRUITMENT_REPLY_TO,
            text: input.bodyText,
            html: input.bodyHtml ?? input.bodyText,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          result = { status: "failed", error: `Gateway ${res.status}: ${text.slice(0, 200)}`, provider: "gateway" };
        } else {
          const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
          result = { status: "sent", provider: "gateway", providerRef: json.messageId ?? json.id ?? undefined };
        }
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "gateway error", provider: "gateway" };
      }
    } else {
      result = { status: "mock", provider: EMAIL_PROVIDER };
    }
  } catch (e) {
    result = { status: "failed", error: e instanceof Error ? e.message : "unknown", provider: EMAIL_PROVIDER };
  }
  try {
    await db.emailLog.create({
      data: {
        to: input.to || "",
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        provider: result.provider,
        status: result.status,
        providerRef: result.providerRef ?? null,
        error: result.error ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        // Metadata (name + size) ONLY — base64 bytes never touch the DB.
        attachments: input.attachments
          ? JSON.stringify(input.attachments.map(({ name, bytes }) => ({ name, bytes })))
          : null,
      },
    });
  } catch {
    // log write is best-effort
  }
  return result;
}

export async function sendSms(input: { to: string; message: string; relatedType?: string; relatedId?: number }): Promise<SendResult> {
  let result: SendResult;
  try {
    const normalized = normalizePhMobile(input.to);
    if (!normalized) {
      result = { status: "skipped", error: "Invalid Philippine mobile number", provider: SMS_PROVIDER };
    } else if (SMS_PROVIDER === "semaphore" && process.env.SEMAPHORE_API_KEY) {
      try {
        const body = new URLSearchParams({
          apikey: process.env.SEMAPHORE_API_KEY,
          number: normalized.local,
          message: input.message.slice(0, 640),
          sendername: process.env.SEMAPHORE_SENDER || "MIRDCRMIS",
        });
        const res = await fetch("https://api.semaphore.co/api/v4/messages", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        result = res.ok
          ? { status: "sent", provider: "semaphore" }
          : { status: "failed", error: `Provider ${res.status}`, provider: "semaphore" };
      } catch (e) {
        result = { status: "failed", error: e instanceof Error ? e.message : "provider error", provider: "semaphore" };
      }
    } else {
      result = { status: "mock", provider: SMS_PROVIDER };
    }
  } catch (e) {
    result = { status: "failed", error: e instanceof Error ? e.message : "unknown", provider: SMS_PROVIDER };
  }
  try {
    await db.smsLog.create({
      data: {
        to: input.to || "",
        message: input.message,
        provider: result.provider,
        status: result.status,
        providerRef: result.providerRef ?? null,
        error: result.error ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
      },
    });
  } catch {
    // best-effort
  }
  return result;
}

/** PH mobile normalization (spec §9.4): 0917…/+63917…/63917…/917… → local + E.164. */
export function normalizePhMobile(raw: string): { local: string; e164: string } | null {
  const digits = (raw || "").replace(/\D/g, "");
  let local: string | null = null;
  if (/^09\d{9}$/.test(digits)) local = digits;
  else if (/^639\d{9}$/.test(digits)) local = `0${digits.slice(2)}`;
  else if (/^9\d{9}$/.test(digits)) local = `0${digits}`;
  if (!local) return null;
  return { local, e164: `+63${local.slice(1)}` };
}

// ── Templates (spec §9.3) ───────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal escaped-HTML wrapper for plain-text bodies (middleware has no text-only mode). */
function textToSimpleHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;">${paras}</div>`;
}

function emailShell(title: string, bodyHtml: string, opts?: { official?: boolean }): string {
  // Official edition (HR notices) — the footer carries the agency office
  // lockup instead of the "do not reply" sentence: these invitations ask the
  // applicant to confirm BY REPLYING, so a no-reply footer contradicted the
  // body (caught against the office's real interview emails).
  const footer = opts?.official
    ? `<p style="margin:0 0 2px;font-size:12px;font-weight:bold;color:#181825;">DOST-MIRDC · Metals Industry Research and Development Center</p>
       <p style="margin:0;font-size:11px;color:#949494;">Department of Science and Technology · MIRDC Complex, Gen. Santos Avenue, Bicutan, Taguig City</p>`
    : `<p style="margin:0;font-size:11px;color:#949494;">This is an automated message from RMIS (Recruitment Management Information System). Please do not reply.</p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#949494;text-transform:uppercase;">DOST-MIRDC · Recruitment</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#181825;">${title}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;" />
    ${footer}
  </div></body></html>`;
}

// ── Official HR signature block (the office's real interview emails) ────────
// The office sends notices over a named signatory, not a department alias.
// Every line is env-overridable so the VM deployment can re-point it without
// a code change; the defaults are the office's current signatory of record.
function hrEnv(key: string, fallback: string): string {
  const v = (process.env[key] || "").trim();
  return v || fallback;
}

function hrSignatureText(): string {
  const lines = [
    hrEnv("RMIS_HR_SIGNATORY", "DOLLY MARIE T. BORLADO"),
    hrEnv("RMIS_HR_SIGNATORY_POSITION", "Administrative Officer IV"),
    hrEnv("RMIS_HR_DIVISION", "Finance and Administrative Division"),
    hrEnv("RMIS_HR_UNIT", "HRMASS-PAU"),
    hrEnv("RMIS_HR_TELEPHONE", "Local 441, Tel No: 8837-0431 to 38"),
  ];
  return lines.join("\n");
}

function hrSignatureHtml(): string {
  const lines = [
    hrEnv("RMIS_HR_SIGNATORY", "DOLLY MARIE T. BORLADO"),
    hrEnv("RMIS_HR_SIGNATORY_POSITION", "Administrative Officer IV"),
    hrEnv("RMIS_HR_DIVISION", "Finance and Administrative Division"),
    hrEnv("RMIS_HR_UNIT", "HRMASS-PAU"),
    hrEnv("RMIS_HR_TELEPHONE", "Local 441, Tel No: 8837-0431 to 38"),
  ];
  return `<p style="color:#484758;font-size:14px;line-height:1.6;">${lines
    .map((l, i) => (i === 0 ? `<strong>${escHtml(l)}</strong>` : escHtml(l)))
    .join("<br/>")}</p>`;
}

// ── Schedule value formatting (the office's real emails) ────────────────────
// The dialog's date input yields ISO "2026-07-30"; the office renders dates
// as "July 30, 2026 (Thursday)". Times from the time input yield 24-hour
// "13:00"; the office renders "1:00 PM". Anything already typed as display
// text passes through untouched.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function noticeDateLabel(raw: string | undefined): string {
  const v = (raw || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) {
    const [, y, m, d] = iso;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) {
      return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()} (${WEEKDAYS[dt.getDay()]})`;
    }
  }
  return v || "TBA";
}

function noticeTimeLabel(raw: string | undefined): string {
  const v = (raw || "").trim();
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hhmm) {
    let h = Number(hhmm[1]);
    const m = hhmm[2];
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  return v || "TBA";
}

export function emailApplicationReceived(applicantName: string, jobTitle: string) {
  return {
    subject: `Application received: ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYour application for ${jobTitle} has been received and is awaiting evaluation. We will notify you of the outcome through this channel.\n\nMIRDC Human Resources`,
    bodyHtml: emailShell(
      "Application received",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Your application for <strong>${jobTitle}</strong> has been received and is awaiting evaluation.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We will notify you of the outcome through this channel.</p>`
    ),
  };
}

export function emailStatusChanged(applicantName: string, jobTitle: string, status: string, reason?: string | null) {
  return {
    subject: `Application status: ${status}, ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nThe status of your application for ${jobTitle} is now: ${status}.${reason ? `\n\nRemarks from HR: ${reason}` : ""}\n\nMIRDC Human Resources`,
    bodyHtml: emailShell(
      "Application status update",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">The status of your application for <strong>${jobTitle}</strong> is now <strong>${status}</strong>.</p>
       ${reason ? `<p style="color:#484758;font-size:14px;line-height:1.6;">Remarks from HR: ${reason}</p>` : ""}`
    ),
  };
}

export function emailUnderReview(applicantName: string, jobTitle: string) {
  return {
    subject: `Your application is under review: ${jobTitle}`,
    bodyText: `Dear ${applicantName},\n\nYour application for ${jobTitle} is now under review by our HR team. No action is needed from you at this time; we will notify you of the outcome.\n\nMIRDC Human Resources`,
    bodyHtml: emailShell(
      "Your application is under review",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${applicantName},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Your application for <strong>${jobTitle}</strong> is now under review by our HR team.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">No action is needed from you at this time; we will notify you of the outcome.</p>`
    ),
  };
}

/** MOM 2026-10-13 — the greeting uses the applicant's LAST name. */
function momGreeting(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : fullName || "Applicant";
}

/** MOM 2026-10-13 approved shortlist email — exact wording. */
export function emailShortlisted(applicantName: string, jobTitle: string) {
  const dear = momGreeting(applicantName);
  return {
    subject: `Application Update – Shortlisted for ${jobTitle}`,
    bodyText: `Dear ${dear},\n\nThank you for your interest in joining the DOST-MIRDC and for taking the time to apply for the ${jobTitle} position.\n\nWe are pleased to inform you that your application has been shortlisted for the next stage of our recruitment process.\n\nOur HR team will be in touch with you regarding the next steps and any additional details or requirements.\n\nWe appreciate your interest in becoming part of the DOST-MIRDC and look forward to getting to know you better as we move forward in the selection process.\n\nBest regards,\nMIRDC HR Office`,
    bodyHtml: emailShell(
      "Application Update – Shortlisted",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${escHtml(dear)},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you for your interest in joining the DOST-MIRDC and for taking the time to apply for the <strong>${escHtml(jobTitle)}</strong> position.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We are pleased to inform you that your application has been <strong>shortlisted</strong> for the next stage of our recruitment process.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Our HR team will be in touch with you regarding the next steps and any additional details or requirements.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We appreciate your interest in becoming part of the DOST-MIRDC and look forward to getting to know you better as we move forward in the selection process.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Best regards,<br/><strong>MIRDC HR Office</strong></p>`
    ),
  };
}

/** MOM 2026-10-13 approved regret/rejection email — exact wording. */
export function emailRegretLetter(applicantName: string, jobTitle: string) {
  const dear = momGreeting(applicantName);
  return {
    subject: `Application Status Update – ${jobTitle}`,
    bodyText: `Dear ${dear},\n\nThank you for your interest in joining the DOST-MIRDC and for taking the time to submit your application for the ${jobTitle} position.\n\nAfter reviewing your application documents, we regret to inform you that you have not been shortlisted to proceed to the next stage of the recruitment process.\n\nWe highly encourage you to explore future career opportunities that may align with your qualifications and experience.\n\nThank you once again for considering the DOST-MIRDC. We wish you all the best in your future career endeavors.\n\nBest regards,\nMIRDC HR Office`,
    bodyHtml: emailShell(
      "Application Status Update",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear ${escHtml(dear)},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you for your interest in joining the DOST-MIRDC and for taking the time to submit your application for the <strong>${escHtml(jobTitle)}</strong> position.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">After reviewing your application documents, we regret to inform you that you have <strong>not been shortlisted</strong> to proceed to the next stage of the recruitment process.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We highly encourage you to explore future career opportunities that may align with your qualifications and experience.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you once again for considering the DOST-MIRDC. We wish you all the best in your future career endeavors.</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Best regards,<br/><strong>MIRDC HR Office</strong></p>`
    ),
  };
}

/** Notice schedule details — MOM 2026-10-13 adds the setup mode (face-to-face
 *  or online with a meeting link) and renames "Notes" to "Invitation
 *  Details" (long text, no character limit). The office's real hiring emails
 *  also run a ONE-DAY, MULTI-STAGE schedule (e.g. interview at 12:30 PM,
 *  psychological assessment at 1:00 PM) — `stages` carries the numbered
 *  blocks; when it holds 2+ entries the invitation switches to the "next
 *  stages" template. */
export type NoticeDetails = {
  date?: string;
  time?: string;
  venue?: string;
  contact?: string;
  notes?: string;
  examType?: string;
  mode?: "face_to_face" | "online";
  meetingLink?: string;
  stages?: { title: string; time?: string; venue?: string }[];
};

function noticeScheduleLines(d: NoticeDetails, kindLabel: string): string[] {
  const online = d.mode === "online";
  const lines = [
    `Date: ${noticeDateLabel(d.date)}`,
    `Time: ${noticeTimeLabel(d.time)}`,
    `${kindLabel} Mode: ${online ? "Online" : "Face-to-Face"}`,
  ];
  if (online) {
    if (d.meetingLink) lines.push(`Meeting Link: ${d.meetingLink}`);
    if (d.venue) lines.push(`Venue: ${d.venue}`);
  } else {
    lines.push(`Venue: ${d.venue || "TBA"}`);
  }
  if (d.contact) lines.push(`HR Contact: ${d.contact}`);
  return lines;
}

/** Rows for the HTML schedule table (label/value pairs). */
function noticeScheduleRows(d: NoticeDetails, kindLabel: string): [string, string][] {
  return noticeScheduleLines(d, kindLabel).map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i), l.slice(i + 1).trim()] as [string, string];
  });
}

/** Stage block rows for the multi-stage (one-day process) template. */
function stageLines(s: { title: string; time?: string; venue?: string }, online?: boolean): string[] {
  const lines: string[] = [];
  if (s.time) lines.push(`Time: ${noticeTimeLabel(s.time)}`);
  if (s.venue) lines.push(`Venue: ${s.venue}`);
  if (online && lines.length === 0) lines.push("Details to follow");
  return lines;
}

// ── Invitation templates — matched to the office's REAL interview emails ───
// (upload samples, Jul/Sep 2026): "Dear Applicant:" greeting; the position
// carries its item number; the schedule block reads Date/Time/Mode/Venue;
// a one-PDF-file instruction paragraph; the confirm-by-reply paragraph with
// the automatic-removal clause; "Thank you very much!"; the named HR
// signatory block; an official footer (these invites DO accept replies).
// When the details carry 2+ stages, the template switches to the office's
// "next stages / one-day process" edition (interview + psychological
// assessment etc.) with the IMPORTANT REMINDER + work-suspension clauses.

const PDF_INSTRUCTION_INTERVIEW =
  "To facilitate the evaluation process, please ensure that your application documents are updated, complete, and compiled into one (1) PDF file before your scheduled interview.";
const CONFIRM_ATTENDANCE =
  "Kindly confirm your attendance by replying to this email. Please note that failure to attend the scheduled interview will result in the automatic removal of your name from the shortlist.";

function multiStageNotice(applicantName: string, jobTitle: string, d: NoticeDetails): { bodyText: string; bodyHtml: string } | null {
  const stages = (d.stages ?? []).filter((s) => s.title.trim());
  if (stages.length < 2) return null;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#949494;font-size:13px;">${escHtml(k)}</td><td style="padding:6px 0;color:#181825;font-size:14px;">${escHtml(v)}</td></tr>`;

  const stageText = stages
    .map((s, i) => {
      const head = `${i + 1}. ${s.title.trim()}`;
      const lines = stageLines(s).map((l) => `   ${l}`);
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
  const stageHtml = stages
    .map((s, i) => {
      const rows = stageLines(s)
        .map((l) => {
          const c = l.indexOf(":");
          return row(l.slice(0, c), l.slice(c + 1).trim());
        })
        .join("");
      return `<p style="margin:14px 0 4px;color:#181825;font-size:14px;line-height:1.6;"><strong>${escHtml(`${i + 1}. ${s.title.trim()}`)}</strong></p>${rows ? `<table style="margin:0 0 8px;">${rows}</table>` : ""}`;
    })
    .join("");

  const bodyText = `Dear Applicant:

Good day!

We are pleased to invite you to the next stages of the recruitment process for the ${jobTitle} position. Kindly take note of the following schedule and details:

Date: ${noticeDateLabel(d.date)}

${stageText}${d.notes ? `\n\n${d.notes}` : ""}

IMPORTANT REMINDER: This will be a one-day process. Please be advised that no alternate schedule will be provided, as the position is urgently needed. Failure to attend the scheduled interview will result in automatic removal from the shortlist, unless a prior request for rescheduling has been submitted and approved by the MIRDC Selection Board.

Kindly confirm your availability for the abovementioned interview and assessment, by replying to this email. Should there be an official issuance of work suspension on the said date, the interview will be rescheduled accordingly, and you will be notified of the new schedule.

Thank you.

${hrSignatureText()}`;

  const bodyHtml = emailShell(
    "Interview and assessment invitation",
    `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear Applicant,</p>
     <p style="color:#484758;font-size:14px;line-height:1.6;">Good day!</p>
     <p style="color:#484758;font-size:14px;line-height:1.6;">We are pleased to invite you to the <strong>next stages of the recruitment process</strong> for the <strong>${escHtml(jobTitle)}</strong> position. Kindly take note of the following schedule and details:</p>
     <table style="margin:8px 0;">${row("Date", noticeDateLabel(d.date))}</table>
     ${stageHtml}
     ${d.notes ? `<div style="color:#484758;font-size:14px;line-height:1.7;white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;margin:12px 0;">${escHtml(d.notes)}</div>` : ""}
     <p style="color:#b91c1c;font-size:14px;line-height:1.6;margin:16px 0 4px;"><strong>⚠ IMPORTANT REMINDER</strong></p>
     <p style="color:#484758;font-size:14px;line-height:1.6;">This will be a <strong>one-day process</strong>. Please be advised that no alternate schedule will be provided, as the position is urgently needed. Failure to attend the scheduled interview will result in automatic removal from the shortlist, unless a prior request for rescheduling has been submitted and approved by the MIRDC Selection Board.</p>
     <p style="color:#484758;font-size:14px;line-height:1.6;">Kindly confirm your availability for the abovementioned interview and assessment, by replying to this email. <strong>Should there be an official issuance of work suspension</strong> on the said date, the interview will be <strong>rescheduled accordingly</strong>, and you will be notified of the new schedule.</p>
     <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you.</p>
     ${hrSignatureHtml()}`,
    { official: true }
  );
  return { bodyText, bodyHtml };
}

export function emailInterviewInvitation(applicantName: string, jobTitle: string, d: NoticeDetails) {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#949494;font-size:13px;">${escHtml(k)}</td><td style="padding:6px 0;color:#181825;font-size:14px;">${escHtml(v)}</td></tr>`;
  const online = d.mode === "online";

  // One-day multi-stage edition (the office's "next stages" email).
  const multi = multiStageNotice(applicantName, jobTitle, d);
  if (multi) {
    return {
      subject: `Interview invitation: ${jobTitle}`,
      bodyText: multi.bodyText,
      bodyHtml: multi.bodyHtml,
    };
  }

  const schedule = noticeScheduleLines(d, "Interview");
  return {
    subject: `Interview invitation: ${jobTitle}`,
    bodyText: `Dear Applicant:

We are pleased to invite you to an interview for the ${jobTitle} position, scheduled as follows:

${schedule.join("\n")}${d.notes ? `\n\n${d.notes}` : ""}

${PDF_INSTRUCTION_INTERVIEW}${online ? " Please ensure you have a stable internet connection and test your audio/video before the schedule." : ""}

${CONFIRM_ATTENDANCE}

Thank you very much!

${hrSignatureText()}`,
    bodyHtml: emailShell(
      "Interview invitation",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear Applicant,</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We are pleased to invite you to an <strong>interview</strong> for the <strong>${escHtml(jobTitle)}</strong> position, scheduled as follows:</p>
       <table style="margin:8px 0;">${noticeScheduleRows(d, "Interview").map(([k, v]) => row(k, v)).join("")}</table>
       ${d.notes ? `<div style="color:#484758;font-size:14px;line-height:1.7;white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;margin:12px 0;">${escHtml(d.notes)}</div>` : ""}
       <p style="color:#484758;font-size:14px;line-height:1.6;">To facilitate the evaluation process, please ensure that your application documents are updated, complete, and compiled into <strong>one (1) PDF file</strong> before your scheduled interview.${online ? ` Please ensure you have a stable internet connection and test your audio/video before the schedule.` : ""}</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">${escHtml(CONFIRM_ATTENDANCE)}</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you very much!</p>
       ${hrSignatureHtml()}`,
      { official: true }
    ),
  };
}

export function emailSkillsExam(applicantName: string, jobTitle: string, d: NoticeDetails) {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#949494;font-size:13px;">${escHtml(k)}</td><td style="padding:6px 0;color:#181825;font-size:14px;">${escHtml(v)}</td></tr>`;
  const online = d.mode === "online";
  const confirmExam =
    "Kindly confirm your attendance by replying to this email. Please note that failure to attend the scheduled examination will result in the automatic removal of your name from the shortlist.";
  return {
    subject: `Skills examination notice: ${jobTitle}`,
    bodyText: `Dear Applicant:

We are pleased to invite you to a skills examination${d.examType ? ` (${d.examType})` : ""} for the ${jobTitle} position, scheduled as follows:

${noticeScheduleLines(d, "Examination").join("\n")}${d.notes ? `\n\n${d.notes}` : ""}

To facilitate the evaluation process, please ensure that your application documents are updated, complete, and compiled into one (1) PDF file before your scheduled examination.${online ? " Please ensure you have a stable internet connection and test your setup before the schedule." : ""}

${confirmExam}

Thank you very much!

${hrSignatureText()}`,
    bodyHtml: emailShell(
      "Skills examination notice",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Dear Applicant,</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">We are pleased to invite you to a <strong>skills examination</strong>${d.examType ? ` (<strong>${escHtml(d.examType)}</strong>)` : ""} for the <strong>${escHtml(jobTitle)}</strong> position, scheduled as follows:</p>
       <table style="margin:8px 0;">${noticeScheduleRows(d, "Examination").map(([k, v]) => row(k, v)).join("")}</table>
       ${d.notes ? `<div style="color:#484758;font-size:14px;line-height:1.7;white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;margin:12px 0;">${escHtml(d.notes)}</div>` : ""}
       <p style="color:#484758;font-size:14px;line-height:1.6;">To facilitate the evaluation process, please ensure that your application documents are updated, complete, and compiled into <strong>one (1) PDF file</strong> before your scheduled examination.${online ? ` Please ensure you have a stable internet connection and test your setup before the schedule.` : ""}</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">${escHtml(confirmExam)}</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Thank you very much!</p>
       ${hrSignatureHtml()}`,
      { official: true }
    ),
  };
}

export function emailDirect(senderName: string, subject: string, message: string) {
  return {
    subject,
    bodyText: `${message}\n\n${senderName}, MIRDC Human Resources`,
    bodyHtml: emailShell(subject, `<div style="color:#484758;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, "&lt;")}</div><p style="color:#949494;font-size:12px;">${senderName}, MIRDC Human Resources</p>`),
  };
}

/** Task 30-b — signup email verification: the 6-digit OTP code. */
export function emailOtpCode(name: string, code: string, minutes: number) {
  return {
    subject: `Your RMIS verification code: ${code}`,
    bodyText: `Hi ${name},\n\nYour RMIS verification code is:\n\n${code}\n\nIt expires in ${minutes} minutes. Never share this code — RMIS staff will never ask for it.\n\nMIRDC Human Resources`,
    bodyHtml: emailShell(
      "Your verification code",
      `<p style="color:#484758;font-size:14px;line-height:1.6;">Hi ${name},</p>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Use this 6-digit code to verify your RMIS account. It <strong>expires in ${minutes} minutes</strong>.</p>
       <div style="margin:20px 0;padding:16px 24px;border-radius:12px;background:#1f2025;text-align:center;"><span style="font-family:'Courier New',Courier,monospace;font-size:32px;letter-spacing:10px;color:#ebf0f8;font-weight:bold;">${code}</span></div>
       <p style="color:#484758;font-size:14px;line-height:1.6;">Never share this code — RMIS staff will never ask for it.</p>
       <p style="color:#8a8a99;font-size:12px;">MIRDC Human Resources</p>`
    ),
  };
}

export function smsApplicationReceived(jobTitle: string) {
  return `RMIS: Your application for ${jobTitle} has been received and is awaiting evaluation. Do not reply.`;
}

export function smsStatusChanged(status: string, jobTitle: string, reason?: string | null) {
  return `RMIS: Your application for ${jobTitle} is now ${status.toUpperCase()}.${reason ? ` Remarks: ${reason}` : ""} Do not reply.`;
}

export function smsNotice(text: string) {
  return `${text.slice(0, 600)} Do not reply.`;
}
