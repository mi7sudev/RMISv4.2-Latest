// ============================================================================
// RMIS — AI application fit summary (GET /api/evaluator/applications/[id]/summary).
// Grounded one-paragraph screening summary for the Review Workspace's
// "AI Summary" card: the prompt is built STRICTLY from the frozen snapshot +
// the live requirements report (same inputs the evaluator sees), the model is
// instructed to never invent qualifications, and any failure falls back to a
// deterministic composition — the card always has truthful content.
// Responses are cached in memory per (application, updatedAt, verdict) so
// re-opening the dossier or a poll refresh never re-bills the LLM.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi, parseId } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { buildRequirementsReport, type SnapshotShape } from "@/lib/requirements";
import { safeJsonParse } from "@/lib/snapshot";
import ZAI from "z-ai-web-dev-sdk";

type SummarySource = "ai" | "fallback";

type SummaryCacheEntry = { summary: string; source: SummarySource };

/** In-memory cache keyed by `${id}:${updatedAtMs}:${verdict}` — a status
 *  change or snapshot edit naturally invalidates the entry via updatedAt. */
const summaryCache = new Map<string, SummaryCacheEntry>();
const CACHE_LIMIT = 200;

function cacheGet(key: string): SummaryCacheEntry | undefined {
  const hit = summaryCache.get(key);
  if (hit && summaryCache.size > CACHE_LIMIT) {
    // Simple freshness heuristic: refresh the insertion order on hit so the
    // map behaves like a tiny LRU without extra bookkeeping structures.
    summaryCache.delete(key);
    summaryCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, entry: SummaryCacheEntry) {
  if (summaryCache.size >= CACHE_LIMIT) {
    const oldest = summaryCache.keys().next().value;
    if (oldest !== undefined) summaryCache.delete(oldest);
  }
  summaryCache.set(key, entry);
}

/** Deterministic, always-available summary — also the LLM fallback. */
function fallbackSummary(
  verdictLabel: string,
  metCount: number,
  requiredCount: number,
  shortfalls: string[]
): string {
  if (requiredCount === 0) {
    return "This posting has no published minimum standards to check, so qualification rests on the evaluator's review of the credentials on file.";
  }
  const head =
    metCount === requiredCount
      ? `The applicant meets all ${requiredCount} published standards for this posting (${verdictLabel.toLowerCase()}).`
      : `The applicant meets ${metCount} of ${requiredCount} published standards for this posting (${verdictLabel.toLowerCase()}).`;
  const tail = shortfalls.length
    ? ` Outstanding gaps: ${shortfalls.slice(0, 3).join("; ")}.`
    : " Every minimum qualification is supported by the credentials on file.";
  return head + tail;
}

function short(text: unknown, max = 220): string {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ── GET — grounded fit summary ──────────────────────────────────────────────

export const GET = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const app = await db.application.findUnique({
    where: { id },
    include: { job: { include: { position: true } } },
  });
  if (!app) throw new ApiError("Application not found", 404);

  const position = app.job.position;
  const snapshot: SnapshotShape = {
    educations: safeJsonParse<SnapshotShape["educations"]>(app.snapshotEducations, []),
    experiences: safeJsonParse<SnapshotShape["experiences"]>(app.snapshotExperiences, []),
    trainings: safeJsonParse<SnapshotShape["trainings"]>(app.snapshotTrainings, []),
    eligibilities: safeJsonParse<SnapshotShape["eligibilities"]>(app.snapshotEligibilities, []),
  };
  const report = buildRequirementsReport(snapshot, position ?? {});
  const relevant = report.checks.filter((c) => c.status !== "NOT_REQUIRED");
  const shortfalls = relevant.filter((c) => c.shortfall).map((c) => short(c.shortfall, 140));

  const cacheKey = `${id}:${app.updatedAt.getTime()}:${report.verdict}`;
  const cached = cacheGet(cacheKey);
  if (cached) return ok({ ...cached, generatedAt: new Date().toISOString(), cached: true });

  // Fact sheet — the ONLY context the model receives (grounded, no live DB
  // access from the model, no applicant identifiers beyond the position).
  const facts = {
    position: position?.positionTitle || app.job.title,
    placeOfAssignment: position?.placeOfAssignment ?? null,
    requirements: relevant.map((c) => ({
      dimension: c.dimension,
      status: c.status,
      standard: short(c.standard, 200),
      onFile: short(c.applicantSummary, 200) || "nothing on file",
      shortfall: c.shortfall ? short(c.shortfall, 140) : null,
    })),
    verdict: report.verdict,
    met: report.metCount,
    required: report.requiredCount,
    experience: snapshot.experiences.slice(0, 4).map((e) => ({
      role: short((e as Record<string, unknown>).positionTitle, 80),
      employer: short((e as Record<string, unknown>).employerName, 80),
      period: `${short((e as Record<string, unknown>).dateFrom, 20)} – ${
        (e as Record<string, unknown>).isPresentWork ? "Present" : short((e as Record<string, unknown>).dateTo, 20)
      }`,
    })),
    education: snapshot.educations.slice(0, 3).map((e) => ({
      level: short((e as Record<string, unknown>).educationLevel, 60),
      course: short((e as Record<string, unknown>).course ?? (e as Record<string, unknown>).degree, 80),
      school: short((e as Record<string, unknown>).schoolName, 80),
      graduated: short((e as Record<string, unknown>).yearGraduated, 20) || null,
    })),
    trainings: snapshot.trainings.length
      ? `${snapshot.trainings.length} entr${snapshot.trainings.length === 1 ? "y" : "ies"} on file`
      : "none on file",
    eligibilities: snapshot.eligibilities
      .slice(0, 3)
      .map((e) => short((e as Record<string, unknown>).title ?? (e as Record<string, unknown>).eligibilityTitle, 80)),
  };

  const SYSTEM_PROMPT = [
    "You are an HR screening assistant for DOST-MIRDC, a Philippine government research agency.",
    "Write a concise fit summary (2-3 sentences, at most 65 words) that helps an evaluator decide whether to shortlist this applicant.",
    "Use ONLY the facts provided — never invent qualifications, dates, numbers, or names.",
    "Lead with the strongest match, then note any shortfall verbatim if present.",
    "Third person, plain text, no markdown, no salutations, no sign-off.",
  ].join(" ");

  let summary = "";
  let source: SummarySource = "fallback";
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(facts) },
      ],
      thinking: { type: "disabled" },
    });
    const text = (completion.choices[0]?.message?.content ?? "").trim();
    // Sanity gate: reject empty or suspiciously long output; strip wrapping
    // quotes some models add despite instructions.
    const clean = text.replace(/^["“]+|["”]+$/g, "").trim();
    if (clean && clean.length <= 900) {
      summary = clean;
      source = "ai";
    }
  } catch {
    /* LLM unavailable — deterministic fallback below keeps the card truthful */
  }

  if (!summary) {
    const verdictLabels: Record<string, string> = {
      ALL_MET: "Qualified",
      PARTIAL: "Partial",
      NONE_MET: "Not qualified",
      NEEDS_REVIEW: "Needs verification",
      NO_REQUIREMENTS: "No published requirements",
    };
    summary = fallbackSummary(
      verdictLabels[report.verdict] ?? report.verdict,
      report.metCount,
      report.requiredCount,
      shortfalls
    );
    source = "fallback";
  }

  cacheSet(cacheKey, { summary, source });
  return ok({ summary, source, generatedAt: new Date().toISOString(), cached: false });
});
