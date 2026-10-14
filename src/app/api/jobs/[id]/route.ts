// ============================================================================
// RMIS — Single job posting (spec §6.2).
//   PATCH  staff — partial update; positionId present → set (null unlinks);
//                  vitals present → update-or-create the linked Position.
//                  No audit on update.
//   DELETE staff — confirm gate: linked applications require ?scope=all;
//                  cascade deletes applications + snapshots + posting.
// ============================================================================

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp, parseId } from "@/lib/api";
import { requireEvaluatorFromReq, type AuthedUser } from "@/lib/auth";
import { jobCreateSchema } from "@/lib/validation";
import { jobIsActive } from "@/lib/job-meta";
import { sanitizeHtml } from "@/lib/sanitize";
import { auditLog } from "@/lib/audit";

// ── Local helpers ───────────────────────────────────────────────────────────

function toDateTime(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

const jobInclude = {
  position: true,
  author: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobPostingInclude;

type JobRow = Prisma.JobPostingGetPayload<{ include: typeof jobInclude }>;

function toJobWire(job: JobRow, ownApplications: { id: number; status: string }[]) {
  return {
    id: job.id,
    title: job.position?.positionTitle || job.title,
    positionType: job.positionType,
    numberOfVacancy: job.numberOfVacancy,
    briefDescription: job.briefDescription,
    briefDescriptionHtml: job.briefDescriptionHtml,
    dutiesResponsibilities: job.dutiesResponsibilities,
    dutiesHtml: job.dutiesHtml,
    compensationPackage: job.compensationPackage,
    compensationHtml: job.compensationHtml,
    otherQualifications: job.otherQualifications,
    otherQualificationsHtml: job.otherQualificationsHtml,
    publishDate: job.publishDate?.toISOString() ?? null,
    deadlineDate: job.deadlineDate?.toISOString() ?? null,
    processingDate: job.processingDate?.toISOString() ?? null,
    publishedAt: job.publishedAt.toISOString(),
    isActive: jobIsActive(job.deadlineDate),
    position: job.position ?? null,
    author: job.author,
    applications: ownApplications,
    applicationCount: job._count.applications,
  };
}

function auditStaff(user: AuthedUser, req: Request, action: string, entityId: number, description: string) {
  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action,
    entityType: "job",
    entityId,
    description,
    ipAddress: getClientIp(req),
  });
}

// ── PATCH /api/jobs/[id] — partial update ───────────────────────────────────

export const PATCH = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);

  const job = await db.jobPosting.findUnique({ where: { id }, include: { position: true } });
  if (!job) throw new ApiError("Job posting not found", 404);

  const body = await req.json().catch(() => ({}));
  const input = jobCreateSchema.partial().parse(body);

  // NOTE: in this Zod version .partial() still applies .default(1) to
  // numberOfVacancy — guard on raw-body presence so an omitted field is
  // never "updated" to the default.
  const vacancyProvided =
    body && typeof body === "object" && "numberOfVacancy" in (body as Record<string, unknown>);

  const data: Prisma.JobPostingUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.positionType !== undefined) data.positionType = input.positionType;
  if (vacancyProvided && input.numberOfVacancy !== undefined) data.numberOfVacancy = input.numberOfVacancy;
  if (input.briefDescription !== undefined) data.briefDescription = input.briefDescription;
  if (input.briefDescriptionHtml !== undefined) data.briefDescriptionHtml = sanitizeHtml(input.briefDescriptionHtml) || null;
  if (input.dutiesResponsibilities !== undefined) data.dutiesResponsibilities = input.dutiesResponsibilities;
  if (input.dutiesHtml !== undefined) data.dutiesHtml = sanitizeHtml(input.dutiesHtml) || null;
  if (input.compensationPackage !== undefined) data.compensationPackage = input.compensationPackage;
  if (input.compensationHtml !== undefined) data.compensationHtml = sanitizeHtml(input.compensationHtml) || null;
  if (input.otherQualifications !== undefined) data.otherQualifications = input.otherQualifications;
  if (input.otherQualificationsHtml !== undefined) data.otherQualificationsHtml = sanitizeHtml(input.otherQualificationsHtml) || null;
  if (input.publishDate !== undefined) data.publishDate = toDateTime(input.publishDate);
  if (input.deadlineDate !== undefined) data.deadlineDate = toDateTime(input.deadlineDate);
  if (input.processingDate !== undefined) data.processingDate = toDateTime(input.processingDate);
  if (input.positionId !== undefined) data.positionId = input.positionId;

  // Vitals write-through (spec §6.2): update the linked position — or create
  // one when none is linked. Only fields actually provided are written.
  const vitals: Prisma.PositionUpdateInput = {};
  if (input.education !== undefined) vitals.cscEducation = input.education;
  if (input.experience !== undefined) vitals.cscWorkExperience = input.experience;
  if (input.training !== undefined) vitals.cscTraining = input.training;
  if (input.eligibility !== undefined) vitals.cscEligibilityGroup = input.eligibility;
  if (input.license !== undefined) vitals.license = input.license;
  if (input.division !== undefined) vitals.division = input.division;
  // QA 2026-02 — posting identity vitals (Item No., Salary Grade, Monthly
  // Salary) ride the same provided-only write-through.
  if (input.itemNumber !== undefined) vitals.itemNumber = input.itemNumber;
  if (input.salaryGrade !== undefined) vitals.salaryGrade = input.salaryGrade;
  if (input.salaryAmount !== undefined) vitals.salaryAmount = input.salaryAmount;
  const hasVitals = Object.keys(vitals).length > 0;

  if (hasVitals) {
    const targetId = input.positionId !== undefined ? input.positionId : job.positionId;
    if (targetId != null) {
      const target = await db.position.findUnique({ where: { id: targetId } });
      if (!target) throw new ApiError("Linked position not found", 404);
      await db.position.update({ where: { id: targetId }, data: vitals });
    } else {
      const created = await db.position.create({
        data: {
          positionTitle: input.title ?? job.title,
          positionType: input.positionType ?? job.positionType,
          cscEducation: input.education ?? null,
          cscWorkExperience: input.experience ?? null,
          cscTraining: input.training ?? null,
          cscEligibilityGroup: input.eligibility ?? null,
          license: input.license ?? null,
          division: input.division ?? null,
          itemNumber: input.itemNumber ?? null,
          salaryGrade: input.salaryGrade ?? null,
          salaryAmount: input.salaryAmount ?? null,
        },
      });
      data.positionId = created.id;
    }
  }

  const updated = await db.jobPosting.update({ where: { id }, data, include: jobInclude });
  return ok(toJobWire(updated, []));
});

// ── DELETE /api/jobs/[id] — confirm-gated cascade delete ────────────────────

export const DELETE = handleApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireEvaluatorFromReq(req);
  const id = parseId((await ctx.params).id);
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) throw new ApiError("Job posting not found", 404);

  const applicationCount = job._count.applications;

  // Confirm gate (spec §6.2): linked applications require an explicit scope.
  if (applicationCount > 0 && scope !== "all") {
    throw new ApiError(
      "This posting has linked applications. Confirm deletion to remove them as well.",
      409,
      { applicationCount }
    );
  }

  if (applicationCount > 0) {
    // Atomic cascade: applications and the posting disappear together. Two
    // bare deletes could strand applications under a deleted posting if the
    // second write failed.
    await db.$transaction(async (tx) => {
      await tx.application.deleteMany({ where: { jobId: id } });
      await tx.jobPosting.delete({ where: { id } });
    });
  } else {
    await db.jobPosting.delete({ where: { id } });
  }

  auditStaff(
    user,
    req,
    "JOB_POSTING_DELETED",
    id,
    `Job posting deleted: ${job.title}` + (applicationCount > 0 ? ` (including ${applicationCount} linked application${applicationCount === 1 ? "" : "s"} with their snapshots)` : "")
  );

  return ok({ id, deleted: true, applicationsDeleted: applicationCount });
});
