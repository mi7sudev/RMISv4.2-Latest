// ============================================================================
// RMIS — Document extraction pipeline (spec §8.5 deterministic PDS parser,
// §8.6 AI fallback). SERVER-SIDE ONLY.
//   xlsx/xls/xlsm → deterministic label-anchored parser first, AI fallback
//   pdf  → unpdf text → AI      docx → mammoth text → AI      images → AI vision
// Prompt contract: extract only what is clearly present; NEVER fabricate;
// not found ⇒ null + confidence "none"; dates → YYYY-MM-DD; JSON only.
// The deterministic parser is VERSION-ADAPTIVE: it handles the official
// multi-sheet CS Form 212 — Revised 2017 AND Revised 2026 (agency copies of
// both, e.g. "SIMBAJON_…(2017 Revised Edition)….xlsx", "cs form 2026.xlsx") —
// plus its continuation sheets and older/lower single-sheet legacy PDS
// layouts, by probing labels with boilerplate stripped and resolving table
// columns from their header rows instead of assuming one template's geometry.
// 2026 deltas handled: dd/mm/yyyy dates (day-first parsing), "SEX AT BIRTH",
// UMID/PhilSys ID labels, L&D (VI) before Voluntary Work (VII), "Continue on
// sheet C<n>" notes, "Valid Until" license columns, C5–C11 continuation sheets.
// ============================================================================

import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { finalizeExtraction, type QualityReport } from "./pds-validate";

export type ConfidentValue = { value: string | number | boolean | null; confidence: "high" | "medium" | "low" | "none" };
export type ExtractionSection = Record<string, ConfidentValue>;
export type ExtractionResult = {
  personalInfo?: ExtractionSection;
  educations?: ExtractionSection[];
  workExperiences?: ExtractionSection[];
  trainings?: ExtractionSection[];
  eligibilities?: ExtractionSection[];
  awards?: ExtractionSection[];
  voluntaryWork?: ExtractionSection[];
  specialSkills?: ExtractionSection[];
  warnings?: string[];
  /** Enterprise observability: how this document was read. */
  meta?: { parserPath: "deterministic" | "ai" | "hybrid" | "vision"; formRevision: string | null; durationMs: number };
  /** Attached by the validation layer (pds-validate). */
  quality?: QualityReport;
};

const cv = (value: string | number | null, confidence: ConfidentValue["confidence"] = "high"): ConfidentValue =>
  ({ value: value === "" ? null : value, confidence });

// ── Deterministic PDS parsing (CS Form 212 — version-adaptive) ──────────────

// Roman-numeral section titles ("IV. CIVIL SERVICE ELIGIBILITY", "VII.
// LEARNING AND DEVELOPMENT …") must never anchor a table — the real table
// header sits 1–2 rows below them. "(Continue on separate sheet …)" notes,
// signature rows, and template disclaimer banners are never data.
const NOISE = /cs\s*form|page\s*\d+\s*of|signature|do not abbreviate|^\s*[ivx]+\.\s*$|^\s*[ivxlc]+\s*\.\s|^section\b|continue\s*on\s*(a\s+)?(the\s+)?(separate\s+)?sheet|continue\s*on\s*separate|administering|e-?signature|over-\s*mark|demonstration\s*data|do\s*not\s*submit/i;

// Template sub-captions printed inside value areas ("House/Block/Lot No.",
// "NAME EXTENSION (JR., SR)", "Pls. indicate country:") — never applicant
// data, so label scanners must hop over them.
const CAPTION_RE = /name\s*extension|house\/?block|^street$|subdivision\/?village|city\/?municipality|^barangay$|^province$|^zip\s*code|if\s*holder|pls\.?\s*indicate|dual\s*citizenship|by\s*birth|by\s*naturalization|inclusive\s*dates|write\s*in\s*full|continue\s*on|do\s*not\s*abbreviate/i;

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "object" && v !== null) {
    const obj = v as { text?: string; result?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (obj.result != null) return String(obj.result);
    return "";
  }
  return String(v).replace(/\s+/g, " ").trim();
}

// Percent-formatted numeric cells (CSC exam ratings are stored as 0.8853 with
// a "0.00%" display format) must surface as "88.53%", not a raw fraction.
function cellDisplay(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
  if (cell && typeof cell.v === "number" && typeof cell.z === "string" && cell.z.includes("%") && Math.abs(cell.v) <= 1.5) {
    return `${Math.round(cell.v * 10000) / 100}%`;
  }
  return cellText(cell?.v);
}

// PDS versions differ in how much boilerplate they embed inside label cells
// ("POSITION TITLE (Write in full/Do not abbreviate)", "(mm/dd/yyyy)",
// "(Continue on separate sheet if necessary)"). Probing the text with
// parentheticals stripped keeps real headers recognizable while page footers
// ("CS FORM 212 (Revised 2017), Page 1 of 4") are still rejected by NOISE.
function probeText(v: unknown): string {
  return cellText(v).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

// "N/A" markers mean the applicant left the cell blank — treat as empty.
const isNA = (s: string) => !s || /^n\/?a\.?$/i.test(s.trim());

// Real PDS cell values are short; anything beyond this is template
// boilerplate (disclaimer banners, instructions) that some versions embed in
// data rows — never extract it as content.
const MAX_VALUE_LEN = 160;
const plausible = (v: string, min: number) => !isNA(v) && v.length >= min && v.length <= MAX_VALUE_LEN;

function findRow(ws: XLSX.WorkSheet, labelRe: RegExp, maxRow = 80, startRow?: number): { row: number; col: number } | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const rEnd = Math.min(range.e.r, maxRow);
  for (let r = startRow ?? range.s.r; r <= rEnd; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 14); c++) {
      const raw = cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
      if (!raw) continue;
      // Section banners ("VI. LEARNING AND DEVELOPMENT …", "WORK EXPERIENCE
      // (Continuation)") must never anchor a table — only column headers may.
      if (/^\s*[ivxlc]+\s*\.\s/i.test(raw) || /\(\s*continuation\s*\)\s*$/i.test(raw)) continue;
      const t = probeText(raw);
      if (t && labelRe.test(t) && !NOISE.test(t)) return { row: r, col: c };
    }
  }
  return null;
}

// Agency templates hide dropdown option lists ("Single/Married/Separated",
// country names) in helper columns BESIDE the form. A label's value always
// sits within a cell or two, so the scan stops after a run of empty cells —
// it must never walk into those helper columns across a blank value area.
const SCAN_GAP = 3;
function scanRight(ws: XLSX.WorkSheet, row: number, startCol: number, maxScan = 12): string {
  const ref = ws["!ref"];
  if (!ref) return "";
  const range = XLSX.utils.decode_range(ref);
  let gap = 0;
  for (let c = startCol + 1; c <= Math.min(range.e.c, startCol + maxScan); c++) {
    const t = cellText(ws[XLSX.utils.encode_cell({ r: row, c })]?.v);
    if (!t || CAPTION_RE.test(t) || NOISE.test(t) || /^(yes|no)$/i.test(t) || /^\d{1,2}$/.test(t)) {
      if (++gap >= SCAN_GAP) break;
      continue;
    }
    return t;
  }
  return "";
}

// PDS address blocks print underline captions ("House/Block/Lot No.",
// "Subdivision/Village", …) directly BENEATH their value cell.
function scanAbove(ws: XLSX.WorkSheet, row: number, col: number, maxUp = 2): string {
  for (let r = row - 1; r >= Math.max(0, row - maxUp); r--) {
    const t = cellText(ws[XLSX.utils.encode_cell({ r, c: col })]?.v);
    if (!t) continue;
    if (CAPTION_RE.test(t) || NOISE.test(t)) return "";
    return t;
  }
  return "";
}

// First non-empty cell to the right of a personal-grid label, tolerating
// short numbers — "WEIGHT (kg)" answers "68", which scanRight's dropdown
// guard would reject. The empty-gap cap and label-pattern guard keep the
// scan from crossing an EMPTY value area into the right-hand grid's next
// labels ("18. PERMANENT ADDRESS", "20. MOBILE NO.") on blank templates.
function valueRight(ws: XLSX.WorkSheet, row: number, col: number, maxScan = 8): string {
  const ref = ws["!ref"];
  if (!ref) return "";
  const range = XLSX.utils.decode_range(ref);
  let gap = 0;
  for (let c = col + 1; c <= Math.min(range.e.c, col + maxScan); c++) {
    const t = cellText(ws[XLSX.utils.encode_cell({ r: row, c })]?.v);
    if (!t || /^(yes|no|true|false)$/i.test(t)) {
      if (++gap >= 2) break;
      continue;
    }
    if (CAPTION_RE.test(t) || NOISE.test(t) || /^\s*\d{1,2}\s*\.\s/i.test(t)) break;
    return t;
  }
  return "";
}

// The 2026 edition prints dates as dd/mm/yyyy (2017: mm/dd/yyyy). The flag is
// set per parse from the detected revision; ambiguous d/m strings resolve
// through it, unambiguous ones self-detect. Safe across awaits: the parse
// pipeline up to normDate use is fully synchronous.
let pdsDayFirst = false;
function normDate(v: string): string {
  if (!v) return "";
  // Excel serial?
  const num = Number(v);
  if (!Number.isNaN(num) && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return d.toISOString().slice(0, 10);
  }
  const m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let dayFirst = pdsDayFirst;
    if (a > 12) dayFirst = true;
    else if (b > 12) dayFirst = false;
    const mo = dayFirst ? b : a;
    const day = dayFirst ? a : b;
    return `${m[3]}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(v)) return parsed.toISOString().slice(0, 10);
  return "";
}

const year4 = (v: string): string => (/^\d{4}$/.test(v.trim()) ? v.trim() : (v.match(/\d{4}/)?.[0] ?? ""));

// ── Version-adaptive table reader ────────────────────────────────────────────
// Every PDS section table (education, eligibility, work, training, awards) is
// located by its HEADER ROW and each field's column is RESOLVED from the
// header labels (header row + up to 3 rows below, covering two-row headers
// with From/To sub-rows). Hardcoded column geometry from one template becomes
// only a fallback, so re-revisions and older/lower layouts that shifted
// columns still parse. Tables are collected from EVERY sheet (main pages and
// continuation sheets alike; Lookup sheets excluded).

type TableRowGetter = (col: number) => string;

type TableSpec = {
  key: "educations" | "workExperiences" | "trainings" | "eligibilities" | "awards";
  headerRe: RegExp;
  fallbackHeaderRe?: RegExp;
  fields: Record<string, { re?: RegExp; fallback: number[] }>;
  maxRows: number;
  build: (get: TableRowGetter, cols: Record<string, number>) => ExtractionSection | null;
};

function resolveColumns(ws: XLSX.WorkSheet, headerRow: number, fields: TableSpec["fields"]): Record<string, number> {
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  const cStart = ref ? ref.s.c : 0;
  const cEnd = ref ? Math.min(ref.e.c, ref.s.c + 14) : 14;
  const cols: Record<string, number> = {};
  for (const [key, spec] of Object.entries(fields)) {
    cols[key] = -1;
    if (spec.re) {
      // Prefer the SHORTEST matching caption in the header window. Real
      // column captions are short ("LICENSE", "RATING"), while section
      // captions that merely CONTAIN the word are long (the 2026 eligibility
      // caption ends "…/ DRIVER'S LICENSE") — length is the discriminator.
      let best: { col: number; len: number } | null = null;
      for (let r = headerRow; r <= headerRow + 3; r++) {
        for (let c = cStart; c <= cEnd; c++) {
          const t = probeText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
          if (t && spec.re.test(t) && !NOISE.test(t)) {
            if (!best || t.length < best.len) best = { col: c, len: t.length };
          }
        }
      }
      if (best) cols[key] = best.col;
    }
    if (cols[key] === -1) cols[key] = spec.fallback[0] ?? -1;
  }
  return cols;
}

// Pick the first candidate cell that satisfies pred, skipping columns that
// belong to other resolved fields (e.g. the To-date column next to a merged
// title) and the header column's merge-neighbors only when they are free.
function pickCell(cands: number[], exclude: number[], get: TableRowGetter, pred: (v: string) => boolean): string {
  for (const c of cands) {
    if (c < 0 || exclude.includes(c)) continue;
    const v = get(c);
    if (pred(v)) return v;
  }
  return "";
}

function parseTableAcrossSheets(wb: XLSX.WorkBook, spec: TableSpec): ExtractionSection[] {
  const entries: ExtractionSection[] = [];
  for (const name of wb.SheetNames) {
    if (/lookup/i.test(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const header = findRow(ws, spec.headerRe, 250) ?? (spec.fallbackHeaderRe ? findRow(ws, spec.fallbackHeaderRe, 250) : null);
    if (!header) continue;
    const cols = resolveColumns(ws, header.row, spec.fields);
    const ref = XLSX.utils.decode_range(ws["!ref"]!);
    // A section table ends at the next "(Continue on separate sheet …)" note,
    // the next roman-numeral section title, or a signature row — without this
    // clamp the scan bleeds into the FOLLOWING section's table (e.g. the
    // eligibility window reading the work-experience header row). The note is
    // tested on the RAW text because probeText strips its parentheses.
    let sectionEnd = Math.min(ref.e.r, header.row + spec.maxRows);
    for (let r = header.row + 1; r <= sectionEnd; r++) {
      const cells = (c: number) => cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
      const raw = [0, 1, 2, 3, 4, 5, 6, 7].map(cells).join(" ");
      const probe = [0, 1, 2].map((c) => probeText(cells(c))).join(" ");
      const tail = [3, 4, 5, 6, 7].map(cells).join("");
      // "Continue on separate sheet …" (2017) and "Continue on sheet C5 …"
      // (2026) both close a section; so do signature rows and the next
      // roman-numeral section title.
      if (/continue\s+on\s+(a\s+)?(the\s+)?(separate|sheet)|signature|administering/i.test(raw) || (/^\s*[ivxlc]+\s*\.\s/i.test(probe) && tail === "")) {
        sectionEnd = r - 1;
        break;
      }
    }
    for (let r = header.row + 1; r <= sectionEnd; r++) {
      const get: TableRowGetter = (c) => (c >= 0 ? cellDisplay(ws, r, c) : "");
      try {
        const entry = spec.build(get, cols);
        // Never emit rows that resolved to nothing (blank templates leave
        // empty shells behind).
        if (entry && Object.values(entry).some((v) => v && v.value !== null && v.value !== "")) entries.push(entry);
      } catch {
        // malformed row — skip
      }
    }
  }
  return entries;
}

const EDUCATION_LEVEL_MAP = (raw: string): string =>
  /elementary/i.test(raw) ? "Elementary"
  : /secondary|high\s*school/i.test(raw) ? "Secondary"
  : /vocational|trade/i.test(raw) ? "Vocational / Trade"
  : /graduate|post/i.test(raw) ? "Graduate Studies"
  : "College";

const TABLE_SPECS: TableSpec[] = [
  {
    key: "educations",
    headerRe: /name\s*of\s*school/i,
    fields: {
      level: { re: /\blevel\b/i, fallback: [1] },
      school: { re: /name\s*of\s*school/i, fallback: [3] },
      degree: { re: /degree|course/i, fallback: [6] },
      from: { re: /^from\b/i, fallback: [9] },
      to: { re: /^to\b/i, fallback: [10] },
      graduated: { re: /year\s*graduated/i, fallback: [12] },
      honors: { re: /scholarship|honors/i, fallback: [13] },
    },
    maxRows: 40,
    build: (get, cols) => {
      const school = get(cols.school);
      const degree = get(cols.degree);
      if (isNA(school) && isNA(degree)) return null;
      if (NOISE.test(school + degree) || /name\s+of\s+school/i.test(school)) return null;
      const entry: ExtractionSection = {};
      const level = get(cols.level);
      if (!isNA(level)) entry.educationLevel = cv(EDUCATION_LEVEL_MAP(level), "medium");
      if (!isNA(school)) entry.schoolName = cv(school);
      if (!isNA(degree) && !/^graduated$/i.test(degree)) entry.course = cv(degree, "medium");
      const from = year4(get(cols.from));
      if (from) entry.yearFrom = cv(from, "medium");
      const to = year4(get(cols.to));
      if (to) entry.yearTo = cv(to, "medium");
      const grad = year4(get(cols.graduated));
      if (grad) entry.yearGraduated = cv(grad, "medium");
      const honors = get(cols.honors);
      if (!isNA(honors)) entry.awards = cv(honors, "medium");
      return Object.keys(entry).length > 0 ? entry : null;
    },
  },
  {
    key: "eligibilities",
    headerRe: /career\s*service\/?\s*ra\s*1080|date\s*of\s*examination|conferment/i,
    fallbackHeaderRe: /civil\s*service\s*eligib|\beligib/i,
    fields: {
      title: { fallback: [1, 2] },
      rating: { re: /rating/i, fallback: [5] },
      examDate: { re: /date\s*of\s*exam|conferment/i, fallback: [6] },
      examPlace: { re: /place\s*of\s*exam/i, fallback: [7] },
      license: { re: /license/i, fallback: [11] },
      validity: { re: /validity|valid\s*until/i, fallback: [12] },
    },
    maxRows: 40,
    build: (get, cols) => {
      const ratingCell = get(cols.rating);
      const dateCell = get(cols.examDate);
      const placeCell = get(cols.examPlace);
      // A row repeating the column captions (older variants anchor one row
      // higher) is a header, not data: 2+ caption cells give it away.
      const captionHits = [ratingCell, dateCell, placeCell].filter((v) => /rating|exam|conferment|place/i.test(v)).length;
      if (captionHits >= 2) return null;
      // The title cell is the only unlabeled column (older variants place it
      // one column off) — exclude the resolved rating/date/place columns and
      // never accept a purely numeric cell (that is the rating).
      const title = pickCell(
        [cols.title, cols.title - 1, cols.title + 1],
        [cols.rating, cols.examDate, cols.examPlace],
        get,
        (v) => plausible(v, 3) && !/^[\d.,\s]+$/.test(v)
      );
      if (isNA(title) || NOISE.test(title)) return null;
      const cleanTitle = title.replace(/\s*\(.*?\)\s*$/, "").trim();
      if (!cleanTitle || /career\s+service\s*\/?\s*ra\s*1080/i.test(cleanTitle)) return null;
      const entry: ExtractionSection = { title: cv(cleanTitle) };
      if (ratingCell && /^\d/.test(ratingCell)) entry.rating = cv(ratingCell, "medium");
      if (dateCell) entry.examDate = cv(normDate(dateCell) || dateCell, "medium");
      if (placeCell) entry.examPlace = cv(placeCell, "medium");
      const license = get(cols.license);
      if (!isNA(license) && license.length > 2 && !NOISE.test(license)) entry.licenseNumber = cv(license, "medium");
      const validity = get(cols.validity);
      if (!isNA(validity) && validity.length > 2 && !NOISE.test(validity)) entry.licenseValidity = cv(normDate(validity) || validity, "medium");
      return entry;
    },
  },
  {
    key: "workExperiences",
    headerRe: /position\s*title/i,
    fields: {
      from: { re: /^from\b/i, fallback: [0, 1] },
      to: { re: /^to\b/i, fallback: [2, 3] },
      title: { re: /position\s*title/i, fallback: [4, 3] },
      employer: { re: /department|agency|company/i, fallback: [6, 5] },
      salary: { re: /monthly\s*salary/i, fallback: [9, 8] },
    },
    maxRows: 200,
    build: (get, cols) => {
      const position = pickCell([cols.title, cols.title - 1, cols.title + 1], [cols.from, cols.to], get, (v) => plausible(v, 3));
      if (!position || NOISE.test(position) || /^position\s+title/i.test(position)) return null;
      const entry: ExtractionSection = { positionTitle: cv(position) };
      const employer = pickCell([cols.employer, cols.employer - 1], [cols.from, cols.to], get, (v) => !isNA(v) && v.length > 2);
      if (employer) entry.employerName = cv(employer, "medium");
      const dFrom = normDate(get(cols.from));
      if (dFrom) entry.dateFrom = cv(dFrom, "medium");
      const toRaw = get(cols.to);
      const dTo = normDate(toRaw);
      if (dTo) entry.dateTo = cv(dTo, "medium");
      else if (isNA(toRaw) || /present/i.test(toRaw)) entry.isPresentWork = cv("true", "medium");
      const salary = get(cols.salary);
      if (!isNA(salary)) {
        const n = Number(salary.replace(/[^\d.]/g, ""));
        if (!Number.isNaN(n) && n > 0) entry.monthlySalary = cv(n, "medium");
      }
      return entry;
    },
  },
  {
    key: "trainings",
    // Primary anchor is the column caption ("TITLE OF LEARNING AND
    // DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS") — the section banner
    // ("VI. LEARNING AND DEVELOPMENT …") and its "(Continuation)" variant
    // must not anchor, or the caption row leaks in as a data row.
    headerRe: /title\s*of\s*(learning|training)/i,
    fallbackHeaderRe: /learning\s*(and|&)\s*development/i,
    fields: {
      title: { fallback: [0, 1] },
      from: { re: /^from\b/i, fallback: [4, 2] },
      to: { re: /^to\b/i, fallback: [5, 3] },
      hours: { re: /number\s*of\s*hours|hours/i, fallback: [6] },
      type: { re: /type\s*of/i, fallback: [7] },
    },
    maxRows: 200,
    build: (get, cols) => {
      const title = pickCell([cols.title, cols.title + 1], [cols.from, cols.to], get, (v) => plausible(v, 4));
      if (isNA(title) || NOISE.test(title) || /^\d+$/.test(title) || /^title\s+of\s+(learning|training)/i.test(title)) return null;
      const entry: ExtractionSection = { title: cv(title) };
      const dFrom = normDate(get(cols.from));
      if (dFrom) entry.dateFrom = cv(dFrom, "medium");
      const dTo = normDate(get(cols.to));
      if (dTo) entry.dateTo = cv(dTo, "medium");
      const hours = get(cols.hours);
      const hNum = Number(String(hours).replace(/[^\d.]/g, ""));
      if (!isNA(hours) && !Number.isNaN(hNum) && hNum > 0) entry.numberHours = cv(hNum, "medium");
      const type = get(cols.type);
      if (!isNA(type) && type.length > 2 && !NOISE.test(type)) entry.typeOfTraining = cv(type, "medium");
      return entry;
    },
  },
  {
    key: "awards",
    headerRe: /non-?academic\s*distinctions/i,
    fields: {
      details: { re: /non-?academic\s*distinctions/i, fallback: [3] },
    },
    maxRows: 60,
    build: (get, cols) => {
      // The distinctions cell is a merge whose anchor often sits one column
      // left of its caption; the Special Skills and Membership columns share
      // the row and must NOT leak in.
      const details = pickCell([cols.details, cols.details - 1, cols.details + 1], [], get, (v) => plausible(v, 7));
      if (!details || NOISE.test(details) || /^\d+$/.test(details) || /membership|special\s*skills|hobbies/i.test(details)) return null;
      return { details: cv(details), recognitionType: cv("Award", "medium") };
    },
  },
  {
    // §30 Voluntary Work — 2017: "NAME & ADDRESS OF ORGANIZATION …" on the
    // C3 page after L&D; 2026: own continuation sheet (C10_Vol. Work cont.).
    key: "voluntaryWork",
    headerRe: /name\s*(?:&|and)\s*address\s*of\s*organization/i,
    fallbackHeaderRe: /voluntary\s*work/i,
    fields: {
      organization: { fallback: [0, 1] },
      from: { re: /^from\b/i, fallback: [4, 2] },
      to: { re: /^to\b/i, fallback: [5, 3] },
      hours: { re: /number\s*of\s*hours|hours/i, fallback: [6] },
      position: { re: /position\s*\/|nature\s*of\s*work/i, fallback: [7] },
    },
    maxRows: 60,
    build: (get, cols) => {
      const org = pickCell([cols.organization, cols.organization + 1], [cols.from, cols.to], get, (v) => plausible(v, 4));
      if (isNA(org) || NOISE.test(org) || /^\d+$/.test(org) || /name\s*&?\s*and?\s*address/i.test(org)) return null;
      const entry: ExtractionSection = { organizationName: cv(org) };
      const dFrom = normDate(get(cols.from));
      if (dFrom) entry.dateFrom = cv(dFrom, "medium");
      const dTo = normDate(get(cols.to));
      if (dTo) entry.dateTo = cv(dTo, "medium");
      const hours = get(cols.hours);
      const hNum = Number(String(hours).replace(/[^\d.]/g, ""));
      if (!isNA(hours) && !Number.isNaN(hNum) && hNum > 0) entry.numberHours = cv(hNum, "medium");
      const pos = get(cols.position);
      if (!isNA(pos) && pos.length > 2 && !NOISE.test(pos)) entry.positionNature = cv(pos, "medium");
      return entry;
    },
  },
  {
    // §31-33 "Other Information" — special skills (and hobbies) live beside
    // non-academic distinctions and membership associations on the same grid.
    key: "specialSkills",
    headerRe: /special\s*skills\s*and\s*hobbies/i,
    fallbackHeaderRe: /special\s*skills/i,
    fields: {
      skill: { fallback: [0, 1] },
    },
    maxRows: 30,
    build: (get, cols) => {
      const skill = pickCell([cols.skill, cols.skill + 1], [], get, (v) => plausible(v, 3));
      if (!skill || NOISE.test(skill) || /^\d+$/.test(skill) || /special\s*skills|hobbies/i.test(skill)) return null;
      // One row per comma-separated skill — the form prints several per cell.
      return { skill: cv(skill) };
    },
  },
];

function detectRevision(wb: XLSX.WorkBook): { label: string; year: number | null } {
  let formOnly = false;
  for (const name of wb.SheetNames) {
    if (/lookup/i.test(name)) continue;
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (!ref) continue;
    for (let r = ref.s.r; r <= Math.min(ref.e.r, 120); r++) {
      for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 15); c++) {
        const t = cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
        // The explicit "Revised <year>" footer wins over the bare form
        // number so the 2026 edition is never mislabelled "CS Form 212".
        const m = t.match(/revised\s*(20\d{2})/i);
        if (m) return { label: `CS Form 212 (Revised ${m[1]})`, year: Number(m[1]) };
        if (/cs\s*form\s*no\.?\s*\.?\s*212/i.test(t)) formOnly = true;
      }
    }
  }
  return { label: formOnly ? "CS Form 212" : "", year: null };
}

export function parsePdsWorkbook(filePath: string): ExtractionResult | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(filePath, { cellDates: false, cellNF: true });
  } catch {
    return null;
  }
  const sheetName = wb.SheetNames.find((n) => /C1|Sheet1|personal/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const a1 = probeText(ws["A1"]?.v ?? ws["A2"]?.v ?? ws["A3"]?.v);
  const looksLikePds =
    /personal\s*data\s*sheet/i.test(a1) ||
    wb.SheetNames.some((n) => /C\d/i.test(n)) ||
    !!findRow(ws, /personal\s*data\s*sheet/i, 12);
  if (!looksLikePds) return null;

  const result: ExtractionResult = { warnings: [] };
  const rev = detectRevision(wb);
  pdsDayFirst = (rev.year ?? 0) >= 2026;
  if (rev.label) result.warnings?.push(`Detected ${rev.label} layout.`);

  const personal: ExtractionSection = {};
  const put = (key: string, v: string, conf: ConfidentValue["confidence"] = "high") => {
    const t = String(v).replace(/\s+/g, " ").trim();
    if (!t || isNA(t) || CAPTION_RE.test(t)) return;
    if (personal[key]) return; // first source wins (e.g. UMID before PhilSys)
    personal[key] = cv(t, conf);
  };

  const surname = findRow(ws, /sur\s*name/i) || findRow(ws, /^surname/i);
  if (surname) put("lastName", scanRight(ws, surname.row, surname.col));
  const given = findRow(ws, /given\s*name|first\s*name/i);
  if (given) put("firstName", scanRight(ws, given.row, given.col));
  const middle = findRow(ws, /middle\s*name/i);
  if (middle) put("middleName", scanRight(ws, middle.row, middle.col));
  const ext = findRow(ws, /name\s*extension/i);
  if (ext) put("extensionName", scanRight(ws, ext.row, ext.col));
  const dob = findRow(ws, /date\s*of\s*birth/i);
  if (dob) put("birthDate", normDate(scanRight(ws, dob.row, dob.col)), "high");
  const pob = findRow(ws, /place\s*of\s*birth/i);
  if (pob) put("birthPlace", scanRight(ws, pob.row, pob.col));
  const sex = findRow(ws, /\bsex\b|\bgender\b/i); // "5. SEX" (2017) / "5. SEX AT BIRTH" (2026)
  if (sex) {
    const raw = scanRight(ws, sex.row, sex.col);
    const m = raw.match(/male|female/i);
    if (m) put("gender", m[0][0].toUpperCase() + m[0].slice(1).toLowerCase());
    else {
      // The 2026 edition replaces Male/Female TEXT with Excel checkbox form
      // controls — only their TRUE/FALSE states land in cells. The official
      // order is MALE then FEMALE, so exactly one ticked boolean resolves
      // the value (low confidence — layout convention, not a printed label).
      const ref2 = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
      const slots: Array<{ c: number; on: boolean }> = [];
      for (let c = sex.col + 1; c <= Math.min(ref2?.e.c ?? sex.col, sex.col + 8); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: sex.row, c })] as XLSX.CellObject | undefined;
        if (cell && typeof cell.v === "boolean") slots.push({ c, on: cell.v });
      }
      const ticked = slots.findIndex((s) => s.on);
      if (ticked === 0) put("gender", "Male", "low");
      else if (ticked === 1) put("gender", "Female", "low");
    }
  }
  const cs = findRow(ws, /civil\s*status/i);
  if (cs) {
    const raw = scanRight(ws, cs.row, cs.col).toLowerCase();
    const hit = ["single", "married", "widowed", "separated", "divorced"].find((s) => raw.includes(s));
    if (hit) put("civilStatus", hit[0].toUpperCase() + hit.slice(1));
  }
  const cit = findRow(ws, /citizenship/i);
  if (cit) put("citizenship", scanRight(ws, cit.row, cit.col));

  // §7-9 physical attributes + §10-15 government IDs (labels in column B of
  // the personal grid; 2026 renames some: UMID ID NO., PAG-IBIG ID NO.).
  const ID_LABELS: Array<[RegExp, string]> = [
    [/agency\s*employee\s*no\.?/i, "agencyEmployeeNo"],
    [/\bheight\b/i, "height"],
    [/\bweight\b/i, "weight"],
    [/blood\s*type/i, "bloodType"],
    [/gsis\s*id\s*no\.?/i, "gsis"],
    [/pag-?ibig\s*id\s*no\.?/i, "pagibig"],
    [/philhealth\s*no\.?/i, "philhealth"],
    [/\bsss\s*no\.?/i, "sss"],
    [/tin\s*no\.?(\/\s*nbi\s*clearance)?/i, "tin"],
    [/umid\s*id\s*no\.?|philsys\s*(id\s*no\.?|card\s*no\.?)/i, "umidNumber"],
  ];
  for (const [re, key] of ID_LABELS) {
    const hit = findRow(ws, re, 60);
    if (hit) {
      const v = valueRight(ws, hit.row, hit.col);
      if (v && !isNA(v) && !NOISE.test(v) && !CAPTION_RE.test(v)) put(key, v, "medium");
    }
  }

  // Address blocks — caption-anchored: each underline caption ("House/Block/
  // Lot No.", "Subdivision/Village", …) sits directly BENEATH its value cell,
  // and the ZIP caption carries its value to its right. Residential wins over
  // permanent when both are filled.
  const permAnchor = findRow(ws, /permanent\s*address/i);
  const resAnchor = findRow(ws, /residential\s*address/i);
  type AddrVals = Partial<Record<"houseNumber" | "street" | "subdivision" | "barangay" | "city" | "province" | "zipCode", string>>;
  const readAddressBlock = (anchor: { row: number; col: number } | null, hardEnd?: number): AddrVals => {
    const vals: AddrVals = {};
    if (!anchor) return vals;
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const endRow = Math.min(hardEnd ?? ref?.e.r ?? anchor.row, anchor.row + 10);
    const cEnd = Math.min(ref?.e.c ?? anchor.col + 8, anchor.col + 8);
    for (let r = anchor.row; r <= endRow; r++) {
      for (let c = anchor.col; c <= cEnd; c++) {
        const t = cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
        if (!t) continue;
        const cap = /house\/?block/i.test(t) ? "houseNumber"
          : /^street$/i.test(t) ? "street"
          : /subdivision/i.test(t) ? "subdivision"
          : /^barangay$/i.test(t) ? "barangay"
          : /city\/?municipality/i.test(t) ? "city"
          : /^province$/i.test(t) ? "province"
          : /^zip\s*code/i.test(t) ? "zipCode"
          : null;
        if (!cap || vals[cap]) continue;
        const value = cap === "zipCode" ? scanRight(ws, r, c) : scanAbove(ws, r, c);
        if (value && !isNA(value)) vals[cap] = value;
      }
    }
    return vals;
  };
  const addr: AddrVals = {
    ...readAddressBlock(permAnchor),
    ...readAddressBlock(resAnchor, permAnchor ? permAnchor.row - 1 : undefined),
  };
  for (const [k, v] of Object.entries(addr)) if (v) put(k, v, "medium");
  const presentAddress = (["houseNumber", "street", "subdivision", "barangay", "city", "province"] as const)
    .map((k) => addr[k])
    .filter(Boolean)
    .join(", ");
  if (presentAddress) put("presentAddress", presentAddress, "medium");

  const tel = findRow(ws, /tele(phone)?\s*\/?\s*mobile|mobile/i);
  if (tel) {
    // "09270035829 / 09922092759" — several numbers may share the cell; the
    // profile keeps one, so take the first valid PH-style number.
    const digits = scanRight(ws, tel.row, tel.col).replace(/[\s()\-]/g, "");
    const m = digits.match(/(?:\+?63|0)\d{9,10}|\d{7,12}/);
    if (m) put("mobileNumber", m[0]);
  }
  const email = findRow(ws, /e-?mail/i);
  if (email) {
    const raw = scanRight(ws, email.row, email.col);
    if (raw.includes("@")) put("emailAddress", raw);
  }

  const fieldsExtracted = Object.keys(personal).length;
  if (fieldsExtracted === 0 && wb.SheetNames.length <= 1) {
    result.warnings?.push("No PDS labels recognized");
    return result;
  }
  if (fieldsExtracted > 0) result.personalInfo = personal;

  // ── Section tables — header-resolved, collected across every sheet ────────
  for (const spec of TABLE_SPECS) {
    const entries = dedupeSectionArray(parseTableAcrossSheets(wb, spec), spec.key);
    if (entries.length > 0) result[spec.key] = entries;
  }

  // ── Legacy/lower-version fallback: simple label:value education rows ──────
  // Older single-sheet PDS exports list educational background as plain
  // "ELEMENTARY: <school>" style rows instead of a headered table.
  if (!result.educations) {
    const legacyEdu: ExtractionSection[] = [];
    for (const name of wb.SheetNames) {
      if (/lookup/i.test(name)) continue;
      const s = wb.Sheets[name];
      const ref = s["!ref"] ? XLSX.utils.decode_range(s["!ref"]) : null;
      if (!ref) continue;
      for (let r = ref.s.r; r <= Math.min(ref.e.r, 120); r++) {
        for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 3); c++) {
          const label = probeText(s[XLSX.utils.encode_cell({ r, c })]?.v);
          if (!/^(elementary|secondary|high\s*school|vocational|college|bachelor|graduate|post\s*graduate)/i.test(label)) continue;
          const value = scanRight(s, r, c);
          if (isNA(value) || value.length < 3) continue;
          legacyEdu.push({ educationLevel: cv(EDUCATION_LEVEL_MAP(label), "medium"), schoolName: cv(value, "medium") });
        }
      }
    }
    const deduped = dedupeSectionArray(legacyEdu, "educations");
    if (deduped.length > 0 && deduped.length <= 8) result.educations = deduped;
  }

  return result;
}

// ── AI extraction (z-ai-web-dev-sdk — backend only) ─────────────────────────

const AI_JSON_PROMPT = (category: string, text: string) => `You are a data-extraction engine for Philippine government recruitment (CSC forms).
You are reading a CS Form 212 Personal Data Sheet (any revision year) converted from PDF, so the text stream is JUMBLED: labels and their values are often separated, and checkbox options ("Male", "Single", "Filipino", "N/A") appear as bare words.
Use the item numbers as anchors: item 2 = SURNAME then FIRST NAME then MIDDLE NAME then NAME EXTENSION; 3 = date of birth; 4 = place of birth; 5 = sex; 6 = civil status; 16 = citizenship; 17/18 = residential/permanent address; 20 = mobile; 21 = email; 22-25 = family; 26 = education table; 27 = eligibility table; 28 = work experience table; 29/30 = trainings; 31 = special skills; 32 = non-academic distinctions.
From the following ${category} document text, extract structured data as STRICT JSON with this exact shape (omit sections you find nothing for):
{
  "personalInfo": { "<field>": {"value": <string|number|null>, "confidence": "high"|"medium"|"low"} },
  "educations": [ { "educationLevel": {...}, "course": {...}, "schoolName": {...}, "yearFrom": {...}, "yearTo": {...}, "yearGraduated": {...}, "awards": {...} } ],
  "workExperiences": [ { "positionTitle": {...}, "employerName": {...}, "dateFrom": {...}, "dateTo": {...}, "monthlySalary": {...}, "isPresentWork": {...} } ],
  "trainings": [ { "title": {...}, "numberHours": {...}, "typeOfTraining": {...}, "dateFrom": {...}, "dateTo": {...} } ],
  "eligibilities": [ { "title": {...}, "rating": {...}, "examDate": {...}, "examPlace": {...}, "licenseNumber": {...}, "licenseValidity": {...} } ],
  "awards": [ { "details": {...}, "recognitionType": {...}, "provider": {...}, "dateGranted": {...} } ],
  "voluntaryWork": [ { "organizationName": {...}, "dateFrom": {...}, "dateTo": {...}, "numberHours": {...}, "positionNature": {...} } ],
  "specialSkills": [ { "skill": {...} } ]
}
personalInfo fields may include: firstName, middleName, lastName, extensionName, birthDate, birthPlace, gender, civilStatus, citizenship, mobileNumber, emailAddress, houseNumber, street, subdivision, barangay, city, province, zipCode, agencyEmployeeNo, height, weight, bloodType, gsis, pagibig, philhealth, sss, tin, umidNumber.
Rules:
- extract ONLY what is clearly present; NEVER fabricate; not found ⇒ value null with confidence "none"; all values in the {value, confidence} shape; dates formatted YYYY-MM-DD (respect the form's stated mm/dd/yyyy or dd/mm/yyyy order); respond with JSON only — no markdown fences, no commentary.
- The document may be a BLANK template. Text that is itself a template caption ("SURNAME", "FIRST NAME", "NAME EXTENSION (JR., SR)", "Pls. indicate country:", "House/Block/Lot No.") is NEVER a value — return null instead. Checkbox options (Male, Single, Filipino) are only values if the form clearly marks them selected.
- The surname is the family name printed right after the SURNAME label of item 2 — never mistake the middle name or the father's/mother's name for the surname.
- "N/A" means the field is empty ⇒ null. Skip education/eligibility rows whose cells are all N/A.
- educationLevel MUST be exactly one of: "Elementary", "Secondary", "Vocational / Trade", "College", "Graduate Studies" (map "Senior High School" → Secondary-with-course, "Bachelor of…" rows → College).
- Keep the applicant's original casing/spacing for names and addresses; join multi-line values with a single space.

DOCUMENT TEXT (truncated, "│" marks cell boundaries; rows are top-to-bottom):
"""
${text.slice(0, 16000)}
"""`;

function parseAiJson(raw: string): ExtractionResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as ExtractionResult;
  } catch {
    return null;
  }
}

// The AI reads raw cell/text soup that includes the form's own captions and
// dropdown option lists. On a BLANK template its only "values" are those
// captions — a hallucination class the deterministic parser is immune to.
// Filter them before merging: caption-identical strings are never applicant
// data, name extensions are Jr/Sr-style honorifics only, and checkbox fields
// (gender/civil status/citizenship) are UNKNOWABLE from plain Excel cell text
// (they live in form controls), so the xlsx path drops those guesses when the
// deterministic parser confirmed the form is otherwise empty.
const AI_CAPTION_VALUE = /^(surname|last\s*name|first\s*name|given\s*name|middle\s*name|name\s*extension|date\s*of\s*birth|place\s*of\s*birth|civil\s*status|sex(\s*at\s*birth)?|gender|citizenship|residential\s*address|permanent\s*address|zip\s*code|mobile\s*no\.?|telephone\s*no\.?|tele(phone)?\s*no\.?|e-?mail(\s*address)?(\s*if\s*any)?|agency\s*employee\s*no\.?|height.*|weight.*|blood\s*type|gsis\s*id\s*no\.?|umid\s*id\s*no\.?|pag-?ibig\s*id\s*no\.?|philhealth\s*no\.?|sss\s*no\.?|tin\s*no\.?|philsys.*|pls\.?\s*indicate.*|if\s*holder.*|house\/?block.*|subdivision.*|city\/?municipality.*|^street$|^barangay$|^province$|dual\s*citizenship|by\s*birth|by\s*naturalization|n\/?a\.?|none)$/i;
const AI_TABLE_CAPTION = /^(n\/?a\.?|none|name\s*of\s*school|position\s*title|title\s*of\s*(learning|training).*|career\s*service.*ra\s*1080.*|civil\s*service\s*eligib.*|non-?academic\s*distinctions.*|inclusive\s*dates.*|department\s*\/?\s*agency.*|scholarship.*|highest\s*level.*|number\s*of\s*hours.*|type\s*of\s*l\s*&\s*d.*|conducted.*)$/i;

function sanitizeAiExtraction(
  result: ExtractionResult | null,
  opts: { dropCheckboxGuesses?: boolean } = {}
): ExtractionResult | null {
  if (!result) return null;
  const out: ExtractionResult = { ...result };
  if (out.personalInfo) {
    const clean: ExtractionSection = {};
    for (const [k, v] of Object.entries(out.personalInfo)) {
      if (v?.value == null || v.value === "") continue;
      const s = String(v.value).trim();
      if (AI_CAPTION_VALUE.test(s)) continue;
      if (k === "extensionName" && !/^(jr|sr|iii|iv|v)\.?$/i.test(s)) continue;
      if (opts.dropCheckboxGuesses && (k === "gender" || k === "civilStatus" || k === "citizenship")) continue;
      clean[k] = v;
    }
    out.personalInfo = Object.keys(clean).length > 0 ? clean : undefined;
  }
  const filterRows = (rows?: ExtractionSection[], fields: string[] = []) =>
    rows?.filter((row) =>
      fields.some((f) => {
        const v = row[f]?.value;
        return v != null && String(v).trim() !== "" && !AI_TABLE_CAPTION.test(String(v).trim());
      })
    );
  out.educations = filterRows(out.educations, ["schoolName"]);
  out.workExperiences = filterRows(out.workExperiences, ["positionTitle"]);
  out.trainings = filterRows(out.trainings, ["title"]);
  out.eligibilities = filterRows(out.eligibilities, ["title"]);
  out.awards = filterRows(out.awards, ["details"]);
  out.voluntaryWork = filterRows(out.voluntaryWork, ["organizationName"]);
  out.specialSkills = filterRows(out.specialSkills, ["skill"]);
  return out;
}

async function aiExtractText(text: string, category: string): Promise<ExtractionResult | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You extract structured data from documents and reply with JSON only." },
        { role: "user", content: AI_JSON_PROMPT(category, text) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    return parseAiJson(raw);
  } catch (e) {
    console.error("[EXTRACT] AI failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Scanned/image PDS pages go through the vision model: the page bitmap is
// sent as a data URL and the SAME strict JSON contract is enforced, so image
// uploads become first-class citizens (enterprise parsers all accept images).
const VISION_PROMPT = (category: string) => `This is a page of a Philippine CS Form 212 Personal Data Sheet (${category}) — a filled government job application form, possibly photographed or scanned.
Read it visually and extract structured data as STRICT JSON with this exact shape (omit sections you find nothing for):
{
  "personalInfo": { "<field>": {"value": <string|number|null>, "confidence": "high"|"medium"|"low"} },
  "educations": [ { "educationLevel": {...}, "course": {...}, "schoolName": {...}, "yearFrom": {...}, "yearTo": {...}, "yearGraduated": {...}, "awards": {...} } ],
  "workExperiences": [ { "positionTitle": {...}, "employerName": {...}, "dateFrom": {...}, "dateTo": {...}, "monthlySalary": {...}, "isPresentWork": {...} } ],
  "trainings": [ { "title": {...}, "numberHours": {...}, "typeOfTraining": {...}, "dateFrom": {...}, "dateTo": {...} } ],
  "eligibilities": [ { "title": {...}, "rating": {...}, "examDate": {...}, "examPlace": {...}, "licenseNumber": {...}, "licenseValidity": {...} } ],
  "awards": [ { "details": {...}, "recognitionType": {...}, "provider": {...}, "dateGranted": {...} } ],
  "voluntaryWork": [ { "organizationName": {...}, "dateFrom": {...}, "dateTo": {...}, "numberHours": {...}, "positionNature": {...} } ],
  "specialSkills": [ { "skill": {...} } ]
}
personalInfo fields may include: firstName, middleName, lastName, extensionName, birthDate, birthPlace, gender, civilStatus, citizenship, mobileNumber, emailAddress, houseNumber, street, subdivision, barangay, city, province, zipCode, agencyEmployeeNo, height, weight, bloodType, gsis, pagibig, philhealth, sss, tin, umidNumber.
Rules:
- extract ONLY handwriting/print clearly present on the page; NEVER fabricate; unreadable ⇒ null with confidence "none"; dates YYYY-MM-DD (the form states mm/dd/yyyy or dd/mm/yyyy order); JSON only — no fences, no commentary.
- Template captions ("SURNAME", "House/Block/Lot No.") are NEVER values. Unticked checkbox options are never values.
- educationLevel MUST be exactly one of: "Elementary", "Secondary", "Vocational / Trade", "College", "Graduate Studies".`;

async function aiExtractImage(filePath: string, mimeType: string, category: string): Promise<ExtractionResult | null> {
  try {
    const data = fs.readFileSync(filePath);
    const dataUrl = `data:${mimeType || "image/png"};base64,${data.toString("base64")}`;
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT(category) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    return parseAiJson(raw);
  } catch (e) {
    console.error("[EXTRACT] Vision failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Text extraction helpers ─────────────────────────────────────────────────

export function extractExcelText(filePath: string): string {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      if (/lookup/i.test(name)) continue;
      const ws = wb.Sheets[name];
      parts.push(`## Sheet: ${name}`);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      for (const row of rows.slice(0, 300)) {
        const cells = (row as unknown[]).map((c) => cellText(c)).filter(Boolean);
        if (cells.length > 0) parts.push(cells.join(" | "));
      }
    }
    return parts.join("\n").slice(0, 16000);
  } catch {
    return "";
  }
}

export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const buffer = fs.readFileSync(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    // Form PDFs (like the PDS) store glyphs with coordinates, so the raw text
    // stream is jumbled and labels get separated from their values. Rebuild
    // VISUAL LINES by grouping glyphs on the same baseline (y) and inserting
    // a "│" cell separator on wide horizontal gaps — the AI then sees the
    // form's rows the way a human does.
    const pages: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items as Array<{ str?: string; transform?: number[]; width?: number }>;
      const lines: Array<{ y: number; parts: Array<{ x: number; str: string; w: number }> }> = [];
      for (const it of items) {
        const s = it.str?.trim();
        if (!s || !it.transform) continue;
        const y = it.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) <= 3);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x: it.transform[4], str: s, w: it.width ?? 0 });
      }
      lines.sort((a, b) => b.y - a.y);
      const rows: string[] = [];
      for (const l of lines) {
        l.parts.sort((a, b) => a.x - b.x);
        let row = "";
        let prevEnd = -Infinity;
        for (const part of l.parts) {
          if (prevEnd > -Infinity && part.x - prevEnd > 18) row += " │ ";
          else if (row) row += " ";
          row += part.str;
          prevEnd = part.x + part.w;
        }
        if (row.trim()) rows.push(row.trim());
      }
      pages.push(rows.join("\n"));
    }
    return pages.map((t, i) => `=== Page ${i + 1} ===\n${t}`).join("\n").slice(0, 16000);
  } catch {
    // Fallback: plain merged text (no coordinates).
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buffer = fs.readFileSync(filePath);
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text.slice(0, 16000);
    } catch {
      return "";
    }
  }
}

export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.slice(0, 12000);
  } catch {
    return "";
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function countExtractedFields(result: ExtractionResult | null): number {
  if (!result) return 0;
  let n = 0;
  const countSection = (s?: ExtractionSection) => { if (s) n += Object.values(s).filter((v) => v && v.value !== null && v.value !== "").length; };
  countSection(result.personalInfo);
  for (const arr of [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards, result.voluntaryWork, result.specialSkills]) {
    for (const s of arr ?? []) countSection(s);
  }
  return n;
}

export function mergeExtractions(results: (ExtractionResult | null)[]): ExtractionResult | null {
  const valid = results.filter((r): r is ExtractionResult => !!r);
  if (valid.length === 0) return null;
  const merged: ExtractionResult = { warnings: [] };
  // personal: per-field highest-confidence non-null wins
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const personal: ExtractionSection = {};
  for (const r of valid) {
    for (const [k, v] of Object.entries(r.personalInfo ?? {})) {
      if (v.value === null || v.value === "") continue;
      const cur = personal[k];
      if (!cur || (rank[v.confidence] ?? 0) > (rank[cur.confidence] ?? 0)) personal[k] = v;
    }
  }
  if (Object.keys(personal).length > 0) merged.personalInfo = personal;
  const mergeArr = (key: keyof ExtractionResult) => {
    const all = valid.flatMap((r) => (r[key] as ExtractionSection[] | undefined) ?? []);
    if (all.length > 0) (merged as Record<string, unknown>)[key as string] = dedupeSectionArray(all, key as string);
  };
  mergeArr("educations");
  mergeArr("workExperiences");
  mergeArr("trainings");
  mergeArr("eligibilities");
  mergeArr("awards");
  mergeArr("voluntaryWork");
  mergeArr("specialSkills");
  merged.warnings = valid.flatMap((r) => r.warnings ?? []);
  // Keep the richest metadata: prefer a path that saw the document directly.
  const withMeta = valid.filter((r) => r.meta);
  if (withMeta.length > 0) {
    const pick = withMeta.find((r) => r.meta?.parserPath === "hybrid") ?? withMeta.find((r) => r.meta?.parserPath === "deterministic") ?? withMeta[0];
    merged.meta = pick.meta;
  }
  return merged;
}

function dedupeSectionArray(arr: ExtractionSection[], key: string): ExtractionSection[] {
  const seen = new Set<string>();
  const out: ExtractionSection[] = [];
  for (const item of arr) {
    const sig =
      key === "trainings" ? `${item.title?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "awards" ? `${item.details?.value ?? ""}`
      : key === "workExperiences" ? `${item.positionTitle?.value ?? ""}|${item.employerName?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "eligibilities" ? `${item.title?.value ?? ""}|${item.examDate?.value ?? ""}`
      : key === "voluntaryWork" ? `${item.organizationName?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "specialSkills" ? `${item.skill?.value ?? ""}`
      : `${item.educationLevel?.value ?? ""}|${item.schoolName?.value ?? ""}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

/**
 * Extract structured data from a stored document (spec §6.4). Deterministic
 * parser first for PDS × Excel; AI fallback otherwise; vision model for
 * images. Every result passes through the normalization/validation layer
 * (pds-validate) before returning, so callers always see canonical values,
 * parser metadata, and a quality report.
 */
export async function extractFromDocument(
  filePath: string,
  category: string,
  mimeType: string
): Promise<{ result: ExtractionResult | null; error?: string }> {
  const t0 = performance.now();
  type ParserPath = NonNullable<ExtractionResult["meta"]>["parserPath"];
  const finalize = (result: ExtractionResult | null, parserPath: ParserPath, formRevision: string | null) => {
    if (!result || countExtractedFields(result) === 0) return null;
    return finalizeExtraction(result, { parserPath, formRevision, durationMs: Math.round(performance.now() - t0) });
  };

  const ext = path.extname(filePath).toLowerCase();
  if (/\.(xlsx|xls|xlsm)$/.test(ext)) {
    const deterministic = parsePdsWorkbook(filePath);
    const revision = deterministic?.warnings?.find((w) => /Revised (\d{4})/.test(w))?.match(/Revised (\d{4})/)?.[1] ?? null;
    const formRevision = revision ? `CS Form 212 (Revised ${revision})` : deterministic ? "CS Form 212" : null;
    if (deterministic && countExtractedFields(deterministic) >= 3) {
      return { result: finalize(deterministic, "deterministic", formRevision) };
    }
    const text = extractExcelText(filePath);
    if (text.trim().length > 40) {
      // When the deterministic parser RECOGNIZED the form but found nothing
      // in it, the file is a blank template — checkbox guesses from raw cell
      // text would be pure fabrication, so they are suppressed.
      const ai = sanitizeAiExtraction(await aiExtractText(text, category), {
        dropCheckboxGuesses: !!deterministic && countExtractedFields(deterministic) === 0,
      });
      const merged = mergeExtractions([deterministic, ai]);
      return { result: finalize(merged, ai ? "hybrid" : "deterministic", formRevision) };
    }
    return { result: finalize(deterministic, "deterministic", formRevision) };
  }
  if (ext === ".pdf") {
    const text = await extractPdfText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read text from this PDF. Try uploading the Excel version of the PDS." };
    const ai = sanitizeAiExtraction(await aiExtractText(text, category));
    return { result: finalize(ai, "ai", "CS Form 212 (PDF)") };
  }
  if (ext === ".docx" || ext === ".doc") {
    const text = await extractDocxText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read this document. Try a DOCX or XLSX file." };
    const ai = sanitizeAiExtraction(await aiExtractText(text, category));
    return { result: finalize(ai, "ai", null) };
  }
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(ext)) {
    const vision = sanitizeAiExtraction(await aiExtractImage(filePath, mimeType, category));
    if (!vision) {
      return { result: null, error: "Could not read this image. Upload the PDS as XLSX, PDF, or DOCX, or use a sharper photo." };
    }
    return { result: finalize(vision, "vision", "CS Form 212 (image)") };
  }
  return { result: null, error: `Unsupported file type for extraction (${mimeType}).` };
}
