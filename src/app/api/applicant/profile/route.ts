// ============================================================================
// RMIS — Applicant profile (spec §6.3, §7.4, §8.3)
//   GET: full applicant + all 5 ordered sections + parsed characterReferences.
//        Section loads are failure-isolated (corrupted section degrades to []).
//   PUT: whitelist-update personal fields; characterReferences → JSON column;
//        mobileNumber digit-strip; isProfileComplete:true is SERVER-GATED via
//        the completeness engine (§8.3) → sets submittedDate. Audit PROFILE_UPDATED.
// ============================================================================

import { ok, err, handleApi, ApiError, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalProfileSchema } from "@/lib/validation";
import { validateProfileCompletion, completionErrorMessage } from "@/lib/profile-completeness";
import { auditLog } from "@/lib/audit";
import { safeJsonParse } from "@/lib/snapshot";

type ProfilePayload = Awaited<ReturnType<typeof loadProfile>>;

/** Load the full profile; each section is failure-isolated (§6.3). */
async function loadProfile(applicantId: number) {
  const applicant = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) throw new ApiError("Applicant profile not found", 404);

  const settled = await Promise.allSettled([
    db.education.findMany({ where: { applicantId }, orderBy: { ord: "asc" } }),
    db.workExperience.findMany({ where: { applicantId }, orderBy: { ord: "asc" } }),
    db.training.findMany({ where: { applicantId }, orderBy: { ord: "asc" } }),
    db.eligibility.findMany({ where: { applicantId }, orderBy: { ord: "asc" } }),
    db.award.findMany({ where: { applicantId }, orderBy: { ord: "asc" } }),
  ]);
  const pick = <T>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value : []);

  return {
    ...applicant,
    characterReferences: safeJsonParse<unknown[]>(applicant.characterReference, []),
    educations: pick(settled[0]),
    workExperiences: pick(settled[1]),
    trainings: pick(settled[2]),
    eligibilities: pick(settled[3]),
    awards: pick(settled[4]),
  };
}

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  return ok(await loadProfile(applicant.id));
});

const BOOLEAN_FIELDS = new Set(["isPwd", "isGovernment", "adminCase", "crimeCharge"]);
const RESERVED_FIELDS = new Set(["characterReferences", "isProfileComplete"]);

export const PUT = handleApi(async (req: Request) => {
  const { user, applicant } = await requireApplicantRow(req);
  const body = personalProfileSchema.parse(await req.json().catch(() => ({})));

  const data: Record<string, string | boolean | Date | null> = {};

  // ── Whitelist-update provided fields (skip undefined; "" → null per §6.3) ──
  for (const [key, raw] of Object.entries(body)) {
    if (raw === undefined || RESERVED_FIELDS.has(key)) continue;
    if (BOOLEAN_FIELDS.has(key)) {
      data[key] = raw === true;
      continue;
    }
    let value = raw == null ? null : String(raw).trim();
    if (value === "") value = null;
    if (key === "mobileNumber" && value) value = value.replace(/\D/g, "") || null;
    data[key] = value;
  }

  // ── Character references: drop entries with empty name, store as JSON ─────
  if (body.characterReferences !== undefined) {
    const refs = body.characterReferences
      .map((e) => ({
        name: (e.name ?? "").trim(),
        title: (e.title ?? "").trim(),
        company: (e.company ?? "").trim(),
        companyAddress: (e.companyAddress ?? "").trim(),
        email: (e.email ?? "").trim(),
        contact: (e.contact ?? "").trim(),
      }))
      .filter((e) => e.name !== "");
    data.characterReference = JSON.stringify(refs);
  }

  // ── Persist the field updates first, so the gate validates fresh state ────
  if (Object.keys(data).length > 0) {
    await db.applicant.update({
      where: { id: applicant.id },
      data: data as Parameters<typeof db.applicant.update>[0]["data"],
    });
  }

  // ── isProfileComplete is SERVER-GATED (spec §8.3) ──────────────────────────
  if (body.isProfileComplete === false) {
    await db.applicant.update({
      where: { id: applicant.id },
      data: { isProfileComplete: false, submittedDate: null },
    });
  } else if (body.isProfileComplete === true) {
    const completion = await validateProfileCompletion(applicant.id);
    if (!completion.complete) {
      return err(completionErrorMessage(completion), 400, { requirements: completion.requirements });
    }
    await db.applicant.update({
      where: { id: applicant.id },
      data: {
        isProfileComplete: true,
        // submittedDate only stamped on the first completion
        ...(applicant.isProfileComplete ? {} : { submittedDate: new Date() }),
      },
    });
  }

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "PROFILE_UPDATED",
    entityType: "applicant",
    entityId: applicant.id,
    description: "Applicant profile updated",
    ipAddress: getClientIp(req),
  });

  return ok(await loadProfile(applicant.id));
});
