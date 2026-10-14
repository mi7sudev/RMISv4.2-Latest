import type { DocumentWire } from "@/lib/router";
import type { ApplicantProfile } from "@/components/views/profile/section-types";

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * §7.4 profile completeness — the SINGLE source for the 7-section math
 * (personal/education/work/training/eligibility/awards/documents). Consumed
 * by the Profile page (step steppers + Mark Complete gate) and the Home
 * mini-profile completion ring, so the two surfaces can never drift.
 */
export function computeProfileCompletion(
  profile: ApplicantProfile | null | undefined,
  docs: DocumentWire[]
) {
  // MOM 2026-10-13 — Email + Mobile Number always required, and at least one
  // Character Reference: the Personal Information section is only "done" with
  // all of them (the Education gate on the Profile page mirrors this).
  const namedRefs = (profile?.characterReferences ?? []).filter((r) =>
    typeof r?.name === "string" && r.name.trim() !== ""
  ).length;
  const personalDone =
    !!profile &&
    hasText(profile.firstName) &&
    hasText(profile.lastName) &&
    hasText(profile.emailAddress) &&
    hasText(profile.mobileNumber) &&
    namedRefs > 0;
  const educationDone = (profile?.educations?.length ?? 0) > 0;
  const workDone = (profile?.workExperiences?.length ?? 0) > 0;
  const trainingDone = (profile?.trainings?.length ?? 0) > 0;
  const eligibilityDone = (profile?.eligibilities?.length ?? 0) > 0;
  const awardsDone = (profile?.awards?.length ?? 0) > 0;
  const documentsDone = docs.length > 0;
  const sectionDone = [
    personalDone,
    educationDone,
    workDone,
    trainingDone,
    eligibilityDone,
    awardsDone,
    documentsDone,
  ];
  const completedCount = sectionDone.filter(Boolean).length;
  const isComplete = profile?.isProfileComplete === true;
  const canMarkComplete = personalDone && educationDone && workDone && !isComplete;
  const pct = Math.round((completedCount / 7) * 100);
  return { sectionDone, completedCount, isComplete, canMarkComplete, pct };
}
