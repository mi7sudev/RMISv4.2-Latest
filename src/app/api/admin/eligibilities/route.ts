// ============================================================================
// RMIS — /api/admin/eligibilities (ADMIN, spec §6.6)
// GET:  the eligibility reference vocabulary, sorted by index then name.
// POST: create { name 1–200 } (upsert on the unique name); published
//       immediately. 201 → the row.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";

export const dynamic = "force-dynamic";

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) });

export const GET = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);
  const rows = await db.eligibilityRef.findMany({
    orderBy: [{ index: "asc" }, { name: "asc" }],
  });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);
  const body = (await req.json().catch(() => null)) as unknown;
  const { name } = nameSchema.parse(body);

  const row = await db.eligibilityRef.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  return ok(row, 201);
});
