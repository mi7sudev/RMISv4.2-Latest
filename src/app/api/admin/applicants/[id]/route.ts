// ============================================================================
// RMIS — GET /api/admin/applicants/[id] (EVALUATOR/ADMIN, spec §6.6)
// FULL LIVE profile (contrast: evaluator review reads frozen snapshots):
// every applicant field, all 5 profile sections ordered by `ord`, parsed
// characterReferences, documents (all fields), and application history with
// job title + position title. 404 when missing.
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok, ApiError } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { safeJsonParse } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleApi(async (req: Request, ctx: Ctx) => {
  await requireEvaluatorFromReq(req);
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId, 10);
  if (Number.isNaN(id)) throw new ApiError("Invalid id", 400);

  const applicant = await db.applicant.findUnique({
    where: { id },
    include: {
      educations: { orderBy: { ord: "asc" } },
      workExperiences: { orderBy: { ord: "asc" } },
      trainings: { orderBy: { ord: "asc" } },
      eligibilities: { orderBy: { ord: "asc" } },
      awards: { orderBy: { ord: "asc" } },
      documents: true,
      user: {
        select: { id: true, email: true, username: true, role: true, blocked: true },
      },
      applications: {
        orderBy: { dateApplied: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              position: { select: { id: true, positionTitle: true } },
            },
          },
        },
      },
    },
  });
  if (!applicant) throw new ApiError("Applicant not found", 404);

  const { characterReference, ...rest } = applicant;

  return ok({
    ...rest,
    characterReferences: safeJsonParse<unknown[]>(characterReference, []),
    applications: applicant.applications.map((a) => ({
      id: a.id,
      status: a.status,
      dateApplied: a.dateApplied,
      jobId: a.jobId,
      positionTitle: a.job.position?.positionTitle ?? null,
      jobTitle: a.job.title,
    })),
  });
});
