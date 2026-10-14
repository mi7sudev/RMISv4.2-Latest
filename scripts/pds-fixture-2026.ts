// ============================================================================
// Generates a FILLED copy of the official blank CS Form 212 (Revised 2026)
// template by writing realistic applicant values into the real workbook —
// preserving the template's exact label geometry — so the parser's 2026
// support can be regression-tested against the agency's newest form.
// Output: tests/fixtures/pds-2026-filled.xlsx
// ============================================================================

import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const SRC = "/home/z/my-project/upload/cs form 2026.xlsx";
const OUT_DIR = "/home/z/my-project/tests/fixtures";
const OUT = path.join(OUT_DIR, "pds-2026-filled.xlsx");

const wb = XLSX.readFile(SRC, { cellDates: false });

// Helper: find a label cell (probe text) and write a value into the merged
// region beside/below it (mimics how an applicant types into the form).
function findLabel(sheet: string, labelRe: RegExp): { r: number; c: number } | null {
  const ws = wb.Sheets[sheet];
  if (!ws) return null;
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = ref.s.r; r <= Math.min(ref.e.r, 130); r++) {
    for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 14); c++) {
      const raw = String((ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined)?.v ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      if (raw && labelRe.test(raw)) return { r, c };
    }
  }
  return null;
}

function write(sheet: string, r: number, c: number, value: string | number | boolean) {
  const ws = wb.Sheets[sheet];
  ws[XLSX.utils.encode_cell({ r, c })] = { t: typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s", v: value } as XLSX.CellObject;
  const ref = XLSX.utils.decode_range(ws["!ref"]!);
  if (r > ref.e.r || c > ref.e.c) {
    ref.e.r = Math.max(ref.e.r, r);
    ref.e.c = Math.max(ref.e.c, c);
    ws["!ref"] = XLSX.utils.encode_range(ref);
  }
}

function setBeside(sheet: string, labelRe: RegExp, value: string | number | boolean, offsetCols = 2, offsetRows = 0): boolean {
  const hit = findLabel(sheet, labelRe);
  if (!hit) {
    console.error(`  ! label not found on ${sheet}: ${labelRe}`);
    return false;
  }
  write(sheet, hit.r + offsetRows, hit.c + offsetCols, value);
  return true;
}

const C1 = "C1";
const C2 = "C2";
const C3 = "C3";

// ── C1: personal information (2026: items 1-21 on the first sheet) ──
setBeside(C1, /^SURNAME$/i, "DELA CRUZ");
setBeside(C1, /^FIRST NAME$/i, "JUAN MIGUEL");
setBeside(C1, /^MIDDLE NAME$/i, "REYES");
setBeside(C1, /NAME EXTENSION/i, "JR.");
setBeside(C1, /DATE OF BIRTH/i, "14/03/1990"); // 2026 = dd/mm/yyyy
setBeside(C1, /PLACE OF BIRTH/i, "Quezon City");
setBeside(C1, /SEX AT BIRTH/i, true, 2, 0); // first checkbox (MALE) ticked
setBeside(C1, /CIVIL STATUS/i, "Single");
setBeside(C1, /CITIZENSHIP/i, "Filipino");
setBeside(C1, /^HEIGHT/i, "1.70");
setBeside(C1, /^WEIGHT/i, "68");
setBeside(C1, /BLOOD TYPE/i, "O+");
setBeside(C1, /UMID ID NO/i, "0435-6789-1011");
setBeside(C1, /PAG-IBIG ID NO/i, "1234-5678-9012");
setBeside(C1, /PHILHEALTH NO/i, "12-345678901-2");
setBeside(C1, /PhilSys Card Number/i, "1234-5678-9012-3", 2, 0);
setBeside(C1, /^TIN/i, "123-456-789-000");
setBeside(C1, /AGENCY EMPLOYEE NO/i, "MIRDC-0451");
setBeside(C1, /MOBILE NO/i, "09171234567", 1, 0);
setBeside(C1, /E-MAIL ADDRESS/i, "juan.delacruz@dost.gov.ph", 1, 0);
// Address captions sit BENEATH their value cells (same as 2017).
setBeside(C1, /^House\/Block\/Lot No\.$/i, "123", 0, -1);
setBeside(C1, /^Street$/i, "Sampaguita St.", 0, -1);
setBeside(C1, /^Subdivision\/Village$/i, "Green Meadows", 0, -1);
setBeside(C1, /^Barangay$/i, "Barangka", 0, -1);
setBeside(C1, /^City\/Municipality$/i, "Mandaluyong City", 0, -1);
setBeside(C1, /^Province$/i, "Metro Manila", 0, -1);
setBeside(C1, /ZIP CODE/i, "1550", 2, 0);

// ── C1: education table (III, item 26 — header r52, levels pre-printed) ──
const edu = [
  { row: 55, school: "Mandaluyong Science High School", course: "", from: "2004", to: "2008", grad: "2008", honors: "With Honors" },
  { row: 57, school: "Polytechnic University of the Philippines", course: "BS Industrial Engineering", from: "2008", to: "2013", grad: "2013", honors: "Cum Laude" },
];
for (const e of edu) {
  write(C1, e.row, 3, e.school);
  if (e.course) write(C1, e.row, 6, e.course);
  write(C1, e.row, 9, e.from);
  write(C1, e.row, 10, e.to);
  write(C1, e.row, 12, e.grad);
  write(C1, e.row, 13, e.honors);
}

// ── C2: eligibility (IV, item 27 — header r2, sub-headers r3, data r4+) ──
const eligHit = findLabel(C2, /CAREER SERVICE\/ RA 1080/i);
if (!eligHit) throw new Error("eligibility header missing");
{
  const r = eligHit.r + 2;
  write(C2, r, 1, "CAREER SERVICE PROF. (PROFESSIONAL)");
  write(C2, r, 5, "88.52");
  write(C2, r, 6, "12/05/2015");
  write(C2, r, 8, "Manila");
  write(C2, r, 11, "12-345678");
  write(C2, r, 12, "05/12/2026");
}

// ── C2: work experience (V, item 28 — header r14, From/To r16, data r17+) ──
const workHit = findLabel(C2, /POSITION TITLE/i);
if (!workHit) throw new Error("work header missing");
const workRows = [
  ["01/07/2021", "31/05/2025", "SUPPLY OFFICER III", "DOST-MIRDC", 62000],
  ["01/06/2018", "30/06/2021", "ADMINISTRATIVE OFFICER II", "DOST-PCIEERD", 48000],
];
workRows.forEach((row, i) => {
  const r = workHit.r + 3 + i;
  write(C2, r, 0, row[0]);
  write(C2, r, 2, row[1]);
  write(C2, r, 3, row[2]);
  write(C2, r, 6, row[3]);
  write(C2, r, 9, row[4] as number);
});

// ── C3: L&D (VI, item 29 — header r1, From/To r3, data r4+) ──
const ldHit = findLabel(C3, /TITLE OF LEARNING AND DEVELOPMENT/i);
if (!ldHit) throw new Error("L&D header missing");
const ldRows: Array<[string, string, string, number, string, string]> = [
  ["Supervisory Development Course", "10/03/2023", "15/03/2023", 40, "Supervisory", "CSC-NIMO"],
  ["Basic Occupational Safety & Health", "02/08/2022", "06/08/2022", 32, "Technical", "OSHC"],
];
ldRows.forEach((row, i) => {
  const r = ldHit.r + 3 + i;
  write(C3, r, 1, row[0]);
  write(C3, r, 4, row[1]);
  write(C3, r, 5, row[2]);
  write(C3, r, 6, row[3]);
  write(C3, r, 7, row[4]);
  write(C3, r, 8, row[5]);
});

// ── C3: voluntary work (VII, item 30 — header r23, From/To r25, data r26+) ──
const vwHit = findLabel(C3, /NAME &? AND? ADDRESS OF ORGANIZATION|NAME & ADDRESS/i);
if (!vwHit) throw new Error("voluntary work header missing");
{
  const r = vwHit.r + 3;
  write(C3, r, 1, "Red Cross Mandaluyong Chapter, Boni Ave., Mandaluyong City");
  write(C3, r, 4, "05/06/2019");
  write(C3, r, 5, "20/12/2024");
  write(C3, r, 6, 250);
  write(C3, r, 7, "Volunteer First Aider");
}

// ── C3: other info (item 31-33 — skills header r37, distinctions beside it) ──
const skHit = findLabel(C3, /SPECIAL SKILLS AND HOBBIES/i);
if (!skHit) throw new Error("special skills header missing");
write(C3, skHit.r + 1, skHit.c, "AutoCAD; Data Analytics; Driving");
const awardsHit = findLabel(C3, /NON-ACADEMIC DISTINCTIONS/i);
if (!awardsHit) throw new Error("awards header missing");
write(C3, awardsHit.r + 1, awardsHit.c, "CSC Plaque of Appreciation (2023)");

fs.mkdirSync(OUT_DIR, { recursive: true });
XLSX.writeFile(wb, OUT, { bookType: "xlsx" });
console.log(`Fixture written: ${OUT}`);
