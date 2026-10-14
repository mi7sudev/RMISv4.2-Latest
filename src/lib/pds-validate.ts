// ============================================================================
// RMIS — PDS validation, normalization & quality scoring (server-side).
// Enterprise parity layer (cf. Affinda/RChilli validation suites):
//   1. NORMALIZE  — ISO-ish dates, PH mobile numbers, emails, whitespace,
//                   numeric salaries/hours — deterministic, per-field rules.
//   2. VALIDATE   — per-field format checks + cross-field consistency
//                   (date ordering, plausible ages, future-date guards).
//   3. SCORE      — transparent weighted quality score 0–100 (coverage +
//                   depth + confidence − issue penalties) with a letter grade
//                   and a per-issue report the UI can surface as "needs review".
// The score is NOT a guess about truth — it measures how completely and
// consistently the document was read, the way enterprise parsers do.
// ============================================================================

import type { ExtractionResult, ExtractionSection, ConfidentValue } from "./pds-extract";

export type QualityIssue = {
  severity: "error" | "warning";
  section: string;
  field: string;
  message: string;
};

export type QualityReport = {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  fieldsExtracted: number;
  needsReview: number; // low-confidence values + flagged issues
  issues: QualityIssue[];
};

// ── Normalization helpers ────────────────────────────────────────────────────

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** PH mobile: 09171234567 / +639171234567 / 639171234567 → 09171234567. */
export function normalizePhMobile(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("639")) d = `0${d.slice(2)}`;
  else if (d.startsWith("63") && d.length === 12) d = `0${d.slice(2)}`;
  if (/^9\d{9}$/.test(d)) d = `0${d}`;
  return /^0\d{10}$/.test(d) ? d : clean(raw);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Excel-serial or string → YYYY-MM-DD ("" when not a recognizable date). */
export function normalizeIsoDate(raw: string): string {
  const s = clean(raw);
  if (!s) return "";
  const num = Number(s);
  if (!Number.isNaN(num) && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return d.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    // Ambiguous mm/dd vs dd/mm is resolved by the only safe signal: a value
    // over 12 cannot be a month. Otherwise default to month-first (2017 PDS).
    const mo = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    return `${dmy[3]}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) return parsed.toISOString().slice(0, 10);
  return "";
}

// ── Per-section normalization ────────────────────────────────────────────────

function normCV(v: ConfidentValue | undefined, fn: (s: string) => string): ConfidentValue | undefined {
  if (!v || v.value == null) return v;
  const t = fn(String(v.value));
  return t === "" ? undefined : { ...v, value: t };
}

const stripNonNum = (s: string): string => s.replace(/[^\d.]/g, "");

function normalizeSection(section: ExtractionSection | undefined, rules: Record<string, (s: string) => string>): ExtractionSection | undefined {
  if (!section) return section;
  const out: ExtractionSection = {};
  for (const [k, v] of Object.entries(section)) {
    const rule = rules[k];
    const nv = rule ? normCV(v, rule) : v;
    if (nv && nv.value != null && nv.value !== "") out[k] = nv;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const PERSONAL_RULES: Record<string, (s: string) => string> = {
  firstName: clean,
  middleName: clean,
  lastName: clean,
  extensionName: (s) => clean(s).replace(/\.$/, ""),
  birthPlace: clean,
  emailAddress: (s) => clean(s).toLowerCase(),
  mobileNumber: normalizePhMobile,
  telephoneNumber: normalizePhMobile,
  zipCode: (s) => clean(s).replace(/\D/g, "").slice(0, 4),
  gsis: (s) => clean(s).replace(/[\s-]/g, ""),
  pagibig: (s) => clean(s).replace(/[\s-]/g, ""),
  philhealth: (s) => clean(s).replace(/[\s-]/g, ""),
  sss: (s) => clean(s).replace(/[\s-]/g, ""),
  tin: (s) => clean(s).replace(/[\s-]/g, ""),
  umidNumber: (s) => clean(s).replace(/[\s-]/g, ""),
  agencyEmployeeNo: clean,
  height: clean,
  weight: clean,
  bloodType: (s) => {
    const t = clean(s).toUpperCase();
    return /^(A|B|AB|O)[+-]$/.test(t) ? t : clean(s);
  },
};

const ROW_RULES: Record<string, (s: string) => string> = {
  monthlySalary: (s) => stripNonNum(s),
  numberHours: (s) => stripNonNum(s),
  dateFrom: normalizeIsoDate,
  dateTo: normalizeIsoDate,
  examDate: normalizeIsoDate,
  licenseValidity: normalizeIsoDate,
  dateGranted: normalizeIsoDate,
  email: (s) => clean(s).toLowerCase(),
  yearFrom: (s) => clean(s).replace(/\D/g, "").slice(0, 4),
  yearTo: (s) => clean(s).replace(/\D/g, "").slice(0, 4),
  yearGraduated: (s) => clean(s).replace(/\D/g, "").slice(0, 4),
};

function normalizeRows(rows: ExtractionSection[] | undefined): ExtractionSection[] | undefined {
  if (!rows?.length) return rows;
  return rows.map((row) => normalizeSection(row, ROW_RULES) ?? {}).filter((r) => Object.keys(r).length > 0);
}

// ── Validation ───────────────────────────────────────────────────────────────

const TODAY = () => new Date();

function addIssue(issues: QualityIssue[], sev: QualityIssue["severity"], section: string, field: string, message: string) {
  issues.push({ severity: sev, section, field, message });
}

function ageFrom(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = TODAY().getTime() - d.getTime();
  return diff / (365.25 * 86_400_000);
}

function validateExtractionStructure(result: ExtractionResult, issues: QualityIssue[]): { lowConfidence: number } {
  let lowConfidence = 0;
  const bump = (v: ConfidentValue | undefined) => {
    if (v && v.value != null && v.value !== "" && v.confidence === "low") lowConfidence++;
  };

  const p = result.personalInfo;
  if (p) {
    const email = p.emailAddress?.value;
    if (email != null && !EMAIL_RE.test(String(email))) {
      addIssue(issues, "warning", "personalInfo", "emailAddress", `Email address does not look valid ("${String(email).slice(0, 60)}")`);
    }
    const mobile = p.mobileNumber?.value;
    if (mobile != null && !/^0\d{10}$/.test(String(mobile).replace(/\D/g, ""))) {
      addIssue(issues, "warning", "personalInfo", "mobileNumber", `Mobile number is not a standard PH format ("${String(mobile).slice(0, 20)}")`);
    }
    const birth = p.birthDate?.value;
    if (birth != null) {
      const iso = normalizeIsoDate(String(birth));
      if (!iso) addIssue(issues, "error", "personalInfo", "birthDate", `Date of birth is not a recognizable date ("${String(birth).slice(0, 20)}")`);
      else {
        const age = ageFrom(iso);
        if (age != null && (age < 15 || age > 80)) {
          addIssue(issues, "error", "personalInfo", "birthDate", `Date of birth implies implausible age (${Math.round(age)})`);
        }
      }
    }
    for (const v of Object.values(p)) bump(v);
  }

  const year = (s: string | number | null | undefined): number | null => {
    const m = s == null ? null : String(s).match(/\d{4}/);
    return m ? Number(m[0]) : null;
  };

  for (const e of result.educations ?? []) {
    const from = year(e.yearFrom?.value);
    const to = year(e.yearTo?.value);
    const grad = year(e.yearGraduated?.value);
    if (from && to && from > to) {
      addIssue(issues, "warning", "educations", "yearFrom", `Education years reversed (${from} → ${to})`);
    }
    const thisYear = TODAY().getFullYear();
    for (const [label, y] of [["yearFrom", from], ["yearTo", to], ["yearGraduated", grad]] as const) {
      if (y && (y < 1940 || y > thisYear)) {
        addIssue(issues, "warning", "educations", label, `Year ${y} is outside a plausible range`);
      }
    }
    for (const v of Object.values(e)) bump(v);
  }

  for (const w of result.workExperiences ?? []) {
    const from = normalizeIsoDate(String(w.dateFrom?.value ?? ""));
    const to = normalizeIsoDate(String(w.dateTo?.value ?? ""));
    if (from && to && from > to) {
      addIssue(issues, "error", "workExperiences", "dateFrom", `Work dates reversed (${from} → ${to})`);
    }
    if (from) {
      const y = Number(from.slice(0, 4));
      if (y < 1950 || y > TODAY().getFullYear()) {
        addIssue(issues, "warning", "workExperiences", "dateFrom", `Work start year ${y} looks implausible`);
      }
    }
    for (const v of Object.values(w)) bump(v);
  }

  for (const t of result.trainings ?? []) {
    const from = normalizeIsoDate(String(t.dateFrom?.value ?? ""));
    const to = normalizeIsoDate(String(t.dateTo?.value ?? ""));
    if (from && to && from > to) {
      addIssue(issues, "warning", "trainings", "dateFrom", `Training dates reversed (${from} → ${to})`);
    }
    const h = Number(String(t.numberHours?.value ?? ""));
    if (Number.isFinite(h) && h > 0 && h > 2000) {
      addIssue(issues, "warning", "trainings", "numberHours", `Training hours (${h}) exceed a plausible single-program maximum`);
    }
    for (const v of Object.values(t)) bump(v);
  }

  for (const arr of [result.eligibilities, result.awards, result.voluntaryWork, result.specialSkills]) {
    for (const row of arr ?? []) for (const v of Object.values(row)) bump(v);
  }
  return { lowConfidence };
}

// ── Quality score ────────────────────────────────────────────────────────────

const CORE_PERSONAL = [
  "lastName", "firstName", "middleName", "birthDate", "gender", "civilStatus",
  "citizenship", "mobileNumber", "emailAddress", "city", "province",
] as const;

/**
 * Weighted 0–100 quality score:
 *   coverage 60 — core personal fields + presence/depth of each section
 *   confidence 25 — high=1, medium=0.6, low=0.25 share of extracted values
 *   penalties 15 — subtracted per validation issue (error 7, warning 2.5)
 */
export function scoreQuality(result: ExtractionResult): QualityReport {
  const issues: QualityIssue[] = [];
  const { lowConfidence } = validateExtractionStructure(result, issues);

  const countFields = (s?: ExtractionSection) => Object.values(s ?? {}).filter((v) => v && v.value !== null && v.value !== "").length;

  // Coverage (60)
  let coverage = 0;
  const p = result.personalInfo;
  const coreHit = CORE_PERSONAL.filter((f) => countFields({ [f]: p?.[f] }) > 0).length;
  coverage += (coreHit / CORE_PERSONAL.length) * 30; // up to 30
  const sectionPresence: Array<[ExtractionSection[] | undefined, number]> = [
    [result.educations, 9],
    [result.workExperiences, 9],
    [result.trainings, 5],
    [result.eligibilities, 4],
    [result.awards, 3],
  ];
  for (const [rows, pts] of sectionPresence) {
    if (rows && rows.length > 0) coverage += Math.min(1, rows.length / 2) * pts;
  }

  // Confidence (25)
  const hist = { high: 0, medium: 0, low: 0 };
  const tally = (s?: ExtractionSection) => {
    for (const v of Object.values(s ?? {})) {
      if (v && v.value !== null && v.value !== "") hist[v.confidence === "high" ? "high" : v.confidence === "medium" ? "medium" : "low"]++;
    }
  };
  tally(result.personalInfo);
  for (const arr of [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards, result.voluntaryWork, result.specialSkills]) {
    for (const row of arr ?? []) tally(row);
  }
  const totalConf = hist.high + hist.medium + hist.low;
  const confPts = totalConf === 0 ? 0 : ((hist.high + hist.medium * 0.6 + hist.low * 0.25) / totalConf) * 25;

  // Penalties (max 15)
  const penalty = Math.min(15, issues.reduce((s, i) => s + (i.severity === "error" ? 7 : 2.5), 0));

  const score = Math.max(0, Math.min(100, Math.round(coverage + confPts - penalty)));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  const fieldsExtracted =
    countFields(result.personalInfo) +
    [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards, result.voluntaryWork, result.specialSkills]
      .flatMap((arr) => arr ?? [])
      .reduce((s, row) => s + countFields(row), 0);

  return {
    score,
    grade,
    fieldsExtracted,
    needsReview: lowConfidence + issues.length,
    issues: issues.slice(0, 12),
  };
}

/**
 * Normalize + validate an extraction in place. Returns the same object with
 * values canonicalized and `quality` + `meta` attached.
 */
export function finalizeExtraction<T extends ExtractionResult>(result: T, meta: ExtractionResult["meta"]): T {
  result.personalInfo = normalizeSection(result.personalInfo, PERSONAL_RULES);
  result.educations = normalizeRows(result.educations);
  result.workExperiences = normalizeRows(result.workExperiences);
  result.trainings = normalizeRows(result.trainings);
  result.eligibilities = normalizeRows(result.eligibilities);
  result.awards = normalizeRows(result.awards);
  result.voluntaryWork = normalizeRows(result.voluntaryWork);
  result.specialSkills = normalizeRows(result.specialSkills);
  result.meta = meta;
  result.quality = scoreQuality(result);
  return result;
}
