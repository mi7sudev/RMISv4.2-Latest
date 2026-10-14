// ============================================================================
// RMIS — Training delete (spec §6.3). Ownership enforced: the row's
// applicantId must match the caller's, otherwise 404.
// ============================================================================

import { ok, handleApi, ApiError, parseId } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";

export const DELETE = handleApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { applicant } = await requireApplicantRow(req);
  const { id } = await params;

  const row = await db.training.findUnique({ where: { id: parseId(id) } });
  if (!row || row.applicantId !== applicant.id) throw new ApiError("Not found", 404);

  await db.training.delete({ where: { id: row.id } });
  return ok({ id: row.id, deleted: true });
});
