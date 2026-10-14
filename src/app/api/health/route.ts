// ============================================================================
// RMIS — GET /api/health (spec §6.7, public): SELECT 1 database probe.
// 200 { status:"healthy", checks:{ app:"ok", database:"ok" } } or 503.
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({ status: "healthy", checks: { app: "ok", database: "ok" } });
  } catch {
    return err("Health check failed", 503, {
      status: "unhealthy",
      checks: { app: "ok", database: "error" },
    });
  }
});
