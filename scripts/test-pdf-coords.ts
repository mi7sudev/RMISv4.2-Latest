// Prototype: coordinate-aware PDF text extraction (rows by y, columns by x)
import { getDocumentProxy } from "unpdf";
import fs from "fs";

const pdfPath = process.argv[2] ?? "/home/z/my-project/upload/SIMBAJON_FINALIZED PERSONAL DATA SHEET (2017 Revised Edition) 03-26-2025.pdf";
const buffer = fs.readFileSync(pdfPath);
const pdf = await getDocumentProxy(new Uint8Array(buffer));
console.log("pages:", pdf.numPages);

for (let p = 1; p <= Math.min(2, pdf.numPages); p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items as Array<{ str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }>;
  // Group into visual lines by y (transform[5]), tolerance ~3pt
  const lines: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    let line = lines.find((l) => Math.abs(l.y - y) < 4);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: it.transform[4], str: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  console.log(`\n=== PAGE ${p} (${lines.length} lines) ===`);
  for (const l of lines.slice(0, 40)) {
    l.parts.sort((a, b) => a.x - b.x);
    // Insert cell separator on big x gaps (> 18pt)
    let out = "";
    let prevEnd = -1;
    for (const part of l.parts) {
      if (prevEnd >= 0 && part.x - prevEnd > 18) out += " │ ";
      else if (out) out += " ";
      out += part.str.trim();
      prevEnd = part.x + part.str.length * 4.2;
    }
    console.log(out);
  }
}
