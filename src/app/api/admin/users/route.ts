// ============================================================================
// RMIS — /api/admin/users (ADMIN, spec §6.6)
// GET: paginated user list; ?q (email/username/name substring), ?role filter,
//      newest first; SAFE select — password is never read.
// POST: userCreateSchema; 409 on duplicate email/username; bcrypt cost 10;
//      APPLICANT role also creates the linked applicant row.
//      Audit USER_CREATED. 201 → user without password.
// ============================================================================

import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { userCreateSchema, paginationSchema } from "@/lib/validation";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SAFE_SELECT = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  middleName: true,
  lastName: true,
  role: true,
  blocked: true,
  confirmed: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const GET = handleApi(async (req: Request) => {
  await requireAdminFromReq(req);

  const sp = new URL(req.url).searchParams;
  const { page, pageSize } = paginationSchema.parse({
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });

  const q = sp.get("q")?.trim() || "";
  const role = sp.get("role")?.trim() || "";

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { username: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
    ];
  }
  if (role === "ADMIN" || role === "EVALUATOR" || role === "APPLICANT") {
    where.role = role;
  }

  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        ...SAFE_SELECT,
        applicant: { select: { id: true, isProfileComplete: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return ok({
    data: rows.map((u) => ({ ...u, isActive: !u.blocked })),
    total,
    page,
    pageSize,
    hasMore: skip + rows.length < total,
  });
});

export const POST = handleApi(async (req: Request) => {
  const admin = await requireAdminFromReq(req);
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = userCreateSchema.parse(body);

  const email = parsed.email.toLowerCase();
  const username = parsed.username;

  const dupe = await db.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (dupe) {
    throw new ApiError(
      dupe.email === email
        ? "An account with this email already exists"
        : "This username is already taken",
      409
    );
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        password: passwordHash,
        role: parsed.role,
        firstName: parsed.firstName ?? null,
        lastName: parsed.lastName ?? null,
        blocked: !parsed.isActive,
        confirmed: true,
      },
    });
    if (parsed.role === "APPLICANT") {
      await tx.applicant.create({
        data: {
          userId: user.id,
          firstName: parsed.firstName ?? null,
          lastName: parsed.lastName ?? null,
          emailAddress: email,
          isProfileComplete: false,
        },
      });
    }
    return user;
  });

  auditLog({
    userId: admin.id,
    userLabel: `${admin.username} (${admin.email})`,
    userRole: admin.role,
    action: "USER_CREATED",
    entityType: "user",
    entityId: created.id,
    description: `Created ${parsed.role} account "${username}" (${email})`,
    ipAddress: getClientIp(req),
  });

  return ok(
    {
      id: created.id,
      username: created.username,
      email: created.email,
      firstName: created.firstName,
      middleName: created.middleName,
      lastName: created.lastName,
      role: created.role,
      blocked: created.blocked,
      confirmed: created.confirmed,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      isActive: !created.blocked,
    },
    201
  );
});
