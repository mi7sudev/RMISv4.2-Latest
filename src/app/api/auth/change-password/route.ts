// ============================================================================
// RMIS — POST /api/auth/change-password (Task 35, Account Settings).
// Any signed-in role. Body { currentPassword, newPassword } — the CURRENT
// password is re-verified against the stored bcrypt hash (login-grade
// check), the new one must differ, then the hash is rotated and a
// PASSWORD_CHANGED audit row is written. The session cookie is untouched:
// the JWT carries only stable claims (id/email/name/role), so the user
// stays signed in on every device including this one.
// ============================================================================

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";
import { auditLog } from "@/lib/audit";
import { getSessionFromReq } from "@/lib/auth";

export const POST = handleApi(async (req: Request) => {
  const session = await getSessionFromReq(req);
  if (!session) throw new ApiError("Unauthorized", 401);

  const body = (await req.json().catch(() => null)) as unknown;
  const { currentPassword, newPassword } = changePasswordSchema.parse(body);

  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) throw new ApiError("Unauthorized", 401);

  // Login-grade re-verification of the CURRENT password (fail closed).
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: user.role,
      action: "PASSWORD_CHANGED",
      entityType: "user",
      entityId: user.id,
      description: "Password change attempt failed: current password did not match",
      ipAddress: getClientIp(req),
    });
    throw new ApiError("Current password is incorrect.", 400);
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      "New password must be different from your current password.",
      400
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id: user.id }, data: { password: passwordHash } });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: user.id,
    description: "Password changed from Account Settings",
    ipAddress: getClientIp(req),
  });

  return ok({ ok: true });
});
