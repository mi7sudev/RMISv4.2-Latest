/**
 * Dev-only preview — renders the HR notice email templates exactly as the
 * API would send them, to verify the office-sample formatting:
 *   bun run scripts/preview-notice-email.ts
 */
import { emailInterviewInvitation, emailSkillsExam } from "../src/lib/notify";

const jobTitle = "Metals Technologist III (MIRDCB-MTEK3-10-1998)";

console.log("════ SINGLE-STAGE INTERVIEW (text) ════");
const single = emailInterviewInvitation("Juan Dela Cruz", jobTitle, {
  date: "2026-07-30",
  time: "08:30",
  mode: "face_to_face",
  venue:
    "3/F FAD Training Room, Gold Building, Metals Industry Research and Development Center, DOST South Gate, General Santos Avenue, Bicutan Taguig City",
});
console.log("Subject:", single.subject);
console.log(single.bodyText);

console.log("\n════ MULTI-STAGE ONE-DAY PROCESS (text) ════");
const multi = emailInterviewInvitation("Juan Dela Cruz", "Training Specialist II (MIRDCB-TRS2-09-2001)", {
  date: "2026-09-30",
  time: "12:30",
  mode: "face_to_face",
  venue: "Office of the Deputy Executive Director for RD, 2/F Gold Building, MIRDC Compound, Gen. Santos Avenue, Bicutan Taguig City",
  stages: [
    { title: "Face-to-face Interview with Dr. AGUSTIN M. FUDOLIG, Deputy Executive Director for Research and Development (DED-RD)", time: "12:30", venue: "Office of the Deputy Executive Director for RD, 2/F Gold Building, MIRDC Compound, Gen. Santos Avenue, Bicutan Taguig City" },
    { title: "Psychological Assessment", time: "1:00 PM - 3:00 PM", venue: "FAD-AGSS Training Room, 3/F Gold Building" },
  ],
});
console.log("Subject:", multi.subject);
console.log(multi.bodyText);

console.log("\n════ SKILLS EXAM (text, first 12 lines) ════");
const exam = emailSkillsExam("Juan Dela Cruz", "Metals Technologist III (MIRDCB-MTEK3-10-1998)", {
  date: "2026-08-05",
  time: "09:00",
  mode: "face_to_face",
  venue: "FAD-AGSS Training Room, 3/F Gold Building",
  examType: "Trade test",
});
console.log("Subject:", exam.subject);
console.log(exam.bodyText.split("\n").slice(0, 12).join("\n"));

console.log("\n════ HTML shells render (flags) ════");
for (const [name, t] of [["single", single], ["multi", multi], ["exam", exam]] as const) {
  const html = t.bodyHtml;
  console.log(
    name,
    "| officialFooter:", html.includes("MIRDC Complex, Gen. Santos Avenue"),
    "| noReply:", html.includes("Please do not reply"),
    "| signature:", html.includes("DOLLY MARIE T. BORLADO")
  );
}
