// ============================================================================
// RMIS — MQR evaluation engine (spec §8.1). Binary pass/fail per dimension;
// MOM-mandated verdict strings; enforced server-side at apply; never persisted.
// ============================================================================

export type MqrResult = {
  education: string;
  eligibility: string;
  workExperience: string;
  training: string;
};

export type MqrInput = {
  education: { course?: string | null; specifyOthers?: string | null; degree?: string | null }[];
  eligibilities: { title?: string | null }[];
  workExperiences: { yearDecimal?: number | null }[];
  trainings: { hourDecimal?: number | null; numberHours?: number | null }[];
};

export type MqrPosition = {
  cscEducation?: string | null;
  cscEligibilityGroup?: string | null;
  cscWorkExperience?: string | null;
  cscTraining?: string | null;
};

export const MQR_MEETS = "Meets the minimum requirements";
export const MQR_FAILS = "Does not meet the minimum requirements";

const GENERIC_WORDS = new Set([
  "bachelor", "bachelors", "degree", "of", "in", "arts", "major", "minor",
  "course", "program", "career", "service", "to", "the", "science",
]);

const ELIGIBILITY_STOPWORDS = new Set([
  "career", "service", "eligibility", "second", "level", "professional",
]);

export function tokenize(text: string | null | undefined, stop = GENERIC_WORDS): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !stop.has(t));
}

function extractFirstNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const paren = text.match(/\((\d+)\)/);
  if (paren) return Number(paren[1]);
  const bare = text.match(/\d+(\.\d+)?/);
  if (bare) return Number(bare[0]);
  return 0;
}

export function verifyMqr(applicant: MqrInput, position: MqrPosition): MqrResult {
  // ── Education: token match (spec §8.1) ──────────────────────────────────
  const reqTokens = tokenize(position.cscEducation);
  const applicantEduTokens = new Set<string>();
  for (const e of applicant.education) {
    for (const t of [...tokenize(e.course), ...tokenize(e.specifyOthers), ...tokenize(e.degree)]) {
      applicantEduTokens.add(t);
    }
  }
  let education: string;
  const reqEmpty = !position.cscEducation || position.cscEducation.trim() === "";
  const isRelevant = (position.cscEducation || "").toLowerCase().includes("relevant");
  if (reqEmpty || isRelevant) {
    education = applicantEduTokens.size > 0 ? MQR_MEETS : MQR_FAILS;
  } else {
    const matched = reqTokens.filter((t) => applicantEduTokens.has(t)).length;
    const hasBachelor = applicantEduTokens.has("bachelor");
    const threshold = hasBachelor ? Math.min(1, reqTokens.length) : Math.min(2, reqTokens.length);
    education = matched >= threshold ? MQR_MEETS : MQR_FAILS;
  }

  // ── Eligibility: subset match (spec §8.1) ───────────────────────────────
  const eligReq = (position.cscEligibilityGroup || "").trim();
  const eligLower = eligReq.toLowerCase();
  const eligTokens = tokenize(eligReq, ELIGIBILITY_STOPWORDS);
  const applicantEligTokens: string[] = applicant.eligibilities.flatMap((e) => tokenize(e.title));
  let eligibility: string;
  if (!eligReq || ["n/a", "na", "none"].includes(eligLower)) {
    eligibility = MQR_MEETS;
  } else if (eligTokens.length === 0) {
    // Boilerplate-only requirement → hold ANY eligibility.
    eligibility = applicantEligTokens.length > 0 ? MQR_MEETS : MQR_FAILS;
  } else {
    const ok = eligTokens.every((t) => applicantEligTokens.includes(t));
    eligibility = ok ? MQR_MEETS : MQR_FAILS;
  }

  // ── Work experience: quantity (spec §8.1) ───────────────────────────────
  const requiredYears = extractFirstNumber(position.cscWorkExperience);
  const totalYears = applicant.workExperiences.reduce((sum, w) => sum + (w.yearDecimal ?? 0), 0);
  const workExperience = requiredYears === 0 || totalYears >= requiredYears
    ? MQR_MEETS
    : MQR_FAILS;

  // ── Training: quantity (spec §8.1) ──────────────────────────────────────
  const requiredHours = extractFirstNumber(position.cscTraining);
  const totalHours = applicant.trainings.reduce(
    (sum, t) => sum + (t.hourDecimal ?? t.numberHours ?? 0),
    0
  );
  const training = requiredHours === 0 || totalHours >= requiredHours ? MQR_MEETS : MQR_FAILS;

  return { education, eligibility, workExperience, training };
}

export function allMet(results: MqrResult): boolean {
  return Object.values(results).every((v) => v === MQR_MEETS);
}

export function mqrDiagnostics(label: string, verdict: string, detail?: string): string {
  return verdict === MQR_MEETS ? `${label}: ${verdict}` : `${label}: ${verdict}${detail ? ` (${detail})` : ""}`;
}
