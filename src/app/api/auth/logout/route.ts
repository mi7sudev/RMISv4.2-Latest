// ============================================================================
// RMIS — POST /api/auth/logout (any session, spec §3.5)
// Audit LOGOUT with the session user's label when available; clear the
// session cookie with identical flags. Fire-and-forget for clients.
// ============================================================================

import { handleApi, ok, getClientIp } from "@/lib/api";
import { getSessionFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clearSessionCookie } from "@/lib/jwt";

export const POST = handleApi(async (req: Request) => {
  const user = await getSessionFromReq(req);
  auditLog({
    userId: user?.id ?? null,
    userLabel: user ? `${user.username} (${user.email})` : null,
    userRole: user?.role ?? null,
    action: "LOGOUT",
    entityType: "user",
    entityId: user?.id ?? null,
    description: "Signed out",
    ipAddress: getClientIp(req),
  });
  await clearSessionCookie(req);
  return ok({ success: true });
});
