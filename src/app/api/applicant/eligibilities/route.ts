// ============================================================================
// RMIS — Eligibility section CRUD (spec §6.3, §5.3). APPLICANT-only.
// POST resolves the title against the eligibility vocabulary via the shared
// resolver (lib/eligibility-ref): explicit eligibilityId preferred, else
// canonical find-or-create (draft rows carry index 99; registry-known titles
// resolve to the canonical CSC name without creating a draft). Title is
// required (400 otherwise). GET = own rows ordered ord asc (title is stored
// directly on the row — no link-chain backfill needed in the normalized
// schema). No PUT (edit = delete + recreate).
// ============================================================================

import { ok, handleApi, ApiError } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveEligibilityTitle } from "@/lib/eligibility-ref";
import { eligibilitySchema, orNull } from "@/lib/validation";


export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const rows = await db.eligibility.findMany({ where: { applicantId: applicant.id }, orderBy: { ord: "asc" } });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const body = eligibilitySchema.parse(await req.json().catch(() => ({})));

  const title = (body.title ?? "").trim();
  if (!title) throw new ApiError("Eligibility title is required", 400);

  const resolvedTitle = await resolveEligibilityTitle(title, body.eligibilityId ?? null);

  const row = await db.eligibility.create({
    data: {
      applicantId: applicant.id,
      title: resolvedTitle,
      rating: orNull(body.rating),
      examDate: orNull(body.examDate),
      examPlace: orNull(body.examPlace),
      licenseNumber: orNull(body.licenseNumber),
      licenseValidity: orNull(body.licenseValidity),
      hrRemarks: orNull(body.hrRemarks),
      ord: Date.now(),
    },
  });

  return ok(row, 201);
});
