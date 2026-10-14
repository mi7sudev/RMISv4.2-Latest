import * as XLSX from "xlsx";

const rows = [
  ["PERSONAL DATA SHEET", "", ""],
  ["", "", ""],
  ["I. PERSONAL INFORMATION", "", ""],
  ["SURNAME", "DELA CRUZ", ""],
  ["GIVEN NAME", "JUAN", ""],
  ["MIDDLE NAME", "REYES", ""],
  ["DATE OF BIRTH", "05/12/1990", ""],
  ["PLACE OF BIRTH", "MANILA", ""],
  ["SEX", "MALE", ""],
  ["CIVIL STATUS", "SINGLE", ""],
  ["CITIZENSHIP", "FILIPINO", ""],
  ["RESIDENTIAL ADDRESS", "123 RIZAL ST.", ""],
  ["ZIP CODE", "1630", ""],
  ["TELEPHONE / MOBILE", "09171234567", ""],
  ["E-MAIL ADDRESS", "juan.delacruz@example.gov.ph", ""],
];
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "C1");
XLSX.writeFile(wb, "/home/z/.staging-email/pds-test.xlsx", { bookType: "xlsx" });
console.log("xlsx written");
try {
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(rows), "C1");
  XLSX.writeFile(wb2, "/home/z/.staging-email/pds-test.xls", { bookType: "biff8" });
  console.log("xls written");
} catch (e) {
  console.log("biff8 write failed:", e.message);
}
