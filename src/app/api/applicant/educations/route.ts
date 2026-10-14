// ============================================================================
// RMIS — Education section CRUD (spec §6.3). APPLICANT-only.
// GET = own rows ordered ord asc; POST = create (ord = Date.now());
// edit is modeled as delete + recreate client-side (no PUT, per spec).
// ============================================================================

import { ok, handleApi } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { educationSchema, orNull } from "@/lib/validation";


export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.education.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = educationSchema.parse(await req.json().catch(() => ({})));

  const row = await db.education.create({
    data: {
      applicantId: applicant.id,
      educationLevel: orNull(body.educationLevel),
      degree: orNull(body.degree),
      course: orNull(body.course),
      specifyOthers: orNull(body.specifyOthers),
      schoolName: orNull(body.schoolName),
      ongoing: body.ongoing === true,
      isHighestEducation: body.isHighestEducation === true,
      yearFrom: orNull(body.yearFrom),
      yearTo: orNull(body.yearTo),
      highestLevel: orNull(body.highestLevel),
      unitsEarned: orNull(body.unitsEarned),
      yearGraduated: orNull(body.yearGraduated),
      awards: orNull(body.awards),
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
