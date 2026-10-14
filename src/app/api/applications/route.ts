// ============================================================================
// RMIS — Applicant's own applications (spec §6.2). Newest first; each embeds
// the job + position with the resolved title, plus an `assessments: []`
// compatibility field.
// ============================================================================

import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireApplicantFromReq } from "@/lib/auth";

export const GET = handleApi(async (req: Request) => {
  const user = await requireApplicantFromReq(req);
  if (user.applicantId == null) return ok([]);

  const apps = await db.application.findMany({
    where: { applicantId: user.applicantId },
    orderBy: { dateApplied: "desc" },
    include: { job: { include: { position: true } } },
  });

  return ok(
    apps.map((app) => ({
      ...app,
      job: {
        ...app.job,
        title: app.job.position?.positionTitle || app.job.title,
        position: app.job.position,
      },
      assessments: [],
    }))
  );
});
