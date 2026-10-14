// ============================================================================
// RMIS — Reviewer-side requirements report (spec §8.2). Honest-uncertainty
// engine: recomputed LIVE from the application snapshots vs the live Position
// CSC standards. Never persisted. Status vocabulary per check:
//   MET | NOT_MET | NOT_REQUIRED | REVIEW
// Report verdicts: ALL_MET | PARTIAL | NONE_MET | NEEDS_REVIEW | NO_REQUIREMENTS
// ============================================================================

export type CheckStatus = "MET" | "NOT_MET" | "NOT_REQUIRED" | "REVIEW";

export type RequirementCheck = {
  dimension: "education" | "experience" | "training" | "eligibility";
  standard: string;
  status: CheckStatus;
  applicantSummary: string;
  evidence: string[];
  shortfall?: string;
};

export type RequirementsReport = {
  verdict: "ALL_MET" | "PARTIAL" | "NONE_MET" | "NEEDS_REVIEW" | "NO_REQUIREMENTS";
  metCount: number;
  requiredCount: number;
  checks: RequirementCheck[];
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, twenty: 20, twentyfour: 24, forty: 40, eighty: 80, hundred: 100,
};

const EDU_GENERIC = new Set([
  "bachelor", "bachelors", "degree", "of", "in", "arts", "major", "minor",
  "course", "program", "career", "service", "to", "the", "science", "grade",
  "shs", "hs", "senior", "junior", "high", "school", "graduate", "graduates",
  "relevant", "field", "study", "studies", "years", "year", "college",
  "vocational", "trade", "technical", "master", "masters", "doctorate", "phd",
]);

function isNotRequired(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (["n/a", "na", "none"].includes(t)) return true;
  if (t.includes("none required") || t.includes("not required")) return true;
  return false;
}

function extractQuantity(text: string | null | undefined, unit: "year" | "hour"): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (!lower.includes(unit)) return null; // no unit word at all → REVIEW
  const paren = text.match(/\((\d+)\)/);
  if (paren) return Number(paren[1]);
  const digitUnit = lower.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}s?`));
  if (digitUnit) return Number(digitUnit[1]);
  const word = Object.entries(WORD_NUMBERS).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower));
  if (word) return word[1];
  return 0;
}

function tokens(text: string | null | undefined, stop = EDU_GENERIC): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !stop.has(t));
}

// ── Education clause parser (spec §8.2) ─────────────────────────────────────

type EduClause = { minLevel: number; partialCollege: boolean; tokens: string[] };

const LEVEL_WORDS: [RegExp, number][] = [
  [/post[-\s]?grad|phd|doctor(ate)?/, 6],
  [/master|graduate studies|\bms\b|m\.s\./, 5],
  [/vocational|trade|technical/, 3],
  [/bachelor|\bbs\b|\bba\b|\bab\b|college|degree/, 4],
  [/high school|senior high|grade 12|\bshs\b|grade\s*10|junior high|\bhs\b/, 2],
  [/elementary/, 1],
];

function detectLevel(text: string): number {
  const lower = text.toLowerCase();
  // vocational/trade checked before bachelor (spec §8.2 ordering note)
  for (const [re, level] of LEVEL_WORDS) if (re.test(lower)) return level;
  return 4;
}

function parseEducationClauses(standard: string): EduClause[] {
  const alternatives = standard.split(/\s+or\s+|;/i).map((s) => s.trim()).filter(Boolean);
  return alternatives.map((alt) => {
    const lower = alt.toLowerCase();
    let minLevel = detectLevel(alt);
    const partialCollege = /\b(two|2)\s+years?\s+in\s+college\b/.test(lower);
    if (partialCollege) minLevel = 4;
    const relevant = lower.includes("relevant");
    return { minLevel, partialCollege, tokens: relevant ? [] : tokens(alt) };
  });
}

function eduLevelOf(row: { educationLevel?: string | null; degree?: string | null; course?: string | null }): number {
  const text = `${row.educationLevel || ""} ${row.degree || ""} ${row.course || ""}`.toLowerCase();
  if (/graduate|master|post/.test(text)) return 5;
  if (/bachelor|college/.test(text)) return 4;
  if (/vocational|trade|technical/.test(text)) return 3;
  if (/secondary|high school|senior high/.test(text)) return 2;
  if (/elementary/.test(text)) return 1;
  return 1;
}

// ── Eligibility alternatives (spec §8.2) ────────────────────────────────────

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function eligibilityMatches(standard: string, applicantEligs: { title: string; level?: number }[]): CheckStatus {
  const altsRaw = standard.split(/\/|,|;|\bor\b/i).map((s) => s.trim()).filter(Boolean);
  for (const alt of altsRaw) {
    const c = compact(alt);
    const isRa1080 = c.includes("ra1080");
    const isSub = /sub[-\s]?professional|first[-\s]?level/.test(alt.toLowerCase());
    const isProfessional = /professional|second[-\s]?level/.test(alt.toLowerCase()) && !isSub;
    const namedTokens = tokens(alt, new Set([...EDU_GENERIC, "eligibility", "career", "service", "level", "second", "first", "sub", "professional", "ra", "civil"]));
    const matched = applicantEligs.some((e) => {
      const level = e.level ?? (compact(e.title).includes("ra1080") ? 5 : /professional/i.test(e.title) && !/sub/i.test(e.title) ? 5 : /sub|first/i.test(e.title) ? 2 : 0);
      if (isRa1080) return compact(e.title).includes("ra1080") || level >= 5;
      if (isProfessional) return level >= 5 || (/professional/i.test(e.title) && !/sub/i.test(e.title));
      if (isSub) return level >= 2 || /sub|first[-\s]?level|professional/i.test(e.title);
      if (namedTokens.length > 0) return namedTokens.some((t) => e.title.toLowerCase().includes(t));
      return level >= 2; // unparseable → any eligibility
    });
    if (matched) return "MET";
  }
  return "NOT_MET";
}

// ── Report builder ──────────────────────────────────────────────────────────

export type SnapshotShape = {
  educations: { educationLevel?: string | null; degree?: string | null; course?: string | null; specifyOthers?: string | null; schoolName?: string | null; ongoing?: boolean | null; yearGraduated?: string | null }[];
  experiences: { positionTitle?: string | null; employerName?: string | null; yearDecimal?: number | null; isPresentWork?: boolean | null; dateFrom?: string | null; dateTo?: string | null }[];
  trainings: { title?: string | null; hourDecimal?: number | null; numberHours?: number | null }[];
  eligibilities: { title?: string | null; rating?: string | null }[];
};

export type PositionShape = {
  cscEducation?: string | null;
  cscEligibility?: string | null;
  cscEligibilityGroup?: string | null;
  cscWorkExperience?: string | null;
  cscTraining?: string | null;
};

function completed(row: { ongoing?: boolean | null; yearGraduated?: string | null }): boolean {
  if (row.ongoing) return false;
  return true; // presence of graduated year or absence of ongoing → assume completed
}

export function buildRequirementsReport(
  snapshot: SnapshotShape,
  position: PositionShape
): RequirementsReport {
  const checks: RequirementCheck[] = [];

  // ── Education ───────────────────────────────────────────────────────────
  if (isNotRequired(position.cscEducation)) {
    checks.push({ dimension: "education", standard: position.cscEducation || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.educations.length} education entr${snapshot.educations.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscEducation!;
    const bareNumber = /^\d+$/.test(standard.trim());
    if (bareNumber) {
      checks.push({ dimension: "education", standard, status: "REVIEW", applicantSummary: "Ambiguous standard, verify manually", evidence: [] });
    } else {
      const clauses = parseEducationClauses(standard);
      const matched = snapshot.educations.some((row) => {
        const level = eduLevelOf(row);
        const rowText = `${row.course || ""} ${row.degree || ""} ${row.specifyOthers || ""} ${row.schoolName || ""}`.toLowerCase();
        return clauses.some((c) =>
          level >= c.minLevel &&
          completed(row) &&
          (c.tokens.length === 0 || c.tokens.some((t) => rowText.includes(t)))
        );
      });
      checks.push({
        dimension: "education",
        standard,
        status: matched ? "MET" : "NOT_MET",
        applicantSummary: snapshot.educations.map((e) => [e.degree, e.course].filter(Boolean).join(", ") || e.educationLevel || "Education entry").slice(0, 3).join("; ") || "None on file",
        evidence: snapshot.educations.slice(0, 3).map((e) => `${[e.educationLevel, e.degree || e.course].filter(Boolean).join(" · ")}${e.schoolName ? `, ${e.schoolName}` : ""}`),
        shortfall: matched ? undefined : "Minimum required education level not met",
      });
    }
  }

  // ── Experience ──────────────────────────────────────────────────────────
  if (isNotRequired(position.cscWorkExperience)) {
    checks.push({ dimension: "experience", standard: position.cscWorkExperience || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.experiences.length} work entr${snapshot.experiences.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscWorkExperience!;
    const required = extractQuantity(standard, "year");
    const total = snapshot.experiences.reduce((s, w) => s + (w.yearDecimal ?? 0), 0);
    if (required === null) {
      checks.push({ dimension: "experience", standard, status: "REVIEW", applicantSummary: `${total.toFixed(1)} years on file, verify manually`, evidence: [] });
    } else if (required === 0) {
      checks.push({ dimension: "experience", standard, status: "NOT_REQUIRED", applicantSummary: "No minimum stated", evidence: [] });
    } else {
      checks.push({
        dimension: "experience",
        standard,
        status: total >= required ? "MET" : "NOT_MET",
        applicantSummary: `${total.toFixed(1)} of ${required} year(s) on file`,
        evidence: snapshot.experiences.slice(0, 3).map((w) => `${w.positionTitle || "Work"} at ${w.employerName || "Employer"} (${(w.yearDecimal ?? 0).toFixed(1)} yr)`),
        shortfall: total >= required ? undefined : `${Math.max(0, required - total).toFixed(1)} more years of relevant experience needed`,
      });
    }
  }

  // ── Training ────────────────────────────────────────────────────────────
  if (isNotRequired(position.cscTraining)) {
    checks.push({ dimension: "training", standard: position.cscTraining || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.trainings.length} training entr${snapshot.trainings.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscTraining!;
    const required = extractQuantity(standard, "hour");
    const total = snapshot.trainings.reduce((s, t) => s + (t.hourDecimal ?? t.numberHours ?? 0), 0);
    if (required === null) {
      checks.push({ dimension: "training", standard, status: "REVIEW", applicantSummary: `${total} hours on file, verify manually`, evidence: [] });
    } else if (required === 0) {
      checks.push({ dimension: "training", standard, status: "NOT_REQUIRED", applicantSummary: "No minimum stated", evidence: [] });
    } else {
      checks.push({
        dimension: "training",
        standard,
        status: total >= required ? "MET" : "NOT_MET",
        applicantSummary: `${total} of ${required} hour(s) on file`,
        evidence: snapshot.trainings.slice(0, 3).map((t) => `${t.title || "Training"} (${t.hourDecimal ?? t.numberHours ?? 0} hr)`),
        shortfall: total >= required ? undefined : `${Math.max(0, required - total)} more hours of relevant training needed`,
      });
    }
  }

  // ── Eligibility ─────────────────────────────────────────────────────────
  if (isNotRequired(position.cscEligibilityGroup) && isNotRequired(position.cscEligibility)) {
    checks.push({ dimension: "eligibility", standard: position.cscEligibilityGroup || position.cscEligibility || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.eligibilities.length} on file`, evidence: [] });
  } else {
    const standard = (position.cscEligibilityGroup || position.cscEligibility || "").trim();
    const lower = standard.toLowerCase();
    if (["n/a", "na", "none", ""].includes(lower)) {
      checks.push({ dimension: "eligibility", standard, status: "NOT_REQUIRED", applicantSummary: "Not required", evidence: [] });
    } else {
      const applicantEligs = snapshot.eligibilities.map((e) => ({ title: e.title || e.rating || "", level: undefined as number | undefined }));
      const status = eligibilityMatches(standard, applicantEligs);
      checks.push({
        dimension: "eligibility",
        standard,
        status,
        applicantSummary: snapshot.eligibilities.map((e) => e.title).filter(Boolean).slice(0, 3).join("; ") || "None on file",
        evidence: snapshot.eligibilities.slice(0, 3).map((e) => `${e.title}${e.rating ? ` (rating ${e.rating})` : ""}`),
        shortfall: status === "NOT_MET" ? "Required civil-service eligibility not held" : undefined,
      });
    }
  }

  const relevant = checks.filter((c) => c.status !== "NOT_REQUIRED");
  const requiredCount = relevant.length;
  const metCount = relevant.filter((c) => c.status === "MET").length;
  const hasReview = relevant.some((c) => c.status === "REVIEW");
  const hasNotMet = relevant.some((c) => c.status === "NOT_MET");

  let verdict: RequirementsReport["verdict"];
  if (requiredCount === 0) verdict = "NO_REQUIREMENTS";
  else if (metCount === requiredCount) verdict = "ALL_MET";
  else if (metCount === 0 && !hasReview) verdict = "NONE_MET";
  else if (hasReview || metCount > 0) verdict = hasNotMet ? "PARTIAL" : "NEEDS_REVIEW";
  else verdict = "PARTIAL";

  return { verdict, metCount, requiredCount, checks };
}
