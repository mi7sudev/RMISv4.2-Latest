// ============================================================================
// RMIS — Seed script (spec §15): RBAC-free normalized schema; demo accounts,
// reference data, positions + postings, sample applicants + applications
// across pipeline stages. Run: npx tsx prisma/seed.ts (or bun prisma/seed.ts)
// Task 14 (production prep): the seed writes DEMO accounts (testadmin /
// testevaluator / testapplicant, password123) and sample applicants — it must
// NEVER touch a production database. It now refuses to run unless the DEMO
// guard is explicit: set ALLOW_DEMO_SEED=1 (dev/sandbox convenience), or the
// run aborts before a single row is written.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
// MOM-authentic notification templates — reused so every seeded email/SMS row
// carries the EXACT wording the live system would have produced.
import {
  emailApplicationReceived,
  emailUnderReview,
  emailShortlisted,
  emailRegretLetter,
  emailInterviewInvitation,
  emailSkillsExam,
  smsApplicationReceived,
  smsNotice,
  smsStatusChanged,
  type NoticeDetails,
} from "@/lib/notify";

const db = new PrismaClient();

async function main() {
  // ── Production guard (Task 14) ──────────────────────────────────────────
  // Demo credentials must never exist outside development. Abort unless the
  // operator opted in explicitly.
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    console.error(
      "\n✖ Refusing to seed: this script writes DEMO accounts (testadmin/testevaluator/" +
        "testapplicant — password123) and sample applicants/postings.\n" +
        "  Point production at a clean database and create real staff accounts instead.\n" +
        "  (Developers: re-run with ALLOW_DEMO_SEED=1 to seed a development database.)\n"
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("\n✖ Refusing to seed: NODE_ENV=production. Demo data is never for production.\n");
    process.exit(1);
  }

  console.log("Seeding RMIS…");

  // ── Reference data ────────────────────────────────────────────────────────
  const eligibilityNames = [
    "None Required",
    "Career Service Sub-Professional (First Level)",
    "Career Service Professional (Second Level)",
    "Honor Graduate (PD 907)",
    "Bar/Board (RA 1080)",
  ];
  for (let i = 0; i < eligibilityNames.length; i++) {
    await db.eligibilityRef.upsert({
      where: { name: eligibilityNames[i] },
      update: { index: i },
      create: { name: eligibilityNames[i], index: i },
    });
  }

  const courses: [string, string, string, string][] = [
    ["BSBA", "BSBA", "Business", "College"],
    ["BS Accountancy", "BSA", "Business", "College"],
    ["BS Mechanical Engineering", "BSME", "Engineering", "College"],
    ["BS Electrical Engineering", "BSEE", "Engineering", "College"],
    ["BS Civil Engineering", "BSCE", "Engineering", "College"],
    ["BS Industrial Engineering", "BSIE", "Engineering", "College"],
    ["BS Computer Science", "BSCS", "IT", "College"],
    ["BS Information Technology", "BSIT", "IT", "College"],
    ["BS Chemistry", "BS Chem", "Science", "College"],
    ["BS Physics", "BS Physics", "Science", "College"],
    ["BS Biology", "BS Bio", "Science", "College"],
    ["BS Psychology", "BSPsych", "Social Science", "College"],
    ["AB Political Science", "AB PolSci", "Social Science", "College"],
    ["MS Mechanical Engineering", "MSME", "Engineering", "Graduate"],
    ["Master in Public Administration", "MPA", "Public Admin", "Graduate"],
    ["Master in Business Administration", "MBA", "Business", "Graduate"],
  ];
  for (const [name, abbr, category, level] of courses) {
    await db.course.upsert({ where: { name }, update: {}, create: { name, abbreviation: abbr, category, level } });
  }

  const places = ["Accounting Unit", "Human Resource Development Unit", "Metrology Laboratory", "Materials and Corrosion Laboratory"];
  for (const name of places) {
    await db.placeOfAssignment.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("password123", 10);
  const accounts = [
    { username: "testadmin", email: "testadmin@mirdc.gov.ph", firstName: "Test", lastName: "Admin", role: "ADMIN" },
    { username: "testevaluator", email: "testevaluator@mirdc.gov.ph", firstName: "Test", lastName: "Evaluator", role: "EVALUATOR" },
    { username: "testapplicant", email: "testapplicant@mirdc.gov.ph", firstName: "Test", lastName: "Applicant", role: "APPLICANT" },
  ];
  const users: Record<string, string> = {};
  for (const a of accounts) {
    const user = await db.user.upsert({
      where: { username: a.username },
      update: { password: hash, role: a.role, blocked: false },
      create: { ...a, password: hash },
    });
    users[a.role] = user.id;
    if (a.role === "APPLICANT") {
      const existing = await db.applicant.findUnique({ where: { userId: user.id } });
      if (!existing) {
        await db.applicant.create({
          data: {
            userId: user.id,
            firstName: "Test",
            lastName: "Applicant",
            emailAddress: a.email,
            mobileNumber: "09171234567",
          },
        });
      }
    }
  }

  // ── Positions + postings ──────────────────────────────────────────────────
  const day = 86400000;
  const now = Date.now();

  const positionDefs = [
    {
      itemNumber: "MIRDC-MC1-1-1998",
      positionTitle: "Supervising Science Research Specialist",
      positionType: "Permanent",
      // MOM 2026-10-13 divisions refresh — MPRD is abolished; materials
      // research now sits under AMMRDD.
      division: "AMMRDD",
      placeOfAssignment: "Materials and Corrosion Laboratory",
      salaryGrade: "22", salaryStep: "1", salaryAmount: 66459,
      cscEducation: "Master's degree or Bachelor's degree relevant to the job",
      cscEligibility: "Career Service Professional", cscEligibilityGroup: "Career Service Professional (Second Level)",
      cscWorkExperience: "2 years of relevant experience",
      cscTraining: "16 hours of relevant training",
      license: "None required",
    },
    {
      itemNumber: "MIRDC-SC1-5-2006",
      positionTitle: "Science Research Specialist I",
      positionType: "Permanent",
      // Old "Testing Services Division" code now means Technology Solutions;
      // metrology/testing belongs to the new Analysis and Testing Division.
      division: "ATD",
      placeOfAssignment: "Metrology Laboratory",
      salaryGrade: "13", salaryStep: "1", salaryAmount: 31699,
      cscEducation: "Bachelor's degree relevant to the job",
      cscEligibility: "Career Service Professional", cscEligibilityGroup: "Career Service Professional (Second Level)",
      cscWorkExperience: "None required",
      cscTraining: "4 hours of relevant training",
      license: "None required",
    },
    {
      itemNumber: "MIRDC-AA1-3-2015",
      positionTitle: "Administrative Assistant I",
      positionType: "Permanent",
      division: "FAD",
      placeOfAssignment: "Accounting Unit",
      salaryGrade: "9", salaryStep: "1", salaryAmount: 22316,
      cscEducation: "Relevant vocational/trade course",
      cscEligibility: "Career Service Sub-Professional", cscEligibilityGroup: "Career Service Sub-Professional (First Level)",
      cscWorkExperience: "None required",
      cscTraining: "None required",
      license: "None required",
    },
    {
      itemNumber: "COS-2026-EMC-01",
      positionTitle: "Electronics Technician (Contract of Service)",
      positionType: "Contract of Service",
      division: "AMMRDD",
      placeOfAssignment: "Human Resource Development Unit",
      salaryGrade: null, salaryStep: null, salaryAmount: 28000,
      cscEducation: "Relevant vocational/trade course",
      cscEligibility: "N/A", cscEligibilityGroup: "N/A",
      cscWorkExperience: "1 year of relevant experience",
      cscTraining: "None required",
      license: "TESDA NC II an advantage",
    },
  ];

  const positions: Record<string, number> = {};
  for (const p of positionDefs) {
    const existing = await db.position.findFirst({ where: { itemNumber: p.itemNumber } });
    const row = existing
      ? await db.position.update({ where: { id: existing.id }, data: p })
      : await db.position.create({ data: p });
    positions[p.positionTitle] = row.id;
  }

  const jobDefs = [
    {
      title: "Supervising Science Research Specialist",
      positionType: "Permanent",
      numberOfVacancy: 1,
      briefDescription: "Leads research projects on metals and materials corrosion, mentors junior researchers, and represents the division in inter-agency collaborations.",
      dutiesResponsibilities: "• Lead R&D projects on materials corrosion and protection\n• Publish research outputs in peer-reviewed venues\n• Mentor junior research staff\n• Coordinate with industry partners on collaborative studies",
      compensationPackage: "SG-22 Step 1 (₱66,459 monthly) plus statutory benefits",
      otherQualifications: "Strong publication record preferred; experience in electrochemical testing an advantage.",
      deadlineOffsetDays: 21,
      positionKey: "Supervising Science Research Specialist",
    },
    {
      title: "Science Research Specialist I",
      positionType: "Permanent",
      numberOfVacancy: 2,
      briefDescription: "Performs calibration and testing services in the Metrology Laboratory and documents results in accordance with ISO/IEC 17025.",
      dutiesResponsibilities: "• Perform calibration of measurement instruments\n• Maintain laboratory quality-management documentation\n• Assist clients with testing requirements",
      compensationPackage: "SG-13 Step 1 (₱31,699 monthly) plus statutory benefits",
      otherQualifications: "Fresh graduates are encouraged to apply.",
      deadlineOffsetDays: 14,
      positionKey: "Science Research Specialist I",
    },
    {
      title: "Administrative Assistant I",
      positionType: "Permanent",
      numberOfVacancy: 1,
      briefDescription: "Provides administrative and records support to the Accounting Unit, including document routing and data entry.",
      dutiesResponsibilities: "• Prepare and route administrative documents\n• Maintain records and filing systems\n• Assist in inventory and supplies monitoring",
      compensationPackage: "SG-9 Step 1 (₱22,316 monthly) plus statutory benefits",
      otherQualifications: "Proficiency in office productivity software required.",
      deadlineOffsetDays: 10,
      positionKey: "Administrative Assistant I",
    },
    {
      title: "Electronics Technician (Contract of Service)",
      positionType: "Contract of Service",
      numberOfVacancy: 3,
      briefDescription: "Supports the fabrication and maintenance of electronics prototypes for advanced manufacturing research projects.",
      dutiesResponsibilities: "• Assemble and test electronics prototypes\n• Maintain laboratory equipment\n• Support project field deployments",
      compensationPackage: "₱28,000 monthly (contract of service)",
      otherQualifications: "TESDA NC II holders encouraged to apply.",
      deadlineOffsetDays: -3, // already closed — demonstrates the visibility rule
      positionKey: "Electronics Technician (Contract of Service)",
    },
  ];

  const adminId = users["ADMIN"];
  for (const j of jobDefs) {
    const existing = await db.jobPosting.findFirst({ where: { title: j.title, positionId: positions[j.positionKey] } });
    const data = {
      title: j.title,
      positionType: j.positionType,
      numberOfVacancy: j.numberOfVacancy,
      briefDescription: j.briefDescription,
      briefDescriptionHtml: `<p>${j.briefDescription}</p>`,
      dutiesResponsibilities: j.dutiesResponsibilities,
      dutiesHtml: j.dutiesResponsibilities.split("\n").map((l) => `<p>${l}</p>`).join(""),
      compensationPackage: j.compensationPackage,
      compensationHtml: `<p>${j.compensationPackage}</p>`,
      otherQualifications: j.otherQualifications,
      otherQualificationsHtml: `<p>${j.otherQualifications}</p>`,
      publishDate: new Date(now - 10 * day),
      deadlineDate: new Date(now + j.deadlineOffsetDays * day),
      positionId: positions[j.positionKey],
      authorId: adminId,
      publishedAt: new Date(now - 10 * day),
    };
    if (!existing) await db.jobPosting.create({ data });
  }

  // ── Sample applicant with complete profile + applications across stages ──
  const sampleEmail = "maria.santos@example.com";
  let sampleUser = await db.user.findUnique({ where: { username: "maria.santos" } });
  if (!sampleUser) {
    sampleUser = await db.user.create({
      data: {
        username: "maria.santos",
        email: sampleEmail,
        password: hash,
        firstName: "Maria",
        lastName: "Santos",
        role: "APPLICANT",
      },
    });
  }
  let sampleApplicant = await db.applicant.findUnique({ where: { userId: sampleUser.id } });
  if (!sampleApplicant) {
    sampleApplicant = await db.applicant.create({
      data: {
        userId: sampleUser.id,
        firstName: "Maria",
        middleName: "Reyes",
        lastName: "Santos",
        emailAddress: sampleEmail,
        mobileNumber: "09181234567",
        gender: "Female",
        civilStatus: "Single",
        citizenship: "Filipino",
        birthDate: "1996-05-14",
        birthPlace: "Quezon City",
        presentAddress: "12 Sampaguita St., Barangay San Roque",
        city: "Quezon City",
        province: "Metro Manila",
        country: "Philippines",
        zipCode: "1100",
        isProfileComplete: true,
        submittedDate: new Date(now - 5 * day),
        characterReference: JSON.stringify([
          { name: "Dr. Jose Cruz", title: "Chief, Materials Lab", company: "DOST-MIRDC", companyAddress: "Taguig", email: "jose.cruz@mirdc.gov.ph", contact: "09170000000" },
        ]),
      },
    });
    await db.education.createMany({
      data: [
        { applicantId: sampleApplicant.id, educationLevel: "College", course: "BS Chemistry", schoolName: "University of the Philippines", yearFrom: "2014", yearTo: "2018", yearGraduated: "2018", ord: 1 },
        { applicantId: sampleApplicant.id, educationLevel: "Secondary", schoolName: "Quezon City Science High School", yearFrom: "2010", yearTo: "2014", yearGraduated: "2014", ord: 2 },
      ],
    });
    await db.workExperience.createMany({
      data: [
        { applicantId: sampleApplicant.id, positionTitle: "Research Assistant", employerName: "DOST-ITDI", dateFrom: new Date("2019-01-01"), dateTo: new Date("2022-06-30"), isGovtService: true, statusOfEmployment: "Permanent", monthlySalary: 28000, yearDecimal: 3.5, ord: 1 },
        { applicantId: sampleApplicant.id, positionTitle: "Laboratory Analyst", employerName: "Private Testing Center", dateFrom: new Date("2022-07-01"), isPresentWork: true, isGovtService: false, statusOfEmployment: "Permanent", monthlySalary: 35000, yearDecimal: 3.1, ord: 2 },
      ],
    });
    await db.training.createMany({
      data: [
        { applicantId: sampleApplicant.id, title: "Basic Occupational Safety and Health", numberHours: 40, typeOfTraining: "Technical", dateFrom: new Date("2019-06-10"), dateTo: new Date("2019-06-14"), ord: 1 },
        { applicantId: sampleApplicant.id, title: "ISO/IEC 17025 Internal Auditor Training", numberHours: 24, typeOfTraining: "Technical", dateFrom: new Date("2021-03-01"), dateTo: new Date("2021-03-03"), ord: 2 },
      ],
    });
    await db.eligibility.create({
      data: { applicantId: sampleApplicant.id, title: "Career Service Professional (Second Level)", rating: "86.40", examDate: "2018-08-12", examPlace: "Quezon City", ord: 1 },
    });
    await db.award.create({
      data: { applicantId: sampleApplicant.id, recognitionType: "Award", scope: "Individual", details: "Best Poster Award — National Chemistry Conference", provider: "Philippine Federation of Chemistry Societies", dateGranted: "2021-11-20", ord: 1 },
    });
  }

  // Applications across stages for the sample applicant
  const jobs = await db.jobPosting.findMany({ include: { position: true } });
  const srs = jobs.find((j) => j.title.includes("Supervising"));
  const srs1 = jobs.find((j) => j.title === "Science Research Specialist I");

  async function ensureApplication(job: (typeof jobs)[number] | undefined, status: string, daysAgo: number) {
    if (!job) return;
    // (applicantId, jobId) is no longer unique (MOM 2026-10-13 re-application)
    // — find the ACTIVE application, else the most recent row.
    const existing =
      (await db.application.findFirst({
        where: {
          applicantId: sampleApplicant!.id,
          jobId: job.id,
          status: { notIn: ["Rejected", "Declined", "Withdrawn"] },
        },
        orderBy: { dateApplied: "desc" },
      })) ??
      (await db.application.findFirst({
        where: { applicantId: sampleApplicant!.id, jobId: job.id },
        orderBy: { dateApplied: "desc" },
      }));
    if (existing) {
      await db.application.update({ where: { id: existing.id }, data: { status } });
      return;
    }
    const app = await db.application.create({
      data: { applicantId: sampleApplicant!.id, jobId: job.id, status, dateApplied: new Date(now - daysAgo * day) },
    });
    // write snapshots from the live profile
    const full = await db.applicant.findUnique({
      where: { id: sampleApplicant!.id },
      include: { educations: true, workExperiences: true, trainings: true, eligibilities: true, awards: true },
    });
    if (full) {
      await db.application.update({
        where: { id: app.id },
        data: {
          snapshotProfile: JSON.stringify({
            id: full.id, firstName: full.firstName, lastName: full.lastName, emailAddress: full.emailAddress,
            contactNumber: full.mobileNumber, gender: full.gender, civilStatus: full.civilStatus,
            citizenship: full.citizenship, birthDate: full.birthDate, presentAddress: full.presentAddress,
            city: full.city, province: full.province, country: full.country,
            characterReference: JSON.parse(full.characterReference || "null"),
          }),
          snapshotEducations: JSON.stringify(full.educations),
          snapshotExperiences: JSON.stringify(full.workExperiences),
          snapshotTrainings: JSON.stringify(full.trainings),
          snapshotEligibilities: JSON.stringify(full.eligibilities),
          snapshotAwards: JSON.stringify(full.awards),
        },
      });
    }
  }

  await ensureApplication(srs, "Under Review", 6);
  await ensureApplication(srs1, "Shortlisted", 4);

  // (deduped by description so re-running the seed never double-posts)
  for (const [d, daysAgo] of [
    ["Your application for Supervising Science Research Specialist is now Under Review.", 5],
    ["You have been shortlisted for Science Research Specialist I. A notice has been sent to your email.", 3],
  ] as const) {
    const exists = await db.notification.findFirst({ where: { applicantId: sampleApplicant.id, description: d } });
    if (!exists)
      await db.notification.create({ data: { applicantId: sampleApplicant.id, name: "Application update", description: d, createdAt: new Date(now - daysAgo * day) } });
  }
  // ══════════════════════════════════════════════════════════════════════════
  // Task 14 — FULL-FLOW DEMO DATASET
  // Every pipeline stage, every role's screens, every MOM surface gets data:
  //   Applicants   — complete profiles (education/experience/training/
  //                  eligibility/awards/character refs/PDF documents)
  //   Applications — Applied · Under Review · Shortlisted · Rejected ·
  //                  Withdrawn · a rejected→re-applied pair (MOM re-application)
  //   Notices      — email + SMS ledger rows built from the REAL templates
  //                  (regret letters, shortlist notices, interview + skills-exam
  //                  invitations incl. an Online-mode one with a meeting link)
  //   Bulk cohort  — 2 shortlisted on SRS I and 2 on Supervising (bulk invitations)
  //   Prior-reject — a ×2 previously-rejected row for the evaluator queue
  //   Admin        — audit trail, contact requests, users to manage
  // All helpers are idempotent: re-running the seed normalizes statuses and
  // never duplicates rows, profiles or files.
  // ══════════════════════════════════════════════════════════════════════════

  const isActiveStatus = (s: string) => !["REJECTED", "DECLINED", "WITHDRAWN"].includes((s || "").toUpperCase());
  const isRejStatus = (s: string) => ["REJECTED", "DECLINED"].includes((s || "").toUpperCase());
  const jobAdminFind = () => jobs.find((j) => j.title === "Administrative Assistant I");
  const jobElecFind = () => jobs.find((j) => j.title.includes("Electronics"));

  // ── minimal but VALID one-page PDF generator (document previews render) ──
  function makePdf(title: string, lines: string[]): Buffer {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    let stream = `BT /F1 16 Tf 72 740 Td 22 TL (${esc(title)}) Tj T*\n`;
    for (const l of lines) stream += `(${esc(l)}) Tj T*\n`;
    stream += "ET";
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
  }

  // ── idempotent writers ────────────────────────────────────────────────────
  async function writeSnapshots(appId: number, applicantId: number) {
    const full = await db.applicant.findUnique({
      where: { id: applicantId },
      include: { educations: true, workExperiences: true, trainings: true, eligibilities: true, awards: true },
    });
    if (!full) return;
    await db.application.update({
      where: { id: appId },
      data: {
        snapshotProfile: JSON.stringify({
          id: full.id, firstName: full.firstName, middleName: full.middleName, lastName: full.lastName,
          emailAddress: full.emailAddress, contactNumber: full.mobileNumber, gender: full.gender,
          civilStatus: full.civilStatus, citizenship: full.citizenship, birthDate: full.birthDate,
          birthPlace: full.birthPlace, presentAddress: full.presentAddress, city: full.city,
          province: full.province, country: full.country,
          characterReference: JSON.parse(full.characterReference || "null"),
        }),
        snapshotEducations: JSON.stringify(full.educations),
        snapshotExperiences: JSON.stringify(full.workExperiences),
        snapshotTrainings: JSON.stringify(full.trainings),
        snapshotEligibilities: JSON.stringify(full.eligibilities),
        snapshotAwards: JSON.stringify(full.awards),
      },
    });
  }

  type DemoProfile = {
    username?: string; // absent → walk-in record without a login
    email: string; firstName: string; middleName?: string; lastName: string;
    gender: string; civilStatus: string; birthDate: string; birthPlace: string;
    street: string; city: string; province: string; zipCode: string; mobile: string;
    refs: { name: string; title: string; company: string; companyAddress: string; email: string; contact: string }[];
    educations: { educationLevel: string; course?: string; schoolName: string; yearFrom: string; yearTo?: string; yearGraduated?: string; ongoing?: boolean }[];
    experiences: { positionTitle: string; employerName: string; dateFrom: string; dateTo?: string; isPresentWork?: boolean; isGovtService?: boolean; statusOfEmployment: string; monthlySalary: number; yearDecimal: number }[];
    trainings: { title: string; typeOfTraining: string; numberHours: number; dateFrom: string; dateTo: string }[];
    eligibilities: { title: string; rating?: string; examDate?: string; examPlace?: string }[];
    awards?: { recognitionType: string; scope: string; details: string; provider: string; dateGranted: string }[];
    submittedDaysAgo: number | null; // null → incomplete profile (apply gate demo)
  };

  async function ensureDemoApplicant(p: DemoProfile): Promise<number> {
    let userId: string | null = null;
    if (p.username) {
      const user = await db.user.upsert({
        where: { username: p.username },
        update: { password: hash, role: "APPLICANT", blocked: false },
        create: { username: p.username, email: p.email, password: hash, firstName: p.firstName, lastName: p.lastName, role: "APPLICANT" },
      });
      userId = user.id;
    }
    const applicant =
      (userId ? await db.applicant.findUnique({ where: { userId } }) : null) ??
      (await db.applicant.findFirst({ where: { emailAddress: p.email, userId: null } }));
    let row = applicant;
    if (!row) {
      row = await db.applicant.create({
        data: {
          userId, firstName: p.firstName, middleName: p.middleName, lastName: p.lastName,
          emailAddress: p.email, mobileNumber: p.mobile, contactNumber: p.mobile,
          gender: p.gender, civilStatus: p.civilStatus, citizenship: "Filipino",
          birthDate: p.birthDate, birthPlace: p.birthPlace,
          presentAddress: p.street, street: p.street, city: p.city, province: p.province,
          country: "Philippines", zipCode: p.zipCode,
          isProfileComplete: p.submittedDaysAgo != null,
          submittedDate: p.submittedDaysAgo != null ? new Date(now - p.submittedDaysAgo * day) : null,
        },
      });
    }
    if (!row.characterReference && p.refs.length)
      row = await db.applicant.update({ where: { id: row.id }, data: { characterReference: JSON.stringify(p.refs) } });
    // Purge noise rows (no level AND no course/degree/specify) — they can
    // never satisfy an MQR education clause but would block section seeding.
    await db.education.deleteMany({
      where: { applicantId: row.id, AND: [{ educationLevel: null }, { course: null }, { degree: null }, { specifyOthers: null }] },
    });
    // Section fill is idempotent — but a half-empty row (e.g. a leftover
    // all-null entry from manual testing) must NOT block proper seeding, so
    // the counts look for rows with meaningful content only.
    if ((await db.education.count({ where: { applicantId: row.id, OR: [{ educationLevel: { not: null } }, { course: { not: null } }, { degree: { not: null } }, { specifyOthers: { not: null } }] } })) === 0 && p.educations.length)
      await db.education.createMany({ data: p.educations.map((e, i) => ({ applicantId: row!.id, ...e, ord: i + 1 })) });
    if ((await db.workExperience.count({ where: { applicantId: row.id, positionTitle: { not: null } } })) === 0 && p.experiences.length)
      await db.workExperience.createMany({
        data: p.experiences.map((e, i) => ({
          applicantId: row!.id, positionTitle: e.positionTitle, employerName: e.employerName,
          dateFrom: new Date(e.dateFrom), dateTo: e.dateTo ? new Date(e.dateTo) : null,
          isPresentWork: !!e.isPresentWork, isGovtService: !!e.isGovtService,
          statusOfEmployment: e.statusOfEmployment, monthlySalary: e.monthlySalary,
          yearDecimal: e.yearDecimal, ord: i + 1,
        })),
      });
    if ((await db.training.count({ where: { applicantId: row.id, title: { not: null } } })) === 0 && p.trainings.length)
      await db.training.createMany({
        data: p.trainings.map((t, i) => ({
          applicantId: row!.id, title: t.title, typeOfTraining: t.typeOfTraining,
          numberHours: t.numberHours, dateFrom: new Date(t.dateFrom), dateTo: new Date(t.dateTo), ord: i + 1,
        })),
      });
    if ((await db.eligibility.count({ where: { applicantId: row.id } })) === 0 && p.eligibilities.length)
      await db.eligibility.createMany({ data: p.eligibilities.map((e, i) => ({ applicantId: row!.id, ...e, ord: i + 1 })) });
    if ((await db.award.count({ where: { applicantId: row.id } })) === 0 && p.awards?.length)
      await db.award.createMany({ data: p.awards.map((a, i) => ({ applicantId: row!.id, ...a, ord: i + 1 })) });
    return row.id;
  }

  async function ensureDemoApplication(applicantId: number, job: (typeof jobs)[number] | undefined, status: string, daysAgo: number, reason?: string | null) {
    if (!job) return null;
    const rows = await db.application.findMany({ where: { applicantId, jobId: job.id }, orderBy: { dateApplied: "desc" } });
    let row = rows.find((r) => isActiveStatus(r.status)) ?? rows[0] ?? null;
    if (row) {
      if (row.status !== status || (reason ?? null) !== row.reason)
        await db.application.update({ where: { id: row.id }, data: { status, reason: reason ?? null } });
    } else {
      row = await db.application.create({
        data: { applicantId, jobId: job.id, status, reason: reason ?? null, dateApplied: new Date(now - daysAgo * day) },
      });
      await writeSnapshots(row.id, applicantId);
    }
    return row;
  }

  /** The MOM re-application pair: one REJECTED row + one active re-apply row
   *  on the same posting (drives the queue chip, workspace banner, Re-apply). */
  async function ensureReapplyPair(applicantId: number, job: (typeof jobs)[number] | undefined, rejectedDaysAgo: number, reason: string, reappliedDaysAgo: number) {
    if (!job) return;
    const rows = await db.application.findMany({ where: { applicantId, jobId: job.id }, orderBy: { dateApplied: "asc" } });
    let rejected = rows.find((r) => isRejStatus(r.status)) ?? null;
    if (!rejected) {
      rejected = await db.application.create({
        data: { applicantId, jobId: job.id, status: "Rejected", reason, dateApplied: new Date(now - rejectedDaysAgo * day) },
      });
      await writeSnapshots(rejected.id, applicantId);
    } else if (rejected.status !== "Rejected" || rejected.reason !== reason) {
      await db.application.update({ where: { id: rejected.id }, data: { status: "Rejected", reason } });
    }
    const active = rows.find((r) => isActiveStatus(r.status)) ?? null;
    if (!active) {
      const fresh = await db.application.create({
        data: { applicantId, jobId: job.id, status: "Applied", dateApplied: new Date(now - reappliedDaysAgo * day) },
      });
      await writeSnapshots(fresh.id, applicantId);
    } else if (active.status !== "Applied") {
      await db.application.update({ where: { id: active.id }, data: { status: "Applied", reason: null } });
    }
  }

  async function ensureEmail(to: string, payload: { subject: string; bodyText: string; bodyHtml?: string }, relatedId: number, daysAgo: number) {
    const exists = await db.emailLog.findFirst({ where: { to, subject: payload.subject, relatedType: "application", relatedId } });
    if (exists) return;
    await db.emailLog.create({
      data: { to, subject: payload.subject, bodyText: payload.bodyText, bodyHtml: payload.bodyHtml, provider: "mock", status: "mock", relatedType: "application", relatedId, createdAt: new Date(now - daysAgo * day) },
    });
  }

  async function ensureSms(to: string, message: string, relatedId: number, daysAgo: number) {
    const exists = await db.smsLog.findFirst({ where: { to, message, relatedType: "application", relatedId } });
    if (exists) return;
    await db.smsLog.create({ data: { to, message, provider: "mock", status: "mock", relatedType: "application", relatedId, createdAt: new Date(now - daysAgo * day) } });
  }

  async function ensureNotification(applicantId: number, name: string, description: string, daysAgo: number) {
    const exists = await db.notification.findFirst({ where: { applicantId, description } });
    if (exists) return;
    await db.notification.create({ data: { applicantId, name, description, createdAt: new Date(now - daysAgo * day) } });
  }

  async function ensureDocument(applicantId: number, originalName: string, category: string, status: string, daysAgo: number, qualityScore?: number) {
    const exists = await db.document.findFirst({ where: { applicantId, originalName } });
    if (exists) return;
    const dir = path.join(process.cwd(), "upload", String(applicantId));
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${crypto.randomUUID()}.pdf`;
    const buf = makePdf(originalName.replace(/\.pdf$/i, "").replace(/_/g, " "), [
      "Metals Industry Research and Development Center",
      "DOST Compound, Gen. Santos Ave., Bicutan, Taguig City",
      "",
      "This is a seeded demo document generated by prisma/seed.ts",
      `for applicant #${applicantId} (${originalName}).`,
      "",
      `Generated on ${new Date().toISOString().slice(0, 10)}. Safe to delete.`,
    ]);
    fs.writeFileSync(path.join(dir, fileName), buf);
    await db.document.create({
      data: {
        applicantId, fileName, originalName, mimeType: "application/pdf", size: buf.byteLength,
        filePath: `upload/${applicantId}/${fileName}`, category, status,
        qualityScore: qualityScore ?? null,
        extractedAt: status === "EXTRACTED" ? new Date(now - (daysAgo - 0.2) * day) : null,
        createdAt: new Date(now - daysAgo * day),
      },
    });
  }

  async function ensureAudit(daysAgo: number, entry: { userId?: string | null; userLabel?: string | null; userRole?: string | null; action: string; entityType?: string; entityId?: string | number | null; description: string }) {
    const exists = await db.auditLog.findFirst({ where: { action: entry.action, description: entry.description } });
    if (exists) return;
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null, userLabel: entry.userLabel ?? null, userRole: entry.userRole ?? null,
        action: entry.action, entityType: entry.entityType ?? null,
        entityId: entry.entityId != null ? String(entry.entityId) : null,
        description: entry.description, timestamp: new Date(now - daysAgo * day),
      },
    });
  }

  async function ensureContactRequest(name: string, email: string, subject: string, message: string, status: "OPEN" | "RESOLVED", daysAgo: number, resolvedDaysAgo?: number) {
    const exists = await db.contactRequest.findFirst({ where: { email, subject } });
    if (exists) return;
    await db.contactRequest.create({
      data: {
        name, email, subject, message, status,
        handledById: status === "RESOLVED" ? users["ADMIN"] : null,
        createdAt: new Date(now - daysAgo * day),
        resolvedAt: status === "RESOLVED" ? new Date(now - (resolvedDaysAgo ?? daysAgo) * day) : null,
      },
    });
  }

  // ── profiles ──────────────────────────────────────────────────────────────
  const emailOf = (u: string) => `${u}@example.com`;

  // testapplicant — COMPLETE profile, zero applications: sign in and apply live
  await ensureDemoApplicant({
    username: "testapplicant", email: "testapplicant@mirdc.gov.ph",
    firstName: "Test", middleName: "Demo", lastName: "Applicant",
    gender: "Male", civilStatus: "Single", birthDate: "1998-02-20", birthPlace: "Makati City",
    street: "24 Kalayaan Ave., Barangay Diliman", city: "Quezon City", province: "Metro Manila", zipCode: "1101",
    mobile: "09171234567",
    refs: [
      { name: "Engr. Ana Cruz", title: "Supervisor", company: "TechServe Solutions Inc.", companyAddress: "Taguig City", email: "ana.cruz@example.com", contact: "09171112233" },
    ],
    educations: [
      { educationLevel: "College", course: "BS Information Technology", schoolName: "Polytechnic University of the Philippines", yearFrom: "2016", yearTo: "2020", yearGraduated: "2020" },
      { educationLevel: "Secondary", schoolName: "Rizal High School", yearFrom: "2012", yearTo: "2016", yearGraduated: "2016" },
    ],
    experiences: [
      { positionTitle: "IT Support Specialist", employerName: "TechServe Solutions Inc.", dateFrom: "2021-07-01", isPresentWork: true, statusOfEmployment: "Regular", monthlySalary: 26000, yearDecimal: 3.2 },
    ],
    trainings: [
      { title: "Computer Systems Servicing NC II", typeOfTraining: "Technical", numberHours: 96, dateFrom: "2020-11-10", dateTo: "2020-12-05" },
    ],
    eligibilities: [
      { title: "Career Service Professional (Second Level)", rating: "84.10", examDate: "2021-03-14", examPlace: "Quezon City" },
      { title: "Career Service Sub-Professional (First Level)", rating: "81.75", examDate: "2019-08-11", examPlace: "Quezon City" },
    ],
    submittedDaysAgo: 30,
  });
  await ensureDocument(1, "Certificate_of_Employment.pdf", "SUPPORTING", "UPLOADED", 20);

  // carlo.reyes — Applied (fresh) + a Withdrawn history row
  const carloId = await ensureDemoApplicant({
    username: "carlo.reyes", email: emailOf("carlo.reyes"),
    firstName: "Carlo", middleName: "Mendoza", lastName: "Reyes",
    gender: "Male", civilStatus: "Married", birthDate: "1993-11-08", birthPlace: "Pasig City",
    street: "8 M. Sanchez St., Barangay Sagad", city: "Pasig City", province: "Metro Manila", zipCode: "1600",
    mobile: "09175551001",
    refs: [{ name: "Arch. Leo Tan", title: "Project Lead", company: "BuildRight Engineering", companyAddress: "Pasig City", email: "leo.tan@example.com", contact: "09175551999" }],
    educations: [
      { educationLevel: "College", course: "BS Mechanical Engineering", schoolName: "University of Santo Tomas", yearFrom: "2011", yearTo: "2016", yearGraduated: "2016" },
    ],
    experiences: [
      { positionTitle: "CAD Technician", employerName: "BuildRight Engineering", dateFrom: "2018-01-15", isPresentWork: true, statusOfEmployment: "Regular", monthlySalary: 30000, yearDecimal: 5.6 },
    ],
    trainings: [{ title: "AutoCAD 2D and 3D Drafting", typeOfTraining: "Technical", numberHours: 40, dateFrom: "2019-05-20", dateTo: "2019-05-25" }],
    eligibilities: [{ title: "Career Service Professional (Second Level)", rating: "85.20", examDate: "2017-10-15", examPlace: "Manila" }],
    submittedDaysAgo: 12,
  });
  const carloApplied = await ensureDemoApplication(carloId, srs1, "Applied", 2);
  const carloWithdrawn = await ensureDemoApplication(carloId, jobAdminFind(), "Withdrawn", 9, "Accepted a position in another agency.");

  // ana.lim — Under Review on the closed COS posting + Withdrawn on Supervising
  const anaId = await ensureDemoApplicant({
    username: "ana.lim", email: emailOf("ana.lim"),
    firstName: "Ana", middleName: "Flores", lastName: "Lim",
    gender: "Female", civilStatus: "Single", birthDate: "1997-06-30", birthPlace: "Manila",
    street: "15 Quirino Ave., Barangay Malate", city: "Manila", province: "Metro Manila", zipCode: "1004",
    mobile: "09175551002",
    refs: [{ name: "Dr. Rosa Villar", title: "Lab Manager", company: "Manila Analytical Services", companyAddress: "Manila", email: "rosa.villar@example.com", contact: "09175551888" }],
    educations: [
      { educationLevel: "College", course: "BS Chemistry", schoolName: "University of the Philippines Manila", yearFrom: "2015", yearTo: "2019", yearGraduated: "2019" },
    ],
    experiences: [
      { positionTitle: "Laboratory Analyst", employerName: "Manila Analytical Services", dateFrom: "2019-09-01", isPresentWork: true, statusOfEmployment: "Regular", monthlySalary: 32000, yearDecimal: 5.0 },
    ],
    trainings: [{ title: "Good Laboratory Practice (GLP)", typeOfTraining: "Technical", numberHours: 24, dateFrom: "2022-02-14", dateTo: "2022-02-16" }],
    eligibilities: [{ title: "Career Service Professional (Second Level)", rating: "88.05", examDate: "2019-08-11", examPlace: "Manila" }],
    awards: [{ recognitionType: "Award", scope: "Individual", details: "Best Technical Paper — Analytical Chemistry Symposium", provider: "Kapisanang Kimika ng Pilipinas", dateGranted: "2023-05-18" }],
    submittedDaysAgo: 20,
  });
  const anaReview = await ensureDemoApplication(anaId, jobElecFind(), "Under Review", 12);
  const anaWithdrawn = await ensureDemoApplication(anaId, srs, "Withdrawn", 15, "Pursued further studies.");

  // james.mendoza — Rejected on SRS I + ×2 prior rejection pair on Electronics
  const jamesId = await ensureDemoApplicant({
    username: "james.mendoza", email: emailOf("james.mendoza"),
    firstName: "James", middleName: "Aquino", lastName: "Mendoza",
    gender: "Male", civilStatus: "Single", birthDate: "1995-09-12", birthPlace: "Caloocan City",
    street: "3 P. Zamora St., Barangay 12", city: "Caloocan City", province: "Metro Manila", zipCode: "1400",
    mobile: "09175551003",
    refs: [{ name: "Engr. Gil Santos", title: "Chief Technician", company: "Voltas Electronics", companyAddress: "Caloocan City", email: "gil.santos@example.com", contact: "09175551777" }],
    educations: [
      { educationLevel: "College", course: "BS Electrical Engineering", schoolName: "Far Eastern University", yearFrom: "2013", yearTo: "2018", yearGraduated: "2018" },
    ],
    experiences: [
      { positionTitle: "Electronics Technician", employerName: "Voltas Electronics", dateFrom: "2022-03-01", isPresentWork: true, statusOfEmployment: "Contractual", monthlySalary: 24000, yearDecimal: 3.4 },
    ],
    trainings: [{ title: "Mechatronics Servicing NC II", typeOfTraining: "Technical", numberHours: 72, dateFrom: "2021-01-11", dateTo: "2021-02-08" }],
    eligibilities: [{ title: "Career Service Professional (Second Level)", rating: "82.90", examDate: "2019-03-17", examPlace: "Caloocan City" }],
    submittedDaysAgo: 45,
  });
  const jamesRejectedSrs = await ensureDemoApplication(jamesId, srs1, "Rejected", 10, "Did not meet the qualification standards after initial document screening.");
  const jamesElecApplied = await ensureDemoApplication(jamesId, jobElecFind(), "Applied", 18);
  // Two HISTORICAL rejection cycles on Electronics (earlier repostings) — the
  // evaluator queue must show "Previously rejected ×2" on his active row.
  const jamesHistorical = [
    { reason: "Incomplete supporting documents submitted.", daysAgo: 40 },
    { reason: "Did not attend the scheduled interview.", daysAgo: 20 },
  ];
  for (const h of jamesHistorical) {
    const existing = await db.application.findFirst({
      where: { applicantId: jamesId, jobId: jobElecFind()!.id, status: "Rejected", reason: h.reason },
    });
    if (existing) continue;
    const created = await db.application.create({
      data: { applicantId: jamesId, jobId: jobElecFind()!.id, status: "Rejected", reason: h.reason, dateApplied: new Date(now - h.daysAgo * day) },
    });
    await writeSnapshots(created.id, jamesId);
  }

  // grace.villanueva — Shortlisted on Supervising (exam sent) + SRS I (bulk pair)
  const graceId = await ensureDemoApplicant({
    username: "grace.villanueva", email: emailOf("grace.villanueva"),
    firstName: "Grace", middleName: "Navarro", lastName: "Villanueva",
    gender: "Female", civilStatus: "Married", birthDate: "1992-01-25", birthPlace: "Taguig City",
    street: "22 Brgy. Ususan, Herminia St.", city: "Taguig City", province: "Metro Manila", zipCode: "1630",
    mobile: "09175551004",
    refs: [
      { name: "Dr. Mila Ramos", title: "Division Chief", company: "DOST-ITDI", companyAddress: "Taguig City", email: "mila.ramos@example.com", contact: "09175551666" },
      { name: "Mr. Rey Lopez", title: "Senior Chemist", company: "PetroLab Inc.", companyAddress: "Batangas City", email: "rey.lopez@example.com", contact: "09175551655" },
    ],
    educations: [
      { educationLevel: "Graduate Studies", course: "MS Chemistry", schoolName: "University of the Philippines Diliman", yearFrom: "2018", yearTo: "2021", yearGraduated: "2021" },
      { educationLevel: "College", course: "BS Chemistry", schoolName: "University of Santo Tomas", yearFrom: "2010", yearTo: "2014", yearGraduated: "2014" },
    ],
    experiences: [
      { positionTitle: "Senior Laboratory Analyst", employerName: "PetroLab Inc.", dateFrom: "2019-02-01", isPresentWork: true, statusOfEmployment: "Regular", monthlySalary: 52000, yearDecimal: 6.5 },
    ],
    trainings: [
      { title: "ISO/IEC 17025 Lead Assessor Course", typeOfTraining: "Technical", numberHours: 40, dateFrom: "2022-08-15", dateTo: "2022-08-19" },
      { title: "Instrumental Methods of Analysis", typeOfTraining: "Technical", numberHours: 16, dateFrom: "2021-04-05", dateTo: "2021-04-06" },
    ],
    eligibilities: [{ title: "Career Service Professional (Second Level)", rating: "89.60", examDate: "2015-10-18", examPlace: "Taguig City" }],
    awards: [{ recognitionType: "Award", scope: "Individual", details: "Outstanding Young Chemist Award", provider: "Philippine Federation of Chemistry Societies", dateGranted: "2022-04-21" }],
    submittedDaysAgo: 14,
  });
  const graceSupervised = await ensureDemoApplication(graceId, srs, "Shortlisted", 7);
  const graceSrs = await ensureDemoApplication(graceId, srs1, "Shortlisted", 3);
  await ensureDocument(graceId, "PDS_Grace_Villanueva.pdf", "PDS", "UPLOADED", 10);
  await ensureDocument(graceId, "Transcript_of_Records.pdf", "EDUCATION", "UPLOADED", 10);

  // paolo.garcia — Shortlisted on Supervising (ONLINE interview invite sent)
  const paoloId = await ensureDemoApplicant({
    username: "paolo.garcia", email: emailOf("paolo.garcia"),
    firstName: "Paolo", middleName: "Dela Cruz", lastName: "Garcia",
    gender: "Male", civilStatus: "Single", birthDate: "1994-04-02", birthPlace: "Mandaluyong City",
    street: "10 Boni Ave., Barangay Hulo", city: "Mandaluyong City", province: "Metro Manila", zipCode: "1550",
    mobile: "09175551005",
    refs: [{ name: "Ms. Irene Pascual", title: "HR Manager", company: "Systems Plus Inc.", companyAddress: "Mandaluyong City", email: "irene.pascual@example.com", contact: "09175551444" }],
    educations: [
      { educationLevel: "College", course: "BS Information Technology", schoolName: "Mapua University", yearFrom: "2012", yearTo: "2017", yearGraduated: "2017" },
    ],
    experiences: [
      { positionTitle: "Research IT Assistant", employerName: "DOST-ASTI", dateFrom: "2020-06-01", dateTo: "2023-05-31", isGovtService: true, statusOfEmployment: "Contract of Service", monthlySalary: 35000, yearDecimal: 2.9 },
    ],
    trainings: [{ title: "Data Analytics Fundamentals", typeOfTraining: "Technical", numberHours: 30, dateFrom: "2023-01-09", dateTo: "2023-01-13" }],
    eligibilities: [{ title: "Career Service Professional (Second Level)", rating: "86.15", examDate: "2018-08-12", examPlace: "Mandaluyong City" }],
    submittedDaysAgo: 16,
  });
  const paoloSupervised = await ensureDemoApplication(paoloId, srs, "Shortlisted", 6);
  await ensureDocument(paoloId, "PDS_Paolo_Garcia.pdf", "PDS", "UPLOADED", 12);

  // liza.fernandez — INCOMPLETE profile: the apply-gate / completion demo
  await ensureDemoApplicant({
    username: "liza.fernandez", email: emailOf("liza.fernandez"),
    firstName: "Liza", lastName: "Fernandez",
    gender: "Female", civilStatus: "Single", birthDate: "1999-12-05", birthPlace: "Marikina City",
    street: "5 Chorillo St., Barangay Malanday", city: "Marikina City", province: "Metro Manila", zipCode: "1800",
    mobile: "09175551006",
    refs: [], educations: [], experiences: [], trainings: [], eligibilities: [],
    submittedDaysAgo: null,
  });

  // roberto.dizon — walk-in record WITHOUT a login (admin applicants list demo)
  const robertoId = await ensureDemoApplicant({
    email: "roberto.dizon@example.com",
    firstName: "Roberto", middleName: "Salazar", lastName: "Dizon",
    gender: "Male", civilStatus: "Widowed", birthDate: "1985-07-19", birthPlace: "Manila",
    street: "31 Goduco St., Barangay Tondo", city: "Manila", province: "Metro Manila", zipCode: "1012",
    mobile: "09175551007",
    refs: [{ name: "Ms. Cita Bautista", title: "Bookkeeping Supervisor", company: "Dizon Enterprises", companyAddress: "Manila", email: "cita.bautista@example.com", contact: "09175551333" }],
    educations: [
      { educationLevel: "Vocational / Trade", course: "Bookkeeping NC III", schoolName: "TESDA Women's Center", yearFrom: "2008", yearTo: "2009", yearGraduated: "2009" },
    ],
    experiences: [
      { positionTitle: "Bookkeeping Clerk", employerName: "Dizon Enterprises", dateFrom: "2015-01-05", isPresentWork: true, statusOfEmployment: "Regular", monthlySalary: 21000, yearDecimal: 10.4 },
    ],
    trainings: [{ title: "Basic Business Accounting", typeOfTraining: "Non-Technical", numberHours: 16, dateFrom: "2018-03-12", dateTo: "2018-03-13" }],
    eligibilities: [{ title: "Career Service Sub-Professional (First Level)", rating: "80.40", examDate: "2014-04-06", examPlace: "Manila" }],
    submittedDaysAgo: 8,
  });
  const robertoApplied = await ensureDemoApplication(robertoId, jobAdminFind(), "Applied", 1);
  await ensureDocument(robertoId, "PDS_Roberto_Dizon.pdf", "PDS", "UPLOADED", 6);

  // maria.santos — complete the MOM story on Administrative Assistant I:
  // #3 Rejected (with regret letter) then #4 re-applied (active, Applied).
  await ensureReapplyPair(sampleApplicant.id, jobAdminFind(), 8, "Does not meet the eligibility requirement for this posting.", 2);
  await ensureDocument(sampleApplicant.id, "PDS_Maria_Santos.pdf", "PDS", "EXTRACTED", 9, 92);
  await ensureDocument(sampleApplicant.id, "Diploma_BS_Chemistry.pdf", "EDUCATION", "UPLOADED", 9);
  await ensureDocument(sampleApplicant.id, "Certificates_and_Awards.pdf", "SUPPORTING", "UPLOADED", 8);

  // ── notification ledger (applicant in-app feed) ───────────────────────────
  const appEmail = (a: number) => db.applicant.findUnique({ where: { id: a } }).then((r) => r?.emailAddress ?? "");
  const mariaEmail = await appEmail(sampleApplicant.id);
  const carloEmail = await appEmail(carloId);
  const anaEmail = await appEmail(anaId);
  const jamesEmail = await appEmail(jamesId);
  const graceEmail = await appEmail(graceId);
  const paoloEmail = await appEmail(paoloId);
  const robertoEmail = await appEmail(robertoId);

  // Shared notice payloads (same details = the seeded bulk-invitation pair)
  const interviewDetails: NoticeDetails = {
    date: "October 21, 2026", time: "9:00 AM", mode: "face_to_face",
    venue: "Conference Room A, MIRDC Administrative Building",
    contact: "Ms. Rivera — 8837-0431 loc. 440",
    notes: "Please bring an original copy of your transcript of records and eligibility. Allow 30 minutes for the panel interview; business attire is requested.",
  };
  const examDetails: NoticeDetails = {
    date: "October 23, 2026", time: "9:00 AM", mode: "face_to_face",
    venue: "Testing Room 2, Materials and Corrosion Laboratory",
    contact: "Mr. Dizon — 8837-0431 loc. 441",
    examType: "Materials Science and Corrosion Fundamentals",
    notes: "Bring a valid government-issued ID and a pen. The examination runs approximately 90 minutes.",
  };
  const onlineInterview: NoticeDetails = {
    date: "October 20, 2026", time: "2:00 PM", mode: "online",
    meetingLink: "https://meet.google.com/mirdc-interview-2026",
    contact: "Ms. Rivera — 8837-0431 loc. 440",
    notes: "Join the meeting room 10 minutes early. A stable internet connection and a working camera are required.",
  };

  const jobTitleOf = (j: (typeof jobs)[number] | null | undefined) => j?.title ?? "the position";
  const nameOf = async (a: number) => {
    const r = await db.applicant.findUnique({ where: { id: a } });
    return r ? `${r.firstName} ${r.lastName}` : "Applicant";
  };

  // Application received — Carlo (SRS I), Roberto (Admin Asst I), James (Electronics), Maria #4 (re-apply)
  if (carloApplied) {
    await ensureEmail(carloEmail, emailApplicationReceived(await nameOf(carloId), jobTitleOf(srs1)), carloApplied.id, 2);
    await ensureSms(carloEmail, smsApplicationReceived(jobTitleOf(srs1)), carloApplied.id, 2);
    await ensureNotification(carloId, "Application received", `Your application for ${jobTitleOf(srs1)} was received and is awaiting evaluation.`, 2);
  }
  if (robertoApplied) {
    await ensureEmail(robertoEmail, emailApplicationReceived(await nameOf(robertoId), jobTitleOf(jobAdminFind())), robertoApplied.id, 1);
    await ensureSms(robertoEmail, smsApplicationReceived(jobTitleOf(jobAdminFind())), robertoApplied.id, 1);
  }
  if (jamesElecApplied) {
    await ensureEmail(jamesEmail, emailApplicationReceived(await nameOf(jamesId), jobTitleOf(jobElecFind())), jamesElecApplied.id, 18);
    await ensureNotification(jamesId, "Application received", `Your application for ${jobTitleOf(jobElecFind())} was received.`, 18);
  }

  // Under Review — Maria #1, Ana (Electronics)
  if (carloWithdrawn) {
    await ensureNotification(carloId, "Application withdrawn", `Your application for ${jobTitleOf(jobAdminFind())} has been withdrawn at your request.`, 9);
  }
  {
    const mariaSrsApp = await db.application.findFirst({ where: { applicantId: sampleApplicant.id, jobId: srs?.id ?? 0, status: "Under Review" } });
    if (mariaSrsApp) {
      await ensureEmail(mariaEmail, emailUnderReview(await nameOf(sampleApplicant.id), jobTitleOf(srs)), mariaSrsApp.id, 5);
      await ensureNotification(sampleApplicant.id, "Application update", `Your application for ${jobTitleOf(srs)} is now Under Review.`, 5);
    }
  }
  if (anaReview) {
    await ensureEmail(anaEmail, emailUnderReview(await nameOf(anaId), jobTitleOf(jobElecFind())), anaReview.id, 11);
    await ensureNotification(anaId, "Application update", `Your application for ${jobTitleOf(jobElecFind())} is now Under Review.`, 11);
  }
  if (anaWithdrawn) await ensureNotification(anaId, "Application withdrawn", `Your application for ${jobTitleOf(srs)} has been withdrawn at your request.`, 15);

  // Shortlisted + notices — Maria #2 & Grace (SRS I bulk pair), Grace & Paolo (Supervising)
  const mariaSrs1 = await db.application.findFirst({ where: { applicantId: sampleApplicant.id, jobId: srs1?.id ?? 0, status: "Shortlisted" } });
  if (mariaSrs1) {
    await ensureEmail(mariaEmail, emailShortlisted(await nameOf(sampleApplicant.id), jobTitleOf(srs1)), mariaSrs1.id, 3);
    await ensureSms(mariaEmail, smsStatusChanged("Shortlisted", jobTitleOf(srs1)), mariaSrs1.id, 3);
    await ensureEmail(mariaEmail, emailInterviewInvitation(await nameOf(sampleApplicant.id), jobTitleOf(srs1), interviewDetails), mariaSrs1.id, 2);
    await ensureSms(mariaEmail, smsNotice(`Interview invitation: ${jobTitleOf(srs1)} on ${interviewDetails.date} at ${interviewDetails.time}, ${interviewDetails.venue}.`), mariaSrs1.id, 2);
    await ensureNotification(sampleApplicant.id, "Interview invitation", `Interview invitation sent for ${jobTitleOf(srs1)} — ${interviewDetails.date} at ${interviewDetails.time}.`, 2);
  }
  if (graceSrs) {
    await ensureEmail(graceEmail, emailShortlisted(await nameOf(graceId), jobTitleOf(srs1)), graceSrs.id, 3);
    await ensureSms(graceEmail, smsStatusChanged("Shortlisted", jobTitleOf(srs1)), graceSrs.id, 3);
    await ensureEmail(graceEmail, emailInterviewInvitation(await nameOf(graceId), jobTitleOf(srs1), interviewDetails), graceSrs.id, 2);
    await ensureSms(graceEmail, smsNotice(`Interview invitation: ${jobTitleOf(srs1)} on ${interviewDetails.date} at ${interviewDetails.time}, ${interviewDetails.venue}.`), graceSrs.id, 2);
    await ensureNotification(graceId, "Interview invitation", `Interview invitation sent for ${jobTitleOf(srs1)} — ${interviewDetails.date} at ${interviewDetails.time}.`, 2);
  }
  if (graceSupervised) {
    await ensureEmail(graceEmail, emailShortlisted(await nameOf(graceId), jobTitleOf(srs)), graceSupervised.id, 7);
    await ensureEmail(graceEmail, emailSkillsExam(await nameOf(graceId), jobTitleOf(srs), examDetails), graceSupervised.id, 5);
    await ensureSms(graceEmail, smsNotice(`Skills examination: ${jobTitleOf(srs)} on ${examDetails.date} at ${examDetails.time}, ${examDetails.venue}.`), graceSupervised.id, 5);
    await ensureNotification(graceId, "Examination notice", `Skills examination notice sent for ${jobTitleOf(srs)} — ${examDetails.date} at ${examDetails.time}.`, 5);
  }
  if (paoloSupervised) {
    await ensureEmail(paoloEmail, emailShortlisted(await nameOf(paoloId), jobTitleOf(srs)), paoloSupervised.id, 6);
    await ensureEmail(paoloEmail, emailInterviewInvitation(await nameOf(paoloId), jobTitleOf(srs), onlineInterview), paoloSupervised.id, 4);
    await ensureSms(paoloEmail, smsNotice(`Interview invitation (Online): ${jobTitleOf(srs)} on ${onlineInterview.date} at ${onlineInterview.time}. Meeting link in your email.`), paoloSupervised.id, 4);
    await ensureNotification(paoloId, "Interview invitation", `Online interview invitation sent for ${jobTitleOf(srs)} — ${onlineInterview.date} at ${onlineInterview.time}.`, 4);
  }

  // Regret letters (email only — no SMS for the rejected family, spec §9.3)
  const mariaRejectedApp = await db.application.findFirst({ where: { applicantId: sampleApplicant.id, jobId: jobAdminFind()?.id ?? 0, status: "Rejected" } });
  if (mariaRejectedApp) {
    await ensureEmail(mariaEmail, emailRegretLetter(await nameOf(sampleApplicant.id), jobTitleOf(jobAdminFind())), mariaRejectedApp.id, 8);
    await ensureNotification(sampleApplicant.id, "Application update", `We regret to inform you that you were not shortlisted for ${jobTitleOf(jobAdminFind())}. See your email for the full letter.`, 8);
  }
  if (jamesRejectedSrs) {
    await ensureEmail(jamesEmail, emailRegretLetter(await nameOf(jamesId), jobTitleOf(srs1)), jamesRejectedSrs.id, 10);
    await ensureNotification(jamesId, "Application update", `We regret to inform you that you were not shortlisted for ${jobTitleOf(srs1)}. See your email for the full letter.`, 10);
  }
  // Regret letters for the historical Electronics cycles (idempotent lookups)
  for (const h of jamesHistorical) {
    const rejRow = await db.application.findFirst({
      where: { applicantId: jamesId, jobId: jobElecFind()!.id, status: "Rejected", reason: h.reason },
    });
    if (rejRow) await ensureEmail(jamesEmail, emailRegretLetter(await nameOf(jamesId), jobTitleOf(jobElecFind())), rejRow.id, h.daysAgo);
  }

  // ── audit trail (matches the app's action vocabulary) ─────────────────────
  await ensureAudit(1, { userId: users["ADMIN"], userLabel: "testadmin (testadmin@mirdc.gov.ph)", userRole: "ADMIN", action: "LOGIN_SUCCESS", entityType: "user", entityId: users["ADMIN"], description: "Signed in from 127.0.0.1" });
  await ensureAudit(10, { userId: users["ADMIN"], userLabel: "testadmin (testadmin@mirdc.gov.ph)", userRole: "ADMIN", action: "JOB_POSTING_CREATED", entityType: "job", entityId: srs1?.id ?? null, description: `Published job posting "${jobTitleOf(srs1)}"` });
  await ensureAudit(2, { userId: users["APPLICANT"], userLabel: "carlo.reyes (carlo.reyes@example.com)", userRole: "APPLICANT", action: "APPLICATION_SUBMITTED", entityType: "application", entityId: carloApplied?.id ?? null, description: `Application submitted for ${jobTitleOf(srs1)}` });
  await ensureAudit(1, { userLabel: "roberto.dizon (roberto.dizon@example.com)", userRole: "APPLICANT", action: "APPLICATION_SUBMITTED", entityType: "application", entityId: robertoApplied?.id ?? null, description: `Application submitted for ${jobTitleOf(jobAdminFind())} (walk-in record)` });
  await ensureAudit(8, { userLabel: "maria.santos (maria.santos@example.com)", userRole: "APPLICANT", action: "APPLICATION_SUBMITTED", entityType: "application", entityId: mariaRejectedApp?.id ?? null, description: `Application submitted for ${jobTitleOf(jobAdminFind())}` });
  await ensureAudit(8, { userId: users["EVALUATOR"], userLabel: "testevaluator (testevaluator@mirdc.gov.ph)", userRole: "EVALUATOR", action: "APPLICATION_STATUS_CHANGED", entityType: "application", entityId: mariaRejectedApp?.id ?? null, description: `Application #${mariaRejectedApp?.id ?? "?"} status set to Rejected — ${jobTitleOf(jobAdminFind())}` });
  await ensureAudit(3, { userId: users["EVALUATOR"], userLabel: "testevaluator (testevaluator@mirdc.gov.ph)", userRole: "EVALUATOR", action: "APPLICATION_STATUS_CHANGED", entityType: "application", entityId: mariaSrs1?.id ?? null, description: `Application #${mariaSrs1?.id ?? "?"} status set to Shortlisted — ${jobTitleOf(srs1)}` });
  if (mariaSrs1 && graceSrs) {
    await ensureAudit(2, { userId: users["EVALUATOR"], userLabel: "testevaluator (testevaluator@mirdc.gov.ph)", userRole: "EVALUATOR", action: "NOTICES_BULK_SENT", entityType: "application", entityId: null, description: `Bulk interview invitations sent to 2 shortlisted applicants — ${jobTitleOf(srs1)}` });
  }
  if (graceSupervised) {
    await ensureAudit(5, { userId: users["EVALUATOR"], userLabel: "testevaluator (testevaluator@mirdc.gov.ph)", userRole: "EVALUATOR", action: "NOTICE_SENT", entityType: "application", entityId: graceSupervised.id, description: `Skills examination notice sent — ${jobTitleOf(srs)}` });
  }
  await ensureAudit(9, { userLabel: "maria.santos (maria.santos@example.com)", userRole: "APPLICANT", action: "DOCUMENT_UPLOADED", entityType: "document", entityId: null, description: 'Uploaded SUPPORTING document "Certificates_and_Awards.pdf"' });
  await ensureAudit(30, { userId: users["APPLICANT"], userLabel: "testapplicant (testapplicant@mirdc.gov.ph)", userRole: "APPLICANT", action: "PROFILE_COMPLETED", entityType: "applicant", entityId: 1, description: "Marked profile as complete" });

  // ── contact requests (Settings → Contact Requests) ────────────────────────
  await ensureContactRequest("Juan Dela Cruz", "juan.delacruz@example.com", "Clarification on eligibility requirements", "Good day! I would like to ask whether a Civil Service Professional eligibility obtained in 2015 is still valid for application to the Science Research Specialist I position. Thank you.", "OPEN", 3);
  await ensureContactRequest("Pedro Ramos", "pedro.ramos@example.com", "Cannot upload PDF documents", "Hello, I keep receiving an error whenever I try to upload my Personal Data Sheet in the Supporting Documents section. The file is under 10 MB and in PDF format.", "OPEN", 2);
  await ensureContactRequest("Sofia Reyes", "sofia.reyes@example.com", "Application status inquiry", "Hi, I applied last month and would like to follow up on the status of my application. Thank you very much.", "RESOLVED", 5, 2);

  console.log("Seed complete.");
  console.log("── Full-flow demo dataset (all accounts use password123) ──");
  console.log("STAFF");
  console.log("  testadmin      ADMIN       — dashboard stats, users, email/SMS ledger, audit trail, contact requests");
  console.log("  testevaluator  EVALUATOR   — queue rows in every stage, ×2 prior-rejection row, bulk cohorts (SRS I ×2, Supervising ×2)");
  console.log("APPLICANTS (complete profiles, sign in to test)");
  console.log("  testapplicant  — ZERO applications: run the apply flow from scratch");
  console.log("  maria.santos   — Under Review (Supervising) · Shortlisted + interview notice (SRS I) · Rejected→re-applied (Admin Asst I) · 3 documents");
  console.log("  carlo.reyes    — Applied (SRS I) · Withdrawn (Admin Asst I)");
  console.log("  ana.lim        — Under Review (Electronics, closed posting) · Withdrawn (Supervising)");
  console.log("  james.mendoza  — Rejected (SRS I) · Applied with ×2 prior rejections (Electronics)");
  console.log("  grace.villanueva — Shortlisted ×2 (Supervising + SRS I) · exam + interview notices · 2 documents");
  console.log("  paolo.garcia   — Shortlisted (Supervising) · ONLINE interview notice with meeting link");
  console.log("  liza.fernandez — INCOMPLETE profile: apply gate + completion flow demo");
  console.log("  roberto.dizon  — walk-in record WITHOUT a login (admin applicants list)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
