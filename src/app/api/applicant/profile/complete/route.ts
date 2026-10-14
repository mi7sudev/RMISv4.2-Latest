// ============================================================================
// RMIS — Fast-track profile completion (spec §6.3, §7.6 step 4, §8.3).
// POST: validates the 3-requirement gate (400 + missing list otherwise);
// if already complete → ok (no-op). Else sets the flag + submittedDate and
// audits PROFILE_COMPLETED. Returns { isProfileComplete: true, requirements }.
// The error wording is a CLIENT CONTRACT: starts with "Please complete your
// profile" — the jobs client routes /complete your profile/i into fast-track.
// ============================================================================

import { ok, err, handleApi, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateProfileCompletion, completionErrorMessage } from "@/lib/profile-completeness";
import { auditLog } from "@/lib/audit";

export const POST = handleApi(async (req: Request) => {
  const { user, applicant } = await requireApplicantRow(req);

  const completion = await validateProfileCompletion(applicant.id);
  if (!completion.complete) {
    return err(completionErrorMessage(completion), 400, { requirements: completion.requirements });
  }

  if (!applicant.isProfileComplete) {
    await db.applicant.update({
      where: { id: applicant.id },
      data: { isProfileComplete: true, submittedDate: new Date() },
    });
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: user.role,
      action: "PROFILE_COMPLETED",
      entityType: "applicant",
      entityId: applicant.id,
      description: "Applicant profile marked complete",
      ipAddress: getClientIp(req),
    });
  }

  return ok({ isProfileComplete: true, requirements: completion.requirements });
});
