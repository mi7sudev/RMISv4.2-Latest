// ============================================================================
// RMIS — GET /api/admin/audit-logs (ADMIN, spec §6.6 / §11)
// Filters: ?search (description/userLabel contains), ?action, ?userId,
// ?entityType, ?startDate/?endDate (timestamp >= / <=), ?page/?pageSize
// (default 25). Returns rows + distinct actions + summary
// { totalEvents, onPage, topActions(6), byRole }.
// ============================================================================

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { paginationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Accepts "YYYY-MM-DD" (UTC) or any parseable ISO datetime; null when invalid. */
function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);

  const sp = new URL(req.url).searchParams;
  const paging = paginationSchema.parse({
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
  const page = paging.page;
  const pageSize = sp.get("pageSize") ? paging.pageSize : 25;

  const search = sp.get("search")?.trim() || "";
  const action = sp.get("action")?.trim() || "";
  const userId = sp.get("userId")?.trim() || "";
  const entityType = sp.get("entityType")?.trim() || "";
  const start = parseDate(sp.get("startDate"));
  const end = parseDate(sp.get("endDate"), true);

  const where: Prisma.AuditLogWhereInput = {};
  if (search) {
    where.OR = [{ description: { contains: search } }, { userLabel: { contains: search } }];
  }
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (entityType) where.entityType = entityType;
  if (start || end) {
    where.timestamp = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }

  const skip = (page - 1) * pageSize;

  const [rows, total, actionGroups, totalEvents, roleGroups] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { timestamp: "desc" }, skip, take: pageSize }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["action"], _count: { action: true }, where }),
    db.auditLog.count(),
    db.auditLog.groupBy({
      by: ["userRole"],
      _count: { userRole: true },
      where: { userRole: { in: ["APPLICANT", "EVALUATOR", "ADMIN"] } },
    }),
  ]);

  const actions = (
    await db.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    })
  ).map((r) => r.action);

  const topActions = actionGroups
    .map((g) => [g.action, g._count.action] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);

  const byRole: Record<string, number> = { APPLICANT: 0, EVALUATOR: 0, ADMIN: 0 };
  for (const g of roleGroups) {
    if (g.userRole && g.userRole in byRole) byRole[g.userRole] = g._count.userRole;
  }

  return ok({
    data: rows,
    total,
    page,
    pageSize,
    hasMore: skip + rows.length < total,
    actions,
    summary: {
      totalEvents,
      onPage: rows.length,
      topActions,
      byRole,
    },
  });
});
