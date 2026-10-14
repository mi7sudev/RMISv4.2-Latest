// ============================================================================
// RMIS — Work experience section CRUD (spec §6.3, §5.3). APPLICANT-only.
// POST computes yearDecimal (MQR denominator): derived from inclusive dates
// with 365.25-day years; open-ended (isPresentWork or missing dateTo) counts
// to today. GET = own rows ordered ord asc. No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { workExperienceSchema, orNull } from "@/lib/validation";

const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 365.25-day years; open-ended rows count to today (spec §8.2). */
function computeYearDecimal(dateFrom: Date | null, dateTo: Date | null, isPresent: boolean): number | null {
  if (!dateFrom) return null;
  const end = isPresent || !dateTo ? new Date() : dateTo;
  const years = (end.getTime() - dateFrom.getTime()) / 86_400_000 / 365.25;
  return years > 0 ? years : 0;
}

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.workExperience.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = workExperienceSchema.parse(await req.json().catch(() => ({})));

  const isPresent = body.isPresentWork === true;
  const dateFrom = toDate(body.dateFrom);
  const dateTo = toDate(body.dateTo);

  const row = await db.workExperience.create({
    data: {
      applicantId: applicant.id,
      positionTitle: orNull(body.positionTitle),
      employerName: orNull(body.employerName),
      employerAddress: orNull(body.employerAddress),
      isPresentWork: isPresent,
      isGovtService: body.isGovtService === true,
      dateFrom,
      dateTo,
      statusOfEmployment: orNull(body.statusOfEmployment),
      monthlySalary: body.monthlySalary ?? null,
      supervisorName: orNull(body.supervisorName),
      supervisorPosition: orNull(body.supervisorPosition),
      office: orNull(body.office),
      reasonForLeaving: orNull(body.reasonForLeaving),
      accomplishment: orNull(body.accomplishment),
      actualDuties: orNull(body.actualDuties),
      hrRemarks: orNull(body.hrRemarks),
      yearDecimal: computeYearDecimal(dateFrom, dateTo, isPresent),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
