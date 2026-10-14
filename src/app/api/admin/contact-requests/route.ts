// ============================================================================
// RMIS — Contact Requests management (QA 2026-02, Settings section).
// GET:   paginated list, newest first (EVALUATOR or ADMIN).
// PATCH: { id, status: "RESOLVED" | "OPEN" } — resolve/reopen (EVALUATOR or
//        ADMIN); stamps handledBy + resolvedAt.
// ============================================================================

import { z } from "zod";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { db } from "@/lib/db";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50) || 50));

  const where = status === "OPEN" || status === "RESOLVED" ? { status } : undefined;

  const [data, total] = await Promise.all([
    db.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { handledBy: { select: { firstName: true, lastName: true, username: true } } },
    }),
    db.contactRequest.count({ where }),
  ]);

  return ok({ data, total, page, pageSize, hasMore: page * pageSize < total });
});

const patchSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["OPEN", "RESOLVED"]),
});

export const PATCH = handleApi(async (req: Request) => {
  const user = await requireEvaluatorFromReq(req);
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("Invalid request", 422);
  const { id, status } = parsed.data;

  const existing = await db.contactRequest.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Contact request not found", 404);

  const updated = await db.contactRequest.update({
    where: { id },
    data: {
      status,
      handledById: user.id,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    },
  });

  auditLog({
    userId: user.id,
    userLabel: user.email,
    userRole: user.role,
    action: "CONTACT_REQUEST_UPDATED",
    entityType: "ContactRequest",
    entityId: id,
    description: `Contact request #${id} marked ${status}`,
    ipAddress: getClientIp(req),
  });

  return ok({ data: updated });
});
