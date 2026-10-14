// ============================================================================
// RMIS — Destructive profile clear (spec §6.3, §7.5 step 5, §8.3).
// The ONLY way back from the one-extraction lock: deletes ALL section rows,
// nulls the form-managed personal fields, marks the profile incomplete, and
// resets every extractable-category document sidecar back to UPLOADED
// (files are kept on disk for HR). Audit PROFILE_CLEARED (+counts).
// ============================================================================

import { ok, handleApi, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import { DOC_STATUS } from "@/lib/document-status";
import { auditLog } from "@/lib/audit";

export const POST = handleApi(async (req: Request) => {
  const { user, applicant } = await requireApplicantRow(req);

  const [education, work, training, eligibility, awards] = await Promise.all([
    db.education.deleteMany({ where: { applicantId: applicant.id } }),
    db.workExperience.deleteMany({ where: { applicantId: applicant.id } }),
    db.training.deleteMany({ where: { applicantId: applicant.id } }),
    db.eligibility.deleteMany({ where: { applicantId: applicant.id } }),
    db.award.deleteMany({ where: { applicantId: applicant.id } }),
  ]);

  await db.applicant.update({
    where: { id: applicant.id },
    data: {
      // Form-managed personal fields (spec §6.3) — null out
      firstName: null,
      middleName: null,
      lastName: null,
      extensionName: null,
      mobileNumber: null,
      contactNumber: null,
      emailAddress: null,
      birthDate: null,
      birthPlace: null,
      gender: null,
      civilStatus: null,
      citizenship: null,
      houseNumber: null,
      street: null,
      subdivision: null,
      barangay: null,
      city: null,
      province: null,
      country: null,
      zipCode: null,
      presentAddress: null,
      adminCase: false,
      adminCaseDetails: null,
      crimeCharge: false,
      crimeDate: null,
      crimeCaseStatus: null,
      characterReference: null,
      // Re-open the apply gate
      isProfileComplete: false,
      submittedDate: null,
    },
  });

  const docReset = await db.document.updateMany({
    where: { applicantId: applicant.id, category: { in: [...EXTRACTABLE_CATEGORIES] } },
    data: { status: DOC_STATUS.UPLOADED, extractedJson: null, extractionError: null, extractedAt: null },
  });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "PROFILE_CLEARED",
    entityType: "applicant",
    entityId: applicant.id,
    description: `Profile cleared: education=${education.count}, work=${work.count}, training=${training.count}, eligibility=${eligibility.count}, awards=${awards.count} entries deleted; ${docReset.count} documents reset to UPLOADED`,
    ipAddress: getClientIp(req),
  });

  return ok({
    cleared: {
      education: education.count,
      work: work.count,
      training: training.count,
      eligibility: eligibility.count,
      awards: awards.count,
    },
    message:
      "Your profile has been cleared and marked incomplete. Uploaded files are kept for HR review, but their extraction results were reset.",
  });
});
