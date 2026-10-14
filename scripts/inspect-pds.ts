// Inspect workbook structure of PDS files: sheets, dimensions, first cells
import * as XLSX from "xlsx";

const files = [
  "/home/z/my-project/upload/SIMBAJON_FINALIZED PERSONAL DATA SHEET (2017 Revised Edition) 03-26-2025.xlsx",
  "/home/z/my-project/upload/DELIMIOS-PDS.xlsx",
  "/home/z/my-project/upload/cs form 2026.xlsx",
];

for (const f of files) {
  console.log("\n==========================================");
  console.log("FILE:", f.split("/").pop());
  const wb = XLSX.readFile(f, { cellDates: false });
  console.log("Sheets:", wb.SheetNames);
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    console.log(`  [${name}] ref=${ref}`);
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    console.log(`    rows=${range.e.r - range.s.r + 1} cols=${range.e.c - range.s.c + 1}`);
  }
}
