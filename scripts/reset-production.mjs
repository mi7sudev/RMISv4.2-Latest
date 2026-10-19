import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databasePath = databaseUrl.startsWith("file:")
  ? path.resolve(databaseUrl.slice(5).split("?")[0])
  : "";
const uploadPath = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : "";

if (
  process.argv[2] !== "--confirm-full-reset" ||
  process.env.CONFIRM_RESET_DATABASE !== databasePath ||
  process.env.CONFIRM_RESET_UPLOADS !== uploadPath ||
  path.basename(databasePath) !== "production-data.db" ||
  !fs.existsSync(databasePath) ||
  !uploadPath ||
  !fs.existsSync(uploadPath)
) {
  console.error(
    "Refusing reset. Pass --confirm-full-reset and set CONFIRM_RESET_DATABASE " +
      "and CONFIRM_RESET_UPLOADS to the exact absolute target paths."
  );
  process.exit(1);
}

const db = new PrismaClient();
const clearOrder = [
  "application",
  "notification",
  "document",
  "education",
  "workExperience",
  "training",
  "eligibility",
  "award",
  "jobPosting",
  "position",
  "emailLog",
  "smsLog",
  "auditLog",
  "contactRequest",
  "emailOtp",
  "applicant",
  "dropdownOption",
  "eligibilityRef",
  "course",
  "placeOfAssignment",
  "user",
];

const eligibilityNames = [
  "None Required",
  "Career Service Sub-Professional (First Level)",
  "Career Service Professional (Second Level)",
  "Honor Graduate (PD 907)",
  "Bar/Board (RA 1080)",
];

const courses = [
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

const places = [
  "Accounting Unit",
  "Human Resource Development Unit",
  "Metrology Laboratory",
  "Materials and Corrosion Laboratory",
];

try {
  const initialPassword = randomBytes(48).toString("base64url");
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  await db.$transaction(
    async (tx) => {
      for (const model of clearOrder) {
        await tx[model].deleteMany({});
      }

      for (let index = 0; index < eligibilityNames.length; index += 1) {
        await tx.eligibilityRef.create({ data: { name: eligibilityNames[index], index } });
      }

      for (const [name, abbreviation, category, level] of courses) {
        await tx.course.create({ data: { name, abbreviation, category, level } });
      }

      for (const name of places) {
        await tx.placeOfAssignment.create({ data: { name } });
      }

      await tx.user.create({
        data: {
          username: "admin",
          email: "admin@mirdc.dost.gov.ph",
          firstName: "System",
          lastName: "Administrator",
          password: passwordHash,
          role: "ADMIN",
          blocked: false,
          confirmed: true,
        },
      });
    },
    { maxWait: 10_000, timeout: 120_000 }
  );

  let removedUploadDirs = 0;
  for (const entry of fs.readdirSync(uploadPath)) {
    const entryPath = path.join(uploadPath, entry);
    if (/^\d+$/.test(entry) && fs.statSync(entryPath).isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
      removedUploadDirs += 1;
    }
  }

  console.log("Full database reset complete.");
  console.log("Created admin@mirdc.dost.gov.ph (ADMIN); use Forgot Password to set its password.");
  console.log(`Removed applicant upload directories: ${removedUploadDirs}`);
} finally {
  await db.$disconnect();
}