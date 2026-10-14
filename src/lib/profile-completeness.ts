// ============================================================================
// RMIS — Profile completeness (spec §8.3 + MOM 2026-10-13). The government
// apply gate: all-or-nothing. MOM additions: the mobile number and at least
// one Character Reference are REQUIRED alongside first/last/email (the MOM
// also mandates Email + Phone always required, and Character References
// required before the Education section of the PDS form). Enforced at PUT
// profile, /profile/complete, and re-validated at /jobs/apply. The error
// wording is a CLIENT CONTRACT: it must start with "Please complete your
// profile" — the jobs client routes messages matching /complete your
// profile/i to the profile builder.
// ============================================================================

import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/snapshot";

export type CompletionRequirement = { id: "personal" | "education" | "work"; label: string; met: boolean };
export type ProfileCompletion = { complete: boolean; requirements: CompletionRequirement[]; missingLabels: string[] };

export async function validateProfileCompletion(applicantId: number): Promise<ProfileCompletion> {
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { firstName: true, lastName: true, emailAddress: true, mobileNumber: true, characterReference: true },
  });
  if (!applicant) throw new Error("Applicant not found");

  const [educations, workExperiences] = await Promise.all([
    db.education.count({ where: { applicantId } }).catch(() => 0),
    db.workExperience.count({ where: { applicantId } }).catch(() => 0),
  ]);

  // MOM 2026-10-13 — Email Address and Phone Number are ALWAYS required, and
  // the Character Reference section must be filled: at least one named
  // reference (the same rule the profile form's save gate enforces).
  const refs = safeJsonParse<{ name?: string | null }[]>(applicant.characterReference, []);
  const namedRefs = refs.filter((r) => String(r?.name ?? "").trim() !== "").length;

  const personalMet = Boolean(
    String(applicant.firstName ?? "").trim() &&
      String(applicant.lastName ?? "").trim() &&
      String(applicant.emailAddress ?? "").trim() &&
      String(applicant.mobileNumber ?? "").trim() &&
      namedRefs > 0
  );

  const requirements: CompletionRequirement[] = [
    {
      id: "personal",
      label: "Personal information (first name, last name, email, mobile number, character reference)",
      met: personalMet,
    },
    { id: "education", label: "At least one education entry", met: educations > 0 },
    { id: "work", label: "At least one work experience entry", met: workExperiences > 0 },
  ];

  return {
    complete: requirements.every((r) => r.met),
    requirements,
    missingLabels: requirements.filter((r) => !r.met).map((r) => r.label),
  };
}

export function completionErrorMessage(completion: ProfileCompletion): string {
  return `Please complete your profile before applying. Still required: ${completion.missingLabels.join("; ")}.`;
}
