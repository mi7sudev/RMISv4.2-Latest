// ============================================================================
// RMIS — Training section CRUD (spec §6.3, §5.3). APPLICANT-only.
// POST falls back hourDecimal = numberHours when hourDecimal is not provided
// (MQR: hour_decimal ?? number_hours). GET = own rows ordered ord asc.
// No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { trainingSchema, orNull } from "@/lib/validation";

const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.training.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = trainingSchema.parse(await req.json().catch(() => ({})));

  const numberHours = body.numberHours ?? null;
  const row = await db.training.create({
    data: {
      applicantId: applicant.id,
      title: orNull(body.title),
      typeOfTraining: orNull(body.typeOfTraining),
      specifyTraining: orNull(body.specifyTraining),
      numberHours,
      hourDecimal: body.hourDecimal ?? numberHours, // MQR fallback (§5.3)
      isPresentWork: body.isPresentWork === true,
      isGovtService: body.isGovtService === true,
      dateFrom: toDate(body.dateFrom),
      dateTo: toDate(body.dateTo),
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
