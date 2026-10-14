// ============================================================================
// RMIS — Audit logging (spec §11). Fire-and-forget; writes a [AUDIT] JSON
// console line (SIEM) + a row in audit_logs. No PII/passwords/tokens.
// ============================================================================

import { db } from "@/lib/db";

export type AuditEvent = {
  userId?: string | null;
  userLabel?: string | null;
  userRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  description?: string | null;
  ipAddress?: string | null;
};

export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_BLOCKED_EXTERNAL", "STAFF_ACCESS_BLOCKED_EXTERNAL",
  "PASSWORD_CHANGED",
  "LOGOUT", "USER_CREATED", "USER_UPDATED", "USER_DISABLED", "USER_DELETED", "USER_ROLE_CHANGED",
  "APPLICATION_SUBMITTED", "APPLICATION_STATUS_CHANGED", "ASSESSMENT_SUBMITTED",
  "JOB_POSTING_CREATED", "JOB_POSTING_UPDATED", "JOB_POSTING_DELETED",
  "POSITION_CREATED", "POSITION_UPDATED",
  "REFERENCE_OPTION_ADDED",
  "DOCUMENT_UPLOADED", "DOCUMENT_DELETED",
  "PROFILE_UPDATED", "PROFILE_COMPLETED", "PROFILE_CLEARED",
  "DIRECT_EMAIL_SENT", "NOTICE_SENT", "REGRET_LETTERS_BULK_SENT",
] as const;

export function auditLog(event: AuditEvent): void {
  void (async () => {
    try {
      await db.auditLog.create({
        data: {
          userId: event.userId ?? null,
          userLabel: event.userLabel ?? null,
          userRole: event.userRole ?? "SYSTEM",
          action: event.action,
          entityType: event.entityType ?? null,
          entityId: event.entityId != null ? String(event.entityId) : null,
          description: event.description ?? null,
          ipAddress: event.ipAddress ?? null,
        },
      });
      console.log(`[AUDIT] ${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}`);
    } catch {
      // never break the operation (spec §11)
    }
  })();
}
