"use client";

// ============================================================================
// RMIS — Evaluator review workspace (spec §7.9, §9.3).
// Default export = smart wrapper: with an `applicationId` prop it renders the
// workspace body (used inside the review-queue modal); without one it reads
// the deep-link `#/evaluator-review?id=<applicationId>` from useHashRoute and
// renders page-style with a close action back to the review queue.
// LEFT = frozen-snapshot dossier (capsule section tabs), RIGHT = decision
// rail (requirements match, credentials, decisions, notices, direct email —
// the old standalone state banner was removed as a duplicate: the status
// pill already lives in the dossier header). Enterprise polish pass:
// functional status pills/dots only — every handler, fetch, and confirmation
// dialog is unchanged.
// Rail polish (user QA 2026-02): decision buttons wear the EXACT color of
// the status they produce (Start Review = blue CTA → Under Review family,
// Shortlist = solid --ok green → Shortlisted pill, Not Qualified = solid
// --bad red → Rejected pill); "Credentials on file" is a 2-column icon
// grid instead of wrapping pill chips; Notices / Direct email cards carry
// icon-led meta rows and quieter empty states.
// Bevel pass: shared page header with round back affordance, white dossier
// panel with cloud/60 snapshot tiles + capsule tabs, cloud decision-rail
// cards with white/70 interior tiles, brand-blue links, blue decision
// capsules. Zero logic changes.
// Wave-3 premium pass: warm monogram dossier header, gradient ink→ember
// active-tab underline, tone chips on verdict actions, mini emerald/rose
// requirement indicators, IconChip rail headers.
// Decision flow: Shortlist / Not Qualified each open a decision composer
// dialog (remarks optional) — its Confirm is guarded by a decision
// confirmation dialog, exactly like the direct-email composer. Decision
// actions now carry solid semantic fills (see Rail polish note above) with
// plain white lucide glyphs. Direct email
// is a composer dialog opened from a "Send a direct email" button, with the
// recipient auto-retrieved from the applicant profile.
// Task 31 — the notice and direct-email dialogs run the sign-in/sign-up
// error contract: the submit button is never disabled for required-field
// gaps, clicking validates + shakes the offending fields (official Input
// `error` prop / glue Textarea, via the shared field-errors hook), and a
// field's error clears the moment it is corrected (reward early, punish late).
// Task 32 — both dialogs now CARRY THE SIGN-IN/SIGN-UP LOOK exactly: the
// bordered dialog card, auth header typography, single-column gap-5 flow of
// icon-led fields with reserved error lines, the official StatefulButton
// submit lifecycle, and the block's EXACT error timing via useAuthErrors —
// "flags a field only once it is left, then clears the moment it is fixed"
// (rules derived on every render; touch on blur; submit reveals all gaps).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import {
  AlertTriangle, Award, BadgeCheck, BookOpen, BriefcaseBusiness,
  Check, Eye, FileText, Gavel, GraduationCap, History, IdCard, ListChecks, Mail, MapPin,
  CheckCircle2, Minus, Mails, Paperclip, Plus, RotateCcw, ScanSearch, Send, Tag, Trash2, UserRound, Video, X, XCircle,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// BEUI Phase 8 — official Input (beui.dev/r/input, vendored at
// src/components/motion/input) + the sanctioned RMIS glue Textarea
// (src/components/forms/textarea): label prop renders the field's own label,
// onChange receives the string. Task 32 adds the official StatefulButton
// submit lifecycle and the auth-exact useAuthErrors timing.
import { Input } from "@/components/motion/input";
import { StatefulButton } from "@/components/motion/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/forms/textarea";
import { useAuthErrors } from "@/components/forms/field-errors";
import {
  EmptyNote, EmptyState, IconChip, LedgerRow, MonogramAvatar, PageHeader, SkeletonRows,
  StatusPill, VerdictPill, dialogScroll, type ChipTone,
} from "@/components/ui/shell";
import {
  ghostBtn, ctaBtn, ctaOkBtn, ctaBadBtn, ghostBadModifier, ghostOkModifier,
} from "@/components/ui/buttons";
import { apiFetch, formatDate, formatDateTime, fullName, humanize, timeAgo } from "@/lib/client";
import { DocumentPreviewModal, documentStatusChip, fileKind, type PreviewDoc } from "@/components/ui/document-preview";
import { getStatusMeta, stageForStatus } from "@/lib/status";
import { pillClass, type StatusVariant } from "@/lib/status-ui";
import { navigate, useHashRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { RequirementsReport } from "@/lib/requirements";

// ── Wire shapes (GET /api/evaluator/applications/[id]) ──────────────────────

type SnapRow = Record<string, unknown>;

type ReviewPayload = {
  id: number;
  status: string;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  /** MOM 2026-10-13 — prior rejected applications for THIS job listing. */
  priorRejections?: { count: number; lastDate: string | null; lastReason: string | null } | null;
  job: {
    id: number;
    title: string;
    positionType: string | null;
    position: {
      positionTitle: string;
      placeOfAssignment: string | null;
      itemNumber: string | null;
    } | null;
  };
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  snapshots: {
    profile: SnapRow | null;
    educations: SnapRow[];
    experiences: SnapRow[];
    trainings: SnapRow[];
    eligibilities: SnapRow[];
    awards: SnapRow[];
    documents: PreviewDoc[];
  };
  requirements: RequirementsReport;
};

type NoticeRow = {
  id: number;
  type: "regret" | "interview" | "skills_exam";
  subject: string;
  status: string;
  to: string;
  sentAt: string;
};

type DirectEmailRow = {
  id: number;
  to: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  attachments: string | null;
  createdAt: string;
};

type NoticeSendResult = {
  type: string;
  email: { status: string; to?: string; error?: string | null };
  sms: { status: string; to?: string; error?: string | null };
};

// ── Small shared visuals ────────────────────────────────────────────────────

// Status pills, verdict pills, the monogram avatar, ledger rows, empty notes
// and the button capsules are the shared shell primitives (ui/shell +
// ui/buttons) — single source of truth, no local copies.

/** Requirements verdict → meaning caption (display copy under the panel title). */
const VERDICT_MEANING: Record<string, string> = {
  ALL_MET: "Meets the minimum requirements",
  PARTIAL: "Partially meets the minimum requirements",
  NONE_MET: "Does not meet the minimum requirements",
  NEEDS_REVIEW: "Needs manual verification",
  NO_REQUIREMENTS: "No published requirements",
};

/** Requirement check status → mini matched/missing indicator chip. */
function checkChip(status: string): { icon: typeof Check; tone: ChipTone } {
  switch (status) {
    case "MET":
      return { icon: Check, tone: "emerald" };
    case "NOT_MET":
      return { icon: X, tone: "rose" };
    case "REVIEW":
      return { icon: Eye, tone: "slate" };
    default:
      return { icon: Minus, tone: "slate" };
  }
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).trim();
  return s;
}

function snapshotDisplayDate(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatDate(d);
}

// ── Dossier section tabs (official BEUI pill tabs) ──────────────────────────

const DOSSIER_TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
  { value: "training", label: "Training", icon: BookOpen },
  { value: "eligibility", label: "Eligibility", icon: BadgeCheck },
  { value: "awards", label: "Awards", icon: Award },
  { value: "documents", label: "Documents", icon: FileText },
] as const;

/** Bounded dossier section (modal only): min/max height + internal scroll —
    long lists scroll inside their section instead of stretching the modal. */
const boundedSectionCls =
  "min-h-[280px] max-h-[56dvh] overflow-y-auto scroll-thin lg:min-h-[360px] lg:max-h-[60dvh]";

// ── Snapshot tab renderers ──────────────────────────────────────────────────

function EducationCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No education entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.degree) || str(r.course) || str(r.specifyOthers) || "-"}</p>
            {r.ongoing === true && <span className="status-pill status-neutral shrink-0">Ongoing</span>}
          </div>
          <p className="mt-1 text-xs text-stone">
            {[str(r.educationLevel), str(r.schoolName)].filter(Boolean).join(" · ") || "-"}
          </p>
          <p className="num mt-0.5 text-xs text-stone">
            {[str(r.yearFrom) && `${str(r.yearFrom)}–${str(r.yearTo) || (r.ongoing ? "Present" : "")}`, str(r.yearGraduated) && `Graduated ${str(r.yearGraduated)}`, str(r.unitsEarned) && `${str(r.unitsEarned)} units`]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
          {str(r.awards) && <p className="mt-1 text-xs text-stone">Honors: {str(r.awards)}</p>}
        </div>
      ))}
    </div>
  );
}

function ExperienceCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No work experience entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{str(r.positionTitle) || "-"}</p>
            {r.isPresentWork === true && <span className={pillClass("info")}>Present</span>}
          </div>
          <p className="mt-1 text-xs text-stone">{str(r.employerName) || "-"}</p>
          <p className="num mt-0.5 text-xs text-stone">
            {[
              (str(r.dateFrom) || str(r.dateTo)) &&
                `${snapshotDisplayDate(r.dateFrom) || "-"} – ${r.isPresentWork ? "Present" : snapshotDisplayDate(r.dateTo) || "-"}`,
              str(r.statusOfEmployment),
            ]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrainingCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No training entries on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white p-4">
          <p className="text-sm text-ink">{str(r.title) || "-"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.typeOfTraining), str(r.numberHours) && `${str(r.numberHours)} hrs`, str(r.hourDecimal) && `${str(r.hourDecimal)} hrs`]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
          <p className="num mt-0.5 text-xs text-stone">
            {snapshotDisplayDate(r.dateFrom) || snapshotDisplayDate(r.dateTo)
              ? `${snapshotDisplayDate(r.dateFrom) || "-"} – ${snapshotDisplayDate(r.dateTo) || "-"}`
              : "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

function EligibilityCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No eligibility records on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white p-4">
          <p className="text-sm text-ink">{str(r.title) || str(r.eligibilityTitle) || "-"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.rating) && `Rating: ${str(r.rating)}`, snapshotDisplayDate(r.examDate), str(r.examPlace), str(r.licenseNumber) && `License ${str(r.licenseNumber)}`]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

function AwardCards({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No awards or accomplishments on file.</EmptyNote>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg bg-white p-4">
          <p className="text-sm text-ink">{str(r.details) || "-"}</p>
          <p className="num mt-1 text-xs text-stone">
            {[str(r.recognitionType), str(r.scope), str(r.provider), snapshotDisplayDate(r.dateGranted)]
              .filter(Boolean)
              .join(" · ") || "-"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Decision rail pieces ────────────────────────────────────────────────────

/** Requirement check status → pill (verdict colors). */
function checkPill(status: string): { label: string; variant: StatusVariant } {
  switch (status) {
    case "MET":
      return { label: "Met", variant: "ok" };
    case "NOT_MET":
      return { label: "Not met", variant: "bad" };
    case "REVIEW":
      return { label: "Verify", variant: "neutral" };
    default:
      return { label: "Not required", variant: "neutral" };
  }
}

function RequirementsMatchPanel({ report }: { report: RequirementsReport }) {
  const meaning = VERDICT_MEANING[report.verdict] ?? "";
  const allMet = report.requiredCount > 0 && report.metCount === report.requiredCount;
  const summaryCls = allMet ? "text-[var(--ok)]" : report.metCount > 0 ? "text-[var(--warn)]" : "text-stone";
  return (
    <div className="dlg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={ListChecks} tone="gold" size={36} iconSize={16} />
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-6 text-ink">Requirements match</h3>
            <p className="mt-0.5 text-xs text-stone">{meaning}</p>
          </div>
        </div>
        <VerdictPill verdict={report.verdict} className="shrink-0" />
      </div>
      <p className={cn("num mt-2 text-sm font-medium", summaryCls)}>
        {report.metCount} of {report.requiredCount} standards met
      </p>
      {report.checks.length > 0 && (
        <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto scroll-thin pr-1">
          {report.checks.map((c, i) => {
            const cp = checkPill(c.status);
            const cc = checkChip(c.status);
            return (
              <div key={i} className="rounded-lg bg-white/70 p-3.5">
                <div className="flex items-start gap-2.5">
                  <IconChip icon={cc.icon} tone={cc.tone} size={22} iconSize={12} className="mt-0.5" />
                  <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink line-clamp-2">{c.standard || "-"}</p>
                  <StatusPill status={cp.label} variant={cp.variant} className="shrink-0" />
                </div>
                <p className="num mt-1.5 text-xs leading-5 text-stone line-clamp-2">
                  {c.applicantSummary || "No applicant data on file."}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {c.shortfall ? (
                    <p className="text-xs text-[var(--bad)]">{c.shortfall}</p>
                  ) : (
                    <span aria-hidden />
                  )}
                  <span className="dlg-pill shrink-0 rounded-full bg-fog px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone">
                    {c.dimension}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CredentialsRow({ payload }: { payload: ReviewPayload }) {
  const p = payload.snapshots.profile;
  const personalCount = p ? Object.values(p).filter((v) => v !== null && v !== "" && v !== undefined).length : 0;
  // 2-column icon grid — one row per credential section (user QA: the old
  // 7 pill chips wrapped across three ragged lines). Zeros render muted so
  // an empty section never reads as an error. Documents spans the full row.
  const items: { label: string; count: number; icon: LucideIcon; span?: boolean }[] = [
    { label: "Personal", count: personalCount, icon: UserRound },
    { label: "Education", count: payload.snapshots.educations.length, icon: GraduationCap },
    { label: "Work", count: payload.snapshots.experiences.length, icon: BriefcaseBusiness },
    { label: "Training", count: payload.snapshots.trainings.length, icon: BookOpen },
    { label: "Eligibility", count: payload.snapshots.eligibilities.length, icon: BadgeCheck },
    { label: "Awards", count: payload.snapshots.awards.length, icon: Award },
    { label: "Documents", count: payload.snapshots.documents.length, icon: FileText, span: true },
  ];
  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={IdCard} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-medium leading-6 text-ink">Credentials on file</h3>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {items.map(({ label, count, icon: Icon, span }) => (
          <div
            key={label}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg bg-white px-2.5 py-2",
              span && "col-span-2"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-stone" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-stone">{label}</span>
            <span className={cn("num text-sm font-medium", count === 0 ? "text-pebble" : "text-ink")}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Notice form dialog (interview / skills exam) ────────────────────────────
// MOM 2026-10-13: the dialog gains the setup mode (Face-to-Face or Online —
// an online setup swaps the required venue for a required meeting link), and
// "Notes" becomes "Invitation Details" — long text with NO character limit.
// Exported so the Review Queue can reuse it for the BULK invitation send
// (bulkSend ids present → POSTs to the bulk endpoint instead).
export function NoticeFormDialog({
  applicationId,
  kind,
  bulkIds,
  bulkContextLabel,
  onClose,
  onSent,
}: {
  applicationId: number;
  kind: "interview" | "skills_exam";
  /** MOM 2026-10-13 bulk send — when present (length > 1), the dialog posts
   *  ONE shared payload to /api/evaluator/applications/invitations. */
  bulkIds?: number[];
  bulkContextLabel?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [examType, setExamType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [mode, setMode] = useState<"face_to_face" | "online">("face_to_face");
  const [venue, setVenue] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [contact, setContact] = useState("");
  const [details, setDetails] = useState("");
  // One-day process — the office's real invitations run MULTIPLE stages in a
  // single day (e.g. 1. Face-to-face Interview 12:30 PM, 2. Psychological
  // Assessment 1:00 PM–3:00 PM). Stage 1 is the dialog's main date/time/venue
  // block; these rows carry stages 2..N and flip the email into the "next
  // stages" template with the IMPORTANT REMINDER + work-suspension clauses.
  const [stages, setStages] = useState<{ title: string; time: string; venue: string }[]>([]);
  const [busy, setBusy] = useState(false);
  // Task 32 — official SignUpForm timing: the rules map is computed on EVERY
  // render (an error clears the moment its field is fixed); `shown` reveals a
  // field's rule only once it has been left (onBlur) or the form submitted.
  // examType is optional and stays ruleless. MOM 2026-10-13 — the venue rule
  // applies face-to-face; the meeting-link rule applies online.
  const rules = {
    date: !date.trim() ? "Date is required." : undefined,
    time: !time.trim() ? "Time is required." : undefined,
    ...(mode === "face_to_face"
      ? { venue: !venue.trim() ? "Venue is required for a face-to-face setup." : undefined }
      : { meetingLink: !meetingLink.trim() ? "A meeting link is required for an online setup." : undefined }),
  };
  const { shown, touch, touchAll, reset, hasGaps } =
    useAuthErrors<"date" | "time" | "venue" | "meetingLink">(rules);

  const isBulk = (bulkIds?.length ?? 0) > 1;
  const endpoint = isBulk
    ? "/api/evaluator/applications/invitations"
    : `/api/evaluator/applications/${applicationId}/notice`;

  const submit = async () => {
    touchAll();
    if (hasGaps) return;
    setBusy(true);
    try {
      const sharedPayload = {
        type: kind,
        date: date || undefined,
        time: time || undefined,
        mode,
        venue: venue || undefined,
        meetingLink: mode === "online" ? meetingLink || undefined : undefined,
        contact: contact || undefined,
        notes: details || undefined,
        examType: kind === "skills_exam" ? examType || undefined : undefined,
        extraStages: stages.some((s) => s.title.trim() || s.time.trim() || s.venue.trim())
          ? stages.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), time: s.time.trim() || undefined, venue: s.venue.trim() || undefined }))
          : undefined,
      };
      if (isBulk) {
        const res = await apiFetch<{ summary: { total: number; sent: number; alreadySent: number; notShortlisted: number; failed: number; notFound: number } }>(endpoint, {
          method: "POST",
          body: { ...sharedPayload, applicationIds: bulkIds },
        });
        const s = res.summary;
        const label = kind === "interview" ? "Interview invitations" : "Skills-exam notices";
        const parts = [
          `${s.sent} sent`,
          `${s.alreadySent} already sent`,
          s.notShortlisted ? `${s.notShortlisted} not shortlisted (skipped)` : "",
          s.failed ? `${s.failed} failed` : "",
          s.notFound ? `${s.notFound} not found` : "",
        ].filter(Boolean);
        if (s.sent > 0) toast.success(`${label}: ${s.sent} sent`, { description: parts.join(" · ") });
        else toast.info(`No new ${label.toLowerCase()} sent`, { description: parts.join(" · ") });
      } else {
        const res = await apiFetch<NoticeSendResult>(endpoint, {
          method: "POST",
          body: sharedPayload,
        });
        const label = kind === "interview" ? "Interview invitation" : "Skills-exam notice";
        toast.success(`${label} sent`, {
          description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
        });
      }
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the notice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      {/* Task 32 — the dialog carries the official SignUpForm card anatomy:
          hairline-bordered white card, auth header typography, gap-5 flow
          of icon-led fields with reserved error lines. */}
      <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "sm:max-w-md")} ariaLabel={kind === "interview" ? "Send interview invitation" : "Send skills-exam notice"}>
        <DialogHeader>
          <DialogTitle className="text-xl font-medium text-foreground">
            {kind === "interview" ? "Send interview invitation" : "Send skills-exam notice"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isBulk
              ? `Fans out as an email plus a companion SMS to ${bulkIds?.length ?? 0} shortlisted applicants${bulkContextLabel ? ` — ${bulkContextLabel}` : ""}. Applicants who already received this notice type are skipped.`
              : "The notice fans out as an email plus a companion SMS to the applicant."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {kind === "skills_exam" && (
            <Input
              id="notice-exam-type"
              label="Exam type"
              value={examType}
              onChange={(next) => setExamType(next)}
              placeholder="e.g. Encoding / trade test"
              leftIcon={<Tag />}
              reserveErrorLine
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              id="notice-date"
              type="date"
              label="Date *"
              value={date}
              onChange={setDate}
              onBlur={() => touch("date")}
              error={shown("date")}
              reserveErrorLine
            />
            <Input
              id="notice-time"
              type="time"
              label="Time *"
              value={time}
              onChange={setTime}
              onBlur={() => touch("time")}
              error={shown("time")}
              reserveErrorLine
            />
          </div>
          {/* MOM 2026-10-13 — setup mode: a toggle check between the
              face-to-face and the online setup. */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              Setup mode <span className="ml-0.5 text-[var(--bad)]" aria-hidden="true">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Setup mode">
              {(
                [
                  { id: "face_to_face", label: "Face-to-Face", icon: MapPin },
                  { id: "online", label: "Online", icon: Video },
                ] as const
              ).map((opt) => {
                const selected = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(opt.id)}
                    className={cn(
                      "focus-ring flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors",
                      selected
                        ? "border-metric-blue bg-metric-blue/10 text-ink"
                        : "border-border bg-white text-stone hover:bg-cloud/60"
                    )}
                  >
                    <opt.icon className={cn("h-4 w-4", selected ? "text-metric-blue" : "text-stone")} aria-hidden />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {mode === "online" ? (
            <Input
              id="notice-meeting-link"
              label="Online meeting link *"
              value={meetingLink}
              onChange={setMeetingLink}
              onBlur={() => touch("meetingLink")}
              placeholder="e.g. https://meet.google.com/..."
              leftIcon={<Video />}
              error={shown("meetingLink")}
              reserveErrorLine
            />
          ) : (
            <Input
              id="notice-venue"
              label="Venue *"
              value={venue}
              onChange={setVenue}
              onBlur={() => touch("venue")}
              placeholder="Building / room"
              leftIcon={<MapPin />}
              error={shown("venue")}
              reserveErrorLine
            />
          )}
          <Input
            id="notice-contact"
            label="HR contact"
            value={contact}
            onChange={(next) => setContact(next)}
            placeholder="Name / number for questions"
            reserveErrorLine
          />
          {/* One-day process — additional stages (2..N). Stage 1 is the main
              date/time/venue block above. Two+ stages switch the emailed
              invitation to the office's "next stages" template. */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Additional stages (one-day process)</p>
              <button
                type="button"
                onClick={() => setStages((prev) => [...prev, { title: "", time: "", venue: "" }])}
                disabled={stages.length >= 5}
                className={cn(ghostBtn, "min-h-[36px] px-3 text-xs")}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add a stage
              </button>
            </div>
            <p className="mt-1 px-1 text-xs text-stone">
              Optional — e.g. a Psychological Assessment after the interview. With two or more stages the invitation is sent as a one-day, multi-stage schedule.
            </p>
            {stages.length > 0 && (
              <div className="mt-2 space-y-3">
                {stages.map((stage, i) => (
                  <div key={i} className="rounded-xl border border-border bg-cloud/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-stone">Stage {i + 2}</p>
                      <button
                        type="button"
                        onClick={() => setStages((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove stage ${i + 2}`}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad)]/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex flex-col gap-3">
                      <Input
                        id={`notice-stage-title-${i}`}
                        label="Stage title *"
                        value={stage.title}
                        onChange={(next) => setStages((prev) => prev.map((s, j) => (j === i ? { ...s, title: next } : s)))}
                        placeholder="e.g. Psychological Assessment"
                        leftIcon={<ListChecks />}
                        reserveErrorLine
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          id={`notice-stage-time-${i}`}
                          label="Time"
                          value={stage.time}
                          onChange={(next) => setStages((prev) => prev.map((s, j) => (j === i ? { ...s, time: next } : s)))}
                          placeholder="e.g. 1:00 PM – 3:00 PM"
                          reserveErrorLine
                        />
                        <Input
                          id={`notice-stage-venue-${i}`}
                          label="Venue"
                          value={stage.venue}
                          onChange={(next) => setStages((prev) => prev.map((s, j) => (j === i ? { ...s, venue: next } : s)))}
                          placeholder="Building / room"
                          leftIcon={<MapPin />}
                          reserveErrorLine
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* MOM 2026-10-13 — "Notes" is now "Invitation Details": LONG text,
              no character limit. */}
          <Textarea
            id="notice-invitation-details"
            label="Invitation Details"
            classNames={{ textarea: "min-h-[120px]" }}
            value={details}
            onChange={(next) => setDetails(next)}
            placeholder="Additional details, requirements, or reminders for the applicant (optional)"
            reserveErrorLine
          >
            <p className="px-1 text-xs text-stone">Long text — no character limit.</p>
          </Textarea>
        </div>
        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          {/* Task 32 — official StatefulButton submit lifecycle; never
              disabled for validation gaps. */}
          <StatefulButton
            type="button"
            size="md"
            state={busy ? "loading" : "idle"}
            loadingText="Sending"
            className="min-h-[44px] px-5 py-2.5"
            onClick={() => void submit()}
          >
            Send notice
          </StatefulButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Decision composer dialog (Shortlist / Not Qualified) ──────────────────

/** Composer dialog opened from the Decision card: remarks optional, its
    Confirm guarded by a confirmation dialog — same pattern as the direct
    email composer. */
function DecisionDialog({
  applicationId,
  decision,
  email,
  onClose,
  onDecided,
}: {
  applicationId: number;
  decision: "Shortlisted" | "Rejected";
  email: string | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const shortlist = decision === "Shortlisted";

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/evaluator/applications/${applicationId}`, {
        method: "PATCH",
        body: { status: decision, reason: remarks.trim() || undefined },
      });
      toast.success(`Applicant marked as ${getStatusMeta(decision).label}`, {
        description: email
          ? `A notification email was sent to ${email}.`
          : "No email on record; HR will contact the applicant directly.",
      });
      setConfirmOpen(false);
      onClose();
      onDecided();
    } catch (e) {
      setConfirmOpen(false);
      toast.error(e instanceof Error ? e.message : "Failed to update the application");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "sm:max-w-lg")} ariaLabel={shortlist ? "Shortlist this applicant" : "Mark as Not Qualified"}>
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              {shortlist ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" aria-hidden />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-[var(--bad)]" aria-hidden />
              )}
              <DialogTitle className="text-xl font-medium text-foreground">
                {shortlist ? "Shortlist this applicant" : "Mark as Not Qualified"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {email
                ? `Confirming will notify the applicant at ${email}.`
                : "No email on record; HR will contact the applicant directly."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id="decision-remarks"
            label="Remarks (optional) — included as the reason"
            classNames={{ textarea: "min-h-[100px]" }}
            placeholder={shortlist ? "e.g. Strong match on the minimum standards" : "e.g. Does not meet the experience requirement"}
            value={remarks}
            maxLength={500}
            onChange={(next) => setRemarks(next)}
          />
          <DialogFooter>
            <button type="button" className={ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={ctaBtn} disabled={busy} onClick={() => setConfirmOpen(true)}>
              {shortlist ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 text-[var(--bad)]" aria-hidden />
              )}
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{shortlist ? "Mark as Shortlisted?" : "Mark as Not Qualified?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {email
                ? `A notification email will be sent to ${email}.`
                : "No email on record; HR will contact the applicant directly."}
              {remarks.trim() ? ` Remarks will be included: “${remarks.trim()}”` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={shortlist ? "" : cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Direct email card ───────────────────────────────────────────────────────

function parseAttachments(json: string | null): { name: string; bytes: number }[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as { name: string; bytes: number }[]) : [];
  } catch {
    return [];
  }
}

function emailStatusVariant(status: string): StatusVariant {
  return status === "sent" || status === "mock" ? "neutral" : "bad";
}

/** Composer dialog: subject + content, recipient auto-retrieved from the
    applicant profile (the server re-resolves it on send). Send is guarded by
    a confirmation dialog. */
function DirectEmailDialog({
  applicationId,
  to,
  onClose,
  onSent,
}: {
  applicationId: number;
  to: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Task 32 — official SignUpForm timing: the required Message flags once
  // left (onBlur) or when the Send click reveals every gap — the message is
  // validated BEFORE the confirmation gate opens — and clears the moment it
  // is fixed. Subject carries no required rule in this flow (ruleless).
  const rules = {
    message: !message.trim() ? "Enter your message." : undefined,
  };
  const { shown, touch, touchAll, reset, hasGaps } =
    useAuthErrors<"subject" | "message">(rules);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (next.length + files.length > 3) {
      toast.error("A maximum of 3 attachments is allowed");
      return;
    }
    if (next.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error("Each attachment must be 5 MB or smaller");
      return;
    }
    setFiles((prev) => [...prev, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("subject", subject.trim());
      fd.set("message", message.trim());
      for (const f of files) fd.append("attachments", f);
      const res = await apiFetch<{ email: { status: string; error?: string | null }; attachments: number }>(
        `/api/evaluator/applications/${applicationId}/email`,
        { method: "POST", formData: fd }
      );
      if (res.email?.status === "failed") {
        toast.error("Email delivery failed", { description: res.email.error ?? undefined });
      } else {
        toast.success(`Direct email ${res.email?.status}`, {
          description: res.attachments ? `${res.attachments} attachment(s) included.` : undefined,
        });
      }
      setConfirmOpen(false);
      onClose();
      onSent();
    } catch (e) {
      setConfirmOpen(false);
      toast.error(e instanceof Error ? e.message : "Failed to send the email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) {
            reset();
            onClose();
          }
        }}
      >
        {/* Task 32 — the dialog carries the official SignUpForm card anatomy:
            hairline-bordered white card, auth header typography, gap-5 flow
            of icon-led fields with reserved error lines. */}
        <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "sm:max-w-lg")} ariaLabel="Send a direct email">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-foreground">Send a direct email</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              The recipient is retrieved automatically from the email on the applicant's profile.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <Input id="direct-email-to" label="To" value={to} readOnly aria-label="Recipient email" leftIcon={<Mail />} />
            <Input
              id="direct-email-subject"
              label="Subject"
              placeholder="Subject"
              value={subject}
              maxLength={200}
              onChange={(next) => setSubject(next)}
              onBlur={() => touch("subject")}
              leftIcon={<Tag />}
              error={shown("subject")}
              reserveErrorLine
            />
            <Textarea
              id="direct-email-message"
              label="Message *"
              classNames={{ textarea: "min-h-[140px]" }}
              placeholder="Message *"
              value={message}
              maxLength={5000}
              onChange={(next) => setMessage(next)}
              onBlur={() => touch("message")}
              error={shown("message")}
              reserveErrorLine
            />
            <div>
              <label className={cn(ghostBtn, "cursor-pointer")}>
                <Paperclip className="h-4 w-4" aria-hidden />
                Attach files
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => pickFiles(e.target.files)}
                  aria-label="Attach files"
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-2 text-xs text-stone">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="focus-ring shrink-0 text-[var(--bad)] hover:underline"
                        onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <button type="button" className={ghostBtn} onClick={onClose}>
              Cancel
            </button>
            {/* Task 32 — official StatefulButton; the Send click validates the
                message BEFORE the confirmation gate opens, and the button is
                never disabled for validation gaps. The actual send happens
                behind the confirm dialog, so this button stays idle. */}
            <StatefulButton
              type="button"
              size="md"
              state="idle"
              disabled={busy}
              className="min-h-[44px] px-5 py-2.5"
              onClick={() => {
                touchAll();
                if (hasGaps) return;
                setConfirmOpen(true);
              }}
            >
              Send email
            </StatefulButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this email?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be delivered to {to}.{files.length > 0 ? ` ${files.length} attachment(s) will be included.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {busy ? "Sending…" : "Send email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Decision-rail card: opens the composer dialog and lists send history. */
function DirectEmailCard({
  applicationId,
  recipient,
  emails,
  onSent,
}: {
  applicationId: number;
  recipient: string | null;
  emails: DirectEmailRow[] | null;
  onSent: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="dlg-card p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={Mail} tone="slate" size={28} iconSize={13} />
        <h3 className="text-[15px] font-medium leading-6 text-ink">Direct email</h3>
      </div>
      {recipient ? (
        <div className="mt-2.5 space-y-1.5">
          {/* Icon-led meta rows replace the old run-on sentence (user QA). */}
          <p className="flex items-center gap-2 text-xs text-stone">
            <Mail className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={recipient}>
              {recipient}
            </span>
          </p>
          <p className="flex items-center gap-2 text-xs text-stone">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
            Up to 3 attachments · 5 MB each
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-stone">No email on record; the applicant left the profile email blank.</p>
      )}
      <button
        type="button"
        className={ctaBtn + " mt-3 w-full"}
        disabled={!recipient}
        onClick={() => setComposerOpen(true)}
      >
        <Send className="h-4 w-4" aria-hidden />
        Send a direct email
      </button>
      <div className="mt-4 border-t border-divider pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-stone">History</p>
          {emails !== null && emails.length > 0 && (
            <span className="dlg-pill num bg-fog px-2 py-0.5 text-[10px] font-medium text-stone">{emails.length}</span>
          )}
        </div>
        <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
          {emails === null ? (
            <p className="text-xs text-stone">Loading…</p>
          ) : emails.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-stone">
              <Mail className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
              No direct emails sent yet.
            </p>
          ) : (
            emails.map((m) => {
              const atts = parseAttachments(m.attachments);
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{m.subject || "(no subject)"}</span>
                  <span className="flex shrink items-center gap-2 text-pebble">
                    {atts.length > 0 && <span className="num">{atts.length} att.</span>}
                    <span className="num">{timeAgo(m.createdAt)}</span>
                    <span className={pillClass(emailStatusVariant(m.status))}>{m.status}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      {composerOpen && recipient && (
        <DirectEmailDialog
          applicationId={applicationId}
          to={recipient}
          onClose={() => setComposerOpen(false)}
          onSent={onSent}
        />
      )}
    </div>
  );
}

// ── The workspace BODY (shared by modal + page) ─────────────────────────────

export function ReviewWorkspace({
  applicationId,
  onClose,
  onDecided,
  bounded = false,
}: {
  applicationId: number;
  onClose?: () => void;
  onDecided?: () => void;
  /** Modal mode: dossier sections get bounded min/max heights with internal
      scroll (the full-page evaluator view keeps natural flow). */
  bounded?: boolean;
}) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [notices, setNotices] = useState<NoticeRow[] | null>(null);
  const [emails, setEmails] = useState<DirectEmailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ status: string; title: string; description: string; destructive?: boolean } | null>(null);
  // Decision composer — Shortlist / Not Qualified each open the dialog.
  const [decisionKind, setDecisionKind] = useState<"Shortlisted" | "Rejected" | null>(null);
  const [busy, setBusy] = useState(false);
  const [noticeKind, setNoticeKind] = useState<"interview" | "skills_exam" | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  const [tab, setTab] = useState("profile");
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const [p, n, m] = await Promise.all([
          apiFetch<ReviewPayload>(`/api/evaluator/applications/${applicationId}`),
          apiFetch<{ notices: NoticeRow[] }>(`/api/evaluator/applications/${applicationId}/notice`),
          apiFetch<{ directEmails: DirectEmailRow[] }>(`/api/evaluator/applications/${applicationId}/email`),
        ]);
        setPayload(p);
        setNotices(n.notices);
        setEmails(m.directEmails);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the application");
      }
    },
    [applicationId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(true), [load]);

  const stage = payload ? stageForStatus(payload.status) : "Applied";
  const applicantName = payload ? fullName(payload.applicant) : "Applicant";
  const email = payload?.applicant.emailAddress ?? null;

  const decide = async (status: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/evaluator/applications/${applicationId}`, {
        method: "PATCH",
        body: { status },
      });
      const label = getStatusMeta(status).label;
      const silentRevert = status === "Applied";
      if (silentRevert) {
        toast.info("Returned to the review queue", { description: "No notification was sent to the applicant." });
      } else {
        toast.success(`Applicant marked as ${label}`, {
          description: email ? `A notification email was sent to ${email}.` : "No email on record; HR will contact the applicant directly.",
        });
      }
      setConfirmAction(null);
      onDecided?.();
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the application");
    } finally {
      setBusy(false);
    }
  };

  const sendRegret = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<NoticeSendResult>(`/api/evaluator/applications/${applicationId}/notice`, {
        method: "POST",
        body: { type: "regret" },
      });
      toast.success("Regret letter sent", {
        description: `Email: ${res.email?.status ?? "unknown"} · SMS: ${res.sms?.status ?? "unknown"}`,
      });
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send the regret letter");
    } finally {
      setRegretBusy(false);
    }
  };

  const openConfirm = (status: string) => {
    const label = getStatusMeta(status).label;
    const consequence = email
      ? `An email will be sent to ${email}.`
      : "No email on record; HR will contact the applicant directly.";
    setConfirmAction({
      status,
      title: `Mark as ${label}?`,
      description: consequence,
      destructive: status === "Rejected",
    });
  };

  const regretAlreadySent = (notices ?? []).some((n) => n.type === "regret" && (n.status === "sent" || n.status === "mock"));
  const noticeLabel: Record<NoticeRow["type"], string> = {
    regret: "Regret letter",
    interview: "Interview invitation",
    skills_exam: "Skills-exam notice",
  };

  if (error) {
    return (
      <div className="dlg-card p-8">
        <EmptyState
          icon={AlertTriangle}
          tone="rose"
          title="Couldn't load the application"
          description={error}
          action={
            <div className="flex items-center justify-center gap-3">
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
              {onClose && (
                <button type="button" className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="dlg-card space-y-5 p-5 sm:p-6">
          <div className="space-y-2.5">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="flex gap-2 border-b border-border pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          <SkeletonRows rows={6} />
        </div>
        <div className="space-y-4">
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-32" />
            <SkeletonRows rows={3} rowClassName="h-6" />
          </div>
          <div className="dlg-card p-4">
            <Skeleton className="mb-3 h-4 w-24" />
            <SkeletonRows rows={4} rowClassName="h-6" />
          </div>
        </div>
      </div>
    );
  }

  const p = payload.snapshots.profile ?? {};
  const characterRefs = Array.isArray(p.characterReferences) ? (p.characterReferences as SnapRow[]) : [];
  const positionTitle = payload.job.position?.positionTitle || payload.job.title;
  const place = payload.job.position?.placeOfAssignment ?? null;
  const sectionCls = (extra: string) => (bounded ? `${extra} ${boundedSectionCls}` : extra);
  // MOM 2026-10-13 — the evaluator must see re-application history: this
  // applicant previously applied (and was rejected) for THIS job listing.
  const prior = payload.priorRejections ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* ── LEFT: frozen dossier ── */}
      <div className="dlg-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <MonogramAvatar name={applicantName} size={48} warm />
            <div className="min-w-0">
              <h2 className="text-xl font-medium leading-tight tracking-[0.01em] text-ink sm:text-2xl">{applicantName}</h2>
              <p className="num mt-1 text-sm text-body-gray">
                {[positionTitle, place].filter(Boolean).join(" · ")} · Applied {formatDate(payload.dateApplied)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusPill status={payload.status} />
            <button
              type="button"
              className="focus-ring inline-flex min-h-[44px] items-center text-sm font-medium text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
              onClick={() => navigate("candidate", { id: String(payload.applicant.id) })}
            >
              View full profile
            </button>
          </div>
        </div>

        {/* MOM 2026-10-13 — previously-rejected indicator for this posting. */}
        {prior && (
          <div
            className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,white)] px-4 py-3"
            role="note"
          >
            <History className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" aria-hidden />
            <p className="text-xs leading-relaxed text-ink">
              <span className="font-semibold">Previously rejected for this posting</span>
              {" "}
              — {prior.count === 1 ? "1 earlier application" : `${prior.count} earlier applications`} from this
              applicant for this job listing
              {prior.lastDate ? `, last applied ${formatDate(prior.lastDate)}` : ""}. Review the applicant's updated
              credentials before deciding.
              {prior.lastReason ? (
                <span className="block text-stone">Last recorded reason: “{prior.lastReason}”</span>
              ) : null}
            </p>
          </div>
        )}

        <Tabs variant="pill" value={tab} onValueChange={setTab}>
          <TabsList>
            {DOSSIER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className={sectionCls("pt-4")}>
            <div className="rounded-lg bg-white p-4">
              <LedgerRow label="Email" value={str(p.emailAddress) || str(payload.applicant.emailAddress)} />
              <LedgerRow label="Mobile" value={str(p.mobileNumber) || str(p.contactNumber)} num />
              <LedgerRow label="Other phone" value={[str(p.contactNumberSec), str(p.telephoneNumber)].filter(Boolean).join(" · ")} num />
              <LedgerRow label="Gender" value={str(p.gender)} />
              <LedgerRow label="Civil status" value={str(p.civilStatus)} />
              <LedgerRow label="Birth date" value={snapshotDisplayDate(p.birthDate)} num />
              <LedgerRow label="Birth place" value={str(p.birthPlace)} />
              <LedgerRow label="Address" value={str(p.presentAddress)} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-stone">Character references</p>
              {characterRefs.length === 0 ? (
                <p className="mt-1 text-sm text-body-gray">None on file.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {characterRefs.map((r, i) => (
                    <li key={i} className="text-sm text-ink">
                      {[str(r.name), str(r.address), str(r.telephone) || str(r.contactNumber)].filter(Boolean).join(" · ") || "-"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="education" className={sectionCls("pt-4")}>
            <EducationCards rows={payload.snapshots.educations} />
          </TabsContent>
          <TabsContent value="experience" className={sectionCls("pt-4")}>
            <ExperienceCards rows={payload.snapshots.experiences} />
          </TabsContent>
          <TabsContent value="training" className={sectionCls("pt-4")}>
            <TrainingCards rows={payload.snapshots.trainings} />
          </TabsContent>
          <TabsContent value="eligibility" className={sectionCls("pt-4")}>
            <EligibilityCards rows={payload.snapshots.eligibilities} />
          </TabsContent>
          <TabsContent value="awards" className={sectionCls("pt-4")}>
            <AwardCards rows={payload.snapshots.awards} />
          </TabsContent>
          <TabsContent value="documents" className={sectionCls("pt-4")}>
            {payload.snapshots.documents.length === 0 ? (
              <EmptyNote>No documents uploaded.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {payload.snapshots.documents.map((doc) => {
                  const chip = documentStatusChip(doc);
                  return (
                    <div key={doc.id ?? doc.filePath} className="flex items-center gap-3 rounded-lg bg-white p-4">
                      <span className="chip chip-slate h-6 shrink-0 px-2 text-[10px] font-medium tracking-wide" aria-hidden>
                        {fileKind(doc.originalName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="focus-ring block w-full cursor-pointer truncate rounded text-left text-sm font-medium text-ink transition-colors hover:text-primary"
                          title={doc.originalName}
                        >
                          {doc.originalName}
                        </button>
                        <p className="num mt-0.5 text-xs text-stone">
                          {humanize(doc.category)} · {Math.max(1, Math.round(doc.size / 1024))} KB · {formatDate(doc.createdAt)}
                        </p>
                      </div>
                      {chip && <StatusPill status={chip.label} variant={chip.variant} pulse={chip.pulse} className="shrink-0" />}
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        aria-label={`View ${doc.originalName}`}
                        className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Document preview modal (shared) — opened from the Documents tab rows. */}
        <DocumentPreviewModal
          doc={previewDoc}
          open={previewDoc !== null}
          onOpenChange={(o) => {
            if (!o) setPreviewDoc(null);
          }}
        />
      </div>

      {/* ── RIGHT: decision rail — inside the modal it never exceeds the
          dialog interior (92dvh − dialog padding), so the rail scrolls
          internally and the dialog itself never scrolls. */}
      <div
        className={`space-y-4 self-start lg:sticky lg:top-6 ${
          bounded ? "lg:max-h-[calc(92dvh-4rem)]" : "lg:max-h-[calc(100dvh-3rem)]"
        } lg:overflow-y-auto scroll-thin`}
      >
        <RequirementsMatchPanel report={payload.requirements} />
        <CredentialsRow payload={payload} />

        {/* (The standalone "Applied · Awaiting review." banner was removed —
            the dossier header already carries the live status pill, so the
            rail goes straight to the decision actions.) */}

        {(stage === "Applied" || stage === "Under Review") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={Gavel} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-medium leading-6 text-ink">Decision</h3>
            </div>
            <div className="space-y-2">
              {/* Status-colored actions — each button wears the color of the
                  pipeline status it produces (blue → Under Review, green →
                  Shortlisted, red → Rejected). */}
              {stage === "Applied" && (
                <button type="button" className={ctaBtn + " w-full"} onClick={() => openConfirm("Under Review")}>
                  <ScanSearch className="h-4 w-4" aria-hidden />
                  Start Review
                </button>
              )}
              <button type="button" className={ctaOkBtn + " w-full"} onClick={() => setDecisionKind("Shortlisted")}>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Shortlist
              </button>
              <button
                type="button"
                className={ctaBadBtn + " w-full"}
                onClick={() => setDecisionKind("Rejected")}
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Not Qualified
              </button>
            </div>
            <p className="text-xs text-stone">
              {email
                ? `Decision notices will be emailed to ${email}.`
                : "No email on record; HR will contact the applicant directly."}
            </p>
          </div>
        )}

        {(stage === "Shortlisted" || stage === "Rejected") && (
          <div className="dlg-card space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <IconChip icon={History} tone="slate" size={28} iconSize={13} />
              <h3 className="text-[15px] font-medium leading-6 text-ink">Revise decision</h3>
            </div>
            <p className="text-xs text-stone">Changing the decision notifies the applicant.</p>
            <button
              type="button"
              className={cn(ghostBtn, "w-full", stage === "Shortlisted" ? ghostBadModifier : ghostOkModifier)}
              onClick={() =>
                stage === "Shortlisted"
                  ? setConfirmAction({
                      status: "Rejected",
                      title: "Mark as Not Qualified?",
                      description: email
                        ? `The decision will be flipped and a regret letter will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record; HR will contact the applicant directly.",
                      destructive: true,
                    })
                  : setConfirmAction({
                      status: "Shortlisted",
                      title: "Mark as Shortlisted?",
                      description: email
                        ? `The decision will be flipped and the shortlist notice will be emailed to ${email}.`
                        : "The decision will be flipped. No email on record; HR will contact the applicant directly.",
                    })
              }
            >
              {stage === "Shortlisted" ? (
                <>
                  <XCircle className="h-4 w-4 text-[var(--bad)]" aria-hidden />
                  Flip to Not Qualified
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                  Flip to Shortlisted
                </>
              )}
            </button>
            <button
              type="button"
              className={ghostBtn + " w-full"}
              onClick={() =>
                setConfirmAction({
                  status: "Applied",
                  title: "Return to review queue?",
                  description: "This reverts the application to Applied and does NOT notify the applicant.",
                })
              }
            >
              <RotateCcw className="h-4 w-4 text-stone" aria-hidden />
              Return to Review
            </button>
          </div>
        )}

        {/* Notices */}
        <div className="dlg-card space-y-3 p-4">
          <div className="flex items-center gap-2.5">
            <IconChip icon={Mails} tone="slate" size={28} iconSize={13} />
            <h3 className="text-[15px] font-medium leading-6 text-ink">Notices</h3>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
            {notices === null ? (
              <p className="text-xs text-stone">Loading…</p>
            ) : notices.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-stone">
                <Mails className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                No notices sent yet.
              </p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{noticeLabel[n.type] ?? n.type}</span>
                  <span className="flex shrink items-center gap-2 text-pebble">
                    <span className="num">{formatDateTime(n.sentAt)}</span>
                    <span className={pillClass(n.status === "sent" || n.status === "mock" ? "neutral" : "bad")}>{n.status}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {stage === "Shortlisted" && (
            <div className="space-y-2">
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("interview")}>
                Send Interview Invitation
              </button>
              <button type="button" className={ghostBtn + " w-full"} onClick={() => setNoticeKind("skills_exam")}>
                Send Skills-Exam Notice
              </button>
            </div>
          )}
          {stage === "Rejected" && (
            <button
              type="button"
              className={cn(ghostBtn, ghostBadModifier, "w-full")}
              disabled={regretAlreadySent || regretBusy}
              onClick={() => setRegretOpen(true)}
            >
              {regretAlreadySent ? "Regret letter sent" : regretBusy ? "Sending…" : "Send Regret Letter"}
            </button>
          )}
        </div>

        <DirectEmailCard applicationId={applicationId} recipient={email} emails={emails} onSent={refetch} />
      </div>

      {/* Decision confirm */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.destructive ? cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium") : ""}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) void decide(confirmAction.status);
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send the regret letter?</AlertDialogTitle>
            <AlertDialogDescription>
              {email
                ? `A formal regret letter will be emailed to ${email}.`
                : "No email on record; the send will be logged as skipped and HR will contact the applicant directly."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={(e) => {
                e.preventDefault();
                void sendRegret();
              }}
            >
              Send regret letter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decision composer */}
      {decisionKind && (
        <DecisionDialog
          applicationId={applicationId}
          decision={decisionKind}
          email={email}
          onClose={() => setDecisionKind(null)}
          onDecided={() => {
            onDecided?.();
            void load(true);
          }}
        />
      )}

      {/* Notice form */}
      {noticeKind && (
        <NoticeFormDialog
          applicationId={applicationId}
          kind={noticeKind}
          onClose={() => setNoticeKind(null)}
          onSent={refetch}
        />
      )}
    </div>
  );
}

// ── Deep-link page (default export, prop-detection wrapper) ─────────────────

function ReviewWorkspacePage() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const close = useCallback(() => navigate("review-queue"), []);

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — labelled back affordance + title */}
      <PageHeader
        back={{ label: "Back to Review Queue", onClick: close }}
        title="Review Workspace"
        description="Applicant dossier and decision rail."
      />
      {valid ? (
        <ReviewWorkspace applicationId={id} onClose={close} />
      ) : (
        <div className="dlg-card py-6">
          <EmptyState
            icon={FileText}
            title="No application selected"
            description="Open a review from the queue to see the applicant dossier."
            action={
              <button type="button" className={ctaBtn} onClick={close}>
                Go to review queue
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function ReviewWorkspaceRoute(props: {
  applicationId?: number;
  onClose?: () => void;
  onDecided?: () => void;
}) {
  if (typeof props.applicationId === "number") {
    return <ReviewWorkspace applicationId={props.applicationId} onClose={props.onClose} onDecided={props.onDecided} />;
  }
  return <ReviewWorkspacePage />;
}
