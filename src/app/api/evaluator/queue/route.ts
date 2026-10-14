// ============================================================================
// RMIS — Evaluator review queue (spec §6.5, §7.8). FIFO by dateApplied asc,
// paginated. ?status filters via the stage vocabulary (invalid/absent = ALL).
// Per-row requirements match is computed LIVE from the frozen snapshots vs
// the live Position CSC standards (§8.2) — never persisted.
// ============================================================================

import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { stageForStatus, QUERYABLE_STATUSES, isTerminalApplicationStatus } from "@/lib/status";
import { buildRequirementsReport, type SnapshotShape } from "@/lib/requirements";
import { credentialTagFor } from "@/lib/credential-tag";
import { safeJsonParse } from "@/lib/snapshot";
import { paginationSchema } from "@/lib/validation";

function normStatus(s: string): string {
  return (s || "").toUpperCase().replace(/\s+/g, "_");
}

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const { searchParams } = new URL(req.url);
  const { page, pageSize } = paginationSchema.parse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  const statusParam = searchParams.get("status");
  const statusFilter =
    statusParam && QUERYABLE_STATUSES.includes(statusParam) ? statusParam : null;

  // Datasets are small — fetch all and compute + paginate in memory.
  const rows = await db.application.findMany({
    orderBy: { dateApplied: "asc" },
    include: {
      applicant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emailAddress: true,
          contactNumber: true,
          gender: true,
          isProfileComplete: true,
        },
      },
      job: { include: { position: true } },
    },
  });

  const filtered = statusFilter
    ? rows.filter(
        (r) =>
          normStatus(r.status) === normStatus(statusFilter) ||
          stageForStatus(r.status) === stageForStatus(statusFilter)
      )
    : rows;

  // MOM 2026-10-13 — prior-rejection history per (applicant, job) pair, so
  // evaluators see when an applicant has applied before and was rejected for
  // THIS specific job listing (repost/republication review aid). Computed in
  // memory from the same row set — no extra queries.
  const priorRejectionsByKey = new Map<
    string,
    { count: number; lastDate: Date | null; lastReason: string | null }
  >();
  for (const r of rows) {
    if (!isTerminalApplicationStatus(r.status)) continue; // only rejected family
    if (r.status?.toUpperCase().replace(/\s+/g, "_") === "WITHDRAWN") continue; // withdrawal is the applicant's own action
    const key = `${r.applicantId}:${r.jobId}`;
    const hit = priorRejectionsByKey.get(key) ?? { count: 0, lastDate: null, lastReason: null };
    hit.count += 1;
    if (!hit.lastDate || r.dateApplied > hit.lastDate) {
      hit.lastDate = r.dateApplied;
      hit.lastReason = r.reason ?? null;
    }
    priorRejectionsByKey.set(key, hit);
  }

  const data = filtered.map((app) => {
    const position = app.job.position;
    const snapshot: SnapshotShape = {
      educations: safeJsonParse<SnapshotShape["educations"]>(app.snapshotEducations, []),
      experiences: safeJsonParse<SnapshotShape["experiences"]>(app.snapshotExperiences, []),
      trainings: safeJsonParse<SnapshotShape["trainings"]>(app.snapshotTrainings, []),
      eligibilities: safeJsonParse<SnapshotShape["eligibilities"]>(app.snapshotEligibilities, []),
    };
    const report = buildRequirementsReport(snapshot, position ?? {});
    // Display-only credential tag (frozen snapshot — never live data).
    // ONE tag per card: education, else training, else eligibility.
    const tag = credentialTagFor(snapshot);
    const tags = tag ? [tag] : [];
    return {
      id: app.id,
      status: app.status,
      stage: stageForStatus(app.status),
      reason: app.reason,
      dateApplied: app.dateApplied.toISOString(),
      applicantId: app.applicantId,
      jobId: app.jobId,
      applicant: app.applicant,
      job: {
        id: app.job.id,
        title: position?.positionTitle || app.job.title,
        position: position
          ? { positionTitle: position.positionTitle, placeOfAssignment: position.placeOfAssignment }
          : null,
      },
      match: { verdict: report.verdict, metCount: report.metCount, requiredCount: report.requiredCount },
      tags,
      priorRejections: (() => {
        const hit = priorRejectionsByKey.get(`${app.applicantId}:${app.jobId}`);
        if (!hit) return null;
        // Exclude the CURRENT row itself from its own history: the map counts
        // every rejected row for the pair, so a rejected application looking
        // at its own record would show itself. Subtract when this row is one
        // of the counted rejections.
        const selfCounts =
          !isTerminalApplicationStatus(app.status) || app.status.toUpperCase().replace(/\s+/g, "_") === "WITHDRAWN"
            ? 0
            : 1;
        const count = hit.count - selfCounts;
        if (count <= 0) return null;
        return {
          count,
          lastDate: hit.lastDate ? hit.lastDate.toISOString() : null,
          lastReason: hit.lastReason,
        };
      })(),
    };
  });

  const total = data.length;
  const start = (page - 1) * pageSize;
  const slice = data.slice(start, start + pageSize);
  const hasMore = start + slice.length < total;

  return ok({ data: slice, total, page, pageSize, hasMore });
});
