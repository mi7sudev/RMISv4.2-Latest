// ============================================================================
// PDS extraction benchmark harness — runs the REAL production pipeline
// (extractFromDocument: deterministic → AI fallback → vision) against the
// agency sample documents and prints an enterprise-style scorecard per file:
//   parser path · duration · fields · quality score/grade · review flags
//   section counts · confidence histogram · meta
// Usage:
//   bun run scripts/pds-benchmark.ts          # rules-only (xlsx deterministic)
//   bun run scripts/pds-benchmark.ts --ai     # full path incl. AI/vision calls
// ============================================================================

import fs from "fs";
import path from "path";
import { extractFromDocument, parsePdsWorkbook, countExtractedFields, type ExtractionResult } from "../src/lib/pds-extract";
import { finalizeExtraction } from "../src/lib/pds-validate";

const UPLOAD_DIR = path.join(process.cwd(), "upload");
const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");
// The official benchmark corpus: agency samples + the generated 2026 fixture.
const PATTERN = /DELIMIOS-PDS\.xlsx|SIMBAJON.*PERSONAL DATA SHEET.*\.(pdf|xlsx)$|cs form 2026\.xlsx|pds-2026-filled\.xlsx/i;

type Row = {
  file: string;
  bytes: number;
  ms: number;
  fields: number;
  path: string;
  sections: Record<string, number>;
  confidence: Record<string, number>;
  quality?: { score: number; grade: string; needsReview: number; issues: number };
  meta?: ExtractionResult["meta"];
  warnings: string[];
};

function histogram(r: ExtractionResult | null): Record<string, number> {
  const h: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };
  const count = (s?: Record<string, { confidence?: string }>) => {
    for (const v of Object.values(s ?? {})) h[v?.confidence ?? "none"] = (h[v?.confidence ?? "none"] ?? 0) + 1;
  };
  count(r?.personalInfo);
  for (const arr of [r?.educations, r?.workExperiences, r?.trainings, r?.eligibilities, r?.awards, r?.voluntaryWork, r?.specialSkills]) {
    for (const row of arr ?? []) count(row);
  }
  return h;
}

function sectionCounts(r: ExtractionResult | null): Record<string, number> {
  return {
    personal: Object.keys(r?.personalInfo ?? {}).length,
    edu: r?.educations?.length ?? 0,
    work: r?.workExperiences?.length ?? 0,
    train: r?.trainings?.length ?? 0,
    elig: r?.eligibilities?.length ?? 0,
    awards: r?.awards?.length ?? 0,
    vol: r?.voluntaryWork?.length ?? 0,
    skills: r?.specialSkills?.length ?? 0,
  };
}

async function benchmarkFile(file: string, dir: string, useAi: boolean): Promise<Row> {
  const abs = path.join(dir, file);
  const ext = path.extname(abs).toLowerCase();
  const bytes = fs.statSync(abs).size;
  const t0 = performance.now();
  let result: ExtractionResult | null = null;
  let usedPath = "deterministic";
  if (!useAi && /\.(xlsx|xls|xlsm)$/.test(ext)) {
    result = parsePdsWorkbook(abs);
    result = countExtractedFields(result) > 0 ? finalizeExtraction(result, { parserPath: "deterministic", formRevision: null, durationMs: 0 }) : result;
  } else {
    const out = await extractFromDocument(abs, "PDS", ext === ".pdf" ? "application/pdf" : ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === ".xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "image/png");
    result = out.result;
    error = out.error;
    usedPath = result?.meta?.parserPath ?? (error ? `error: ${error.slice(0, 40)}` : "none");
  }
  const ms = Math.round(performance.now() - t0);
  return {
    file,
    bytes,
    ms,
    fields: countExtractedFields(result),
    path: usedPath,
    sections: sectionCounts(result),
    confidence: histogram(result),
    quality: result?.quality
      ? { score: result.quality.score, grade: result.quality.grade, needsReview: result.quality.needsReview, issues: result.quality.issues.length }
      : undefined,
    meta: result?.meta,
    warnings: result?.warnings ?? [],
  };
}

let error: string | undefined = undefined;

async function main() {
  const useAi = process.argv.slice(2).includes("--ai");
  const collect = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => PATTERN.test(f)).map((f) => ({ dir, f })) : [];
  const files = [...collect(UPLOAD_DIR), ...collect(FIXTURE_DIR)];
  console.log(`\n═ PDS EXTRACTION BENCHMARK — ${files.length} file(s), mode=${useAi ? "FULL (AI/vision enabled)" : "RULES-ONLY"} ═\n`);
  let pass = 0;
  const failures: string[] = [];
  for (const { dir, f } of files) {
    try {
      const row = await benchmarkFile(f, dir, useAi);
      const blankOk = /cs form 2026\.xlsx/i.test(f) && row.fields === 0; // blank template must stay empty
      const filled = !/cs form 2026\.xlsx/i.test(f);
      const ok = blankOk || (filled && row.fields >= 20);
      if (ok) pass++;
      else failures.push(f);
      console.log(`${ok ? "✓" : "✗"} ${row.file}  (${(row.bytes / 1024).toFixed(0)} KB)`);
      console.log(`  path=${row.path}  ms=${row.ms}  fields=${row.fields}${row.quality ? `  quality=${row.quality.score}/100 (${row.quality.grade})  needsReview=${row.quality.needsReview}` : ""}`);
      console.log(`  sections: ${JSON.stringify(row.sections)}`);
      console.log(`  confidence: ${JSON.stringify(row.confidence)}`);
      if (row.meta?.formRevision) console.log(`  formRevision: ${row.meta.formRevision}`);
      if (row.warnings.length) console.log(`  warnings: ${row.warnings.join(" | ")}`);
      console.log("");
    } catch (e) {
      failures.push(f);
      console.log(`✗ ${f}  CRASH: ${e instanceof Error ? e.message : e}\n`);
    }
  }
  console.log(`═ RESULT: ${pass}/${files.length} passed${failures.length ? ` — failures: ${failures.join(", ")}` : ""} ═\n`);
  process.exit(failures.length ? 1 : 0);
}

void main();
