// ============================================================================
// RMIS — THE application-status vocabulary module (spec §4, single source of
// truth). Normalizes mixed stored spellings; defines pipeline stages, settable
// and queryable whitelists.
// ============================================================================

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const PIPELINE_STAGES = ["Applied", "Under Review", "Shortlisted", "Rejected"] as const;
export type StageKey = (typeof PIPELINE_STAGES)[number];

/** Every status this system has ever stored (both stored spellings). */
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  APPLIED: { label: "Applied", tone: "info" },
  PENDING: { label: "Pending", tone: "warning" },
  UNDER_REVIEW: { label: "Under Review", tone: "primary" },
  FOR_EVALUATION: { label: "Under Review", tone: "primary" },
  SCREENING: { label: "Under Review", tone: "primary" },
  EVALUATION: { label: "Under Review", tone: "primary" },
  FINAL_REVIEW: { label: "Under Review", tone: "primary" },
  EVALUATED: { label: "Under Review", tone: "primary" },
  INTERVIEW: { label: "Interview", tone: "primary" },
  SHORTLISTED: { label: "Shortlisted", tone: "success" },
  SELECTED: { label: "Selected", tone: "success" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  NEEDS_CORRECTION: { label: "Needs Correction", tone: "warning" },
  OPEN: { label: "Open", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
  Applied: { label: "Applied", tone: "info" },
  "Under Review": { label: "Under Review", tone: "primary" },
  Shortlisted: { label: "Shortlisted", tone: "success" },
  Rejected: { label: "Rejected", tone: "danger" },
};

export function getStatusMeta(status: string | null | undefined): { label: string; tone: Tone } {
  if (!status) return { label: "Pending", tone: "warning" };
  const hit = STATUS_MAP[status] || STATUS_MAP[status.toUpperCase().replace(/\s+/g, "_")];
  if (hit) return hit;
  return { label: status, tone: "neutral" };
}

/** Canonical pipeline grouping of ANY stored status spelling (spec §4.2). */
export function stageForStatus(status: string | null | undefined): StageKey {
  if (!status) return "Applied";
  const key = status.toUpperCase().replace(/\s+/g, "_");
  if (["APPLIED", "PENDING", "DRAFT", ""].includes(key) || status === "Applied") return "Applied";
  if (["UNDER_REVIEW", "FOR_EVALUATION", "SCREENING", "EVALUATION", "FINAL_REVIEW", "EVALUATED"].includes(key))
    return "Under Review";
  if (["SHORTLISTED", "INTERVIEW", "SELECTED", "APPROVED"].includes(key)) return "Shortlisted";
  if (["REJECTED", "DECLINED", "WITHDRAWN"].includes(key)) return "Rejected";
  return "Applied";
}

export function isRejectedStatus(status: string | null | undefined): boolean {
  const key = (status || "").toUpperCase().replace(/\s+/g, "_");
  return ["REJECTED", "DECLINED"].includes(key);
}

/** API-writable statuses (zod-validated) — both spellings. */
export const SETTABLE_STATUSES = [
  "Applied",
  "APPLIED",
  "Under Review",
  "UNDER_REVIEW",
  "Shortlisted",
  "SHORTLISTED",
  "Rejected",
  "REJECTED",
];

/** Queue-filterable statuses (both spellings); absent/invalid = ALL. */
export const QUERYABLE_STATUSES = [
  ...SETTABLE_STATUSES,
  "PENDING",
  "FOR_EVALUATION",
  "SCREENING",
  "EVALUATION",
  "EVALUATED",
  "FINAL_REVIEW",
  "INTERVIEW",
  "SELECTED",
  "APPROVED",
  "DECLINED",
  "NEEDS_CORRECTION",
];

/** Applicant-facing journey label (spec §7.3): Submitted / In Review / Shortlisted / Not Selected. */
export function currentStageLabel(status: string | null | undefined): string {
  const stage = stageForStatus(status);
  if (stage === "Applied") return "Submitted";
  if (stage === "Under Review") return "In Review";
  if (stage === "Shortlisted") return "Shortlisted";
  return "Not Selected";
}

// ── MOM 2026-10-13 — re-application support ──────────────────────────────────
// A previously rejected (or withdrawn) applicant may apply AGAIN to the same
// job listing (repost/republication). An application is "active" — and thus
// blocks a duplicate — only while it still sits in a live pipeline stage.

/** Terminal statuses that free the applicant to re-apply to the same posting. */
const TERMINAL_APPLICATION_STATUSES = new Set(["REJECTED", "DECLINED", "WITHDRAWN"]);

export function isTerminalApplicationStatus(status: string | null | undefined): boolean {
  return TERMINAL_APPLICATION_STATUSES.has((status || "").toUpperCase().replace(/\s+/g, "_"));
}

/** True while the application still occupies the pipeline (blocks duplicates). */
export function isActiveApplicationStatus(status: string | null | undefined): boolean {
  return !isTerminalApplicationStatus(status);
}
