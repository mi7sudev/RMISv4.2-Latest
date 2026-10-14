// ============================================================================
// RMIS — GET /api/admin/stats (ADMIN, spec §6.6)
// Dashboard counts + status distribution (status.ts normalization in memory)
// + 8 most recent applications + Needs-Attention tiles.
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { getStatusMeta, stageForStatus, isRejectedStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const PENDING_REVIEW_STATUSES = new Set([
  "Applied",
  "APPLIED",
  "PENDING",
  "FOR_EVALUATION",
  "UNDER_REVIEW",
  "SCREENING",
  "EVALUATION",
  "FINAL_REVIEW",
]);

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(startOfToday.getTime() + 7 * 24 * 3600 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const [
    totalUsers,
    admins,
    applicants,
    evaluators,
    activeJobs,
    totalApplications,
    statusRows,
    recent,
    failedLogins24h,
    deadlinesThisWeek,
    blockedUsers,
    incompleteProfiles,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "ADMIN" } }),
    db.user.count({ where: { role: "APPLICANT" } }),
    db.user.count({ where: { role: { notIn: ["ADMIN", "APPLICANT"] } } }),
    // NOTE: `publishedAt` is non-nullable in this normalized schema (defaults to
    // now()), so the spec's "publishedAt not null" predicate is vacuous here.
    db.jobPosting.count({
      where: {
        OR: [{ deadlineDate: null }, { deadlineDate: { gte: startOfToday } }],
      },
    }),
    db.application.count(),
    db.application.findMany({ select: { status: true } }),
    db.application.findMany({
      orderBy: { dateApplied: "desc" },
      take: 8,
      include: {
        applicant: { select: { id: true, firstName: true, lastName: true } },
        job: {
          select: {
            id: true,
            title: true,
            position: { select: { id: true, positionTitle: true } },
          },
        },
      },
    }),
    db.auditLog.count({ where: { action: "LOGIN_FAILED", timestamp: { gte: dayAgo } } }),
    db.jobPosting.count({
      where: {
        deadlineDate: { gte: startOfToday, lte: weekEnd },
      },
    }),
    db.user.count({ where: { blocked: true } }),
    db.applicant.count({ where: { isProfileComplete: false } }),
  ]);

  // ── Status distribution (in-memory normalization of mixed spellings) ──────
  const byStatusMap = new Map<string, number>();
  let pendingReview = 0;
  let shortlisted = 0;
  let rejected = 0;
  for (const row of statusRows) {
    const raw = row.status ?? "";
    const label = getStatusMeta(raw === "" ? null : raw).label;
    byStatusMap.set(label, (byStatusMap.get(label) ?? 0) + 1);
    if (PENDING_REVIEW_STATUSES.has(raw) || raw === "") pendingReview += 1;
    if (stageForStatus(raw === "" ? null : raw) === "Shortlisted") shortlisted += 1;
    if (isRejectedStatus(raw)) rejected += 1;
  }
  const byStatus = Array.from(byStatusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  return ok({
    totalUsers,
    admins,
    applicants,
    evaluators,
    activeJobs,
    totalApplications,
    pendingReview,
    shortlisted,
    rejected,
    byStatus,
    recent: recent.map((a) => ({
      id: a.id,
      status: getStatusMeta(a.status).label,
      dateApplied: a.dateApplied,
      applicant: {
        id: a.applicant.id,
        firstName: a.applicant.firstName,
        lastName: a.applicant.lastName,
      },
      jobId: a.job.id,
      jobTitle: a.job.title,
      positionTitle: a.job.position?.positionTitle ?? null,
    })),
    needsAttention: {
      failedLogins24h,
      deadlinesThisWeek,
      blockedUsers,
      incompleteProfiles,
    },
  });
});
