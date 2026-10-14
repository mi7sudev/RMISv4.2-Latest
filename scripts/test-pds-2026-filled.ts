// Simulate a FILLED CS Form 212 (Revised 2026): write sample applicant data
// into the blank template the way an agency user would, then run the parser.
// Proves the 2026 edition (dd/mm/yyyy, continuation sheets, new labels) parses.
import * as XLSX from "xlsx";
import { parsePdsWorkbook, countExtractedFields } from "../src/lib/pds-extract";

const SRC = "/home/z/my-project/upload/cs form 2026.xlsx";
const OUT = "/tmp/cs-form-2026-filled.xlsx";

const wb = XLSX.readFile(SRC, { cellDates: false, cellNF: true });
const set = (sheet: string, addr: string, v: unknown) => {
  const ws = wb.Sheets[sheet];
  ws[addr] = { t: typeof v === "number" ? "n" : "s", v } as XLSX.CellObject;
};

// ── C1 personal (dd/mm/yyyy per 2026) ──
set("C1", "D10", "DELA CRUZ");          // 1. SURNAME
set("C1", "D11", "JUAN MIGUEL");        // 2. FIRST NAME
set("C1", "L12", "JR.");                // name extension value area
set("C1", "D12", "REYES");              // 3? MIDDLE NAME
set("C1", "D13", "29/12/2001");         // DATE OF BIRTH (dd/mm/yyyy)
set("C1", "D15", "QUEZON CITY");        // PLACE OF BIRTH
set("C1", "D22", "1.70");               // HEIGHT
set("C1", "D24", "70");                 // WEIGHT
set("C1", "D25", "O+");                 // BLOOD TYPE
set("C1", "D29", "121249205283");       // PAG-IBIG
set("C1", "D31", "02-027236313-8");     // PHILHEALTH
set("C1", "D32", "1234-5678-9012");     // PhilSys PCN
set("C1", "D33", "662-931-426-00000");  // TIN
set("C1", "I17", "LOT 5 BLK. 3");       // residential house
set("C1", "L17", "RIZAL STREET");       // residential street
set("C1", "I19", "SAINT JOSEPH SUBDIVISION");
set("C1", "L19", "SANTA LUCIA");
set("C1", "I22", "SAN JUAN CITY");
set("C1", "L22", "METRO MANILA, NCR");
set("C1", "I24", "1500");               // residential zip (right of ZIP CODE box)
set("C1", "I33", "09171234567");        // 20. MOBILE NO.
set("C1", "I34", "juan.delacruz@test.ph"); // 21. E-MAIL

// ── C2: eligibility + work experience ──
set("C2", "A5", "CAREER SERVICE PROFESSIONAL EXAM");
const ratingCell = { t: "n", v: 0.8853, z: "0.00%" } as XLSX.CellObject;
wb.Sheets["C2"]["F5"] = ratingCell;
set("C2", "G5", "03/03/2024");          // date of exam (dd/mm/yyyy)
set("C2", "I5", "DR. JOSEFA JARA MARTINEZ HIGH SCHOOL");
set("C2", "L5", "Examinee No: 596531");
// Work experience rows (sheet rows 16-19 → r15-18): From/To in cols A/B, title D, employer G, salary J
set("C2", "A16", "02/01/2025");         // From (dd/mm/yyyy)
set("C2", "B16", "Present");
set("C2", "D16", "INFORMATION SYSTEMS ANALYST I");
set("C2", "G16", "METALS INDUSTRY RESEARCH AND DEVELOPMENT CENTER");
set("C2", "J16", 32245);
set("C2", "A17", "18/11/2024");
set("C2", "B17", "31/12/2024");
set("C2", "D17", "NUTRITION OFFICER II");
set("C2", "G17", "NATIONAL NUTRITION COUNCIL CENTRAL OFFICE");
set("C2", "J17", 35535);

// ── C3: L&D trainings (title col B, From/To E/F, hours G, type H) ──
set("C3", "B3", "RESPONSIVE WEB DESIGN");
set("C3", "E3", "09/05/2022");
set("C3", "F3", "19/09/2022");
set("C3", "G3", "300 HOURS");
set("C3", "H3", "TECHNICAL");
set("C3", "B4", "FOUNDATIONS OF PROJECT MANAGEMENT");
set("C3", "E4", "24/08/2021");
set("C3", "F4", "09/03/2021");
set("C3", "G4", "6 HOURS");
set("C3", "H4", "MANAGERIAL");

XLSX.writeFile(wb, OUT);
console.log("Wrote", OUT);

const result = parsePdsWorkbook(OUT);
if (!result) {
  console.log("RESULT: null — NOT recognized as PDS!");
  process.exit(1);
}
console.log(`fields=${countExtractedFields(result)} warnings=${JSON.stringify(result.warnings)}`);
if (result.personalInfo) {
  console.log("PERSONAL:");
  for (const [k, v] of Object.entries(result.personalInfo)) console.log(`  ${k} = ${JSON.stringify(v.value)} (${v.confidence})`);
}
for (const key of ["educations", "workExperiences", "trainings", "eligibilities"] as const) {
  console.log(`${key.toUpperCase()} (${result[key]?.length ?? 0}):`);
  for (const item of result[key] ?? []) {
    console.log("  -", Object.entries(item).map(([k, v]) => `${k}=${JSON.stringify(v.value)}`).join(" | "));
  }
}
