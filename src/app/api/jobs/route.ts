// ============================================================================
// RMIS — Jobs collection (spec §6.2).
//   GET  public  — published postings, newest first, deadline-visibility rule
//                  (§8.7: non-staff viewers never see postings whose deadline
//                  date is before start-of-today).
//   POST  staff  — create + immediately publish; HTML companions sanitized;
//                  qualification vitals written through to the linked Position
//                  (update) or used to create a new Position when none linked.
// ============================================================================

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, ApiError, handleApi, getClientIp } from "@/lib/api";
import { getSessionFromReq, requireEvaluatorFromReq } from "@/lib/auth";
import { jobIsActive } from "@/lib/job-meta";
import { jobCreateSchema } from "@/lib/validation";
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

/** Qualification vitals carried on the job form (write-through to Position). */
function positionVitals(input: {
  education?: string | null;
  experience?: string | null;
  training?: string | null;
  eligibility?: string | null;
  license?: string | null;
  division?: string | null;
  itemNumber?: string | null;
  salaryGrade?: string | null;
  // Task 10 — the remaining front-page identity facts ride the same
  // write-through so the public board renders them straight from the form.
  salaryStep?: string | null;
  placeOfAssignment?: string | null;
  salaryAmount?: number | null;
}) {
  return {
    cscEducation: input.education ?? null,
    cscWorkExperience: input.experience ?? null,
    cscTraining: input.training ?? null,
    cscEligibilityGroup: input.eligibility ?? null,
    license: input.license ?? null,
    division: input.division ?? null,
    // QA 2026-02 — the posting identity vitals (Item No., Salary Grade,
    // Monthly Salary) ride the same write-through so the public board's
    // quick facts and every table render them.
    itemNumber: input.itemNumber ?? null,
    salaryGrade: input.salaryGrade ?? null,
    salaryStep: input.salaryStep ?? null,
    placeOfAssignment: input.placeOfAssignment ?? null,
    salaryAmount: input.salaryAmount ?? null,
  };
}

function hasVitals(input: {
  education?: string | null;
  experience?: string | null;
  training?: string | null;
  eligibility?: string | null;
  license?: string | null;
  division?: string | null;
  itemNumber?: string | null;
  salaryGrade?: string | null;
  salaryStep?: string | null;
  placeOfAssignment?: string | null;
  salaryAmount?: number | null;
}): boolean {
  return [input.education, input.experience, input.training, input.eligibility, input.license, input.division, input.itemNumber, input.salaryGrade, input.salaryStep, input.placeOfAssignment]
    .some((v) => typeof v === "string" && v.trim() !== "") || input.salaryAmount != null;
}

// ── GET /api/jobs — public listing ──────────────────────────────────────────

export const GET = handleApi(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100, 1), 200);

  // Session is optional — used only to personalize (own applications) and to
  // decide the deadline-visibility tier (staff see everything, §8.7).
  const session = await getSessionFromReq(req);
  const isStaff = session?.role === "EVALUATOR" || session?.role === "ADMIN";

  const jobs = await db.jobPosting.findMany({
    // publishedAt is non-nullable (@default(now())) — gte(epoch) expresses the
    // "published only" filter in a way Prisma's DateTimeFilter accepts.
    where: { publishedAt: { gte: new Date(0) } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: jobInclude,
  });

  // Deadline visibility rule (spec §8.7): hide from non-staff viewers any
  // posting whose deadline date is before start-of-today (date-level compare;
  // shared predicate from lib/job-meta).
  const visible = isStaff
    ? jobs
    : jobs.filter((j) => jobIsActive(j.deadlineDate));

  // Viewer's own applications (APPLICANT only) — keyed per job.
  const ownByJob = new Map<number, { id: number; status: string }[]>();
  if (session?.role === "APPLICANT" && session.applicantId != null && visible.length > 0) {
    const jobIds = visible.map((j) => j.id);
    const apps = await db.application.findMany({
      where: { applicantId: session.applicantId, jobId: { in: jobIds } },
      select: { id: true, status: true, jobId: true },
    });
    for (const a of apps) {
      const list = ownByJob.get(a.jobId) ?? [];
      list.push({ id: a.id, status: a.status });
      ownByJob.set(a.jobId, list);
    }
  }

  return ok(visible.map((j) => toJobWire(j, ownByJob.get(j.id) ?? [])));
});

// ── POST /api/jobs — staff create + publish ─────────────────────────────────

export const POST = handleApi(async (req: Request) => {
  const user = await requireEvaluatorFromReq(req);
  const body = await req.json().catch(() => ({}));
  const input = jobCreateSchema.parse(body);

  // QA 2026-02: contractual postings (Contract of Service and Job Order) must
  // carry a vacancy count — Plantilla posts are 1:1 with a Plantilla Item
  // Number, so their count is optional (null) and the ITEM NUMBER is required
  // instead whenever a Plantilla type is chosen.
  const typeUpper = (input.positionType ?? "").toUpperCase();
  const isCos =
    typeUpper.includes("COS") || typeUpper.includes("CONTRACT") || typeUpper.includes("JOB ORDER");
  if (isCos && (input.numberOfVacancy == null)) {
    throw new ApiError("Contract of Service / Job Order postings must specify the number of vacancies", 422);
  }
  if (!isCos && typeUpper !== "" && !input.itemNumber?.trim()) {
    throw new ApiError("Plantilla postings need the Plantilla Item No.", 422);
  }

  // HTML companions are sanitized server-side before storage (spec §12.4).
  const briefDescriptionHtml = sanitizeHtml(input.briefDescriptionHtml) || null;
  const dutiesHtml = sanitizeHtml(input.dutiesHtml) || null;
  const compensationHtml = sanitizeHtml(input.compensationHtml) || null;
  const otherQualificationsHtml = sanitizeHtml(input.otherQualificationsHtml) || null;

  // Vitals write-through (spec §6.2): link an existing position (updating its
  // CSC standards) — or auto-create a Position when none was selected.
  let positionId = input.positionId ?? null;
  if (positionId != null) {
    const existing = await db.position.findUnique({ where: { id: positionId } });
    if (!existing) throw new ApiError("Linked position not found", 404);
    await db.position.update({ where: { id: positionId }, data: positionVitals(input) });
  } else if (hasVitals(input)) {
    const created = await db.position.create({
      data: {
        positionTitle: input.title,
        positionType: input.positionType ?? null,
        ...positionVitals(input),
      },
    });
    positionId = created.id;
  }

  const job = await db.jobPosting.create({
    data: {
      title: input.title,
      positionType: input.positionType ?? null,
      numberOfVacancy: input.numberOfVacancy ?? null,
      briefDescription: input.briefDescription ?? null,
      briefDescriptionHtml,
      dutiesResponsibilities: input.dutiesResponsibilities ?? null,
      dutiesHtml,
      compensationPackage: input.compensationPackage ?? null,
      compensationHtml,
      otherQualifications: input.otherQualifications ?? null,
      otherQualificationsHtml,
      publishDate: toDateTime(input.publishDate),
      deadlineDate: toDateTime(input.deadlineDate),
      processingDate: toDateTime(input.processingDate),
      positionId,
      authorId: user.id,
      publishedAt: new Date(),
    },
  });

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "JOB_POSTING_CREATED",
    entityType: "job",
    entityId: job.id,
    description: `Job posting created: ${job.title}${positionId ? ` (position #${positionId})` : ""}`,
    ipAddress: getClientIp(req),
  });

  const fresh = await db.jobPosting.findUnique({ where: { id: job.id }, include: jobInclude });
  return ok(
    toJobWire(
      fresh ?? ({ ...job, position: null, author: null, _count: { applications: 0 } } as unknown as JobRow),
      []
    ),
    201
  );
});
