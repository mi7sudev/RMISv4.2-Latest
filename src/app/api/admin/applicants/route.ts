// ============================================================================
// RMIS — GET /api/admin/applicants (EVALUATOR/ADMIN, spec §6.6)
// Paginated master registry of ALL applicants (even without accounts).
// ?search (firstName/lastName/emailAddress/employeeNumber/mobileNumber
// contains), ?status=complete|incomplete, ?hasAccount=yes|no — totals reflect
// every filter. Rows: basics, isProfileComplete, hasAccount, embedded user
// (safe), applicationCount. Ordered updatedAt desc.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { paginationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);

  const sp = new URL(req.url).searchParams;
  const { page, pageSize } = paginationSchema.parse({
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });

  const search = sp.get("search")?.trim() || "";
  const status = sp.get("status")?.trim() || "";
  const hasAccount = sp.get("hasAccount")?.trim() || "";

  const where: Prisma.ApplicantWhereInput = {};
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { emailAddress: { contains: search } },
      { employeeNumber: { contains: search } },
      { mobileNumber: { contains: search } },
    ];
  }
  if (status === "complete") where.isProfileComplete = true;
  else if (status === "incomplete") where.isProfileComplete = false;
  if (hasAccount === "yes") where.userId = { not: null };
  else if (hasAccount === "no") where.userId = null;

  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    db.applicant.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailAddress: true,
        mobileNumber: true,
        gender: true,
        isProfileComplete: true,
        userId: true,
        user: {
          select: { id: true, email: true, username: true, role: true, blocked: true },
        },
        _count: { select: { applications: true } },
      },
    }),
    db.applicant.count({ where }),
  ]);

  return ok({
    data: rows.map((a) => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      emailAddress: a.emailAddress,
      mobileNumber: a.mobileNumber,
      gender: a.gender,
      isProfileComplete: a.isProfileComplete,
      hasAccount: !!a.userId,
      user: a.user,
      applicationCount: a._count.applications,
    })),
    total,
    page,
    pageSize,
    hasMore: skip + rows.length < total,
  });
});
