"use client";

// ============================================================================
// RMIS — Applicant home ("My Application"): dashboard welcome hero (mini
// profile — avatar, name, role/email line and the profile completion
// ring — Task 22, moved here from the Profile page whose identity header was
// removed — on a restrained white enterprise identity card, Task 25/27)
// above a two-pane workspace grid
// (lg:grid-cols-12):
//   LEFT  · Job Openings — full-width stacked list rows (metric-blue hover
//           rule, humanized title, pipe-separated vitals, capsule +/−
//           quick-view toggle, in-place quick view with six QuickFacts).
//           DESKTOP ONLY (Task 20): on phones the section moved off the home
//           page — the Jobs page (#/vacant-positions) carries the same list
//           below lg via the shared JobListCard.
//   RIGHT · Your Applications — sticky rail with its own overflow scroll;
//           journey cards (No. kicker · status pill · chevron · 3-checkpoint
//           jade progress timeline with per-step captions · next-step hint).
//           On mobile the rail is the only workspace section.
// Clicking a journey card opens the full Application detail modal (§7.7)
// with Cancel Application while the journey is still at "Submitted".
// Data: parallel /api/applications + /api/jobs — 15 s silent poll + refetch on
// focus (never flips skeletons or clobbers good data on transient failure).
// Bevel pass: shared page-header anatomy, cloud journey/position cards, white
// interior tiles inside the detail modal, capsule CTAs, body-gray copy.
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Inbox,
  Mail,
  MapPin,
  Star,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ghostBadBtn, cancelBtn } from "@/components/ui/buttons";
import { EmptyState, ErrorCard, IconChip, PageHeader, RichSection, StatusPill } from "@/components/ui/shell";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { navigate, type ApplicationWire, type DocumentWire, type JobWire, type PositionWire } from "@/lib/router";
import { currentStageLabel, stageForStatus, isActiveApplicationStatus } from "@/lib/status";
import { APPLICANT_STAGE_VARIANT, type StatusVariant } from "@/lib/status-ui";
import { cn } from "@/lib/utils";
import { computeProfileCompletion } from "@/lib/profile-completion";
import type { ApplicantProfile } from "@/components/views/profile/section-types";
import { useSession } from "@/components/session-provider";
import { initialsOf } from "@/components/shell/nav-rail";
import { useSavedJobs } from "@/lib/use-saved-jobs";
import OnboardingTour from "@/components/onboarding-tour";
import { JobListCard } from "@/components/views/jobs/job-openings-card";
import { jobIsActive } from "@/lib/job-meta";

// ── Small helpers ───────────────────────────────────────────────────────────

function notRequired(v: string | null | undefined): boolean {
  if (!v) return true;
  const s = v.trim().toLowerCase();
  return s === "" || s === "n/a" || s === "na" || s === "none" || s === "none required" || s === "not required";
}

/** Circular completion ring — a small, elegant SOLID Metric-Blue arc on a
 *  divider track (Task 27 refinement: no gradient, no glow, and NO inner
 *  readout — the percentage is displayed exactly once, as the metric value
 *  beside the ring). Fixed h-8 size so it sits flush inside the compact
 *  metrics strip. */
function CompletionRing({ pct, className }: { pct: number; className?: string }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div
      className={cn("relative h-8 w-8 shrink-0", className)}
      role="img"
      aria-label={`${pct}% profile complete`}
    >
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={R} fill="none" className="stroke-divider" strokeWidth="6" />
        {pct > 0 && (
          <circle
            cx="36"
            cy="36"
            r={R}
            fill="none"
            className="stroke-metric-blue motion-safe:transition-[stroke-dasharray] duration-700 ease-out"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
          />
        )}
      </svg>
    </div>
  );
}

/** Applicant-facing stage label → functional status variant (§2 status system).
 *  Shared mapping from lib/status-ui — the applicant timeline, tracker chips
 *  and board badges all agree on hue AND glyph. */
function stageVariant(label: string): StatusVariant {
  return APPLICANT_STAGE_VARIANT[label] ?? "neutral";
}

/** §7.3 Next Step hint paragraph per pipeline stage. */
function nextStepHint(stage: string): string {
  if (stage === "Rejected")
    return "Your application was not shortlisted. You may apply for other open positions.";
  if (stage === "Shortlisted")
    return "A notice has been sent to your registered email. HR will contact you for the next steps.";
  if (stage === "Under Review") return "HR is currently evaluating your application. You will be notified of the outcome.";
  return "Your application has been received and is awaiting evaluation by the Human Resource Office.";
}

type CheckpointState = "done" | "current" | "pending" | "failed";

/* Progress-timeline palette — the system's functional status tokens: ok green
   for achieved/live steps, neutral disc for steps ahead, divider gray rails,
   bad-red for a failed decision. Same hue source as the status dots/pills. */
const TL_OK = "var(--ok)";
const TL_PENDING_DISC = "var(--neutral-bg)";
const TL_PENDING_RAIL = "var(--divider)";

/** Timeline checkpoint marker (system status spec): achieved steps are a
 *  solid ok-green disc with a white glyph, the live step is a thick ok ring,
 *  steps ahead are a quiet neutral disc, and a failed decision is the app's
 *  bad-red disc with a white ×. Glyph/shape carries the state so it never
 *  rides on hue alone; the ring keeps a pulsing halo — motion-safe only. */
function CheckpointDot({ state, doneGlyph }: { state: CheckpointState; doneGlyph?: ReactNode }) {
  if (state === "current") {
    return (
      <span
        aria-hidden="true"
        className="motion-safe:animate-pulse inline-flex h-5 w-5 shrink-0 rounded-full border-[7px] bg-white"
        style={{ borderColor: TL_OK }}
      />
    );
  }
  if (state === "failed") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bad)] text-white"
      >
        <X aria-hidden="true" className="h-[11px] w-[11px]" strokeWidth={3} />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: TL_OK }}
      >
        {doneGlyph ?? <Check aria-hidden="true" className="h-[11px] w-[11px]" strokeWidth={3} />}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 shrink-0 rounded-full"
      style={{ backgroundColor: TL_PENDING_DISC }}
    />
  );
}

/** 3-checkpoint tracking timeline: Submitted → Under Review → Decision (§7.3),
 *  styled to the system status spec — ok-green rails, a bold step label with a
 *  one-line caption under every checkpoint, the live step captioned in ok. */
function JourneyTimeline({ status }: { status: string }) {
  const stage = stageForStatus(status);
  const decided = stage === "Shortlisted" || stage === "Rejected";

  const steps: { label: string; state: CheckpointState; desc: string; doneGlyph?: ReactNode }[] = [
    {
      label: "Submitted",
      state: "done",
      desc: "Your application has been successfully submitted",
    },
    {
      label: "Under Review",
      state: stage === "Under Review" ? "current" : decided ? "done" : "pending",
      desc:
        stage === "Under Review"
          ? "HR is currently reviewing your application"
          : decided
            ? "Your application has passed the initial review"
            : "HR will evaluate your application next",
    },
    {
      // Neutral pending label — never presumes the shortlist outcome, since
      // the decision can go either way.
      label: stage === "Shortlisted" ? "Shortlisted" : stage === "Rejected" ? "Not Shortlisted" : "Awaiting Decision",
      state: stage === "Shortlisted" ? "done" : stage === "Rejected" ? "failed" : "pending",
      desc:
        stage === "Shortlisted"
          ? "You've been shortlisted for the next step"
          : stage === "Rejected"
            ? "Your application was not shortlisted"
            : "You will be notified once a decision is made",
      // Proper glyph for the achieved decision — a star, not a generic check.
      doneGlyph: <Star aria-hidden="true" className="h-[11px] w-[11px] fill-current" strokeWidth={0} />,
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {steps.map((s, i) => {
        const reached = s.state !== "pending";
        return (
          <div key={`${s.label}-${i}`} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              {/* Traversed connectors render in the system's ok green.
                  Negative outer margins bridge the grid's gap-1 so each rail
                  reads as one continuous line, not segments with gaps. */}
              <div
                className={cn("h-[2px] flex-1", i > 0 && "-ml-1")}
                style={{ backgroundColor: i === 0 ? "transparent" : reached ? TL_OK : TL_PENDING_RAIL }}
              />
              <CheckpointDot state={s.state} doneGlyph={s.doneGlyph} />
              <div
                className={cn("h-[2px] flex-1", i < steps.length - 1 && "-mr-1")}
                style={{
                  backgroundColor:
                    i === steps.length - 1 ? "transparent" : steps[i + 1].state !== "pending" ? TL_OK : TL_PENDING_RAIL,
                }}
              />
            </div>
            <div className="mt-2 flex flex-col gap-0.5">
              <span
                className="text-[10px] font-medium leading-tight text-ink"
                style={
                  s.state === "current"
                    ? { color: TL_OK }
                    : s.state === "failed"
                      ? { color: "var(--bad)" }
                      : undefined
                }
              >
                {s.label}
              </span>
              <span
                className="text-[10px] leading-snug text-stone"
                style={s.state === "current" ? { color: TL_OK } : undefined}
              >
                {s.desc}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Bookmarks — the same client store the frontpage explorer uses
// (shared hook + localStorage key in lib/use-saved-jobs).

// ── Application journey card (right rail) ───────────────────────────────────

function ApplicationJourneyCard({ app, index, onOpen }: { app: ApplicationWire; index: number; onOpen: () => void }) {
  const stage = stageForStatus(app.status);
  const label = currentStageLabel(app.status);
  const place = app.job?.position?.placeOfAssignment ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View complete posting and application details: ${app.job?.title ?? "position"}`}
      className="dlg-card lift focus-ring min-h-[44px] w-full p-4 text-left sm:p-5"
    >
      {/* Header — the chevron is the whole-card affordance: the card opens
          the full posting in the detail modal. "In Review" wears the BEUI
          syncing badge (spinning loader + pulse, brand-blue tint) — the docs'
          "Syncing" badge with the word "In Review" (user directive). */}
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">No. {String(index + 1).padStart(2, "0")}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusPill status={label} variant={stageVariant(label)} pulse={label === "In Review"} />
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 text-pebble transition-all duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
      <h3 className="mt-3 text-base font-medium leading-snug text-ink sm:text-lg">{app.job?.title ?? "Position"}</h3>
      {place && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-stone">
          <MapPin className="h-4 w-4" aria-hidden="true" /> {place}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1.5 text-xs text-stone">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Applied{" "}
        <span className="num">{formatDate(app.dateApplied)}</span>
      </p>

      <JourneyTimeline status={app.status} />

      {/* Next hint — the card's closing block (the full posting lives one
          click away, in the application detail modal). */}
      <div className="mt-3 border-t border-divider pt-2.5">
        <p className="eyebrow text-stone">Next Step</p>
        <p className="mt-1 text-xs leading-relaxed text-stone">{nextStepHint(stage)}</p>
      </div>
    </button>
  );
}

// ── Application detail modal (spec §7.7) ────────────────────────────────────
// RichSection comes from ui/shell (heading="lg" scale) — no local copy.

function MqrLedger({ position }: { position: PositionWire | null }) {
  if (!position) return null;
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Education", value: position.cscEducation },
    { label: "Work Experience", value: position.cscWorkExperience },
    { label: "Training", value: position.cscTraining },
    { label: "Eligibility", value: position.cscEligibilityGroup || position.cscEligibility },
    { label: "License / Certification", value: position.license },
  ];
  const visible = rows.filter((r) => !notRequired(r.value));
  if (visible.length === 0) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-base font-medium text-ink sm:text-lg">Minimum Qualification Requirements</h4>
      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.label} className="rounded-lg bg-cloud/60 p-3">
            <p className="text-xs font-medium text-stone">{r.label}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-stone">{r.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApplicationDetailModal({
  application,
  onClose,
  onCancelled,
}: {
  application: ApplicationWire;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const job = application.job ?? null;
  const position = job?.position ?? null;
  const label = currentStageLabel(application.status);
  const cancellable = label === "Submitted";
  const dl = deadlineState(job?.deadlineDate ?? null);

  const cancelApplication = async () => {
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${application.id}`, { method: "DELETE" });
      toast.success("Application cancelled", { description: "Your application has been withdrawn." });
      setConfirmOpen(false);
      onClose();
      onCancelled();
    } catch (e) {
      // Progressed applications: surface the server's guidance (e.g. "contact HR") as-is.
      toast.error(e instanceof Error ? e.message : "Unable to cancel this application");
      setConfirmOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  const facts: [string, string][] = [
    ["Place of Assignment", position?.placeOfAssignment ?? "-"],
    ["Employment Type", job?.positionType ? humanize(job.positionType) : position?.positionType ? humanize(position.positionType) : "-"],
    ["Vacancies", job?.numberOfVacancy == null ? "-" : String(job.numberOfVacancy)],
    ["Monthly Salary", formatCurrency(position?.salaryAmount ?? null)],
    ["Salary Grade", position?.salaryGrade ? `SG-${position.salaryGrade}${position.salaryStep ? ` Step ${position.salaryStep}` : ""}` : "-"],
    ["Item No.", position?.itemNumber ?? "-"],
    ["Published", formatDate(job?.publishDate ?? null)],
    ["Deadline", job ? dl.label : "-"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dlg-card-plain max-h-[90dvh] w-full overflow-y-auto scroll-thin p-0 sm:max-w-3xl" ariaLabel={job?.title ?? "Application"}>
        <div className="p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={label} variant={stageVariant(label)} />
              <span className="dlg-pill num rounded-full bg-fog px-3 py-1 text-xs font-medium text-stone">
                Application #{application.id}
              </span>
            </div>
            <DialogTitle className="font-display text-2xl leading-tight tracking-[0.01em] text-ink">
              {job?.title ?? "Application"}
            </DialogTitle>
          </DialogHeader>

          {/* Successfully-applied strip (§7.7) — BEUI Animated Alert */}
          <Alert variant="success" className="mt-4">
            <AlertIcon>
              <BadgeCheck />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>Successfully Applied</AlertTitle>
              <AlertDescription>
                Applied <span className="num">{formatDate(application.dateApplied)}</span>
              </AlertDescription>
            </AlertContent>
          </Alert>

          {/* Vitals summary grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-cloud/60 p-3">
                <p className="text-[11px] text-stone">{k}</p>
                <p className="num mt-0.5 truncate text-sm text-ink" title={v}>
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            <MqrLedger position={position} />
            <RichSection title="Brief Description" text={job?.briefDescription} html={job?.briefDescriptionHtml} />
            <RichSection title="Duties & Responsibilities" text={job?.dutiesResponsibilities} html={job?.dutiesHtml} />
            <RichSection title="Compensation Package" text={job?.compensationPackage} html={job?.compensationHtml} />
            <RichSection title="Other Qualifications" text={job?.otherQualifications} html={job?.otherQualificationsHtml} />
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            {cancellable && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
                className={`${ghostBadBtn} px-6 py-2.5`}
              >
                Cancel Application
              </button>
            )}
            <button type="button" onClick={onClose} className="dlg-ghost min-h-[44px] px-6 py-2.5 text-sm">
              Close
            </button>
          </div>
        </div>

        {/* Nested destructive confirm (§7.7) */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="dlg-card-plain">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-2xl text-ink">Cancel this application?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
                Your application for {job?.title ?? "this position"} will be withdrawn. You may apply again while the
                position is still open. Once review has started, applications can no longer be cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void cancelApplication();
                }}
                disabled={cancelling}
                className={`${ghostBadBtn} px-5 py-2.5`}
              >
                {cancelling ? "Cancelling…" : "Cancel Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skel h-3 w-32" />
        <div className="skel mt-3 h-8 w-72 sm:h-9" />
        <div className="skel mt-3 h-4 w-1/2" />
      </div>
      {/* Two-pane skeleton — positions (left, register rows) · applications (right) */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="hidden space-y-4 lg:order-1 lg:col-span-7 lg:block">
          <div className="skel h-3 w-44" />
          <div className="skel h-6 w-36" />
          <div className="space-y-4 sm:space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dlg-card px-5 py-5 sm:px-6">
                <div className="min-w-0 space-y-3">
                  <div className="skel h-6 w-3/4" />
                  <div className="skel h-5 w-1/2" />
                  <div className="skel h-4 w-2/3" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="skel h-4 w-14 rounded-full" />
                  <div className="flex items-center gap-1.5">
                    <div className="skel h-9 w-9 rounded-full" />
                    <div className="skel h-9 w-9 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:order-2 lg:col-span-5">
          <div className="skel h-3 w-40" />
          <div className="skel h-6 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel h-64" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function ApplicantHome() {
  const { user } = useSession();
  const [apps, setApps] = useState<ApplicationWire[] | null>(null);
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationWire | null>(null);
  // Quick view — single-expand: opening one card closes the previous one.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Bookmarks — the same client store the frontpage explorer uses.
  const { saved, toggle: toggleSave } = useSavedJobs();
  // Profile completion ring (Task 22): 100% for free when the session says
  // complete; otherwise ONE quiet profile+documents fetch computes it. A
  // failure just hides the ring — it never owns a loading state.
  const [ringPct, setRingPct] = useState<number | null>(null);

  const reload = useCallback(async (silent: boolean) => {
    try {
      const [appRes, jobRes] = await Promise.all([
        apiFetch<ApplicationWire[]>("/api/applications"),
        apiFetch<JobWire[]>("/api/jobs"),
      ]);
      setApps(appRes);
      setJobs(jobRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your workspace");
      // Silent failures keep the last good data (§13 polling contract).
    }
  }, []);

  useEffect(() => {
    void reload(false);
    const interval = setInterval(() => {
      if (!document.hidden) void reload(true);
    }, 15_000);
    const onFocus = () => void reload(true);
    const onVisible = () => {
      if (!document.hidden) void reload(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const loading = apps === null && jobs === null;
  const firstName = user?.firstName || "there";
  // Reference-faithful identity: full name as the primary element (the
  // initials avatar already derives from the same composed name).
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || firstName
    : firstName;
  const initials = user ? initialsOf(user) : "--";

  // Right rail — every application on record, newest first. The rail has its
  // own overflow scroll, so no cap is needed.
  const sortedApps = (apps ?? []).sort((a, b) => Date.parse(b.dateApplied) - Date.parse(a.dateApplied));

  // Left pane — every open posting (deadline not passed), newest published
  // first. This pane is the browsing surface: the full list scrolls in place.
  const openJobs = (jobs ?? [])
    .filter((j) => jobIsActive(j.deadlineDate))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const profileComplete = user?.applicant?.isProfileComplete ?? false;

  // Ring data (Task 22) — runs before the skeleton early-return below.
  useEffect(() => {
    let alive = true;
    if (profileComplete) {
      setRingPct(100);
      return () => {
        alive = false;
      };
    }
    setRingPct(null);
    void (async () => {
      try {
        const [profileRes, docsRes] = await Promise.all([
          apiFetch<ApplicantProfile>("/api/applicant/profile"),
          apiFetch<DocumentWire[]>("/api/applicant/documents"),
        ]);
        if (alive) setRingPct(computeProfileCompletion(profileRes, docsRes).pct);
      } catch {
        if (alive) setRingPct(null); // ring quietly hides on failure
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileComplete]);

  if (loading) return <HomeSkeleton />;

  if (error && apps === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Applicant Portal" title="My Application" />
        <ErrorCard
          title="Couldn't load your workspace"
          description={error}
          onRetry={() => void reload(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== Dashboard welcome hero — mini profile (Task 27, enterprise
           refinement of the Task 25 card). ONE tightly composed identity
           card wearing the SAME "Hero Sky" wash as the frontpage
           "Job Opportunities" hero (user directive: shared .hero-sky
           gradient — sky-blue fading into white, dark mode flips to the
           deep blue wash) inside a bordered rounded-2xl surface (no grid /
           glow / shadow — the hairline border carries the elevation),
           compact padding, circular initials avatar (the data model has no
           picture field) with a subtle outline and the verified chip
           bottom-right, name + restrained Applicant badge grouped as the
           primary line with the email as quiet secondary metadata, a single
           Edit Profile capsule aligned right, and a DIVIDER-FREE metrics
           strip (deliberate spacing, not a full-width rule): bare muted
           icon → value over label at uniform compact sizes so the identity
           keeps primacy. The completion ring is the third item and the
           percentage is displayed ONCE (small solid Metric-Blue arc, no
           inner readout), labelled "Profile complete" / "In progress". The
           "Welcome back," greeting stays removed and onboarding-tour anchors
           are untouched — they target the rails below.
           ============================= */}
      <section aria-label="Mini profile" className="hero-sky rounded-2xl border border-divider px-5 py-4 sm:px-6 sm:py-5">
        {/* Identity — avatar and name block grouped as one unit (name +
            restrained Applicant badge on the primary line, email as the
            quiet secondary line); the Edit Profile action sits at the right
            and wraps below the name block on narrow screens via flex-wrap. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="relative shrink-0">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-sm font-medium text-white ring-1 ring-divider sm:h-14 sm:w-14 sm:text-base">
              {initials}
            </span>
            {profileComplete && (
              <span
                className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-divider"
                title="Profile complete"
              >
                <BadgeCheck className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="font-display truncate text-lg font-medium text-ink sm:text-xl">
                {displayName}
              </h1>
              <span className="dlg-pill shrink-0 bg-cloud px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-stone">
                {user?.role ?? "APPLICANT"}
              </span>
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-stone">
              <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ash" />
              <span className="truncate">{user?.email}</span>
            </p>
          </div>
          {/* Edit Profile is a DESKTOP-only affordance (Task 36, per user):
              on mobile the Profile tab in the bottom bar is the direct path,
              so the button drops out of the mini profile row below lg. */}
          <button
            type="button"
            onClick={() => navigate("profile")}
            className="dlg-cta focus-ring hidden min-h-[44px] shrink-0 items-center px-5 py-2 text-sm lg:inline-flex"
          >
            Edit Profile
          </button>
        </div>
        {/* Metrics strip — deliberately spaced inline stats (no full-width
            divider, no boxes): bare muted icon, value over label, uniform
            compact sizes so the identity row keeps visual primacy. The
            completion ring is the third item: the percentage appears once
            (as the value — the arc itself carries no readout) with the
            status as the caption. dt stays first in the DOM for valid dl
            semantics; order utilities put the value on top visually. */}
        <dl className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 sm:mt-5 sm:gap-x-12">
          <div className="flex min-w-0 items-center gap-2.5">
            <Inbox aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
            <div className="flex min-w-0 flex-col">
              <dt className="order-2 truncate text-[11px] leading-tight text-stone">
                <span className="sm:hidden">Applied</span>
                <span className="hidden sm:inline">Applications</span>
              </dt>
              <dd className="num order-1 font-display text-sm font-medium leading-tight text-ink">{sortedApps.length}</dd>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2.5">
            <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
            <div className="flex min-w-0 flex-col">
              <dt className="order-2 truncate text-[11px] leading-tight text-stone">
                <span className="sm:hidden">Jobs</span>
                <span className="hidden sm:inline">Open Jobs</span>
              </dt>
              <dd className="num order-1 font-display text-sm font-medium leading-tight text-ink">{openJobs.length}</dd>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2.5">
            {ringPct !== null ? (
              <CompletionRing pct={ringPct} />
            ) : (
              <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-ash" />
            )}
            <div className="flex min-w-0 flex-col">
              <dt
                className={cn(
                  "order-2 truncate text-[11px] font-medium leading-tight",
                  profileComplete ? "text-ok" : "text-warn"
                )}
              >
                <span className="sm:hidden">{profileComplete ? "Complete" : "In progress"}</span>
                <span className="hidden sm:inline">
                  Profile {profileComplete ? "complete" : "in progress"}
                </span>
              </dt>
              <dd className="num order-1 font-display text-sm font-medium leading-tight text-ink">
                {ringPct !== null ? `${ringPct}%` : profileComplete ? "Complete" : "In progress"}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      {/* ===== Profile completion banner ===== */}
      {!profileComplete && (
        <div data-tour="profile-banner" className="dlg-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <IconChip icon={AlertCircle} tone="gold" size={36} iconSize={17} className="mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink sm:text-lg">Complete Your Profile</p>
              <p className="mt-0.5 text-sm text-stone">
                Finish your applicant profile to apply for positions and speed up processing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("profile")}
            className="dlg-cta focus-ring inline-flex min-h-[44px] w-fit shrink-0 items-center gap-2 px-6 py-2.5 text-sm"
          >
            Complete Profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ===== Two-pane workspace =======================================
           LEFT  · Open Positions — the scrollable browsing pane in the
           board job-card register. DESKTOP ONLY (Task 20): phones no
           longer carry this section — the same JobListCard list lives on
           the Jobs page (#/vacant-positions) below lg. RIGHT · Your
           Applications — sticky rail with its own overflow scroll, so
           statuses stay in view while the applicant browses. Mobile:
           renders Your Applications alone. ========================== */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        {/* ---- Right rail · Your Applications (first on mobile) ---- */}
        <aside data-tour="my-applications" className="order-1 min-w-0 lg:order-2 lg:col-span-5">
          <div className="flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
            {/* Rail header — pinned above the scrolling cards */}
            <div className="flex shrink-0 items-end justify-between gap-2 border-b border-border pb-4">
              <div>
                <p className="eyebrow">Your Applications</p>
                <h2 className="mt-1.5 text-xl font-medium tracking-[0.01em] text-ink sm:text-2xl">
                  In Progress
                </h2>
              </div>
              {sortedApps.length > 0 && <span className="status-pill status-neutral num">{sortedApps.length}</span>}
            </div>

            {/* Independently scrollable application cards */}
            <div className="scroll-thin mt-6 min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
              {sortedApps.length === 0 ? (
                <div className="dlg-card">
                  <EmptyState
                    icon={Inbox}
                    tone="plum"
                    title="No applications yet"
                    description="Browse open positions to start your application journey."
                    action={
                      <button
                        type="button"
                        onClick={() => navigate("vacant-positions")}
                        className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-6 py-2.5 text-sm"
                      >
                        <Briefcase className="h-4 w-4" aria-hidden="true" /> Browse Positions
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-4 pb-1">
                  {sortedApps.map((app, i) => (
                    <ApplicationJourneyCard key={app.id} app={app} index={i} onOpen={() => setDetail(app)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ---- Left pane · Job Openings (browsing surface — lg+ only;
             mobile browses on the Jobs page instead) ---- */}
        <section
          data-tour="apply-now"
          className="order-2 hidden min-w-0 lg:order-1 lg:col-span-7 lg:block"
        >
          <div className="flex items-end justify-between border-b border-border pb-4">
            <div>
              <p className="eyebrow">Job Openings</p>
              <h2 className="mt-1.5 text-xl font-medium tracking-[0.01em] text-ink sm:text-2xl">
                Apply Now
              </h2>
            </div>
            {openJobs.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("vacant-positions")}
                className="dlg-ghost hidden min-h-[44px] items-center gap-2 px-5 py-2 text-sm sm:inline-flex"
              >
                View All <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-6">
            {openJobs.length === 0 ? (
              <div className="dlg-card">
                <EmptyState
                  icon={Briefcase}
                  tone="amber"
                  title="No open positions right now"
                  description="New postings appear here as soon as they are published."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate("vacant-positions")}
                      className="dlg-ghost inline-flex min-h-[44px] items-center px-5 py-2 text-sm"
                    >
                      Browse All Jobs
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                {openJobs.map((j) => (
                  <JobListCard
                    key={j.id}
                    job={j}
                    applied={(j.applications ?? []).some((a) => isActiveApplicationStatus(a.status))}
                    expanded={expandedId === j.id}
                    saved={saved.includes(j.id)}
                    onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)}
                    onSave={() => toggleSave(j.id)}
                    onOpen={() => navigate("jobs", { job: String(j.id) })}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {detail && (
        <ApplicationDetailModal
          application={detail}
          onClose={() => setDetail(null)}
          onCancelled={() => {
            setDetail(null);
            void reload(true);
          }}
        />
      )}

      {/* QA 2026-02 — Guided tooltips for first-time users: proceed with the
          tutorial or dismiss/skip it (remembered per browser). */}
      <OnboardingTour
        storageKey="rmis.tour.applicant.v1"
        title="Welcome to the Applicant Portal"
        description="This quick guided tour points out the essentials: finish your profile, apply to vacancies, and track where you stand. You can skip it anytime."
        steps={[
          {
            selector: '[data-tour="profile-banner"]',
            title: "Complete your profile",
            body: "Fill out your Personal Data Sheet once. You can even upload your PDS and let RMIS auto-fill the forms. A complete profile is required before applying.",
          },
          {
            selector: '[data-tour="apply-now"]',
            title: "Apply Now",
            body: "Browse every open vacancy here. Expand a posting with the dropdown to read the full description, then continue to the posting to apply; your profile carries over.",
          },
          {
            selector: '[data-tour="my-applications"]',
            title: "Track your applications",
            body: "Every application you submit appears here with its live stage: from qualification screening to shortlisting, exams, and interviews.",
          },
        ]}
      />
    </div>
  );
}
