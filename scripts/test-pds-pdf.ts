// Full PDF pipeline test: extractFromDocument (unpdf text + AI fallback)
import { extractFromDocument, extractPdfText, countExtractedFields } from "../src/lib/pds-extract";

const pdf = "/home/z/my-project/upload/SIMBAJON_FINALIZED PERSONAL DATA SHEET (2017 Revised Edition) 03-26-2025.pdf";

const text = await extractPdfText(pdf);
console.log("PDF text length:", text.length);
console.log("--- first 600 chars ---");
console.log(text.slice(0, 600));
console.log("--- ---------------- ---");

const t0 = Date.now();
const { result, error } = await extractFromDocument(pdf, "pds", "application/pdf");
console.log(`extractFromDocument in ${Date.now() - t0}ms — error=${error ?? "none"} fields=${countExtractedFields(result)}`);
if (result?.personalInfo) {
  console.log("PERSONAL:");
  for (const [k, v] of Object.entries(result.personalInfo)) console.log(`  ${k} = ${JSON.stringify(v.value)} (${v.confidence})`);
}
for (const key of ["educations", "workExperiences", "trainings", "eligibilities", "awards"] as const) {
  console.log(`${key.toUpperCase()} (${result?.[key]?.length ?? 0}):`);
  for (const item of result?.[key] ?? []) {
    console.log("  -", Object.entries(item).map(([k, v]) => `${k}=${JSON.stringify(v.value)}`).join(" | "));
  }
}
