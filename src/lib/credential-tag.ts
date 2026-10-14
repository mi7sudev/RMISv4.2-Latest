// ============================================================================
// RMIS — single credential highlight for applicant cards (kanban + queues).
// Product rule: each applicant card shows ONE credential tag — education
// first, then training, then eligibility. Previously every snapshot row
// became a chip and kanban cards overflowed to "+N", so the board now picks
// the single most representative credential (frozen snapshot — never live).
// ============================================================================

type EduRow = {
  educationLevel?: string | null;
  degree?: string | null;
  course?: string | null;
  specifyOthers?: string | null;
};
type TrainRow = { title?: string | null };
type EligRow = { title?: string | null };

/** Education level rank for display ordering (higher = more advanced). */
function eduRank(row: EduRow): number {
  const text = `${row.educationLevel || ""} ${row.degree || ""} ${row.course || ""}`.toLowerCase();
  if (/graduate|post[-\s]?grad|master|phd|doctor/.test(text)) return 5;
  if (/bachelor|college/.test(text)) return 4;
  if (/vocational|trade|technical/.test(text)) return 3;
  if (/secondary|high school|senior high/.test(text)) return 2;
  if (/elementary/.test(text)) return 1;
  return 0;
}

/** Placeholder labels that carry no information ("N/A", "-", "none"…). */
function isJunkLabel(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (!t) return true;
  return ["n/a", "na", "n a", "-", "--", "none", "null", "0"].includes(t);
}

/** Collapse whitespace runs and trim. */
function clean(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * ONE credential tag per applicant card, fallback order:
 *   1. Education — the most advanced entry with a real course/degree label;
 *      if every entry's label is junk, the highest entry's level name.
 *   2. Training — first training title.
 *   3. Eligibility — first eligibility title.
 * Returns "" when the applicant has no credentials at all (card shows no tag).
 */
export function credentialTagFor(snap: {
  educations?: EduRow[] | null;
  trainings?: TrainRow[] | null;
  eligibilities?: EligRow[] | null;
}): string {
  // 1) Education — highest level first; first entry with a real label wins.
  const edus = [...(snap.educations ?? [])].sort((a, b) => eduRank(b) - eduRank(a));
  for (const e of edus) {
    const label = clean(e.course) || clean(e.degree) || clean(e.specifyOthers);
    if (label && !isJunkLabel(label)) return label;
  }
  const topLevel = clean(edus[0]?.educationLevel);
  if (topLevel && !isJunkLabel(topLevel)) return topLevel;

  // 2) Training
  const training = clean(snap.trainings?.[0]?.title);
  if (training && !isJunkLabel(training)) return training;

  // 3) Eligibility
  const eligibility = clean(snap.eligibilities?.[0]?.title);
  if (eligibility && !isJunkLabel(eligibility)) return eligibility;

  return "";
}
