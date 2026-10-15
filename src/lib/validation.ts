// ============================================================================
// RMIS — Shared Zod validation (spec §12.3). Shared by API routes and forms.
// Dates accept YYYY-MM-DD or full ISO (production dates are TEXT).
// ============================================================================

import { z } from "zod";
import { SETTABLE_STATUSES } from "@/lib/status";

/** Accepts "YYYY-MM-DD" or any parseable datetime string. */
export const dateString = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}/.test(v) || !Number.isNaN(Date.parse(v)), {
    message: "Invalid date",
  })
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .nullable();

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

// ── Auth ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  // Turnstile token (public applicant door only; ignored on the staff gate).
  captchaToken: z.string().max(4096).optional().nullable(),
});

export const registerSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  captchaToken: z.string().max(4096).optional().nullable(),
});

// Task 35 — Account Settings › Change password (any signed-in role; the
// CURRENT password is re-verified server-side, matching the login bcrypt).
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters").max(128),
});

// ── Profile sections (spec §12.3) ───────────────────────────────────────────
export const educationSchema = z.object({
  educationLevel: optStr(50),
  degree: optStr(120),
  course: optStr(200),
  specifyOthers: optStr(200),
  schoolName: optStr(200),
  ongoing: z.boolean().optional(),
  isHighestEducation: z.boolean().optional(),
  yearFrom: optStr(20),
  yearTo: optStr(20),
  highestLevel: optStr(50),
  unitsEarned: optStr(50),
  yearGraduated: optStr(20),
  awards: optStr(500),
  hrRemarks: optStr(500),
});

export const workExperienceSchema = z.object({
  positionTitle: optStr(200),
  employerName: optStr(200),
  employerAddress: optStr(500),
  isPresentWork: z.boolean().optional(),
  isGovtService: z.boolean().optional(),
  dateFrom: dateString,
  dateTo: dateString,
  statusOfEmployment: optStr(50),
  monthlySalary: z.number().min(0).max(10_000_000).optional().nullable(),
  supervisorName: optStr(120),
  supervisorPosition: optStr(120),
  office: optStr(200),
  reasonForLeaving: optStr(500),
  accomplishment: optStr(2000),
  actualDuties: optStr(2000),
  hrRemarks: optStr(500),
});

export const trainingSchema = z.object({
  title: optStr(200),
  typeOfTraining: optStr(50),
  specifyTraining: optStr(200),
  numberHours: z.number().int().min(0).max(10000).optional().nullable(),
  hourDecimal: z.number().min(0).max(10000).optional().nullable(),
  isPresentWork: z.boolean().optional(),
  isGovtService: z.boolean().optional(),
  dateFrom: dateString,
  dateTo: dateString,
  hrRemarks: optStr(500),
});

export const eligibilitySchema = z.object({
  title: optStr(200),
  eligibilityId: z.number().int().optional().nullable(),
  rating: optStr(20),
  examDate: optStr(40),
  examPlace: optStr(200),
  licenseNumber: optStr(80),
  licenseValidity: optStr(40),
  hrRemarks: optStr(500),
});

export const awardSchema = z.object({
  recognitionType: optStr(30),
  scope: optStr(30),
  details: optStr(500),
  category: optStr(100),
  provider: optStr(200),
  dateGranted: optStr(40),
  points: z.number().int().min(0).max(1000).optional().nullable(),
  hrRemarks: optStr(500),
});

// ── Personal profile PUT (whitelist; spec §6.3) ─────────────────────────────
export const personalProfileSchema = z.object({
  firstName: optStr(80),
  middleName: optStr(80),
  lastName: optStr(80),
  extensionName: optStr(20),
  nickname: optStr(80),
  employeeNumber: optStr(40),
  mobileNumber: optStr(20),
  contactNumber: optStr(30),
  contactNumberSec: optStr(30),
  telephoneNumber: optStr(30),
  emailAddress: optStr(200),
  birthDate: optStr(20),
  birthPlace: optStr(200),
  gender: optStr(20),
  civilStatus: optStr(20),
  citizenship: optStr(80),
  height: optStr(20),
  weight: optStr(20),
  bloodType: optStr(5),
  religion: optStr(80),
  ethnicity: optStr(80),
  isPwd: z.boolean().optional(),
  houseNumber: optStr(50),
  street: optStr(200),
  subdivision: optStr(200),
  barangay: optStr(100),
  city: optStr(100),
  province: optStr(100),
  country: optStr(100),
  zipCode: optStr(10),
  presentAddress: optStr(500),
  permanentHouseNumber: optStr(50),
  permanentStreet: optStr(200),
  permanentSubdivision: optStr(200),
  permanentBarangay: optStr(100),
  permanentCity: optStr(100),
  permanentProvince: optStr(100),
  permanentZipCode: optStr(10),
  pagibig: optStr(40),
  gsis: optStr(40),
  philhealth: optStr(40),
  tin: optStr(40),
  sss: optStr(40),
  govtIssuedId: optStr(80),
  govtIdIssuedNumber: optStr(80),
  govtIdIssuedPlace: optStr(200),
  govtIdDateIssued: optStr(40),
  govtIdValidUntil: optStr(40),
  isGovernment: z.boolean().optional(),
  pendingCases: optStr(500),
  adminCase: z.boolean().optional(),
  adminCaseDetails: optStr(500),
  crimeCharge: z.boolean().optional(),
  crimeDate: optStr(20),
  crimeCaseStatus: optStr(100),
  specifyReferral: optStr(200),
  remarks: optStr(500),
  characterReferences: z
    .array(
      z.object({
        name: optStr(120),
        title: optStr(120),
        company: optStr(200),
        companyAddress: optStr(300),
        email: optStr(120),
        contact: optStr(60),
      })
    )
    .max(5)
    .optional(),
  isProfileComplete: z.boolean().optional(),
});

// ── Jobs ────────────────────────────────────────────────────────────────────
export const jobCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  positionType: optStr(100),
  // QA 2026-02: Plantilla posts are 1:1 with an item number — vacancy count
  // is optional (null). COS / Job Order posts must carry a count (enforced in
  // the route). The Plantilla Item No., Salary Grade and Monthly Salary ride
  // the position write-through.
  numberOfVacancy: z.number().int().min(1).max(99).nullable().optional(),
  itemNumber: optStr(60),
  salaryGrade: optStr(20),
  // Task 10 — the posting's remaining front-page identity facts: Salary Step
  // (SG grade/step pair on the public board) and Place of Assignment (the
  // posting's location line). Both ride the same Position write-through.
  salaryStep: optStr(20),
  placeOfAssignment: optStr(200),
  salaryAmount: z.number().min(0).max(1_000_000).optional().nullable(),
  briefDescription: optStr(5000),
  briefDescriptionHtml: optStr(20000),
  dutiesResponsibilities: optStr(8000),
  dutiesHtml: optStr(20000),
  compensationPackage: optStr(4000),
  compensationHtml: optStr(20000),
  otherQualifications: optStr(4000),
  otherQualificationsHtml: optStr(20000),
  publishDate: dateString,
  deadlineDate: dateString,
  processingDate: dateString,
  division: optStr(100),
  education: optStr(1000),
  experience: optStr(500),
  training: optStr(500),
  eligibility: optStr(500),
  license: optStr(500),
  positionId: z.number().int().optional().nullable(),
});

export const positionCreateSchema = z.object({
  itemNumber: optStr(40),
  positionTitle: z.string().trim().min(1).max(200),
  positionType: optStr(100),
  division: optStr(100),
  placeOfAssignment: optStr(200),
  salaryGrade: optStr(20),
  salaryStep: optStr(20),
  salaryAmount: z.number().min(0).max(1_000_000).optional().nullable(),
  cscEducation: optStr(1000),
  cscEligibility: optStr(500),
  cscEligibilityGroup: optStr(200),
  cscWorkExperience: optStr(500),
  cscTraining: optStr(500),
  license: optStr(500),
  preferredQualification: optStr(1000),
});

// ── Status / users / misc ───────────────────────────────────────────────────
export const statusUpdateSchema = z.object({
  status: z.enum(SETTABLE_STATUSES as [string, ...string[]]),
  reason: optStr(500),
});

export const userCreateSchema = z.object({
  email: z.string().trim().email(),
  username: z.string().trim().min(3).max(60),
  password: z.string().min(6).max(128),
  role: z.enum(["APPLICANT", "EVALUATOR", "ADMIN"]),
  firstName: optStr(80),
  lastName: optStr(80),
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(3).max(60).optional(),
  firstName: optStr(80),
  lastName: optStr(80),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["APPLICANT", "EVALUATOR", "ADMIN"]).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// MOM 2026-10-13 — "Notes" is now "Invitation Details": LONG TEXT with no
// practical character limit (the input and the SQLite TEXT column are both
// unlimited; the 20,000-char server ceiling is an abuse guard, ~5× the old
// bound), plus the new setup-mode fields (face-to-face venue vs. online
// meeting link).
export const noticeSchema = z.object({
  type: z.enum(["regret", "interview", "skills_exam"]),
  date: optStr(80),
  time: optStr(80),
  venue: optStr(200),
  contact: optStr(200),
  notes: optStr(20000),
  examType: optStr(120),
  mode: z.enum(["face_to_face", "online"]).optional(),
  meetingLink: optStr(500),
  // The office's real hiring emails run a ONE-DAY, MULTI-STAGE schedule
  // (e.g. 1. Face-to-face Interview 12:30 PM, 2. Psychological Assessment
  // 1:00 PM–3:00 PM). Stage 1 comes from the main date/time/venue fields;
  // `extraStages` carries stages 2..N. Two+ stages switch the invitation
  // email to the "next stages / one-day process" template.
  extraStages: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Stage title is required.").max(160),
        time: optStr(80),
        venue: optStr(200),
      })
    )
    .max(5)
    .optional(),
});

/** MOM 2026-10-13 — bulk interview/exam invitations to shortlisted applicants
 *  of specific job listings. Same notice details, fanned out per application. */
export const bulkNoticeSchema = noticeSchema.extend({
  applicationIds: z.array(z.number().int()).min(1, "At least one application id is required").max(200, "A maximum of 200 applications per batch"),
});

export const directEmailSchema = z.object({
  subject: optStr(200),
  message: z.string().trim().min(1).max(5000),
});

export const autoApplySchema = z.object({
  extraction: z.object({
    personalInfo: z.record(z.string(), z.unknown()).optional(),
    educations: z.array(z.record(z.string(), z.unknown())).optional(),
    workExperiences: z.array(z.record(z.string(), z.unknown())).optional(),
    trainings: z.array(z.record(z.string(), z.unknown())).optional(),
    eligibilities: z.array(z.record(z.string(), z.unknown())).optional(),
    awards: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

export const DOCUMENT_CATEGORIES = [
  "PDS", "RESUME", "EDUCATION", "WORK_EXPERIENCE", "TRAINING", "ELIGIBILITY",
  "AWARD", "ACCOMPLISHMENT", "COE", "PERFORMANCE_EVALUATION", "SUPPORTING",
  "PROFILE_PICTURE",
] as const;

export const EXTRACTABLE_CATEGORIES = [
  "PDS", "RESUME", "EDUCATION", "WORK_EXPERIENCE", "TRAINING", "ELIGIBILITY",
  "AWARD", "ACCOMPLISHMENT",
] as const;

// ── Upload allowlist (spec §10) — ONE source ───────────────────────────────
// The server 415 gate (api/applicant/documents/route.ts) and the client
// accept-string (profile/documents-section.tsx) previously mirrored this list
// by hand. The client rejects bad files before a byte is sent; the server
// remains the backstop.
export const UPLOAD_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp",
  "xlsx", "xls", "xlsm", "pdf", "doc", "docx",
] as const;

/** ".png,.jpg,…" — the FilePicker accept value derived from the allowlist. */
export const UPLOAD_ACCEPT = "." + UPLOAD_EXTENSIONS.join(".");

/** Trim-to-null for optional section fields — ONE definition for the five
 *  applicant section CRUD routes (was copy-pasted ×5 with drift risk). */
export const orNull = (s: string | null | undefined): string | null =>
  s && s.trim() !== "" ? s.trim() : null;
