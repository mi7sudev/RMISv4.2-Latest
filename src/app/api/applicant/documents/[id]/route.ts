// ============================================================================
// RMIS — Document delete (spec §6.4). Removes the binary + the sidecar row.
// Ownership enforced: the document's applicantId must match the caller's,
// otherwise 404. Audit DOCUMENT_DELETED. → { id, deleted: true }.
// ============================================================================

import { ok, handleApi, ApiError, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
import fs from "fs";
import path from "path";

export const DELETE = handleApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, applicant } = await requireApplicantRow(req);
  const { id } = await params;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.applicantId !== applicant.id) throw new ApiError("Not found", 404);

  try {
    fs.rmSync(path.join(process.cwd(), doc.filePath), { force: true });
  } catch {
    // best-effort file removal
  }
  await db.document.delete({ where: { id: doc.id } });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "DOCUMENT_DELETED",
    entityType: "document",
    entityId: doc.id,
    description: `Deleted ${doc.category} document "${doc.originalName}"`,
    ipAddress: getClientIp(req),
  });

  return ok({ id: doc.id, deleted: true });
});
