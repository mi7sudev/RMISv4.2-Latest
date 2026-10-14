// Dump workbook structure: sheets, ranges, and cell contents for diagnosis.
import * as XLSX from "xlsx";

const file = process.argv[2];
const maxRow = Number(process.argv[3] ?? 45);
const wb = XLSX.readFile(`/home/z/my-project/upload/${file}`, { cellDates: false, cellNF: true });
console.log(`SHEETS: ${wb.SheetNames.join(" | ")}`);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  console.log(`\n══ Sheet "${name}" range=${ws["!ref"] ?? "EMPTY"}`);
  if (!ref) continue;
  for (let r = ref.s.r; r <= Math.min(ref.e.r, maxRow); r++) {
    const cells: string[] = [];
    for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 15); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      let t = "";
      if (cell && typeof cell.v === "number" && typeof cell.z === "string" && cell.z.includes("%")) {
        t = `${Math.round(cell.v * 10000) / 100}%`;
      } else if (cell?.v != null) {
        t = String(cell.v).replace(/\s+/g, " ").trim();
      }
      if (t) cells.push(`${XLSX.utils.encode_cell({ r, c })}="${t.slice(0, 60)}"`);
    }
    if (cells.length) console.log(`  r${r}: ${cells.join("  ")}`);
  }
}
