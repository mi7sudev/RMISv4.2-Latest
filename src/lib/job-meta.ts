// ============================================================================
// RMIS — shared job display helpers.
// Single source for the posting-place / publish-date read used by every job
// surface (public landing, applicant job cards, staff boards). Previously
// copy-pasted in public-landing.tsx and jobs/job-openings-card.tsx.
// ============================================================================

import type { JobWire } from "@/lib/router";
import type { StatusVariant } from "@/lib/status-ui";
import { deadlineState } from "@/lib/client";

/** Agency address shown when a posting has no place of assignment. */
export const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display place — nested position read, then the agency address. */
export function jobPlace(job: JobWire): string {
  return job.position?.placeOfAssignment ?? PLACE_FALLBACK;
}

/** Posting age source — editorial publish date, else the record timestamp. */
export function postedAt(job: JobWire): string {
  return job.publishDate ?? job.publishedAt;
}

// ── Deadline semantics (date-only) ──────────────────────────────────────────
// One predicate for EVERY deadline comparison. Previously four copies with
// TWO different semantics: the server gates and the applicant list filters
// used date-only startOfToday(), while job-openings-card/public-landing
// compared against Date.now() — so a posting closing TODAY rendered a red
// "Deadline passed" badge while the apply gate still accepted it. Date-only
// is the spec semantic: a posting closes at midnight tonight, not at the
// moment of the request.

/** Start of today, local time. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True when a non-null deadline is before today (date-only). */
export function jobDeadlinePassed(deadline: string | Date | null | undefined): boolean {
  return deadline != null && new Date(deadline) < startOfToday();
}

/** Posting is open when it has no deadline, or the deadline is today or later. */
export function jobIsActive(deadline: string | Date | null | undefined): boolean {
  return !jobDeadlinePassed(deadline);
}

// ── Job status ladder (THE one job-status badge vocabulary) ────────────────
// One resolver behind every job-status badge — the staff Jobs table, the job
// workspace header AND the vacant-positions board — so a posting shows the
// same status story with the same badge treatment everywhere. Labels come
// from deadlineState (lib/client), the vocabulary the public pages already
// speak; variants follow the system badge tints (bad=red ✕, warn=amber ⚠,
// ok=green ✓, neutral=gray ○):
//   Closed (unpublished or deadline passed)      → bad
//   Closing today / Closing in N days (≤ 7)      → warn
//   N days left (≤ 30)                           → neutral
//   Open (deadline further out)                  → ok
//   Open until filled (no deadline)              → neutral
export type JobStatusView = {
  label: string;
  variant: StatusVariant;
  /** Open/Closed family — backs the staff table's status filter. */
  family: "open" | "closed";
};

export function jobStatusView(
  job: Pick<JobWire, "isActive" | "deadlineDate">,
): JobStatusView {
  const dl = deadlineState(job.deadlineDate);
  if (job.isActive === false || dl.overdue) {
    return { label: "Closed", variant: "bad", family: "closed" };
  }
  if (dl.closingSoon) {
    return { label: dl.label, variant: "warn", family: "open" };
  }
  if (dl.label === "Open until filled") {
    return { label: dl.label, variant: "neutral", family: "open" };
  }
  if (dl.label === "Open") {
    return { label: dl.label, variant: "ok", family: "open" };
  }
  return { label: dl.label, variant: "neutral", family: "open" };
}
