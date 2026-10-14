// Run the deterministic PDS parser against the uploaded files and print results
import { parsePdsWorkbook, countExtractedFields, extractPdfText, extractExcelText } from "../src/lib/pds-extract";

const files = process.argv.slice(2);
for (const f of files) {
  console.log("\n==========================================");
  console.log("FILE:", f.split("/").pop());
  if (f.endsWith(".pdf")) {
    const t = await extractPdfText(f);
    console.log("PDF text length:", t.length);
    console.log(t.slice(0, 1200));
    continue;
  }
  const t0 = Date.now();
  const result = parsePdsWorkbook(f);
  const ms = Date.now() - t0;
  if (!result) {
    console.log("RESULT: null (not recognized as PDS)");
    const t = extractExcelText(f);
    console.log("excelText length:", t.length);
    continue;
  }
  console.log(`RESULT in ${ms}ms — fields=${countExtractedFields(result)} warnings=${JSON.stringify(result.warnings)}`);
  if (result.personalInfo) {
    console.log("PERSONAL:");
    for (const [k, v] of Object.entries(result.personalInfo)) console.log(`  ${k} = ${JSON.stringify(v.value)} (${v.confidence})`);
  }
  for (const key of ["educations", "workExperiences", "trainings", "eligibilities", "awards"] as const) {
    const arr = result[key];
    console.log(`${key.toUpperCase()} (${arr?.length ?? 0}):`);
    for (const item of arr ?? []) {
      const parts = Object.entries(item).map(([k, v]) => `${k}=${JSON.stringify(v.value)}`);
      console.log("  -", parts.join(" | "));
    }
  }
}
