// ============================================================================
// RMIS — GET /api/session (public bootstrap, spec §3.2)
// { user: null } for: no session; staff session resolved from a non-intranet
// network (fail closed + audited); deleted/blocked users (guard fails closed).
// Otherwise the full session user incl. the applicant apply-gate flag.
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok, getClientIp } from "@/lib/api";
import { getSessionFromReq, isIntranetRequest } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  const user = await getSessionFromReq(req);
  if (!user) return ok({ user: null });

  // Chokepoint 2 of 3 — staff session from a public network resolves to null.
  if ((user.role === "ADMIN" || user.role === "EVALUATOR") && !isIntranetRequest(req)) {
    auditLog({
      userId: user.id,
      userLabel: `${user.username} (${user.email})`,
      userRole: user.role,
      action: "STAFF_ACCESS_BLOCKED_EXTERNAL",
      entityType: "user",
      entityId: user.id,
      description: "Staff session blocked from a non-intranet network",
      ipAddress: getClientIp(req),
    });
    return ok({ user: null });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: {
      middleName: true,
      blocked: true,
      applicant: { select: { id: true, isProfileComplete: true } },
    },
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: row?.middleName ?? null,
      isActive: !row?.blocked,
      applicant: row?.applicant ?? null,
    },
  });
});
