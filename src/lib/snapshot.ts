// ============================================================================
// RMIS — Application snapshots (spec §8.8): freeze the applicant's credentials
// at apply time. Reviewer surfaces read ONLY these snapshots.
// ============================================================================

import { db } from "@/lib/db";

export type SnapshotProfile = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  birthDate: string | null;
  presentAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  characterReference: unknown;
};

export async function writeApplicationSnapshots(applicationId: number, applicantId: number) {
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    include: {
      educations: { orderBy: { ord: "asc" } },
      workExperiences: { orderBy: { ord: "asc" } },
      trainings: { orderBy: { ord: "asc" } },
      eligibilities: { orderBy: { ord: "asc" } },
      awards: { orderBy: { ord: "asc" } },
    },
  });
  if (!applicant) return;

  let characterRef: unknown = null;
  try {
    characterRef = applicant.characterReference ? JSON.parse(applicant.characterReference) : null;
  } catch {
    characterRef = null;
  }

  const profile: SnapshotProfile = {
    id: applicant.id,
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    emailAddress: applicant.emailAddress,
    contactNumber: applicant.contactNumber,
    gender: applicant.gender,
    civilStatus: applicant.civilStatus,
    citizenship: applicant.citizenship,
    birthDate: applicant.birthDate,
    presentAddress: applicant.presentAddress,
    city: applicant.city,
    province: applicant.province,
    country: applicant.country,
    characterReference: characterRef,
  };

  await db.application.update({
    where: { id: applicationId },
    data: {
      snapshotProfile: JSON.stringify(profile),
      snapshotEducations: JSON.stringify(applicant.educations),
      snapshotExperiences: JSON.stringify(applicant.workExperiences),
      snapshotTrainings: JSON.stringify(applicant.trainings),
      snapshotEligibilities: JSON.stringify(applicant.eligibilities),
      snapshotAwards: JSON.stringify(applicant.awards),
    },
  });
}

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
