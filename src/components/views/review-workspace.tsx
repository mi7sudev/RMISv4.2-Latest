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
// Rail polish 2 (user QA 2026-02): "Requirements match" cards now lead with
// their category (Education / Experience / Training / Eligibility) — the old
// layout buried the dimension in a bottom-right chip that read like a stray
// word after the content — and a segmented scorecard meter visualizes
// "N of M standards met" (one segment per relevant check, colored by its
// status). Dimensions that are not required collapse to a single muted line
// under a "Not required for this posting" caption, killing the old
// "None required" + "Not required" double-say.
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
// Candidate-page redesign (user direction, reference screenshot): the dossier
// reads like a modern ATS candidate page — ONE header card (avatar · name +
// status pill · icon meta · key-facts grid · Send Email · pipeline stepper
// with a days counter), then a STACKED card dossier on the left (About, Work
// Experience, Education, Training, Eligibility, Awards, Documents — the
// capsule tabs are gone) and the decision rail on the right (matching panel
// with a big match %, an expandable check list and a grounded AI Summary
// card backed by GET /api/evaluator/applications/[id]/summary; credentials
// as chips). Every handler, fetch and dialog is unchanged.
// MOM 2026-10-14 — the BEUI pill navs return as JUMP LINKS directly below
// the "Work Experience" card: they scroll the stacked dossier to Education /
// Training / Eligibility / Awards / Documents and their animated pill tracks
// the section currently in view (scroll-spy), so navigation feels like the
// old tabs while every card stays visible in the stacked flow.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import {
  AlertTriangle, ArrowUpRight, Award, BadgeCheck, BookOpen, Briefcase, BriefcaseBusiness,
  CalendarCheck, Check, ChevronDown, Eye, FileText, Gavel, GraduationCap, History, Inbox,
  ListChecks, Mail, MapPin, Phone,
  CheckCircle2, Minus, Mails, Paperclip, Plus, RotateCcw, ScanSearch, Send, Sparkles, Tag, Trash2, UserRound, Video, X, XCircle,
  type LucideIcon,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/forms/textarea";
import { useAuthErrors } from "@/components/forms/field-errors";
import {
  EmptyNote, EmptyState, IconChip, MonogramAvatar, PageHeader, SkeletonRows,
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
import type { RequirementCheck, RequirementsReport } from "@/lib/requirements";

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

/** Requirement dimension → display label + icon (same icon vocabulary as
    the Credentials on file grid and the dossier tabs). */
const DIMENSION_META: Record<
  RequirementCheck["dimension"],
  { label: string; icon: typeof GraduationCap }
> = {
  education: { label: "Education", icon: GraduationCap },
  experience: { label: "Experience", icon: BriefcaseBusiness },
  training: { label: "Training", icon: BookOpen },
  eligibility: { label: "Eligibility", icon: BadgeCheck },
};

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

// ── Candidate-dossier visual kit (reference-matched redesign) ────────────────

/** Plain dossier card (title + optional count pill + body) — the reference
    design's stacked "About" / "Work Experience" card anatomy. `id` anchors a
    card for the jump navs below "Work Experience"; the scroll margin keeps a
    jumped-to card clear of the dialog edge / the mobile sticky header. */
function SectionCard({ title, count, id, children }: { title: string; count?: number; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="dlg-card scroll-mt-20 p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {typeof count === "number" && (
          <span className="dlg-pill num bg-fog px-2 py-0.5 text-[10px] font-medium text-stone">{count}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── Dossier jump navs (below "Work Experience") ──────────────────
// MOM 2026-10-14 — user direction: keep the reference stacked-card dossier,
// but bring back the pre-redesign BEUI pill navs as jump links. The strip
// sits directly below the "Work Experience" card and scrolls the dossier to
// Education / Training / Eligibility / Awards / Documents. The animated pill
// (official motion Tabs, variant="pill") follows the section currently in
// view via a scroll-spy, so it navigates like the old tabs without hiding
// any content.

const SECTION_NAV_ITEMS = [
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "training", label: "Training", icon: BookOpen },
  { id: "eligibility", label: "Eligibility", icon: BadgeCheck },
  { id: "awards", label: "Awards", icon: Award },
  { id: "documents", label: "Documents", icon: FileText },
] as const;

/** Innermost ancestor of `el` with a vertical scrollbar (null → the document
    itself is the scroller — the full-page evaluator view scrolls the window). */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function DossierSectionNav({ idPrefix }: { idPrefix: string }) {
  const ids = useMemo(() => SECTION_NAV_ITEMS.map((s) => `${idPrefix}-${s.id}`), [idPrefix]);
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);
  // Hold the pill on the clicked section for the length of the smooth glide
  // — the scroll-spy stands down while the pin is live.
  const pinUntil = useRef(0);
  const [active, setActive] = useState(ids[0]);

  // Scroll-spy: one rAF-throttled measure pass per scroll frame, computed
  // from viewport-relative rects so it works for BOTH scrollers — the review
  // modal's DialogContent and the full-page evaluator window flow.
  useEffect(() => {
    const SPY_LINE = 176; // px from the viewport top
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (Date.now() < pinUntil.current) return;
      const currentIds = idsRef.current;
      const lastEl = document.getElementById(currentIds[currentIds.length - 1]);
      const scroller = lastEl ? scrollParentOf(lastEl) : null;
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
        : window.innerHeight + window.scrollY >= (document.documentElement.scrollHeight || 0) - 4;
      // 1) Classic rule — the card straddling the spy line is the active one.
      let current = "";
      for (const id of currentIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= SPY_LINE && r.bottom > SPY_LINE) {
          current = id;
          break;
        }
      }
      // 2) Short-card fallback — the modal's scroll range can run out before
      //    later cards ever climb to the line (dossiers with few rows), so
      //    when nothing straddles, the topmost card still on screen wins.
      //    This keeps the pill advancing card-by-card instead of skipping.
      if (!current) {
        for (const id of currentIds) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().bottom > SPY_LINE) {
            current = id;
            break;
          }
        }
      }
      if (!current) current = currentIds[0];
      // 3) Bottom edge — a short tail can never push the last card up to the
      //    line, so at the very bottom of the scroll the final section wins.
      if (atBottom && lastEl && lastEl.getBoundingClientRect().top > SPY_LINE) {
        current = currentIds[currentIds.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const jump = (id: string) => {
    setActive(id);
    pinUntil.current = Date.now() + 1200;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label="Jump to a dossier section">
      <Tabs variant="pill" value={active} onValueChange={jump}>
        <TabsList>
          {SECTION_NAV_ITEMS.map((s, i) => (
            <TabsTrigger key={s.id} value={ids[i]} className="gap-1.5">
              <s.icon className="size-3.5" aria-hidden />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

/** Whole days since the application landed (clamped ≥ 0). */
function daysSince(dateIso: string): number {
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** "2 yrs 6 mos" duration from an experience row's date range. */
function experienceDuration(row: SnapRow): string {
  const from = new Date(str(row.dateFrom)).getTime();
  const to = row.isPresentWork === true ? Date.now() : new Date(str(row.dateTo)).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "";
  const months = Math.max(0, Math.floor((to - from) / (30.44 * 86_400_000)));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : "", m ? `${m} mo${m === 1 ? "" : "s"}` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Deterministic employer mark — pastel tile with initials (the reference
    design's company-logo slot; RMIS snapshots carry no logos). Hues avoid
    the brand blue; the mix with var(--card)/var(--ink) adapts to dark mode. */
const MARK_HUES = [16, 42, 88, 152, 322, 352] as const;
function CompanyMark({ name }: { name: string }) {
  const hue = MARK_HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % MARK_HUES.length];
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-[13px] font-semibold"
      style={{
        background: `color-mix(in srgb, hsl(${hue} 75% 50%) 12%, var(--card))`,
        borderColor: `color-mix(in srgb, hsl(${hue} 75% 50%) 25%, transparent)`,
        color: `color-mix(in srgb, hsl(${hue} 70% 42%) 70%, var(--ink))`,
      }}
    >
      {initials}
    </span>
  );
}

// ── Pipeline stepper (header card) ──────────────────────────────────────────
// The reference design's horizontal stage tracker, mapped onto the REAL RMIS
// pipeline (lib/status.ts): Applied → Under Review → Shortlisted, with the
// offline "Appointment" step as the gray forward marker (mirrors the
// applicant journey modal's Face-to-face step). Rejected collapses the path
// to Applied → (Under Review) → the terminal red node labelled with the
// stored status — glyphs reuse the canonical stage vocabulary.

type StepperNode = {
  key: string;
  label: string;
  icon: LucideIcon;
  state: "done" | "current" | "todo";
  terminal?: boolean;
};

function StageStepper({ status, dateApplied }: { status: string; dateApplied: string }) {
  const stage = stageForStatus(status);
  const days = daysSince(dateApplied);
  const successPath: StepperNode[] = [
    { key: "applied", label: "Applied", icon: Inbox, state: "todo" },
    { key: "review", label: "Under Review", icon: ScanSearch, state: "todo" },
    { key: "shortlisted", label: "Shortlisted", icon: Check, state: "todo" },
    { key: "appointment", label: "Appointment", icon: CalendarCheck, state: "todo" },
  ];
  let nodes: StepperNode[];
  if (stage === "Rejected") {
    const terminalLabel = getStatusMeta(status).label;
    nodes = [
      { ...successPath[0], state: "done" },
      { ...successPath[1], state: "todo" },
      {
        key: "terminal",
        label: terminalLabel === "Rejected" ? "Not Qualified" : terminalLabel,
        icon: XCircle,
        state: "current",
        terminal: true,
      },
    ];
  } else {
    const idx = successPath.findIndex((n) => n.label === stage);
    nodes = successPath.map((n, i) => ({ ...n, state: i < idx ? "done" : i === idx ? "current" : "todo" }));
  }
  const nodeStyle = (n: StepperNode): CSSProperties =>
    n.terminal
      ? { background: "var(--bad)", color: "#ffffff" }
      : n.state === "done"
        ? { background: "var(--primary)", color: "#ffffff" }
        : n.state === "current"
          ? { background: "var(--card)", border: "2px solid var(--primary)", color: "var(--primary)" }
          : { background: "var(--card)", border: "1.5px solid var(--divider)", color: "var(--pebble)" };
  const connectorColor = (left: StepperNode, right: StepperNode) =>
    right.terminal ? "var(--bad)" : left.state === "done" ? "var(--primary)" : "var(--divider)";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <ol aria-label="Application pipeline" className="flex min-w-[320px] flex-1 items-start overflow-x-auto scroll-thin pb-1">
        {nodes.map((n, i) => (
          <li key={n.key} className={cn("flex items-start", i < nodes.length - 1 ? "flex-1" : "shrink-0")}>
            <div className="flex w-[76px] shrink-0 flex-col items-center gap-1 text-center sm:w-20">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full" style={nodeStyle(n)}>
                <n.icon className="h-4 w-4" />
              </span>
              <p
                className={cn(
                  "text-[11px] leading-4",
                  n.state === "current"
                    ? n.terminal
                      ? "font-medium text-[var(--bad)]"
                      : "font-medium text-[var(--primary)]"
                    : "text-stone"
                )}
              >
                <span className="sr-only">Step {i + 1}: </span>
                {n.label}
              </p>
              {n.key === "applied" && (
                <p className="num text-[10px] leading-tight text-pebble">{formatDate(dateApplied)}</p>
              )}
            </div>
            {i < nodes.length - 1 && (
              <span
                aria-hidden
                className="mt-[19px] h-[2px] min-w-4 flex-1 rounded-full"
                style={{ background: connectorColor(n, nodes[i + 1]) }}
              />
            )}
          </li>
        ))}
      </ol>
      {/* Days counter — the reference card's right end. RMIS tracks the
          application date, not per-stage entry dates, so the caption stays
          honest ("since applied") instead of borrowing "in current stage". */}
      <div className="shrink-0 rounded-2xl bg-fog px-5 py-3 text-center">
        <p className="num text-lg font-semibold leading-6 text-ink">
          {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-stone">since applied</p>
      </div>
    </div>
  );
}

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

/** Reference-style Work Experience — employer mark + bold employer, role,
    dates · computed duration · employment type. */
function WorkExperienceCard({ rows }: { rows: SnapRow[] }) {
  if (!rows.length) return <EmptyNote>No work experience entries on file.</EmptyNote>;
  return (
    <div className="space-y-4">
      {rows.map((r, i) => {
        const employer = str(r.employerName);
        const role = str(r.positionTitle);
        const dur = experienceDuration(r);
        return (
          <div key={i} className="flex gap-3.5">
            <CompanyMark name={employer || role || "Entry"} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{employer || role || "—"}</p>
              {employer && role && <p className="mt-0.5 text-[13px] text-body-gray">{role}</p>}
              <p className="num mt-1 text-xs leading-4 text-stone">
                {[
                  (str(r.dateFrom) || str(r.dateTo)) &&
                    `${snapshotDisplayDate(r.dateFrom) || "—"} – ${
                      r.isPresentWork ? "Present" : snapshotDisplayDate(r.dateTo) || "—"
                    }`,
                  dur,
                  str(r.statusOfEmployment),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
          </div>
        );
      })}
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

// ── "About" card ────────────────────────────────────────────────────────────
// Composed bio (experience → education → eligibility) plus the contact rows,
// personal facts and character references the old Profile tab carried — the
// reference design's About card, grounded in the frozen snapshot.

function AboutCard({ payload }: { payload: ReviewPayload }) {
  const p = payload.snapshots.profile ?? {};
  const refs = Array.isArray(p.characterReferences) ? (p.characterReferences as SnapRow[]) : [];
  const exps = payload.snapshots.experiences;
  const edus = payload.snapshots.educations;
  const eligs = payload.snapshots.eligibilities;

  // Experience span → opening sentence.
  let earliest: number | null = null;
  let latestEnd: number | null = null;
  for (const r of exps) {
    const f = Date.parse(str(r.dateFrom));
    if (!Number.isNaN(f)) earliest = earliest === null ? f : Math.min(earliest, f);
    const t = r.isPresentWork === true ? Date.now() : Date.parse(str(r.dateTo));
    if (!Number.isNaN(t)) latestEnd = latestEnd === null ? t : Math.max(latestEnd, t);
  }
  const years =
    earliest !== null && latestEnd !== null ? Math.floor((latestEnd - earliest) / (365.25 * 86_400_000)) : 0;
  const current = exps.find((r) => r.isPresentWork === true) ?? exps[exps.length - 1];
  const openLabel =
    years >= 1
      ? `${years}+ year${years === 1 ? "" : "s"} of professional experience`
      : exps.length
        ? "Early-career professional"
        : "";
  const s1 = exps.length
    ? `${openLabel || "Work history on file"}${
        current
          ? `, most recently as ${str(current.positionTitle) || "a role"}${
              str(current.employerName) ? ` at ${str(current.employerName)}` : ""
            }`
          : ""
      }.`
    : "";
  const edu = edus[0];
  const eduCourse = edu ? str(edu.course) || str(edu.degree) : "";
  const s2 = edu
    ? `Holds ${str(edu.educationLevel) || "a degree"}${eduCourse ? ` in ${eduCourse}` : ""}${
        str(edu.schoolName) ? ` from ${str(edu.schoolName)}` : ""
      }${str(edu.yearGraduated) ? `, graduated ${str(edu.yearGraduated)}` : ""}.`
    : "";
  const eligTitles = eligs.map((e) => str(e.title) || str(e.eligibilityTitle)).filter(Boolean);
  const s3 = eligTitles.length
    ? `Civil service eligibility: ${eligTitles.slice(0, 2).join(" and ")}${eligTitles.length > 2 ? ", among others" : ""}.`
    : "";
  const bio = [s1, s2, s3].filter(Boolean).join(" ") || "No profile summary on file yet — review the credential sections below.";

  const contact = [
    { icon: Mail, value: str(p.emailAddress) || str(payload.applicant.emailAddress) },
    { icon: Phone, value: str(p.mobileNumber) || str(p.contactNumber) },
    { icon: MapPin, value: str(p.presentAddress) },
  ].filter((r) => r.value);
  const facts = [
    { label: "Gender", value: str(p.gender) },
    { label: "Civil status", value: str(p.civilStatus) },
    { label: "Birth date", value: snapshotDisplayDate(p.birthDate) },
    { label: "Birth place", value: str(p.birthPlace) },
  ].filter((f) => f.value);

  return (
    <SectionCard title="About">
      <p className="text-[13px] leading-relaxed text-body-gray">{bio}</p>
      {contact.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {contact.map(({ icon: Icon, value }, i) => (
            <p key={i} className="flex items-center gap-2 text-[13px] text-stone">
              <Icon className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
              <span className="min-w-0 truncate" title={value}>
                {value}
              </span>
            </p>
          ))}
        </div>
      )}
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-divider pt-3 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-pebble">{f.label}</dt>
              <dd className="num mt-0.5 truncate text-xs font-medium text-ink" title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {refs.length > 0 && (
        <div className="mt-4 border-t border-divider pt-3">
          <p className="text-xs font-medium text-stone">Character references</p>
          <ul className="mt-1.5 space-y-1">
            {refs.map((r, i) => (
              <li key={i} className="text-[13px] text-ink">
                {[str(r.name), str(r.address), str(r.telephone) || str(r.contactNumber)].filter(Boolean).join(" · ") || "-"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function MatchingPanel({ report, applicationId }: { report: RequirementsReport; applicationId: number }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const meaning = VERDICT_MEANING[report.verdict] ?? "";
  const relevant = report.checks.filter((c) => c.status !== "NOT_REQUIRED");
  const notRequired = report.checks.filter((c) => c.status === "NOT_REQUIRED");
  // Reference layout: one big percentage where the old segmented meter was —
  // the segmented scorecard folds into "N of M requirements matched".
  const pct = report.requiredCount > 0 ? Math.round((report.metCount / report.requiredCount) * 100) : null;
  return (
    <section className="dlg-card p-5">
      <div className="flex items-center gap-3">
        <IconChip icon={ListChecks} tone="blue" size={36} iconSize={16} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">Skill &amp; Experience Matching</h3>
          <p className="mt-0.5 text-xs text-stone">{meaning}</p>
        </div>
        <VerdictPill verdict={report.verdict} className="shrink-0" />
      </div>
      {pct !== null && (
        <div className="mt-4">
          <p className="text-3xl font-semibold leading-8 tracking-tight text-ink" aria-label={`${pct} percent match`}>
            {pct}%
          </p>
          <p className="mt-1 text-xs text-stone">
            {report.metCount} of {report.requiredCount} requirements matched
          </p>
        </div>
      )}
      {report.checks.length > 0 ? (
        <div className="mt-3 max-h-96 space-y-0.5 overflow-y-auto scroll-thin">
          {/* Check list — reference-style plain rows (icon + standard); each
              row expands to the full standard, the on-file summary and any
              shortfall so no requirement detail was lost in the restyle. */}
          {relevant.map((c, i) => {
            const cc = checkChip(c.status);
            const dim = DIMENSION_META[c.dimension];
            const open = openIdx === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="focus-ring flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-fog"
                >
                  <cc.icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      cc.tone === "emerald"
                        ? "text-[var(--ok)]"
                        : cc.tone === "rose"
                          ? "text-[var(--bad)]"
                          : "text-[var(--warn)]"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{c.standard || dim.label}</span>
                    <span className="block truncate text-[11px] text-stone">
                      {dim.label} · {c.applicantSummary || "nothing on file"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-pebble transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="mb-1 rounded-lg bg-white p-3">
                    <p className="text-[13px] leading-5 text-ink">{c.standard || "—"}</p>
                    <p className="num mt-1 text-xs leading-5 text-stone">{c.applicantSummary || "No applicant data on file."}</p>
                    {c.shortfall && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs leading-5 text-[var(--bad)]">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span className="min-w-0">{c.shortfall}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Dimensions the posting does not require collapse to one muted
              line each — no more "None required" + "Not required" double-say. */}
          {notRequired.length > 0 && (
            <div className="mt-2 rounded-lg bg-white/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-pebble">
                Not required for this posting
              </p>
              <div className="mt-1.5 space-y-1.5">
                {notRequired.map((c, i) => {
                  const dim = DIMENSION_META[c.dimension];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <dim.icon className="h-3.5 w-3.5 shrink-0 text-pebble" aria-hidden />
                      <span className="shrink-0 text-xs font-medium text-stone">{dim.label}</span>
                      <span className="num min-w-0 truncate text-right text-xs text-pebble">
                        {c.applicantSummary || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone">No published standards to check.</p>
      )}
      <AiSummaryCard applicationId={applicationId} report={report} />
    </section>
  );
}

/** "AI Summary" box — grounded fit summary fetched from the backend LLM
    route (which falls back to a deterministic composition; the loading state
    is a quiet shimmer and a failed request simply hides the box). */
function AiSummaryCard({ applicationId, report }: { applicationId: number; report: RequirementsReport }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSummary(null);
    apiFetch<{ summary: string }>(`/api/evaluator/applications/${applicationId}/summary`)
      .then((r) => {
        if (alive) {
          setSummary(r.summary);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applicationId, report.verdict, report.metCount, report.requiredCount]);
  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-divider bg-fog/50 p-4" aria-hidden>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-4/5" />
      </div>
    );
  }
  if (!summary) return null;
  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--primary) 8%, var(--card))" }}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-metric-blue">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        AI Summary
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-body-gray">{summary}</p>
      <p className="mt-2 text-[10px] text-pebble">
        Auto-generated from the frozen snapshot — verify against the source documents.
      </p>
    </div>
  );
}

function CredentialsRow({ payload }: { payload: ReviewPayload }) {
  const p = payload.snapshots.profile;
  const personalCount = p ? Object.values(p).filter((v) => v !== null && v !== "" && v !== undefined).length : 0;
  // Reference-style chips — one chip per credential section with its count;
  // zeros render muted so an empty section never reads as an error.
  const items: { label: string; count: number; icon: LucideIcon }[] = [
    { label: "Personal", count: personalCount, icon: UserRound },
    { label: "Education", count: payload.snapshots.educations.length, icon: GraduationCap },
    { label: "Work", count: payload.snapshots.experiences.length, icon: BriefcaseBusiness },
    { label: "Training", count: payload.snapshots.trainings.length, icon: BookOpen },
    { label: "Eligibility", count: payload.snapshots.eligibilities.length, icon: BadgeCheck },
    { label: "Awards", count: payload.snapshots.awards.length, icon: Award },
    { label: "Documents", count: payload.snapshots.documents.length, icon: FileText },
  ];
  return (
    <section className="dlg-card p-5">
      <h3 className="text-sm font-semibold text-ink">Credentials on file</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(({ label, count, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fog px-3 py-1.5 text-xs text-stone"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
            <span className={cn("num font-semibold", count === 0 ? "text-pebble" : "text-ink")}>{count}</span>
          </span>
        ))}
      </div>
    </section>
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
  const [emailOpen, setEmailOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);
  // Unique anchor prefix for the dossier jump navs — the review modal and the
  // full-page evaluator view each get their own id scope so their scroll-spies
  // can never cross-fire.
  const dossierNavPrefix = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-dossier`;

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
      <div className="space-y-5">
        {/* Header card skeleton — identity row, key-facts row, stepper band */}
        <div className="dlg-card space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-5">
            <div className="dlg-card space-y-3 p-5">
              <Skeleton className="h-4 w-16" />
              <SkeletonRows rows={3} />
            </div>
            <div className="dlg-card space-y-3 p-5">
              <Skeleton className="h-4 w-36" />
              <SkeletonRows rows={2} />
            </div>
          </div>
          <div className="space-y-5">
            <div className="dlg-card space-y-3 p-5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-8 w-16" />
              <SkeletonRows rows={3} rowClassName="h-7" />
            </div>
            <div className="dlg-card space-y-3 p-5">
              <Skeleton className="h-4 w-36" />
              <SkeletonRows rows={3} rowClassName="h-7" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const positionTitle = payload.job.position?.positionTitle || payload.job.title;
  const place = payload.job.position?.placeOfAssignment ?? null;
  // MOM 2026-10-13 — the evaluator must see re-application history: this
  // applicant previously applied (and was rejected) for THIS job listing.
  const prior = payload.priorRejections ?? null;
  const stageLabel = getStatusMeta(payload.status).label;

  return (
    <div className="space-y-5">
      {/* ── Header card: identity → icon meta → key-facts grid → Send Email →
          pipeline stepper (reference candidate-page anatomy) ── */}
      <div className="dlg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <MonogramAvatar name={applicantName} size={56} warm />
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-xl font-semibold leading-tight tracking-[0.01em] text-ink sm:text-2xl">{applicantName}</h2>
              <StatusPill status={payload.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-body-gray">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-stone" aria-hidden />
                <span className="truncate">{positionTitle}</span>
              </span>
              {place && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-stone" aria-hidden />
                  <span className="truncate">{place}</span>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="focus-ring ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-divider bg-card px-4 text-sm font-medium text-ink transition-colors hover:bg-fog"
            onClick={() => navigate("candidate", { id: String(payload.applicant.id) })}
          >
            Full profile
            <ArrowUpRight className="h-4 w-4 text-stone" aria-hidden />
          </button>
        </div>

        {/* Key facts + the primary send action (the reference's meta grid) */}
        <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-4">
          {[
            { label: "Applied on", value: formatDate(payload.dateApplied) },
            { label: "Job applied", value: positionTitle },
            { label: "Current stage", value: stageLabel },
            {
              label: "Requirements",
              value:
                payload.requirements.requiredCount > 0
                  ? `${payload.requirements.metCount} of ${payload.requirements.requiredCount} met`
                  : "—",
            },
          ].map((m) => (
            <div key={m.label} className="min-w-0">
              <p className="text-[11px] leading-4 text-body-gray">{m.label}</p>
              <p className="mt-0.5 max-w-[220px] truncate text-sm font-semibold text-ink" title={m.value}>
                {m.value}
              </p>
            </div>
          ))}
          <button
            type="button"
            className={ctaBtn + " ml-auto"}
            disabled={!email}
            title={email ? "Send a direct email to the applicant" : "No email on record for this applicant"}
            onClick={() => setEmailOpen(true)}
          >
            <Mail className="h-4 w-4" aria-hidden />
            Send Email
          </button>
        </div>

        {/* Pipeline stepper + days counter */}
        <div className="mt-5 border-t border-divider pt-5">
          <StageStepper status={payload.status} dateApplied={payload.dateApplied} />
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

      {/* ── Body: stacked dossier cards LEFT · decision rail RIGHT ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <AboutCard payload={payload} />
          <SectionCard title="Work Experience" count={payload.snapshots.experiences.length || undefined}>
            <WorkExperienceCard rows={payload.snapshots.experiences} />
          </SectionCard>
          {/* MOM 2026-10-14 — jump navs back below "Work Experience": the
              reference redesign stacked every section, so these pill navs
              (the pre-redesign BEUI tab look) jump straight to each credential
              section and their pill follows the scroll. */}
          <DossierSectionNav idPrefix={dossierNavPrefix} />
          <SectionCard id={`${dossierNavPrefix}-education`} title="Education" count={payload.snapshots.educations.length || undefined}>
            <EducationCards rows={payload.snapshots.educations} />
          </SectionCard>
          <SectionCard id={`${dossierNavPrefix}-training`} title="Training" count={payload.snapshots.trainings.length || undefined}>
            <TrainingCards rows={payload.snapshots.trainings} />
          </SectionCard>
          <SectionCard id={`${dossierNavPrefix}-eligibility`} title="Eligibility" count={payload.snapshots.eligibilities.length || undefined}>
            <EligibilityCards rows={payload.snapshots.eligibilities} />
          </SectionCard>
          <SectionCard id={`${dossierNavPrefix}-awards`} title="Awards" count={payload.snapshots.awards.length || undefined}>
            <AwardCards rows={payload.snapshots.awards} />
          </SectionCard>
          <SectionCard id={`${dossierNavPrefix}-documents`} title="Documents" count={payload.snapshots.documents.length || undefined}>
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
          </SectionCard>

          {/* Document preview modal (shared) — opened from the Documents rows. */}
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
          <MatchingPanel report={payload.requirements} applicationId={applicationId} />
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

      {/* Direct email composer — the header card's "Send Email" action */}
      {emailOpen && email && (
        <DirectEmailDialog
          applicationId={applicationId}
          to={email}
          onClose={() => setEmailOpen(false)}
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
