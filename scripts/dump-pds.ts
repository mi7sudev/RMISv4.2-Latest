// Dump non-empty cells in row ranges to understand geometry
import * as XLSX from "xlsx";

const [file, sheet, from, to] = process.argv.slice(2);
const wb = XLSX.readFile(file, { cellDates: false });
const ws = wb.Sheets[sheet];
const range = XLSX.utils.decode_range(ws["!ref"]!);
const r0 = Number(from), r1 = Math.min(Number(to), range.e.r);
const merges = (ws["!merges"] ?? []) as XLSX.Range[];
for (let r = r0; r <= r1; r++) {
  const parts: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell || cell.v == null || String(cell.v).trim() === "") continue;
    const isAnchor = merges.some((m) => m.s.r === r && m.s.c === c);
    const inMerge = merges.some((m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
    const tag = isAnchor ? "A" : inMerge ? "m" : " ";
    parts.push(`${XLSX.utils.encode_cell({ r, c })}${tag}=${JSON.stringify(String(cell.v).slice(0, 60))}`);
  }
  if (parts.length) console.log(`r${r}: ${parts.join("  ")}`);
}
