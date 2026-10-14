// ============================================================================
// RMIS — Awards section CRUD (spec §6.3, §5.3). APPLICANT-only.
// dateGranted stays TEXT. GET = own rows ordered ord asc.
// No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardSchema, orNull } from "@/lib/validation";


export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.award.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = awardSchema.parse(await req.json().catch(() => ({})));

  const row = await db.award.create({
    data: {
      applicantId: applicant.id,
      recognitionType: orNull(body.recognitionType),
      scope: orNull(body.scope),
      details: orNull(body.details),
      category: orNull(body.category),
      provider: orNull(body.provider),
      dateGranted: orNull(body.dateGranted),
      points: body.points ?? null,
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
