// ============================================================================
// RMIS — Sandbox cleanup (Task 15): wipe ALL demo/test content and keep ONLY
// the three staff/applicant test accounts (testadmin / testevaluator /
// testapplicant, password123). Removes: job postings + positions,
// applications, notifications, documents (rows AND files on disk), profile
// section entries, email/SMS/audit logs, contact requests, email OTP rows,
// and every User account beyond the three kept ones. Reference vocabularies
// (EligibilityRef / Course / PlaceOfAssignment) are SYSTEM config and stay.
// testapplicant is left with an empty Applicant shell — the same state a
// fresh registration produces — so the account signs in cleanly.
// Run: ALLOW_SANDBOX_RESET=1 bun scripts/cleanup-system.ts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Two-step guard (mirrors the prisma/seed.ts production guard): this script
// wipes ALL recruitment content — it must never run by accident or in a
// production deployment.
if (process.env.ALLOW_SANDBOX_RESET !== "1") {
  console.error(
    "\n✖ Refusing to run: this script deletes ALL jobs, applications, applicant " +
      "profiles, documents, and logs.\n  Re-run with ALLOW_SANDBOX_RESET=1 to confirm."
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("\n✖ Refusing to run in production (NODE_ENV=production).");
  process.exit(1);
}

const db = new PrismaClient();
const KEEP_USERNAMES = ["testadmin", "testevaluator", "testapplicant"];

async function main() {
  console.log("• wiping content tables…");
  const steps: [string, () => Promise<unknown>][] = [
    ["applications", () => db.application.deleteMany({})],
    ["notifications", () => db.notification.deleteMany({})],
    ["documents", () => db.document.deleteMany({})],
    ["educations", () => db.education.deleteMany({})],
    ["workExperiences", () => db.workExperience.deleteMany({})],
    ["trainings", () => db.training.deleteMany({})],
    ["eligibilities", () => db.eligibility.deleteMany({})],
    ["awards", () => db.award.deleteMany({})],
    ["jobPostings", () => db.jobPosting.deleteMany({})],
    ["positions", () => db.position.deleteMany({})],
    ["emailLogs", () => db.emailLog.deleteMany({})],
    ["smsLogs", () => db.smsLog.deleteMany({})],
    ["auditLogs", () => db.auditLog.deleteMany({})],
    ["contactRequests", () => db.contactRequest.deleteMany({})],
    ["emailOtps", () => db.emailOtp.deleteMany({})],
    ["applicant profiles", () => db.applicant.deleteMany({})],
  ];
  for (const [label, run] of steps) {
    const res = (await run()) as { count: number };
    console.log(`  - ${label}: ${res.count} deleted`);
  }

  console.log("• pruning users (keeping testadmin / testevaluator / testapplicant)…");
  const users = await db.user.deleteMany({
    where: { username: { notIn: KEEP_USERNAMES } },
  });
  console.log(`  - users removed: ${users.count}`);

  console.log("• recreating the empty Applicant shell for testapplicant…");
  const ta = await db.user.findUnique({ where: { username: "testapplicant" } });
  if (!ta) throw new Error("testapplicant account missing — aborting");
  const shell = await db.applicant.findUnique({ where: { userId: ta.id } });
  if (!shell) {
    await db.applicant.create({ data: { userId: ta.id } });
    console.log("  - empty shell created (fresh-registration state)");
  } else {
    console.log("  - shell already present");
  }

  console.log("• removing uploaded applicant files (upload/<applicantId>/)…");
  const root = path.join(process.cwd(), "upload");
  let dirs = 0;
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      // ONLY the per-applicant folders (numeric names) — root-level app
      // assets (login background, logos) stay untouched.
      if (fs.statSync(p).isDirectory() && /^\d+$/.test(entry)) {
        fs.rmSync(p, { recursive: true, force: true });
        dirs += 1;
      }
    }
  }
  console.log(`  - applicant file folders removed: ${dirs}`);

  console.log("\nFinal state:");
  const counts = {
    users: await db.user.count(),
    applicants: await db.applicant.count(),
    jobs: await db.jobPosting.count(),
    positions: await db.position.count(),
    applications: await db.application.count(),
    notifications: await db.notification.count(),
    documents: await db.document.count(),
    emailLogs: await db.emailLog.count(),
    smsLogs: await db.smsLog.count(),
    auditLogs: await db.auditLog.count(),
    contactRequests: await db.contactRequest.count(),
  };
  console.table(counts);
  const kept = await db.user.findMany({ select: { username: true, role: true } });
  console.log("Kept accounts:", kept.map((u) => `${u.username} (${u.role})`).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
