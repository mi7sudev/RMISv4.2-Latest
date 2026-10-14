// ============================================================================
// RMIS — MQR pre-check (spec §6.2, §8.1). APPLICANT-only, read-only: runs the
// binary MQR engine against the linked Position's CSC standards. Never
// persisted; the same gate is re-enforced server-side at /api/jobs/apply.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi } from "@/lib/api";
import { requireApplicantFromReq } from "@/lib/auth";
import { verifyMqr, allMet, type MqrInput } from "@/lib/mqr";

export const POST = handleApi(async (req: Request) => {
  const user = await requireApplicantFromReq(req);

  const body = await req.json().catch(() => ({}));
  const jobId = Number((body as { jobId?: unknown }).jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) throw new ApiError("jobId is required", 400);

  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: { position: true },
  });
  if (!job || !job.publishedAt) throw new ApiError("Job posting not found", 404);

  if (user.applicantId == null) throw new ApiError("Applicant profile not found", 404);
  const applicant = await db.applicant.findUnique({
    where: { id: user.applicantId },
    include: {
      educations: true,
      workExperiences: true,
      trainings: true,
      eligibilities: true,
    },
  });
  if (!applicant) throw new ApiError("Applicant profile not found", 404);

  // MqrInput expects `education` (the engine's name for the education list).
  const mqrInput: MqrInput = {
    education: applicant.educations,
    eligibilities: applicant.eligibilities,
    workExperiences: applicant.workExperiences,
    trainings: applicant.trainings,
  };

  const mqrResults = verifyMqr(mqrInput, job.position ?? {});
  return ok({ mqrResults, allMet: allMet(mqrResults) });
});
