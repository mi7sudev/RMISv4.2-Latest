// ============================================================================
// RMIS — Application cancellation (spec §6.2, §7.7). APPLICANT-only, own
// applications; cancellable only while the status is in the Applied stage.
// Deleting re-opens the position for a fresh application.
// ============================================================================

import { db } from "@/lib/db";
import { ok, ApiError, handleApi } from "@/lib/api";
import { requireApplicantFromReq } from "@/lib/auth";
import { stageForStatus } from "@/lib/status";

export const DELETE = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApplicantFromReq(req);
  const raw = (await ctx.params).id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Invalid id", 400);

  const app = await db.application.findUnique({ where: { id } });
  if (!app) throw new ApiError("Application not found", 404);

  // Ownership check — applicants may only cancel their own applications.
  if (app.applicantId !== user.applicantId) {
    throw new ApiError("Forbidden", 403);
  }

  // Cancellable only while "Applied" (spec §4.3, §7.7).
  if (stageForStatus(app.status) !== "Applied") {
    throw new ApiError(
      "This application is already being processed. Please contact HR if you wish to withdraw.",
      400
    );
  }

  await db.application.delete({ where: { id } });
  return ok({ id, cancelled: true });
});
