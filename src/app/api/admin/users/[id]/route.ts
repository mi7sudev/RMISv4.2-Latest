// ============================================================================
// RMIS — /api/admin/users/[id] (ADMIN, spec §6.6)
// NOTE: User.id is a cuid STRING (not numeric) — parsed/validated as-is.
// GET:    safe user + linked applicant (full, with profile section counts).
// PATCH:  userUpdateSchema — names/email/username/isActive/password(rehash)/
//         role. Role change → audit USER_ROLE_CHANGED (from→to), else
//         USER_UPDATED. 409 on duplicate email/username.
// DELETE: default soft-disable (blocked=true, audit USER_DISABLED);
//         ?hard=1 real delete with guards (not self; not another ADMIN),
//         job-posting authorship detached, applicant row removed (its child
//         sections cascade via FK), audit USER_DELETED.
// ============================================================================

import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";
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

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleApi(async (req: Request, ctx: Ctx) => {
  await requireAdminFromReq(req);
  const { id } = await ctx.params;
  if (!id) throw new ApiError("Invalid id", 400);

  const user = await db.user.findUnique({
    where: { id },
    select: {
      ...SAFE_SELECT,
      applicant: {
        include: {
          _count: {
            select: {
              educations: true,
              workExperiences: true,
              trainings: true,
              eligibilities: true,
              awards: true,
              documents: true,
              applications: true,
            },
          },
        },
      },
    },
  });
  if (!user) throw new ApiError("User not found", 404);

  return ok({ ...user, isActive: !user.blocked });
});

export const PATCH = handleApi(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdminFromReq(req);
  const { id } = await ctx.params;
  if (!id) throw new ApiError("Invalid id", 400);

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = userUpdateSchema.parse(body);

  const target = await db.user.findUnique({
    where: { id },
    select: { ...SAFE_SELECT },
  });
  if (!target) throw new ApiError("User not found", 404);

  const data: Prisma.UserUpdateInput = {};

  if (parsed.email !== undefined) {
    const email = parsed.email.toLowerCase();
    if (email !== target.email) {
      const dupe = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (dupe) throw new ApiError("An account with this email already exists", 409);
    }
    data.email = email;
  }
  if (parsed.username !== undefined && parsed.username !== target.username) {
    const dupe = await db.user.findUnique({
      where: { username: parsed.username },
      select: { id: true },
    });
    if (dupe) throw new ApiError("This username is already taken", 409);
    data.username = parsed.username;
  }
  if (parsed.firstName !== undefined) data.firstName = parsed.firstName;
  if (parsed.lastName !== undefined) data.lastName = parsed.lastName;
  if (parsed.isActive !== undefined) data.blocked = !parsed.isActive;
  if (parsed.password !== undefined) data.password = await bcrypt.hash(parsed.password, 10);

  const roleChanged = parsed.role !== undefined && parsed.role !== target.role;
  if (parsed.role !== undefined) data.role = parsed.role;

  const updated = await db.user.update({ where: { id }, data, select: SAFE_SELECT });

  auditLog({
    userId: admin.id,
    userLabel: `${admin.username} (${admin.email})`,
    userRole: admin.role,
    action: roleChanged ? "USER_ROLE_CHANGED" : "USER_UPDATED",
    entityType: "user",
    entityId: id,
    description: roleChanged
      ? `Role changed from ${target.role} to ${parsed.role} for "${updated.username}" (${updated.email})`
      : `Updated account "${updated.username}" (${updated.email})`,
    ipAddress: getClientIp(req),
  });

  return ok({ ...updated, isActive: !updated.blocked });
});

export const DELETE = handleApi(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdminFromReq(req);
  const { id } = await ctx.params;
  if (!id) throw new ApiError("Invalid id", 400);
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const target = await db.user.findUnique({
    where: { id },
    select: { ...SAFE_SELECT, applicant: { select: { id: true } } },
  });
  if (!target) throw new ApiError("User not found", 404);

  const actor = {
    userId: admin.id,
    userLabel: `${admin.username} (${admin.email})`,
    userRole: admin.role,
    entityType: "user",
    entityId: id,
    ipAddress: getClientIp(req),
  };

  // ── Default: soft-disable ────────────────────────────────────────────────
  if (!hard) {
    await db.user.update({ where: { id }, data: { blocked: true } });
    auditLog({
      ...actor,
      action: "USER_DISABLED",
      description: `Disabled account "${target.username}" (${target.email})`,
    });
    return ok({ success: true, softDisabled: true });
  }

  // ── Hard delete with guards ──────────────────────────────────────────────
  if (target.id === admin.id) {
    throw new ApiError("You cannot delete your own account", 400);
  }
  if (target.role === "ADMIN") {
    throw new ApiError("Demote this administrator before deleting", 400);
  }

  await db.$transaction(async (tx) => {
    // Detach job-posting authorship first (author is optional).
    await tx.jobPosting.updateMany({ where: { authorId: id }, data: { authorId: null } });
    // Remove the applicant profile (child sections cascade via FK).
    if (target.applicant) {
      await tx.applicant.delete({ where: { id: target.applicant.id } });
    }
    await tx.user.delete({ where: { id } });
  });

  auditLog({
    ...actor,
    action: "USER_DELETED",
    description: `Deleted account "${target.username}" (${target.email})`,
  });

  return ok({ success: true, deleted: true });
});
