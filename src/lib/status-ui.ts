// ============================================================================
// RMIS — status → UI variant mapping (presentation layer).
// Bridges lib/status.ts tone vocabulary onto the Dialog functional status
// system defined in globals.css (ok / warn / bad / info / neutral).
// UI-only: no business logic lives here.
// ============================================================================

export type StatusVariant = "ok" | "warn" | "bad" | "info" | "neutral";

import type { AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import { Check, Inbox, ScanSearch, X, type LucideIcon } from "lucide-react";
import { getStatusMeta, stageForStatus, type Tone, type StageKey } from "@/lib/status";

/** Functional variant → official BEUI AnimatedBadge status
 *  (beui.dev/components/motion/animated-badge). The single mapping behind
 *  StatusPill / VerdictPill so every chip in the system speaks BEUI. */
export const BADGE_STATUS: Record<StatusVariant, AnimatedBadgeStatus> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
  info: "info",
  neutral: "neutral",
};

const TONE_TO_VARIANT: Record<Tone, StatusVariant> = {
  success: "ok",
  warning: "warn",
  danger: "bad",
  info: "info",
  // "primary" statuses are the in-review family (Under Review / Screening /
  // Evaluation / Interview…). User directive (non-negotiable): the amber
  // chip rendered the AnimatedBadge WARNING triangle — an orange danger
  // sign — which is the wrong glyph AND hue for an in-review application.
  // The in-review family is an active informational state, so it renders
  // as the info chip (brand-blue tint + Info glyph) everywhere: applicant
  // journey pills, review queue, staff tables and pipeline dots agree.
  primary: "info",
  neutral: "neutral",
};

/** Pipeline stage → functional variant. Shared by the job workspace pipeline,
 *  the analytics funnel and the candidate mini-pipeline so the three always
 *  agree on hue AND glyph. */
export const STAGE_VARIANT: Record<StageKey, StatusVariant> = {
  "Applied": "info",
  "Under Review": "info",
  "Shortlisted": "ok",
  "Rejected": "bad",
};

/** Applicant-facing journey labels (spec §7.3) → variant. Single mapping for
 *  the applicant portal timeline, tracker chips and board badges. */
export const APPLICANT_STAGE_VARIANT: Record<string, StatusVariant> = {
  "Submitted": "info",
  "In Review": "info",
  "Shortlisted": "ok",
  "Not Selected": "bad",
};

/** Pipeline stage → data-viz color token (funnels, sparklines, pipelines).
 *  The chart series speak the viz palette; UI chips speak the status tints —
 *  both keyed off the same stage vocabulary so nothing drifts. */
export const STAGE_VIZ: Record<StageKey, string> = {
  "Applied": "var(--viz-1)",
  "Under Review": "var(--viz-3)",
  "Shortlisted": "var(--viz-2)",
  "Rejected": "var(--bad)",
};

// ── Stage icon vocabulary (QA 2026-02) ──────────────────────────────────────

/** Pipeline stage → semantic Lucide glyph — the ONE stage icon vocabulary.
 *  Kanban StageDot (board columns + queue filter chips), the analytics
 *  funnel, candidate mini-pipelines, job pipeline headers and candidate-detail
 *  rows all draw from this map so a stage never changes icon between pages.
 *  Applied and Under Review deliberately share the blue info TINT, so the
 *  GLYPH is what tells them apart: Applied = Inbox (the application was
 *  received), Under Review = ScanSearch (being screened — the same glyph as
 *  the Start Review CTA). The old paper-plane (Send) read as "send message"
 *  and rendered identically on both stages — retired. Shortlisted / Rejected
 *  keep the system check / x that the badges and CSS pills already speak. */
export const STAGE_GLYPH: Record<StageKey, LucideIcon> = {
  "Applied": Inbox,
  "Under Review": ScanSearch,
  "Shortlisted": Check,
  "Rejected": X,
};

/** Stored-status spellings whose AnimatedBadge glyph should match the stage
 *  dots (applicant-facing labels included). Every other status keeps the
 *  badge defaults, which are already correct: success ✓ · danger ✕ ·
 *  warning ⚠ · info (i) · neutral ○. Only the two blue families need the
 *  re-point — they share one variant, so the badge alone can't tell
 *  "Applied" from "Under Review". Keys are normalized lowercase display
 *  forms (underscores/case folded by glyphForStatus); exported as a RECORD
 *  so render paths can do static member lookups (react-hooks lint rejects
 *  JSX types that come from function calls). */
export const PILL_STAGE_GLYPH: Readonly<Record<string, LucideIcon>> = {
  applied: Inbox,
  pending: Inbox,
  submitted: Inbox,
  "under review": ScanSearch,
  "for evaluation": ScanSearch,
  screening: ScanSearch,
  evaluation: ScanSearch,
  "final review": ScanSearch,
  evaluated: ScanSearch,
  "in review": ScanSearch,
};

export function glyphForStatus(status: string | null | undefined): LucideIcon | null {
  if (!status) return null;
  return PILL_STAGE_GLYPH[status.trim().toLowerCase().replace(/[_\s]+/g, " ")] ?? null;
}

/** Canonical variant for ANY stored application/job status spelling. */
export function variantForStatus(status: string | null | undefined): StatusVariant {
  return TONE_TO_VARIANT[getStatusMeta(status).tone];
}

/** MQR / requirements verdict → variant. */
export function variantForVerdict(verdict: string | null | undefined): StatusVariant {
  const v = (verdict || "").toLowerCase();
  if (v.includes("not qualified") || v === "no" || v === "unqualified") return "bad";
  if (v === "partial" || v.includes("partial")) return "warn";
  if (v.includes("qualified") || v === "yes" || v === "met" || v.includes("met")) return "ok";
  return "neutral";
}

/** Document status → variant. The single mapping behind every document
 *  status chip (profile Documents, review dossier, candidate detail,
 *  preview modal). Badge semantics follow the system status language:
 *    UPLOADED            → ok    (success ✓ — the file is on record; the old
 *                                  neutral chip rendered the AnimatedBadge's
 *                                  EMPTY CIRCLE, which elsewhere in the system
 *                                  means "no state / inactive" — wrong for a
 *                                  completed upload)
 *    PROCESSING          → info  (in-flight extraction; documentStatusMeta
 *                                  flags it so StatusPill renders the official
 *                                  syncing badge — spinner + breathing tint)
 *    EXTRACTED           → ok    (success ✓)
 *    PARTIALLY_EXTRACTED → warn  (⚠)
 *    FAILED              → bad   (✕) */
export function variantForDocStatus(
  status: string | null | undefined
): StatusVariant | null {
  const key = (status || "").toUpperCase();
  if (key === "EXTRACTED") return "ok";
  if (key === "PARTIALLY_EXTRACTED") return "warn";
  if (key === "FAILED") return "bad";
  if (key === "PROCESSING") return "info";
  if (key === "UPLOADED") return "ok";
  return null;
}

/** Document status → the ONE label + variant + pulse vocabulary shared by
 *  every document row in the system. `pulse` marks in-flight states so the
 *  pill renders as the BEUI syncing badge (spinning loader + breathing tint)
 *  while keeping the domain label — the same convention as the applicant
 *  progress "In Review" syncing badge. Null for unknown stored statuses
 *  (no chip rather than a lying one). */
export type DocumentStatusMeta = {
  label: string;
  variant: StatusVariant;
  pulse: boolean;
};

export function documentStatusMeta(
  status: string | null | undefined
): DocumentStatusMeta | null {
  const variant = variantForDocStatus(status);
  if (!variant) return null;
  switch ((status || "").toUpperCase()) {
    case "PARTIALLY_EXTRACTED":
      return { label: "Partial", variant, pulse: false };
    case "PROCESSING":
      return { label: "Processing", variant, pulse: true };
    case "EXTRACTED":
      return { label: "Extracted", variant, pulse: false };
    case "FAILED":
      return { label: "Failed", variant, pulse: false };
    default:
      return { label: "Uploaded", variant, pulse: false };
  }
}

/** Profile completion state → variant. */
export function variantForCompletion(complete: boolean | null | undefined): StatusVariant {
  if (complete === true) return "ok";
  if (complete === false) return "warn";
  return "neutral";
}

/** Job posting status → variant (OPEN is hiring = ok; CLOSED neutral). */
export function variantForJobStatus(status: string | null | undefined): StatusVariant {
  const key = (status || "").toUpperCase();
  if (key === "OPEN") return "ok";
  if (key === "CLOSED") return "neutral";
  return variantForStatus(status);
}

/** CSS class for the status-pill primitive in globals.css. */
export function pillClass(variant: StatusVariant): string {
  return `status-pill status-${variant}`;
}
