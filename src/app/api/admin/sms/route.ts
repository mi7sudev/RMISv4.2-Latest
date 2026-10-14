// ============================================================================
// RMIS — /api/admin/sms (ADMIN, spec §6.6 / §9)
// GET:  provider info (mock|semaphore), stats mirror of the email panel,
//       latest SMS logs. BEUI Phase 7 (async table): supports cursor paging
//       for the official Table's onEndReached infinite scroll —
//       ?before=<id>&limit=<1..100> → slim { logs, nextCursor } page (nextCursor
//       = id of the oldest row in the page, null when exhausted); no params →
//       first page (25) + provider + stats, shape unchanged plus nextCursor.
// POST: test send { to (PH format), message? ≤640 } — PH mobile normalization
//       (§9.4); invalid number → 400 "Invalid Philippine mobile number";
//       delivery failure → 502.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, err, ApiError } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { sendSms, normalizePhMobile } from "@/lib/notify";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  to: z.string().trim().min(7).max(30),
  message: z.string().trim().max(640).optional(),
});

const LOG_PAGE = 25;

const pageQuery = (req: Request) => {
  const { searchParams } = new URL(req.url);
  const beforeRaw = searchParams.get("before");
  const limitRaw = Number(searchParams.get("limit") ?? LOG_PAGE);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : LOG_PAGE;
  const before = beforeRaw != null && beforeRaw !== "" ? Number(beforeRaw) : null;
  return {
    limit,
    before: before != null && Number.isInteger(before) ? before : null,
  };
};

export const GET = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);

  const { limit, before } = pageQuery(req);

  // Cursor page for the BEUI async table (onEndReached): slim payload, no
  // stats recount per scroll page.
  if (before != null) {
    const logs = await db.smsLog.findMany({
      where: { id: { lt: before } },
      orderBy: { id: "desc" },
      take: limit,
    });
    return ok({ logs, nextCursor: logs.length === limit ? logs[logs.length - 1].id : null });
  }

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [total, sent, failed, skipped, mock, last24h, logs] = await Promise.all([
    db.smsLog.count(),
    db.smsLog.count({ where: { status: "sent" } }),
    db.smsLog.count({ where: { status: "failed" } }),
    db.smsLog.count({ where: { status: "skipped" } }),
    db.smsLog.count({ where: { status: "mock" } }),
    db.smsLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.smsLog.findMany({ orderBy: { id: "desc" }, take: limit }),
  ]);

  return ok({
    provider: process.env.SMS_PROVIDER || "mock",
    configured: !!process.env.SEMAPHORE_API_KEY,
    stats: { total, sent, failed, skipped, mock, last24h },
    logs,
    nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
  });
});

export const POST = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = testSchema.parse(body);

  const normalized = normalizePhMobile(parsed.to);
  if (!normalized) {
    throw new ApiError("Invalid Philippine mobile number", 400);
  }

  const result = await sendSms({
    to: parsed.to,
    message: parsed.message || "RMIS test SMS",
    relatedType: "test",
  });

  if (result.status === "failed") {
    return err("SMS delivery failed", 502, { error: result.error ?? null, provider: result.provider });
  }
  return ok({ sms: result });
});
