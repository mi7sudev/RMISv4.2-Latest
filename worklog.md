# RMIS Project Worklog

---
Task ID: 1
Agent: Z.ai Code (main agent)
Task: Adopt the uploaded `rmis-deploy-2026-10-12.tar.gz` as our own project, set it up, and run it.

Work Log:
- Extracted `upload/rmis-deploy-2026-10-12.tar.gz` to /tmp/rmis-extract and inspected contents: a complete Next.js 16 (App Router) RMIS — Recruitment Management Information System for DOST-MIRDC, with Prisma/SQLite schema, seed script, API routes, hash-router SPA frontend, and deployment docs.
- Reviewed `package.json` (same base scaffold name `nextjs_tailwind_shadcn_ts`, Next 16.1.1, Prisma 6), `.env.example`, `prisma/seed.ts`, `DEPLOYMENT.md` (two-tier access runbook), and `Caddyfile` (identical to sandbox gateway config).
- Replaced the scaffold in /home/z/my-project with the archive contents (kept `upload/` and `examples/`).
- Wrote `.env`: DATABASE_URL=file:/home/z/my-project/db/custom.db (sandbox shell env var already pins this path), generated random NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000, INTRANET_ENFORCEMENT=off (so ADMIN/EVALUATOR logins work from any IP in the sandbox), EMAIL_PROVIDER=mock.
- Reinstalled dependencies: `rm -rf node_modules bun.lock .next && bun install` (882 packages) + `bun pm trust --all`.
- Pushed schema and generated client: `bun run db:push` (SQLite in sync, Prisma Client v6.19.3 generated).
- Seeded database: `bun prisma/seed.ts` → accounts testadmin / testevaluator / testapplicant / maria.santos (all password123), eligibility refs, courses, places of assignment, 4 job postings, sample applicants + applications.
- Started dev server in background (`bun run dev`, port 3000). `/api/health` → {"status":"healthy","checks":{"app":"ok","database":"ok"}}.
- Browser verification (agent-browser): public landing renders Job Opportunities board with seeded postings; admin login (testadmin) → Operations dashboard with live stats (Applicants 2, Active jobs 3, Applications 2, Shortlisted 1); Recruitment workspace lists 4 postings with Open/Closed statuses; applicant login (testapplicant) → applicant home with profile stats (14% profile progress, Apply Now board); onboarding tour modal dismisses; logout works.
- Mobile check (390×844): job cards stack correctly, bottom tab bar + footer behave properly.
- Fixed ESLint errors from `deploy/mirdc_middleware/index.js` (CommonJS require in the separate office email-relay service) by adding `deploy/**` and `scripts/**` to eslint ignores. `bun run lint` now passes clean.
- No console errors, no runtime errors in dev.log.

Stage Summary:
- RMIS is now our own project at /home/z/my-project and runs on port 3000.
- Demo logins (password123): testadmin (ADMIN), testevaluator (EVALUATOR), testapplicant (APPLICANT), maria.santos.
- Key config: INTRANET_ENFORCEMENT=off for sandbox demo; EMAIL_PROVIDER=mock (emails only recorded to ledger); Turnstile captcha auto-disabled (no keys configured) on trusted gates.
- App is a single-route hash-router SPA (#/operations, #/recruitment, #/home, #/vacant-positions, #/signin …).

---
Task ID: 2
Agent: Z.ai Code (main agent)
Task: Mobile UX fixes — (a) decrease footer height on mobile, (b) remove container-in-container nesting in profile forms on mobile, (c) fix crushed table columns on mobile using the authentic BEUI Table (no recreation).

Work Log:
- Verified table authenticity: fetched https://beui.dev/r/table.json and diffed all 12 vendored files in src/components/motion/table — every file is BYTE-FOR-BYTE identical to the official BEUI registry (index.tsx differs by one provenance comment only). The block is authentic; no recreation needed.
- Diagnosed the mobile table crush: the BEUI block floors the table at its min-column width and lets the viewport scroll, but flexible (undeclared) columns split the leftover with the block's trailing filler col under table-layout:fixed — Position/Candidate columns collapsed to the 64px floor on phones.
- Fixed at the CALL SITE (sanctioned BEUI usage): responsive column sets below md via useIsMobile() —
  • recruitment.tsx: mobile [Position 142px (logo hidden, deadline folded into subtitle), Status 108px, Actions 108px]; sm+ keeps the full 7-column table with editable vacancies.
  • review-queue.tsx: mobile [Candidate 106px (position folded into subtitle, avatar hidden), Status 134px, Actions 118px (single Review/View button)].
  • candidates.tsx: mobile [Candidate 166px (avatar hidden), Profile 120px, quick-view Actions 72px]; application count stays in quick view.
  • settings.tsx UsersPanel: mobile [User 208px (role folded into subtitle), combined Actions 150px carrying the Active switch + Edit + Delete]; sm+ keeps the 4-column table with 480px User column.
  • Added max-sm:[&_td]:px-3 max-sm:[&_th]:px-3 to those Table classNames (block cells wear px-4; 8px per cell back on phones). recruitment.tsx needed the missing `cn` import (caught at runtime, fixed).
- Footer (shell/footer.tsx): mobile strip tightened further — py-2, gap-0.5, 10px note with snug leading, size-6 chip, h-12 seal watermark below sm. Measured footer height on 390px viewport: ~97px → 77px. sm+ (desktop) sizing untouched.
- Profile forms (shell.tsx SectionCard + all 7 profile sections): added opt-in `bareOnMobile` prop — below sm the outer section card drops its chrome (no border/surface/radius/inset), the title wraps and the header actions drop to their own full-width row, so the disclosure groups ("Identity", "Address", …) and entry cards become the ONLY containers. Applied to personal-info, education, work-experience, training, eligibility, awards, documents sections. Desktop (sm+) keeps the card anatomy.
- Browser verification at 390×844: recruitment/review-queue/candidates/settings tables all render fully readable without crushed columns; profile Section 01 shows one container level; footer is a tight 77px strip. Desktop regression at 1280×800: full 7-column recruitment table intact, profile card-in-card anatomy preserved, footer at 80px (Task 37 sizing unchanged). bun run lint clean; /api/health healthy.

Stage Summary:
- Mobile footer height reduced ~20% (97px → 77px on 390px viewport).
- Profile forms on mobile are flat: section header as plain heading, inner group cards as the only containers; desktop unchanged.
- Tables on mobile use responsive column sets at the call sites; the BEUI Table block remains 100% official vendored code (registry-verified), untouched.

---
Task ID: 3
Agent: Z.ai Code (main agent)
Task: Profile page → read-only preview by default; "Save Changes" becomes "Edit Profile"; editing is an explicit session (user request, design left to me).

Work Log:
- Reworked src/components/views/profile/personal-info-section.tsx (Task 40):
  • PREVIEW BY DEFAULT: the section renders the SAVED record as quiet label/value rows inside the same four disclosure groups (Identity / Address / Legal Disclosures / Character References) — real read-only text, never disabled inputs. Empty values show "—" + sr-only "Not provided"; dates format human-readable (formatDate → "May 12, 1990"); Yes/No declarations render as Yes/No; character references render as name-led cards listing only filled fields, with a quiet empty note when none exist.
  • "Edit Profile" button (pencil, dlg-cta) replaces "Save Changes" in the header; description swaps to "Read-only preview — click Edit Profile to make changes." / "Editing — your changes apply when you save."
  • EDIT SESSION: enterEdit seeds the draft from the freshest server profile; header becomes SaveHint ("Unsaved changes") + Cancel + Save Changes (official StatefulButton lifecycle). Save validates through the Task 32 auth timing (touchAll + hasGaps), persists, toasts, refreshes session, fires the new onChanged parent reload BEFORE leaving edit mode so the preview shows server truth (no stale-value flash), then flashes "Saved ✓" in the preview header (useSavedFlash).
  • AUTOSAVE RETIRED: with a Cancel affordance, silent persistence would make "discard" a lie — edits only mark the draft dirty; the 1.2s debounce + timer plumbing is gone.
  • CANCEL: instant exit when the draft is clean; AlertDialog "Discard unsaved changes?" (Keep editing / Discard changes, ghostBadBtn) when dirty or in error.
  • NEW-RECORD BOOT: an empty record (no first+last name+email) mounts straight into edit mode so first-time applicants still land on the form; filled records get the preview.
  • Reports unsaved state upward via onUnsavedChange (false on unmount), takes onChanged for the post-save silent reload.
- Reworked src/components/views/profile-view.tsx: Task 40 unsaved-changes navigation guard — hasUnsaved state + stable handleUnsavedChange; handleMobileSectionChange renamed changeSection; new requestSection()/requestPortalExit() wrap EVERY nav path (desktop step band, mobile strip cells, caption prev/next, footer Back/Continue, Return to Portal); while dirty, navigation opens "Leave with unsaved changes?" and confirmLeave() resumes the ORIGINAL destination (pendingNav holds section number or "home"). PersonalInfoSection now receives onChanged={reloadSilent} + onUnsavedChange. Also dropped unused EmptyState/ghostBtn imports (lint hygiene).
- Browser verification (agent-browser, testapplicant @ #/profile):
  • Preview: zero textboxes in the a11y tree, Edit Profile present, values/dashes render correctly (desktop 1280×800).
  • Edit: form returns with Cancel/Save Changes; dirty → "Unsaved changes"; Cancel w/ dirty → discard dialog; Keep editing stays; Discard returns to preview with value unchanged (verified no leak).
  • Save: middle name "Reyes" → toast "Profile changes saved", header "Saved ✓" flash, preview shows the saved value, Identity chip 4/13→5/13; then reverted to original data via the same flow.
  • Validation: clearing First Name + Save reveals "First Name is required." and stays in edit (Task 32 timing intact).
  • Nav guard: dirty + step-band click → "Leave with unsaved changes?"; Keep editing stays (still editing+dirty); Discard & leave lands on Education; returning to section 01 shows a fresh preview (no session leak).
  • Mobile 390×844: preview = full-width Edit Profile under the title, single-column rows, no card nesting (Task 39 intact); edit = Cancel/Save row; discard dialog renders cleanly.
  • Tooling note: mid-session agent-browser clicks silently stopped reaching the page (0 pointer events at document level even via raw mouse down/up) — a stale daemon issue, NOT an app bug; `agent-browser close` + fresh sign-in restored real clicks (sign-in button click worked). JS-dispatched clicks were used to complete verification after the restart.
- bun run lint clean; dev.log shows no runtime errors; test data restored to its pre-test state (Middle Name back to empty).

Stage Summary:
- Profile page is now a READ-ONLY PREVIEW of the saved record; editing requires the explicit "Edit Profile" → form → "Save Changes" (or Cancel/discard) session.
- Autosave on section 01 is retired by design; data-loss paths are guarded (Cancel confirm + view-level navigation guard covering step band, mobile strip, caption arrows, footer Back/Continue, Return to Portal).
- New records skip the preview and boot into the form; successful saves return to the preview with server-truth data and a transient "Saved ✓" flash.
- Sections 02–07 untouched (they were already list-based: read-only entries + explicit Add/Edit per entry).

---
Task ID: 4
Agent: Z.ai Code (main)
Task: Extend the read-only preview + "Edit Profile" gate to ALL profile sections (02 Education · 03 Work · 04 Training · 05 Eligibility · 06 Awards · 07 Documents) — user clarified the Task 40 pattern must apply to every section, not just 01 Personal.

Work Log:
- Read worklog + all section components; confirmed Task 40 covered section 01 only and sections 02–07 still exposed per-row Edit/Delete + Add affordances at all times.
- Design (adapted for list sections whose mutations are immediate, no draft): each section gets a section-level `editMode` gate. Populated section boots as PREVIEW — entry tiles render without the per-row Edit/Delete cluster, header Add button, foot dashed AddEntryButton (02–06) / without the upload rail, checkboxes and delete buttons (07). Header shows "Edit Profile" (dlg-cta + Pencil, same as section 01); description "Read-only preview — click Edit Profile to make changes." "Edit Profile" reveals all editing affordances + SaveHint; "Done Editing" (dlg-cta + Check) returns to preview. EMPTY sections boot straight into EDIT mode (the inline first-entry form / upload rail IS the add path) — mirrors section 01's new-record boot, so first-time applicants never hit a dead-end preview. Section unmount on section-switch naturally resets the gate; no unsaved-guard wiring needed (no draft state in these sections). 07 keeps row-click preview + eye button in preview mode (opening a document is a READ action).
- Edited education-section.tsx, work-experience-section.tsx, training-section.tsx, eligibility-section.tsx, awards-section.tsx (uniform pattern: editMode state `useState(() => items.length === 0)`, mode-scaled description/actions, `{editMode && ...}` on row-action cluster + Add buttons) and documents-section.tsx (editMode gate on upload rail, batch bar, checkboxes, delete buttons).
- bun run lint clean.
- Browser verification (testapplicant @ #/profile, desktop 1280×800 + mobile 390×844):
  • 01 preview intact (Edit Profile + Identity 4/13 groups, no textboxes).
  • 02 empty → boots EDIT (inline form + Done Editing); added "Metro Institute of Technology" 2015–2019 entry via the inline form (golden path) → stays in edit with row Edit/Delete/Add; Done Editing → PREVIEW (entry card clean, only Edit Profile left); Edit Profile → edit returns. Section switch away & back → boots PREVIEW (mode reset verified).
  • 03/04/05/06 empty → all boot EDIT with Done Editing.
  • 07 empty → boots EDIT; uploaded /tmp/test-diploma.pdf under EDUCATION category (golden path, "test-diploma.pdf uploaded"); Done Editing → PREVIEW: upload rail/checkbox/delete/batch-bar all hidden, row + eye + "Uploaded" pill remain, Edit Profile present; Edit Profile → controls return.
  • Mobile 390×844: strip caption/stepping fine; 02 preview = full-width Edit Profile, zero edit links, zero Add buttons, no nested containers; 07 preview = row with PDF chip/status/eye, no checkbox/delete. Mobile edit round-trip on 02 verified (Done Editing + Edit + 2 Add buttons appear).
  • agent-browser errors: none; console: no errors/warnings; dev.log: all API 200 (the transient documents-section parse error in dev.log was from mid-edit compile, resolved — latest compiles clean).
- Note on daemon: agent-browser real-pointer clicks went stale again mid-session (same known issue as Task 3) — `agent-browser close` was NOT needed; JS-dispatched clicks (el.click()) used for the remaining steps, all verified states consistent.
- Demo data left in place intentionally: testapplicant now has 1 education entry + 1 EDUCATION-category document so the new preview mode is visible immediately on sign-in.

Stage Summary:
- Every profile section (01–07) is now READ-ONLY PREVIEW BY DEFAULT; editing always requires the explicit "Edit Profile" click. Section 01 keeps its draft session (Save Changes/Cancel + discard confirm + navigation guard); sections 02–07 use the immediate-persistence edit gate (Edit Profile ↔ Done Editing, empty sections boot in edit mode).
- No API, form, validation, or dialog changes — purely a UI gating layer over the existing section components; Task 39 mobile nesting fix and Task 25/32/33 field anatomy untouched.
---
Task ID: 5
Agent: Z.ai Code (main)
Task: Post-reset integrity audit — verify all prior changes (deployment, Tasks 38–41) survived the system reset.

Work Log:
- Confirmed dev server up on :3000, /api/health = {status: healthy, database: ok}; .env intact (DATABASE_URL=file:/home/z/my-project/db/custom.db, NEXTAUTH_SECRET, INTRANET_ENFORCEMENT=off, EMAIL_PROVIDER=mock).
- Code audit: all 7 profile section files (personal-info, education, work-experience, training, eligibility, awards, documents) carry the editMode gate + "Edit Profile"/"Read-only preview" strings (Task 40/41 intact). profile-view.tsx retains hasUnsaved/pendingNav/requestSection/requestPortalExit guard wiring + key={active} section remount (Task 40 nav guard intact). footer.tsx retains Task 38 tight-strip padding (px-4 py-2 sm:px-6 sm:py-5). BEUI Table vendored block at src/components/motion/table/ untouched and imported by candidates/recruitment/settings/review-queue.
- bun run lint clean.
- Browser verification: testapplicant @ #/profile — 01 boots PREVIEW (0 visible inputs, Edit Profile present), edit session round-trip works (Edit Profile → 26 inputs + Cancel/Save Changes(StatefulButton) → Cancel → preview restored); 02 (populated) boots PREVIEW and toggles Edit↔Done Editing cleanly; 03–06 (empty for this account) boot EDIT per design; 07 (1 doc) PREVIEW toggle verified. Mobile 390×844: footer 77px, section header is a plain heading outside cards (no nesting), full-width Edit Profile, screenshot confirmed. testadmin: recruitment desktop 1280×800 shows full 6+action-column BEUI table (screenshot), mobile 390×844 shows responsive 2-column set; review-queue/candidates/settings tables all render headers; desktop footer 80px flush at viewport bottom. dev.log: no runtime errors, all API 200.

Stage Summary:
- ALL changes survived the reset: deployment (.env/db/server), Task 38 mobile footer (77px), Task 39 flat mobile profile (no nested containers), Task 40 section-01 read-only + edit session + nav guard, Task 41 all-sections edit gate, BEUI Table wiring in 4 views. Nothing needed restoration.
---
Task ID: 6
Agent: Z.ai Code (main)
Task: Implement the 2026-10-13 MOM changes: MOM rejection/shortlist email templates, recruitment-mailer identity, required profile fields (email/phone/character refs), rejection auto-email, re-application for previously rejected applicants, invitation dialog rework (Invitation Details + face-to-face/online mode), and bulk invitations to shortlisted applicants.

Work Log:
- Templates (src/lib/notify.ts): replaced emailRegretLetter + emailShortlisted with the EXACT MOM wording — subjects "Application Status Update – {job}" / "Application Update – Shortlisted for {job}", greeting uses the applicant's LAST name, sign-off "MIRDC HR Office". Interview/exam invitation templates rebuilt around NoticeDetails: Date/Time/{Kind} Mode: Face-to-Face|Online/Venua or Meeting Link lines (mirrors the real MIRDC notice format), long-text Invitation Details block, attendance-confirmation line. Added RECRUITMENT_EMAIL_ADDRESS (EMAIL_FROM, default recruitment@mirdc.dost.gov.ph) + RECRUITMENT_SENDER_NAME ("MIRDC HR Office") and the `from` header on the middleware/resend drivers (MOM: nodemailer on the backend using the recruitment email); .env gains EMAIL_FROM.
- Subject-prefix plumbing: regrets route idempotency now matches "Application Status Update –" (+ legacy "Application regret:"/"Application regret —"); notice-route history maps the new subject to type "regret".
- Validation: noticeSchema — notes (Invitation Details) raised to 4,000 chars, new mode enum + meetingLink; new bulkNoticeSchema.
- Schema: Application @@unique([applicantId, jobId]) → @@index (re-application); db:push clean; seed.ts ensureApplication switched to findFirst(active→latest).
- Apply gate (api/jobs/apply): duplicate 409 now only for ACTIVE applications (isActiveApplicationStatus in lib/status.ts; REJECTED/DECLINED/WITHDRAWN free the posting). Jobs wire unchanged; clients compute active state.
- Prior-rejection visibility: queue route computes per-row priorRejections {count,lastDate,lastReason} in memory (self-row excluded, withdrawals ignored); applications/[id] GET adds priorRejectionsFor.
- New route POST /api/evaluator/applications/invitations: bulk interview/exam notices to shortlisted-stage applications — shared payload (date/time/mode/venue|meetingLink/contact/Invitation Details/examType), mode guards (online⇒meetingLink required; f2f⇒venue required), per-type subject-prefix idempotency, fans out email+SMS+notification+audit.
- Profile: personal-info-section — Mobile Number now required (rule + required marker + helper), Email Address gains isEmailShape rule, CollapsibleGroup gained `required` prop (red asterisk + sr-only), Character References group marked required in edit+preview, empty-note mentions the requirement. profile-view — requestSection blocks forward moves past section 01 while the SAVED profile has 0 named character references (toast explains), completion caption updated. lib/profile-completion + lib/profile-completion(client) — personal requirement now includes mobile number + ≥1 character reference (apply gate + Mark Complete + ring).
- Contact: contact-view + account-settings channels updated to the MOM details — "MIRDC Compound, Gen. Santos Ave. Bicutan 1631, City of Taguig, Metro Manila 1631, Philippines", "8837-0431 loc. 440/441", "recruitment@mirdc.dost.gov.ph".
- UI (review-workspace): NoticeFormDialog exported + reworked — Setup mode radio toggle (Face-to-Face/Online) swapping Venue⇄Online meeting link (mode-aware client+server validation), "Notes"→"Invitation Details" long text (no maxLength), bulk mode (bulkIds>1 → POSTs bulk endpoint with summary toast). Prior-rejection amber banner (History icon, count, last applied date, last recorded reason) under the dossier header.
- UI (review-queue): QueueRow.priorRejections; amber "Previously rejected ×N" chip in the Candidate cell (desktop + mobile column sets) and as a kanban tag; "Send interview invitations (N)" action (shortlisted cohort) opening the shared dialog in bulk mode.
- Jobs re-apply (jobs-view + applicant-home): applied-state computed via isActiveApplicationStatus (JobCard/SummaryCard/hero/JobListCard prop/cancel appliedId); SummaryCard shows a warning alert "Previous application not shortlisted — you may re-apply…" + the submit button reads "Re-apply" when a prior terminal attempt exists; Cancel only for the active application.
- Data note: Maria gained a "Career Service Sub-Professional (First Level)" eligibility (id 2) so her E2E apply to Administrative Assistant I passes the live MQR gate (used by the verification below; also useful demo data).
- Verification (browser, admin + maria.santos + testapplicant): contact page shows the 3 MOM details (old phone/email gone). Profile: Edit→clear Mobile→Save ⇒ "Mobile Number is required." and save blocked; Character References * marker; forward nav 01→02 blocked with toast at 0 refs, lifts after saving ref (Maria flow via testapplicant). Rejection: admin marked Maria's app #3 Not Qualified ⇒ status Rejected + email_log row subject "Application Status Update – Administrative Assistant I" body "Dear Santos," + exact MOM paragraphs (mock provider). Re-apply: job-3 detail shows warning alert + Re-apply button (no Cancel), re-apply created app #4 (same job, Applied) — non-unique pair works. Evaluator: queue row #4 carries "Previously rejected ×1" (desktop + mobile 390×844), workspace banner shows count/date/last reason; shortlisting #4 emitted "Application Update – Shortlisted for Administrative Assistant I" with MOM body. Bulk invitations: "Send interview invitations (2)" dialog (2 shortlisted) with Online mode + meeting link + 242-char Invitation Details ⇒ 2 emails each containing "Interview Mode: Online", "Meeting Link: https://meet.google.com/mirdc-interview-2026", details block; API re-send ⇒ {sent:0, alreadySent:2} (idempotent); single workspace notice (F2F default) emits "Interview Mode: Face-to-Face" + Venue; notice-history rail + GET map both subjects correctly. bun run lint clean; tsc: no new errors (pre-existing pds/dialog/skills debt untouched); dev.log: no runtime errors, health {app: ok, database: ok}.

Stage Summary:
- All 2026-10-13 MOM items implemented end-to-end: MOM-approved rejection + shortlist emails (auto on verdict), recruitment-email sender identity, Email/Phone always required + Character References required before Education, re-application for previously rejected applicants with evaluator-facing prior-rejection indicators, invitation dialog with Invitation Details (long text) + Face-to-Face/Online toggle + meeting link, and bulk interview/exam invitations to shortlisted applicants (idempotent).
- Demo data now includes a rejected→re-applied pair on Administrative Assistant I (Maria) so every new surface is visible on sign-in.
---
Task ID: 7
Agent: Z.ai Code (main)
Task: User QA round — (1) header must show the COMPLETE RMIS name, not just "RMIS"; (2) fix the intermittent double-click logout bug; (3) enterprise-look upgrade for the sign-in and registration pages (consistent across the system).

Work Log:
- Logout fix (src/components/shell/nav-rail.tsx — performSignOut, the single shared helper used by the nav-rail dropdown, mobile tab bar, ⌘K command menu and Account Settings): the old fire-and-forget fetch + immediate window.location.reload() let the reload abort the in-flight POST /api/auth/logout, so the session cookie survived and the user had to sign out twice. Now AWAITS the POST (raced against a 4s guard so an unreachable server can never trap the user) before navigate("signin") + reload, and the request rides keepalive:true so it survives a fast unload regardless.
- Complete name lockups: new shared const RMIS_FULL_NAME ("Recruitment Management Information System") in src/components/auth-enterprise.tsx; applied to the public site-header (two-line wordmark, sm+, same pattern as the signed-in rail/mobile bar), the AuthBrandPanel lockup, the reset-password card brand row, the desktop footer eyebrow (mobile keeps the compact © RMIS strip per Tasks 36–38) and the layout metadata title ("RMIS · Recruitment Management Information System").
- Enterprise auth family (new src/components/auth-enterprise.tsx): AuthMobileLockup (seal + RMIS + full name, lg:hidden — auth pages previously had NO brand on phones) and AuthSecureStrip (government-portal trust strip; "session" = authorized-use/audit notice, "privacy" = RA 10173 line). Sign-in card: white fill + lift shadow (dlg-card-plain anatomy; .dark .bg-white sweep keeps night mode), gov.ph letterhead eyebrow ("Republic of the Philippines · DOST-MIRDC") over a hairline rule heading the form, trust strip under the card. Sign-up: same treatment through the official SignUpForm's sanctioned className prop (bg-white + shadow; no vendored edits), letterhead header on the OTP card, RA 10173 notice + privacy strip below, wrapper aligned to max-w-sm. Reset-password joins the family (lockup below lg, brand row lg+, lift-shadow card, session strip). Duplicate-masthead fix: AuthMobileLockup carries only seal+name (letterhead lives once, inside each card); reset card brand row is lg+-only.
- Verification (agent-browser): desktop 1280×800 sign-in (header + panel + card + strip + footer all show the full name), sign-up (card + RA notice + privacy strip), reset (card + strip), landing header; mobile 390×844 sign-in and sign-up (lockup renders, no duplication, no overflow); dark-mode spot check (card flips to raised dark surface, strip correct). Logout golden path TWICE (testadmin, then testevaluator): single click → LOGOUT audit row in dev.log, POST /api/auth/logout 200, next /api/admin/stats 401, reload lands on #/signin showing the form and STAYS signed out. bun run lint clean; dev.log compiles clean, no runtime errors; console: no errors/warnings.
- Note: agent-browser real-pointer clicks went stale mid-session again (known issue) — JS-dispatched clicks (el.click()) used for menu interactions; all states verified via DOM text + dev.log.

Stage Summary:
- Sign-out is now deterministic (one click, every surface) because the reload can no longer race the server logout; the bug's root cause (unload aborting the cookie-clearing POST) is fixed at the shared helper.
- Every brand surface in the system now reads the complete name: public header, auth panel, rail (existing), mobile top bar (existing), reset card, footer (desktop), tab title.
- Sign-in / sign-up / reset-password share one enterprise anatomy — institutional lockup (mobile), letterhead-headed white lift-shadow cards, RA-trust strips — while all official BEUI blocks, handlers, validation and copy stayed untouched.
---
Task ID: 8
Agent: Z.ai Code (main)
Task: User request — replace the section 07 (Supporting Documents) upload UI with the FolderUpload component per the user's documented usage (<FolderUpload adapter={demoAdapter} name="…" />), while keeping the table below that displays the applicant's uploaded documents.

Work Log:
- Sourced the block: the live BEUI registry (beui.dev/r/registry.json, 143 items) has NO folder-upload item (404 on /r/folder-upload.json; sitemap has only project-folder/card-folder) — so the component was BUILT to the user's exact API contract in the house BEUI design language (EASE_OUT motion, token surfaces, reduced-motion aware).
- New src/components/folder-upload.tsx — FolderUpload: a folder card workspace (tab row = open-folder glyph + `name` + live "N files · total size" ledger + Clear list when settled) wrapping a dashed dropzone ("Drop files into {name}" / Browse) and an animated per-file ledger with REAL progress (only what the adapter reports — no invented progress), success/error status-icon swap, per-row retry and remove (removing an in-flight row ABORTS its signal). Transport lives entirely in the adapter: FolderUploadAdapter { upload(file, {onProgress, signal}), validate? }. Sequential uploads (SQLite-safe, mirrors the old batch contract); onAllSettled(okCount cumulative) after each batch/retry sweep; React 19 ref-as-prop exposing retryFailed() (host re-runs failed rows after fixing an external blocker). Dropzone stacks on mobile (full-width Browse pill below the copy) — no overflow at 390px.
- New src/examples/_demo.ts — demoAdapter (simulated ~1.1s eased-progress upload) so the user's snippet works verbatim.
- Rewired src/components/views/profile/documents-section.tsx: the old BEUI FileUpload rail + queue machinery replaced by <FolderUpload ref adapter name="Supporting Documents" />. The section owns the REAL adapter: uploadWithProgress XHR POST to /api/applicant/documents (true upload progress, same FormData file+category contract, { error } envelope + 401/403/500 fallbacks parsed identically to apiFetch). Category gate lives in the adapter: no category ⇒ every file's row fails with "Select a category before uploading" + the Task 31-b shake contract fires; picking a category AUTO-RETRIES the blocked batch (ref.synced before the sweep). Per-file toasts keep the old copy ("{name} uploaded" / server 413/415 verbatim). SaveHint + parent refresh now gate on cumulative settled-OK growth (retries fold into one count). The uploaded-documents TABLE BELOW is UNCHANGED — same rows (PDF chip, name, category · size · date, status pill, eye, checkbox batch delete), same Task 41 preview/edit gate, same preview modal and delete dialogs.
- Verification (agent-browser, testapplicant @ #/profile section 07, desktop 1280×800): preview boots with the docs table intact; Edit Profile → folder workspace renders (tab row + Empty folder + dropzone); gate trip (file injected with no category) ⇒ toast + red-ring shake + failed row with gate message + retry/remove; picking EDUCATION auto-retried the row ⇒ "gate-test.pdf uploaded" toast, row flips to "Uploaded · 9 B", AND the table below gains the row (server 201); second file (folder-test.pdf) uploaded straight through with the category set (2 files · 18 B, both rows in the table); Done Editing → preview shows all three docs, folder/checkboxes/delete hidden, view targets only. Cleanup: both test docs deleted via the UI (only test-diploma.pdf remains). Mobile 390×844: dropzone stacking fix verified, no horizontal overflow, preview shows table with 2 view targets per doc and zero delete buttons. bun run lint clean; tsc: no errors in the new/changed files (only pre-existing examples/websocket debt); dev.log: both POSTs 201, latest compiles clean, no new runtime errors.

Stage Summary:
- Section 07 now uploads through the FolderUpload folder workspace (adapter-driven, true XHR progress, gate-aware auto-retry, abortable rows) exactly per the user's documented component API — demoAdapter ships for docs/examples while RMIS wires its own authenticated adapter.
- The uploaded-documents table below the uploader is byte-for-byte the previous, heavily-QA'd anatomy (preview/edit gate, batch delete, preview modal) — zero regression to the display surface.
---
Task ID: 8-b
Agent: Z.ai Code (main)
Task: User follow-ups — (1) "don't recreate the UI I sent — wire the REAL one into the system": the FolderUpload is the official UploadCN shadcn-registry component (@uploadcn/folder-upload), not a hand-built lookalike; (2) remove the "Category * / Select category" picker from section 07; (3) two-column edit layout — uploaded files list on the LEFT, the file-folder upload on the RIGHT.

Work Log:
- Sourced the official component: uploadcn.com was unreachable from the sandbox (SSL blocked), so the sources were pulled from the official GitHub repo (github.com/uploadcn/uploadcn, matching the user's pasted docs verbatim): registry/default/ui/upload.tsx (the @uploadcn/upload item) + registry/default/blocks/folder-upload.tsx, and the npm engine packages installed (bun add @uploadcn/core@0.1.1 @uploadcn/react@0.1.1; motion/lucide-react/tw-animate-css already present).
- Vendored BOTH files with a scripted transform that reproduces exactly what the shadcn CLI does on install (nothing else changed): cn alias → @/lib/utils, @/registry/default/ui/upload → @/components/ui/upload, and every IconPlaceholder resolved to its lucide prop icon (project iconLibrary). Result: src/components/ui/upload.tsx (full official Upload primitive kit) and src/components/folder-upload.tsx (the official folder block — hover/drag-tilt folder, flying files, front-panel progress) replacing the previous custom build. The custom component and its API are gone.
- Style: appended the cn-upload-* semantic rules (nova — the uploadcn docs default style) from the registry's style-nova.css into globals.css @layer components, and added the two modern shadcn button sizes the official block expects (xs, icon-xs) additively to ui/button.tsx.
- demoAdapter (src/examples/_demo.ts) rebuilt on the official mockAdapter engine — the user's snippet <FolderUpload adapter={demoAdapter} name="Q3 Reports" /> now runs verbatim.
- Section 07 rewired per the official docs: useUploader + createAdapter (the sanctioned custom-API extension point) — one XHR POST per file to /api/applicant/documents (same FormData file+category contract; category now constant "SUPPORTING" = the server default since the picker is gone), TRUE byte progress via the adapter context, { error } envelope parsed for verbatim 401/403/413/415/500 messages. Uploader options: accept mirrors the server extension allowlist, maxSize 10 MB (client rejects before a byte is sent; server still backstops), concurrency 1 (SQLite-safe sequential), duplicates "allow", retry false. Callbacks (onSuccess toast "{name} uploaded" / onError toast verbatim / onReject toast validation issue / onComplete → Saved flash + table refresh, gated on cumulative settled-OK growth). SaveHint rides useUploadProgress(uploader).isUploading.
- Category gate REMOVED end-to-end: select, ShakeField wrapper, BEUI field tokens, gate message, shake re-arm timer and the pick→auto-retry sweep are all gone (no category concept left in the UI; server default applies).
- Layout: edit mode is now a two-column grid — uploaded files list LEFT (batch bar + rows/EmptyState unchanged byte-for-byte: chips, status pills, eye, checkbox batch delete, preview modal), official FolderUpload card RIGHT (rounded-3xl cloud/60 card). Mobile stacks folder FIRST with the list below (no overflow at 390px). Task 41 read-only preview untouched (folder hidden, eye-only rows).
- Verification (agent-browser, testapplicant @ #/profile s07, desktop 1280×800 + mobile 390×844): geometry check confirms list x=347 LEFT of folder card x=776 (lg:grid-cols-2); real file injected through the official input → flying-file + folder caption "N files uploaded · 18 B", POST 201 (66ms), table auto-refreshed with the new SUPPORTING row; rejected .exe → official "File type not allowed. Accepted: …" toast with ZERO server requests and no phantom row; double-injection raced the queue cleanly (sequential, both 201, refresh folded into one); batch delete of both test docs (2× DELETE 200, only test-diploma.pdf remains); Done Editing → folder hidden, 0 delete buttons, 2 eye targets; dark mode spot check (folder rides bg-primary, rows on cloud token); mobile: folder stacks first (top 292), list below (top 725), scrollWidth === clientWidth. bun run lint clean; tsc clean for all touched files; dev.log compiles clean, no runtime errors; console: no errors/warnings.

Stage Summary:
- Section 07 now runs the OFFICIAL UploadCN FolderUpload exactly per its documentation — vendored sources are the registry's own code (only the shadcn-CLI's sanctioned import/icon rewrites applied), so future registry updates diff cleanly.
- The upload pipeline is the official engine (@uploadcn/core + @uploadcn/react) with RMIS transport in a createAdapter adapter; category picker removed (uploads land in the server-default SUPPORTING category).
- Edit mode reads left-to-right: what you've uploaded on the left, where to drop more on the right — with the uploaded-documents table's QA'd anatomy fully preserved.
---
Task ID: 8-c
Agent: Z.ai Code (main)
Task: Header title fix (user: "on the header it should be 'Recruitment Management Information System (RMIS)' the current one is wrong") — the full system title in every header lockup was missing the "(RMIS)" acronym.

Work Log:
- Updated the single source of truth: src/components/auth-enterprise.tsx RMIS_FULL_NAME = "Recruitment Management Information System (RMIS)" — auto-corrects the public SiteHeader sub-line, the lg+ AuthBrandPanel lockup, the AuthMobileLockup on auth cards, and the reset-password header (all import the constant).
- Replaced the two hardcoded copies with the constant: src/components/shell/nav-rail.tsx (signed-in desktop rail brand row, was literal string) and src/components/shell/app-shell.tsx (signed-in mobile top bar brand row, was literal string) — both now import RMIS_FULL_NAME from auth-enterprise.
- Aligned the browser tab title: src/app/layout.tsx metadata title "RMIS · Recruitment Management Information System" → "Recruitment Management Information System (RMIS)".
- Left intentionally unchanged: the footer eyebrow ("Recruitment Management Information System · © {year} RMIS" — the acronym already follows the ©) and the notify.ts email footer (already uses the correct parenthesized form).
- Verification (agent-browser): public header at 1440×900 renders "RMIS / Recruitment Management Information System (RMIS)" (eval + screenshot); signed in as testadmin — desktop rail brand row reads the same (screenshot), mobile 390×844 top bar reads the same (screenshot); tab title = "Recruitment Management Information System (RMIS)"; console clean (no errors/warnings), dev.log compiles clean with no new runtime errors (the two old parse-error entries at log lines 2508/2534 predate this session); bun run lint clean; bunx tsc --noEmit reports zero errors in the touched files (remaining errors are pre-existing debt in scripts/, skills/, pds-extract/pds-validate, ui/dialog).

Stage Summary:
- Every header lockup in the system (public pill header, signed-in rail, mobile top bar, auth pages, reset password) plus the tab title now read the official "Recruitment Management Information System (RMIS)" form from one shared constant — no drift possible going forward.
---
Task ID: 8-d
Agent: Z.ai Code (main)
Task: User QA — "on the Supporting Documents uploaded list the status 'Uploaded' displays an empty circle, that's not the correct status for it right? double check our system status badge to understand the correct status badge to display across the entire system."

Work Log:
- Audited the badge system end-to-end: the StatusPill IS the official BEUI AnimatedBadge (motion/animated-badge) whose `neutral` variant renders a bare lucide Circle — everywhere else in the system that empty circle means "no state / inactive" (e.g. a CLOSED job). Mapping document status UPLOADED to neutral was therefore wrong: an uploaded file is a completed, positive state. Also audited PROCESSING (extraction in flight) — same wrong empty circle, where the documented system convention for in-flight states is the syncing badge (spinning LoaderCircle + breathing tint, per the "In Review" syncing-badge user directive).
- Found the mapping had drifted into THREE copies: (1) documentStatusChip in ui/document-preview.tsx (the live one — profile Documents rows, review dossier documents tab, preview modal header), (2) variantForDocStatus in lib/status-ui.ts (documented as "the single mapping" but had ZERO consumers), (3) a private docStatusVariant in views/candidate-detail.tsx that additionally rendered raw caps labels ("UPLOADED") through the old CSS pillClass span instead of the AnimatedBadge.
- Unified into ONE vocabulary: status-ui.ts now owns variantForDocStatus (UPLOADED→ok, PROCESSING→info, EXTRACTED→ok, PARTIALLY_EXTRACTED→warn, FAILED→bad, unknown→null) plus a new documentStatusMeta(status) returning { label, variant, pulse } (labels: Uploaded / Processing / Extracted / Partial / Failed; pulse=true only for PROCESSING so StatusPill renders the official syncing badge while keeping the domain label). document-preview.documentStatusChip keeps its extractable-category gate and delegates to documentStatusMeta; unknown stored statuses now render NO chip rather than a lying one (the DB only stores the five schema statuses).
- Consumers rewired: profile documents-section rows, review dossier rows and the preview modal pass chip.pulse to StatusPill; candidate-detail dropped its private mapping + raw-caps CSS pill and now renders the shared documentStatusMeta through the official StatusPill (so the ADMIN/evaluator candidate file speaks the same badges, with humanized labels).
- Verification (agent-browser): testapplicant profile §07 — test-diploma.pdf (EDUCATION, status UPLOADED) row badge now resolves to the emerald success class (border-emerald-500/30 bg-emerald-500/10) with the lucide Check glyph path M20 6 9 17l-5-5 (screenshot); preview modal header badge also success; admin candidate-detail for the same applicant shows the emerald ✓ Uploaded badge in its Documents card (screenshot) instead of the old neutral raw-caps pill; review dossier opened for Maria Santos renders "No documents uploaded" (she has no docs — the dossier path uses the identical shared helper verified above); EXTRACTED/PARTIAL/FAILED mappings unchanged (were already correct). bun run lint clean; tsc: zero errors in the touched files; dev.log: clean compiles, all 200s, no runtime errors.

Stage Summary:
- The document status chip now speaks the system's badge language everywhere it appears (profile Documents, review dossier, candidate detail, preview modal): ✓ emerald "Uploaded" (on record), syncing spinner "Processing" (in flight), ✓ "Extracted", ⚠ "Partial", ✕ "Failed" — one source of truth in lib/status-ui.ts (variantForDocStatus + documentStatusMeta), no more empty-circle neutral and no more drifted local mappings.
---
Task ID: 8-e
Agent: Z.ai Code (main)
Task: User — "use the Matt Pocock skill (github.com/mattpocock/skills · engineering/codebase-design) to optimize the system; up to you what to use from it." Applied the skill's deep-module vocabulary (deep vs shallow, deletion test, seam discipline, locality/leverage) to find and deepen two shallow clusters, behavior-preserved.

Work Log:
- Fetched and applied the skill (SKILL.md + DEEPENING.md; DESIGN-IT-TWICE noted, light version used since scope was delegated). Scanned the codebase through the deep-module lens: apiFetch's error parsing vs documents-section's private uploadWithProgress; the five profile entry sections' mutation blocks; status/mutations seams already deepened in 8-c/8-d.
- DEEPENING 1 — lib/client.ts is now the ONE client seam: extracted the single apiErrorMessage(status, payload, fallback) parser (private internal seam) shared by apiFetch and a new public apiUpload(path, formData, { onProgress, signal }) — XHR transport, true byte progress, credentials, { error } envelope, ApiClientError(.status) error mode, abort wiring. Interface: one function, 3 params, same discipline as apiFetch. documents-section.tsx dropped its 45-line private uploadWithProgress (whose fallback strings had ALREADY drifted: "Upload failed (N)" vs "Request failed") and now calls apiUpload inside its official createAdapter. Locality: the 401/403/404/5xx fallback strings live in exactly one file; leverage: the next progress-uploading feature gets the pipeline free.
- DEEPENING 2 — new src/components/views/profile/section-mutations.ts: useSectionMutations({ resource, noun, onChanged, flashSaved }) → { saveEntry(values, editing, onSuccess?), removeEntry(id, onSuccess?), busy }. Hides the spec §6.3 delete+recreate edit invariant (previously duplicated ×5), the toast language ("{noun} added/updated/removed"), the verbatim error toasts, the saved-flash + parent-refresh ordering, and busy gating. onSuccess fires right after the toast so each section closes its own dialog state at the exact legacy moment (POST settles, BEFORE the refresh runs); failures keep dialogs open and never throw. Rewired education/work-experience/training/awards fully (each −~25 lines of orchestration) and eligibility partially (keeps its domain title-validation + custom-title payload mapping; hands the network tail to the hook). documents-section.runDelete left as-is (genuinely different batch behavior — count-based toasts, partial failure).
- BUG CAUGHT BY BROWSER VERIFICATION (the skill's "interface is the test surface" in action): the first removeEntry omitted the parent refresh (await onChanged) — DELETE hit the server (200) but the list never refreshed. Fixed to the symmetric interface removeEntry(id, onSuccess?) preserving the exact legacy ordering (toast → caller closes confirm → await refresh); re-verified the full create→delete→refresh cycle passes.
- Verification (agent-browser, testapplicant): education ADD through the hook (POST 201, entry visible); EDIT through the hook's delete+recreate (log shows DELETE /educations/4 200 → POST 201; rename visible); DELETE through the fixed hook (POST-delete → list refreshes, PASS); document upload through apiUpload (official FolderUpload input → POST /api/applicant/documents 201, folder caption + left-column table both update); documents single delete (untouched path, 200); Done Editing returns to preview. bun run lint clean; tsc zero errors in touched files; console/page errors none; dev.log clean compiles, all 2xx. Test artifacts cleaned up (seam-test.pdf deleted via UI; test education entries removed; pre-existing "Metro Institute" entry untouched).

Stage Summary:
- Two real deepenings shipped with zero behavior change: (1) lib/client.ts owns the entire client transport surface (apiFetch + apiUpload behind ONE error parser — no more duplicated fallback strings in views), (2) profile/section-mutations.ts owns the §6.3 entry-mutation contract once instead of five drifted copies. The system now matches the skill's definition: small interfaces, complexity concentrated at the seam, fix-once locality for the next change.

---
Task ID: 9
Agent: Z.ai Code (main)
Task: User QA — remove the redundant "RMIS" wordmark line from the stacked brand lockup; leave only "Recruitment Management Information System (RMIS)" as the single brand text in every header.

Work Log:
- Audited all lockups: the stacked "RMIS" + full-name two-line pattern existed in SIX surfaces (public SiteHeader, desktop NavRail, mobile top bar in app-shell, AuthBrandPanel lg+, AuthMobileLockup, reset-password card row lg+). BrandLogo confirmed text-free emblem.
- Edited all six: dropped the "RMIS" wordmark span; RMIS_FULL_NAME (src/components/auth-enterprise.tsx, unchanged) is now the SINGLE brand text beside the seal. Per-context sizing: SiteHeader 15px (1 line on wide, wraps below), NavRail 11px leading-snug (2 lines in w-64), mobile bar 13px, AuthBrandPanel text-lg, AuthMobileLockup 15px, reset card text-sm.
- Browser verification caught two wrap defects: NavRail at 12px orphaned "(RMIS)" onto a 3rd line → reduced to 11px (measured exactly 2 lines); reset card wrapped as "…System / (RMIS)" widow → added `text-balance` to ALL six spans so browsers even out every wrap (no effect on single-line renders).
- Verified with agent-browser across surfaces/viewports: public header @1280 (1 line) and @640 (2 balanced lines, pageOverflowX=false), AuthBrandPanel @1280 (2-line masthead), AuthMobileLockup @375 (2 lines), NavRail @1280 (2 lines, collapse toggle intact), mobile bar @375 (2 lines inside the 64px bar, bell intact), reset card @1280 (2 balanced lines). Signed-in flows re-exercised (sign-in form → operations dashboard, sign-out via API).
- bun run lint clean; dev.log: compiles clean, no errors in recent 100 lines, all 2xx.

Stage Summary:
- Every header in RMIS now reads exactly "Recruitment Management Information System (RMIS)" as the single brand text next to the official seal — the redundant "RMIS" wordmark is gone system-wide, wraps are browser-balanced, and the name still has ONE source of truth (RMIS_FULL_NAME).

---
Task ID: 10-b
Agent: Production-axis audit sub-agent
Task: Two-axis production-readiness review — Production axis (auth guards, IDOR, validation, transactions, error modes, file safety, rate limiting) over all 55 API routes + auth plumbing.

Work Log:
- Enumerated all 55 route.ts files and cross-checked guard coverage: every admin/evaluator/applicant route calls requireAdmin/Evaluator/ApplicantFromReq or requireApplicantRow (src/lib/auth.ts:184-214); IDOR ownership verified at applications/[id]/route.ts:22, applicant */[id] routes (row.applicantId !== applicant.id → 404), files/[...path]/route.ts:38. No missing guards found.
- Audited auth plumbing: bcrypt everywhere (login:57, register:55, reset:73), OTP hashed sha256+pepper with TTL/attempts (lib/otp.ts), reset tokens purpose-scoped JWT bound to current password hash (forgot-password:70-76, reset-password:69-71), lockout ladder on login. Found rate-limit key uses spoofable FIRST XFF (api.ts:59-63) vs spoof-resistant LAST entry in auth.ts:26-33 — header rotation evades lockout.
- Found CRITICAL: .env (NEXTAUTH_SECRET) and db/custom.db (live applicant PII + bcrypt hashes) are git-tracked (git ls-files confirms both; .gitignore has no .env rule).
- Found HIGH: auto-apply (auto-apply/route.ts:161-267) runs 5× deleteMany+recreate with no $transaction — mid-loop failure loses profile data. jobs/[id] DELETE deleteMany+delete also non-transactional (jobs/[id]/route.ts:190-192).
- Checked error modes (handleApi envelope matches client.ts ApiClientError), zod validation coverage (all auth/profile/notice/job bodies parsed), files route containment guard (files route:30-34), turnstile chokepoints, schema constraints (User.username/email unique, Application lacks (applicantId,jobId) unique → duplicate-apply race), unbounded evaluator/queue fetch-all, invitations N+1, seed demo creds password123.

Stage Summary:
- 1 CRITICAL + 3 HIGH findings; guards/IDOR/validation/envelope broadly PASS — the axis's real exposure is repo hygiene (secrets+PII in git) and non-transactional destructive writes.
- Worst finding: .env + db/custom.db committed to git — session-signing secret and all applicant PII leak with any repo push.
- Top-3 fixes: (1) purge .env/db from git history + gitignore them, rotate NEXTAUTH_SECRET; (2) wrap auto-apply section replaces (and jobs/[id] cascade) in prisma.$transaction; (3) key login rate-limit on the spoof-resistant LAST XFF entry (or socket IP) and add a DB-backed store.

---
Task ID: 10-a
Agent: Standards-axis audit sub-agent
Task: Two-axis production-readiness review — Standards axis (repo standards + Fowler smell baseline) over RMIS.

Work Log:
- Read worklog Tasks 8/8-b/8-c/8-d/8-e/9 and the documented contracts in file-header blocks: lib/api.ts ("Every route handler is wrapped in handleApi()"), lib/client.ts (apiFetch/apiUpload = the ONE client transport seam), lib/status.ts + lib/status-ui.ts (single status vocabulary), lib/toast.ts, ui/buttons.ts ("Import from here everywhere… call sites never re-type them"), lib/job-meta.ts (dedup precedent), auth.ts (three spec-defined staff-gate chokepoints), section-mutations.ts (§6.3 deep module).
- Verified seam conformance mechanically: 54/55 route.ts use handleApi; zero raw fetch() in components; zero hardcoded transport fallback strings outside lib/client.ts; zero raw status-enum strings in views (all flow through getStatusMeta/STAGE_VARIANT/documentStatusMeta); RMIS_FULL_NAME has one source (remaining literals in layout/footer/notify are the documented intentional exceptions).
- Hot-spot scanned recently-changed areas: profile/** (education/training/awards/eligibility/work-experience/documents/personal-info), shell/**, jobs surfaces, review-workspace/candidates/candidate-detail, and API routes (jobs, jobs/[id], jobs/apply, applicant/{awards,documents,extract,clear,categories}, auth/login, session).
- Found residual duplication clusters: orNull helper copied ×5 in applicant CRUD routes (+ ord: Date.now() ×5); startOfToday ×4 + deadline-open predicate expressed 6× with TWO different semantics (date-only vs timestamp — job-openings-card.tsx:58 drifts from the server gate); document-status union ("UPLOADED|PROCESSING|EXTRACTED|PARTIALLY_EXTRACTED|FAILED") hand-copied in router.ts:110, extract route:24, schema comment, with writers using raw strings and presentation mapping only in status-ui.ts; MQR verdict vocabulary mapped in 3 styles across ui/shell.tsx verdictMeta, review-workspace VERDICT_MEANING + checkChip/checkPill, status-ui variantForVerdict string-sniffing; upload allowlist/10MB mirrored client/server by hand (mqr.shared.ts pattern not used); Role union defined twice (lib/auth.ts:14, lib/router.ts:13); 5 profile sections still re-type the editMode/delete-confirm/header-actions orchestration (Task 41 state clump ×5) and 11 files re-type dlg-cta/dlg-ghost anatomy despite buttons.ts's "never re-type" standard.
- Confirmed repo-endorsed patterns NOT flagged: three staff-gate chokepoints (login:101, session:20, auth.ts:186 — spec-defined), client-side upload validation mirror (documented as backstop design), StatusPill/VerdictPill bridges, String+comment columns in prisma schema (status.ts is the sanctioned mitigation), vendored UploadCN files (scripted shadcn-CLI transform per Task 8-b), pre-existing tsc debt in scripts/, skills/, pds-extract/pds-validate, ui/dialog.
- HARD items: src/app/api/route.ts is the scaffold "Hello, world!" GET with no handleApi (violates api.ts header standard; dead unauthenticated endpoint); buttons.ts re-typed anatomy in 13 call sites across 11 files (violates its own "Import from here everywhere" standard, incl. files that import buttons.ts elsewhere).

Stage Summary:
- Hardest violation: src/app/api/route.ts bypasses the documented handleApi convention (scaffold leftover, ships an unauthenticated 200). Second: ui/buttons.ts anatomy re-typed in 13 sites — the exact drift its header forbids.
- Top smells: deadline-open predicate duplicated 6× with two conflicting semantics (user-visible "Deadline passed" red on a job the apply gate still accepts); document-status vocabulary without its status.ts-style single source (shotgun surgery on any new state); orNull/ord/startOfToday copied across the 5 applicant CRUD routes; Task 41 edit-gate state clump ×5 in profile sections.
- Top-3 fix priorities: (1) unify deadline semantics in lib/job-meta.ts (one jobIsActive/startOfToday) — fixes live behavior drift, cheapest high-leverage; (2) add lib/document-status.ts vocabulary + rewire router.ts/extract/clear/status-ui — removes the only shotgun-surgery surface; (3) delete src/app/api/route.ts + hoist orNull/ord into lib/validation.ts/api.ts, fold the 5-section Task 41 gate into a useSectionEditGate hook — hygiene batch that closes both hard/semi-hard items.

---
Task ID: 10
Agent: Z.ai Code (main)
Task: User — "use the rest of the Matt Pocock skill to make sure that our system is production ready." Applied the REMAINING skill surface beyond Task 8-e: code-review's two-axis review (parallel isolated audit agents + Fowler smell baseline), improve-codebase-architecture's YAGNI hot-spot scoping + deletion test, codebase-design's DESIGN-IT-TWICE (light) for the one new seam, and the skill ecosystem's GLOSSARY.md artifact.

Work Log:
- TWO-AXIS AUDIT (parallel sub-agents, isolated contexts, separate reports): Task 10-a Standards axis (repo standards + smell baseline) and Task 10-b Production axis (all 55 API routes: guards, IDOR, validation, error envelopes, transactions, file safety, rate limiting, secrets). Both appended their sections above.
- VERIFIED CLEAN by the audits (do not re-litigate): every guarded route uses require*FromReq fail-closed; ownership scoping (IDOR) present on all applicant-owned resources; zod on bodies; {error} envelope consistent with lib/client.ts; file route containment + allowlist; bcrypt cost 10; OTP sha256+pepper+TTL+lockout; reset JWT bound to password hash; constant-envelope forgot/resend.
- FIXED — CRITICAL: .env + db/custom.db were TRACKED in git (committed before .env* ignore rule existed; db had no ignore rule) → git rm --cached both, extended .gitignore (db/*.db, *.sqlite, *.sqlite3), rotated NEXTAUTH_SECRET (fresh random value; old sessions/OTPs/reset links invalidated once — expected).
- FIXED — HIGH: silent dev-fallback JWT secret (4 copy-pasted derivation sites) → new lib/secrets.ts with getAppSecret()/getAppSecretText(): NEXTAUTH_SECRET wins, dev fallback warn-once, PRODUCTION FAILS FAST when unset. Rewired jwt.ts, otp.ts, forgot-password, reset-password. Design-it-twice (light): import-time const rejected (env timing + crash-loop), per-site injection rejected (Speculative Generality), lazy zero-param getter chosen.
- FIXED — HIGH: login lockout keyed on FIRST XFF entry (client-spoofable; auth.ts itself documents LAST as spoof-resistant) → lib/api.ts getClientIp now uses the LAST entry; auth.ts's private lastXffIp deleted and delegated (one IP contract for audit + rate-limit + intranet gate).
- FIXED — HIGH: auto-apply delete+recreate of 5 profile sections ran bare (mid-failure stranded half-deleted profile) → one interactive $transaction; resolveEligibilityTitle gained a tx-client param (bare db write inside tx deadlocks SQLite on the write lock); completion gate re-read committed state outside the tx.
- FIXED — HIGH: PROFILE_PICTURE replace deleted old rows/files BEFORE writing the new file (failed upload = no photo at all) → reordered: write file → transactional row swap → best-effort old-file reclaim; failure removes the just-written file, never the user's existing photo.
- FIXED — HIGH: jobs/[id] DELETE cascade (applications then posting) → atomic $transaction.
- FIXED — MEDIUM: duplicate-application race (no DB unique pair by design for re-apply) → apply route re-checks the active-application gate INSIDE the write transaction (SQLite serializes writes → check+create atomic).
- FIXED — LOW: NaN ids hit Prisma as generic 500s → lib/api.ts exports parseId (strict 400); wired into all 5 applicant section [id] routes; 4 identical local parseId copies (jobs/[id], evaluator notice/[id]/email) deleted in favor of the shared one. Live probe: /api/evaluator/applications/garbage → 400 {error:"Invalid id"}.
- FIXED — Standards hard violations: deleted scaffold src/app/api/route.ts (unauthenticated "Hello world" GET violating the handleApi convention; no callers).
- FIXED — deadline predicate drift (the one USER-VISIBLE standards finding): job-openings-card + public-landing (2 sites) used Date.now() while server gates + list filters used date-only startOfToday() → a posting closing TODAY showed red "Deadline passed" while still applyable. One source: lib/job-meta.ts startOfToday/jobDeadlinePassed/jobIsActive; rewired jobs list/detail/apply routes + job-openings-card + jobs-view + applicant-home + public-landing (6 client/server sites → 1 module).
- FIXED — vocabulary single-sourcing: new lib/document-status.ts (DOCUMENT_STATUSES + DOC_STATUS constants; DocumentWire type, extract outcome type, documents/clear/extract writers rewired — was ~5-site shotgun surface); Role union now defined once in lib/router.ts (auth.ts re-exports); upload extension allowlist shared (lib/validation UPLOAD_EXTENSIONS/UPLOAD_ACCEPT — server 415 gate + client accept string from ONE list); orNull hoisted to lib/validation (was ×5 in section routes).
- CREATED GLOSSARY.md — domain vocabulary (Applicant/Application/pipeline/MQR/Snapshot/PDS/Document status/Notice/OTP) + the architecture vocabulary mapping (which lib files are the repo's deep modules), per the skill ecosystem's AI-navigability requirement.
- DOCUMENTED-FOR-LATER (deliberate skips, judgement calls): button-anatomy constants swap ×13 call sites (visual QA per site needed — NOT behavior-preserving); §6.3 edit-gate clump ×5 (useSectionEditGate hook — profile work resumption); MQR verdict meta ×3 mapping sites; Turnstile host-trust hardening (spec control, demo impact); evaluator queue pagination (dataset small; "datasets are small" assumption documented in-route); seed demo credentials (demo system); @@unique partial index for applications (needs migration semantics decision — tx re-check covers it); magic-byte sniffing (mitigated by extension allowlist); contact 200 {submitted:false} (deliberate anti-enumeration shape).
- VERIFICATION (browser + API probes): lint clean; tsc zero errors in src/ (pre-existing pds-extract/pds-validate/ui/dialog debt untouched); dev.log all 2xx. Live: fresh login with ROTATED secret (all roles re-auth path proven); public landing + applicant home render 3 active jobs, no false "Deadline passed" badges, no overflow; education create+delete through the rewired section routes (shared orNull + parseId); document upload through the transactional documents POST (row appeared; extraction correctly persisted DOC_STATUS.FAILED for the stub PDF) + Remove (server row gone); admin dashboard + stats render; garbage-id 400 contract; apply gates a→f exercised live (completion 400 with missing contract, MQR 400 with verdict details); concurrent double-apply blocked at MQR before tx (tx path pattern-verified by the two live $transaction flows above + tsc). All test artifacts removed (education entry, seam-audit.pdf, probe work-experience id 3).

Stage Summary:
- Two-axis review verdict: the route layer is unusually disciplined (54/55 routes on-contract before this pass). Production readiness work shipped: secrets/PII out of git + rotated secret; fail-fast production secret; spoof-resistant lockout keying; four destructive multi-write flows now atomic; NaN 500s → 400s; deadline semantics unified (user-visible correctness fix); four vocabularies single-sourced; scaffold endpoint deleted; GLOSSARY.md added. Remaining recommendations are documented above as deliberate, reasoned skips with their trigger conditions.

---
Task ID: 11
Agent: Z.ai Code (main)
Task: QA fix — "the login page form is not looking great even the sign up… it looks ugly" — redesign the sign-in and sign-up form columns (screenshot: upload/pasted_image_1791967654530.png).

Work Log:
- DIAGNOSED from the live pages (agent-browser @1568×813 + user's full-page screenshot): (a) "Forgot password?" floated alone in dead space between the password field and the submit; (b) two stray centered links ("Create an account" / "Back to vacant positions") dangled under the demo section; (c) demo accounts rendered as a loose border-t section — raw eyebrow + long paragraph, reading as unfinished scaffolding; (d) the sign-up card lacked the sign-in card's gov.ph letterhead eyebrow + hairline (the two cards drifted apart); (e) the brand panel's ghosted-seal watermark sat clipped mid-panel like an accident rather than a deliberate document watermark.
- signin-view.tsx — form polish pass: "Forgot password?" moved UP onto the Password label row (classic sign-in pattern). Implementation: the label row is rendered by the view (flex justify-between) with an external <label htmlFor="signin-password">, because the vendored Input's label prop is string-only (no source edits); the Input drops its label prop and binds via its explicit id — accessible name unchanged. The sign-up cross-link became a proper IN-CARD footer ("New to RMIS? Create an account" behind a hairline, mirroring the sign-up card's footer; h-11 -my-3 keeps a 44px hit area inside a 20px line). "Back to vacant positions" link DELETED — the SiteHeader owns that navigation on every auth page. Demo quick-fill restyled as a quiet fog panel (rounded-2xl border-border/70 bg-fog/60) in the same visual family as AuthSecureStrip: eyebrow "Demo access" + inline "Password: password123" hint, compact 36px capsule chips (unselected: white/80 on fog; selected: dlg-cta), one-line network note. Header comment documents the pass.
- signup-view.tsx — sanctioned-props-only alignment of the SignUpForm card: title is now a two-line node (aria-hidden .eyebrow "Republic of the Philippines · DOST-MIRDC" over the title — both spans phrasing content so the block's <h2> stays valid; accessible name stays "Create your account"), classNames.header carries "border-b border-border/70 pb-4", classNames.footer carries "border-t border-border/70 pt-4", footer "Sign in" link gets the same h-11 -my-3 hit-area treatment. Vendored signup-form.tsx untouched.
- auth-brand-panel.tsx — watermark re-anchored: -bottom-52 -right-14 at logoSize 500 (was -bottom-28 -right-20 @380) so only the seal's crown arcs into the quiet ledger-to-address zone — a deliberate rising-seal watermark; overflow-hidden crops the off-canvas remainder.
- VERIFICATION (agent-browser): desktop 1568×813 — sign-in card tight (forgot inline, footer in-card, demo panel tidy), full-page 923px (110px scroll; card + trust strip fully above the fold), no overflow-x; sign-up card shows eyebrow + both hairlines, matching sign-in anatomy. Mobile 375×700 + tablet 640×800 — no overflow-x, mobile lockup + cards correct. Interactions live: testadmin chip fills identifier+password and flips aria-pressed; "Forgot password?" opens the Reset dialog; real submit → toast "Welcome to RMIS" → #/operations (admin home) → API logout; "Create an account" navigates to #/signup. Forgot-password dialog + OTP card untouched.
- bun run lint clean; dev.log all 2xx (login/logout audit entries correct), zero errors.

Stage Summary:
- Both auth form columns now share one anatomy: white lift card → gov.ph letterhead + hairline header → icon-led capsule fields (forgot link ON the Password label row) → StatefulButton submit → hairline footer cross-link → trust strip; demo access is a matching fog panel. Zero handler/API/validation/copy changes; vendored blocks untouched; brand panel watermark reads as an intentional document convention. Files: signin-view.tsx, signup-view.tsx, auth-brand-panel.tsx.

---
Task ID: 12
Agent: Z.ai Code (main)
Task: QA fix — "on the frontpage the margin on the left and right side is too big when on wider screen".

Work Log:
- DIAGNOSED: the public family sat on a 1200px grid (SiteHeader pill, landing main, jobs board container, PublicShell footer) while the signed-in workspace shell uses the 1600px page max-width — at 1920px that left 360px dead margins per side on the frontpage (measured mainW=1200 at innerW=1920).
- WIDENED the public family to the workspace's 1600px grid: site-header.tsx pill max-w-[1200px]→max-w-[1600px] (comment updated); public-landing.tsx main 1200→1600 + its own <Footer /> → <Footer wide />; jobs-view.tsx anonymous-board container 1200→1600 (shell-contract comment updated; signed-in branch untouched — AppShell main already provides 1600); app-shell.tsx PublicShell <Footer /> → <Footer wide /> so the jobs/contact/auth footer joins the same grid.
- DELIBERATE: contact-view.tsx keeps its own max-w-[1200px] — a focused form page (capsule inputs + 360px sidebar read badly stretched to 1600); it stays centered under the wide floating pill, which is a normal floating-nav pattern.
- VERIFICATION (agent-browser): 1920×1000 — landing main=1600 (160px side margins, was 360), header pill=1600, footer inner container=1600; hero + two-pane explorer + sticky posting pane all use the room; jobs board and contact render correctly at 1920; scrolled state shows footer on the wide grid. Responsive sweep: 1366 (main fills viewport below the cap), 768, 375 — zero overflow-x everywhere. bun run lint clean; dev.log error-free.

Stage Summary:
- Public pages now share ONE page max-width with the workspace: 1600px (header pill, landing, jobs board, all public footers); contact keeps a deliberately narrower 1200px form column. Files: site-header.tsx, public-landing.tsx, jobs-view.tsx, app-shell.tsx (PublicShell).
---
Task ID: 13
Agent: Z.ai Code (main)
Task: MOM compliance audit — user uploaded `upload/Progress-Update-of-RMIS-Oct132026.docx` ("CHECK THE DOC MAKE SURE WE IMPLEMENTED THE REQUIRED UPDATE ON THIS MINUTES OF MEETING"). Verify every required revision from the 2026-10-13 minutes (text + 5 embedded screenshots) against the current codebase; fix the gaps.

Work Log:
- Extracted the DOCX (pandoc + unzip media): the MOM requires (1) Homepage — "Put the new and updated division names" (annotation on the MPRD chip in image1), "Remove DOST-MIRDC" from the posting header (image1), and the official contact block "Visit Us: MIRDC Compound, Gen. Santos Ave. Bicutan 1631… / Call Us: 8837-0431 loc. 440/441 / Email Us: recruitment@mirdc.dost.gov.ph" (image2 + text); (2) Profile — Email Address + Mobile Number always required (image3), Character References marked required before the Education section (image4); (3) backend nodemailer via the recruitment email; (4) Review Queue — auto-email regret letter on rejection, previously-rejected applicants may re-apply with evaluator-facing history; (5) Candidates — "Notes"→"Invitation Details" long text no limit (image5), face-to-face/online toggle for interview AND exam with meeting-link field, bulk-send to shortlisted.
- Compliance audit vs worklog Task 6 + current code: 8 of 10 items ALREADY IMPLEMENTED and re-verified line-by-line — contact-view.tsx carries the exact MOM contact values; notify.ts has RECRUITMENT_EMAIL_ADDRESS (EMAIL_FROM, default recruitment@mirdc.dost.gov.ph) + middleware/resend drivers + deploy/mirdc_middleware (Express+nodemailer); emailRegretLetter/emailShortlisted use the exact MOM wording and applications/[id]/route.ts auto-sends the regret on isRejectedStatus; apply route 409s only on ACTIVE applications + jobs-view "Re-apply" + queue/workspace priorRejections surfaces; personal-info-section Email isEmailShape + Mobile required; profile-view requestSection gates section 02 on ≥1 saved Character Reference; NoticeFormDialog has the Face-to-Face/Online radio, meeting-link field, "Invitation Details" textarea (no client maxLength); validation noticeSchema mode/meetingLink + bulkNoticeSchema; POST /api/evaluator/applications/invitations bulk fan-out.
- GAP 1 (division names): DIVISIONS still held the abolished structure (MPRD, TSSS, "Testing Services Division", "Policy and Planning", "Power and Energy", AMMRDD without "and Development"). Resolved the authoritative updated list from mirdc.dost.gov.ph/key-officials via page_reader: PMD Planning and Management · FAD Finance and Administrative · ATD Analysis and Testing · TDD Technology Diffusion · TSD Technology Solutions · AMMRDD Advanced Manufacturing and Materials Research and Development · PERDD Product and Equipment Research and Development (7 divisions). Rewrote DIVISIONS in src/lib/constants.ts (with MOM-provenance comment) + added divisionFullName() (name-only display helper).
- GAP 2 ("Remove DOST-MIRDC"): public-landing posting pane still showed the "DOST-MIRDC ✓(verified agency)" row. Removed the span + BadgeCheck (import pruned), kept "View all jobs"; cards + posting meta rows now render divisionFullName(job.position.division) so the public board reads full updated names; card agency fallback ("DOST-MIRDC") only fires for division-less positions.
- Data migration: prisma/seed.ts positionDefs MPRD→AMMRDD (Supervising SSRS) + TSD→ATD (Science Research Specialist I / Metrology) with comments; live db/custom.db remapped in dependency-safe order (TSD→ATD first, TSSS→TSD, MPRD→AMMRDD; verified 0 abolished codes remain; FAD/AMMRDD rows unchanged — same codes, names flow from constants).
- Invitation Details bound tightened toward the MOM "no character limit": noticeSchema notes 4,000→20,000 (server abuse guard; input + SQLite TEXT stay unlimited).
- Verification (agent-browser): desktop 1920×1080 home — posting pane header is title + "View all jobs" only (DOM sweep: the only visible "DOST-MIRDC" strings left are the footer privacy notice and a devtools script tag), card + meta rows read "Finance and Administrative Division" / "Analysis and Testing Division" / "Advanced Manufacturing and Materials Research and Development Division"; #/vacant-positions board division filter shows AMMRDD/ATD/FAD only; #/contact contains all three MOM contact values and zero old ones (hr@mirdc.gov.ph gone), no horizontal overflow; mobile 375×700 home + detail — full division names wrap cleanly, no overflow, "View all jobs" present after card select; signed-in testadmin — recruitment Create Job division combobox lists the new official divisions (PMD Planning and Management…, FAD…, ATD…), job rows show remapped codes; Review queue renders, /api/evaluator/queue rows carry priorRejections, invitations route present (405 on HEAD = POST-only, expected). bun run lint clean; dev.log all 2xx, zero errors.

Stage Summary:
- MOM 2026-10-13 is now FULLY implemented: 8 items were already in place from Task 6 (re-verified end-to-end), and the two missing Homepage revisions — updated MIRDC division names (constants + seed + live DB migration) and the removal of the DOST-MIRDC line from the posting header — are fixed and browser-verified at 1920/375 widths, plus the invitation-details server bound was raised to honor the "no character limit" requirement.
---
Task ID: 14
Agent: Z.ai Code (main)
Task: User request — "add like test seed data so that you can test all the flow from applicant to evaluator to admin all their steps" — a full-coverage demo dataset in prisma/seed.ts so every role's every screen has realistic, sign-in-testable data.

Work Log:
- Studied schema + role surfaces first (User/Applicant/7 profile sections/Position/JobPosting/Application/Notification/EmailLog/SmsLog/AuditLog/Document/ContactRequest; status pipeline Applied→Under Review→Shortlisted→Rejected+Withdrawn; evaluator queue/dossier + notice history derived from email_logs; admin users/settings tabs; files served from upload/<applicantId>/<uuid>.<ext>).
- Extended prisma/seed.ts with a "Task 14 — full-flow demo dataset" section (all idempotent): ensureDemoApplicant (user+applicant+7 profile sections, meaningful-row guards), ensureDemoApplication (active-first lookup, force-normalizes canonical statuses, writes frozen snapshots), ensureReapplyPair (MOM rejected→re-applied pair), ensureEmail/ensureSms (rows built from the REAL templates imported from @/lib/notify so every ledger row carries the exact live wording), ensureNotification, ensureDocument (writes REAL minimal-valid one-page PDFs into upload/<id>/ so previews render), ensureAudit (app action vocabulary), ensureContactRequest.
- New accounts (all password123): carlo.reyes (Applied SRS I + Withdrawn Admin Asst I), ana.lim (Under Review on the CLOSED Electronics posting + Withdrawn Supervising), james.mendoza (Rejected SRS I + Applied on Electronics with TWO prior rejection cycles → "Previously rejected ×2"), grace.villanueva (Shortlisted on Supervising + SRS I; skills-exam notice + interview notice; 2 documents), paolo.garcia (Shortlisted Supervising; ONLINE interview notice with meeting link), liza.fernandez (INCOMPLETE profile — apply-gate demo), roberto.dizon (walk-in WITHOUT login — admin applicants list). testapplicant gained a complete profile (BSIT College+Secondary, CSP 2nd + Sub-Pro eligibilities, 3.2y experience, 96h training, character reference, CoE document) and keeps ZERO applications so the apply flow can be run live. maria.santos completed the MOM story: Admin Asst I #3 Rejected (regret letter) + #4 re-applied; PDS EXTRACTED (quality 92) + Diploma + Certificates documents.
- Canonical matrix: 16 applications spanning Applied(5) / Under Review(2) / Shortlisted(4) / Rejected(5) / Withdrawn(2 incl.) — bulk cohorts of 2 shortlisted on BOTH SRS I and Supervising; 20 email + 14 SMS ledger rows (regret letters MOM-exact, shortlist notices, interview + skills-exam invitations incl. online-mode, application-received); notifications per applicant; 10 audit rows (LOGIN_SUCCESS, JOB_POSTING_CREATED, APPLICATION_SUBMITTED ×3 incl. walk-in, APPLICATION_STATUS_CHANGED ×2, NOTICES_BULK_SENT, NOTICE_SENT, DOCUMENT_UPLOADED, PROFILE_COMPLETED); 3 contact requests (2 OPEN, 1 RESOLVED handled by admin).
- Idempotency bugs found by re-running and fixed: (a) james historical rejections were raw creates → duplicated after the crashed first run (now deduped by reason+pair, dups purged); (b) the ORIGINAL seed's maria notification createMany duplicated every run → deduped by description (+ DB dedupe keeping earliest); (c) testapplicant had a leftover all-null-ish education row (schoolName only, no level/course) that blocked section seeding AND failed the MQR gate → ensureDemoApplicant now purges noise rows (educationLevel AND course AND degree AND specifyOthers all null) before counting meaningful rows. Verified: re-running the seed twice leaves Application=16 / Notification=18 / EmailLog=20 / SmsLog=14 / Document=10 / AuditLog=91(+live) / ContactRequest=3 stable.
- Verification (agent-browser, all live): testapplicant — dashboard 0 applications + 100% profile, applied to Science Research Specialist I through the REAL dialog (first attempt exposed the MQR gate failing on the garbage education row → fixed by the seed; second attempt: "Application submitted — We received your application…", My Applications count → 1). testevaluator — Review Queue 17 applications, stage filters Applied 5 / Under Review 2 / Shortlisted 4 / Rejected 6, "Send interview invitations (4)" bulk action, "Previously rejected ×2" chip on James's active row (×1 on his historical rejected rows), workspace dossier shows the amber prior-rejection banner ("2 earlier applications… last applied Sep 24, 2026"), bulk dialog shows MOM rework (Setup mode Face-to-Face/Online toggle → meeting-link field replaces Venue, "Invitation Details — Long text — no character limit."). testadmin — dashboard (AWAITING REVIEW 5, INCOMPLETE PROFILES 1 = liza, active jobs with application counts), Users & Security 10/10 accounts, Email Notices (regret/shortlist/interview/exam/received subjects all present), Contact Requests (all 3), Audit Log 98 events with the seeded action vocabulary. maria.santos — dashboard: 4 applications, timeline shows NO.01 Admin Asst I Submitted (the re-apply) and NO.02 Admin Asst I Not Selected with the 3-step tracker; Applied chips on the job board. bun run lint clean; dev.log all 2xx, zero runtime errors.

Stage Summary:
- The seed now ships a complete, self-resetting demo world: every stage of the pipeline, every MOM surface (re-apply pair, prior-rejection chips/banner, bulk cohorts, Invitation Details, online-mode notices), and realistic ledgers — sign in as any of the 10 accounts (password123) and every screen has data. testapplicant is the designated "blank slate" for running the apply flow live; liza.fernandez demonstrates the incomplete-profile gate; roberto.dizon is the no-login walk-in record.

---
Task ID: 15
Agent: Z.ai Code (main)
Task: User QA — "on the frontpage its ugly to have a duplicate logo below the job opportunities because we already have dost logo at the header" — remove the duplicated DOST-MIRDC emblem from the landing hero.

Work Log:
- Located the duplication: site-header.tsx renders BrandLogo(32px) + RMIS full name in the sticky glass capsule; public-landing.tsx hero ("Job Opportunities") rendered BrandLogo(36px) again ~40px below it as an "institutional proof strip".
- Checked the other BrandLogo call sites to scope the fix: jobs-view.tsx:249 is the per-job-card company-logo chip (intentional job-board pattern, not under the heading), auth panels/nav-rail are separate surfaces — only the frontpage hero was the duplicate.
- public-landing.tsx: removed the <BrandLogo logoSize={36} tone="light" /> element from the hero proof strip, kept the agency-name line "Metals Industry Research and Development Center" (not shown in the header, so no information lost), dropped the now-unused BrandLogo import, updated both explanatory comments.
- Verified (agent-browser): 1920×1080 — hero img count = 0, header brand imgs = 1, agency text intact, screenshot clean; 375×700 — hero img count = 0, no horizontal overflow, screenshot clean (header seal remains the sole brand anchor on mobile where the header text is hidden). bun run lint clean; dev.log all 2xx, hot recompile OK, zero runtime errors.

Stage Summary:
- The frontpage hero now reads: "Job Opportunities" heading → agency name text line → CTA capsule; the DOST-MIRDC emblem appears exactly once on the surface (sticky header). Single-file fix (public-landing.tsx); no API/DB changes.

---
Task ID: 16
Agent: Z.ai Code (main)
Task: User QA — "update the 'Previously rejected ×2' into status for much better approach and put it before the '100%'" — promote the prior-rejection indicator from a bottom credential tag to a first-class status badge positioned before the match-percentage badge.

Work Log:
- Ground-truthed the surfaces: the "100%" exists only on kanban cards (MatchBadge in row 1); the "Previously rejected ×N" chip sat as (a) a trailing credential TAG on kanban cards, (b) a 3rd line crammed under name/email in the desktop list Candidate cell, (c) the same in the mobile Candidate cell where the 148px chip measurably overflowed its 106px column.
- New shared primitive PriorRejectionPill in ui/shell.tsx (amber warn tone, History glyph, aria-label with full wording; label compacts to "Rejected ×N" under sm so it fits the 134px mobile Status column).
- KanbanCardBody (ui/kanban.tsx) gained a sanctioned statusFlag slot: when present, the match badge moves onto the flag's own status line immediately AFTER it — the flag reads directly before the "100%" badge; cards without a flag render byte-identical to before (badge stays top-right).
- review-queue.tsx rewired: kanban cards pass statusFlag instead of appending to tags (frees a MAX_TAGS slot for real credentials); desktop + mobile list rows render the pill stacked under the StatusPill in the Status column; desktop Status column widened 130→184px (fixed budget ~564px, still fits the 960px card); candidate cells on both breakpoints are clean 2-line cells again. Removed the now-unused History import.
- Hit and fixed a JSX parsing error: a {/* */} comment between attributes parses as an empty spread — moved it inside the statusFlag expression as // lines.
- Verified (agent-browser, testevaluator): desktop list — Status cell "Rejected | Previously rejected ×1" stacked, pill 151px in 184px column, candidate cell clean, no page overflow; kanban — all 4 flagged cards show pill + "100%" on the same line with pill.before(badge) true (James's active row "Previously rejected ×2" → "100%"); mobile 375px — compact "Rejected ×1" 96px fits 134px cell, no overflow; Candidates board (other KanbanCardBody consumer) — zero flag pills, unchanged. bun run lint clean; dev.log all 2xx.

Stage Summary:
- The prior-rejection signal is now a status badge everywhere: kanban [Previously rejected ×N][100%] status line, list Status-column stack, mobile-safe compact label. One shared pill + one optional slot on the shared card body; the job-workspace/candidates boards are untouched.

---
Task ID: 17
Agent: Z.ai Code (main)
Task: User QA — on the kanban card replace the two meta lines ("Electronics Technician (Contract Of Service)" + "Human Resource Development Unit") with a single "Applying for {Position Title} Position" sentence.

Work Log:
- Edited the shared KanbanCardBody (ui/kanban.tsx): removed the placeOfAssignment prop, the position meta is now one Building2-anchored line "Applying for {position} Position" with line-clamp-2 (long titles wrap to 2 lines instead of hard-truncating); MapPin import dropped; JSDoc updated with the user-QA rationale (place-of-assignment detail stays in the review dossier).
- Updated all three callers (review-queue.tsx, job-workspace.tsx, candidates.tsx): removed the prop and the now-unused `place` locals.
- Verified (agent-browser): review-queue kanban — James's card reads "James Mendoza / [Previously rejected ×2][100%] / Applying for Electronics Technician (Contract Of Service)… / Applied 2 weeks ago / BS Electrical Engineering"; Roberto Dizon's card shows the user's literal example "Applying for Administrative Assistant I Position"; candidates kanban — 14 cards on the new format; admin #/job?id=1 pipeline — 8 cards on the new format; no horizontal overflow anywhere. bun run lint clean; dev.log all 2xx.

Stage Summary:
- Every staff kanban board (review queue, candidates registry, per-job pipeline) now presents the position as a single "Applying for … Position" sentence — one meta line instead of two; the prior-rejection flag → "100%" status line from Task 16 is preserved above it.

---
Task ID: 1
Agent: Z.ai Code (main)
Task: Clone https://github.com/mi7sudev/FINAL-RMIS.git, make it our own project, and run it

Work Log:
- Cloned FINAL-RMIS repo to /home/z/FINAL-RMIS and audited its stack (Next.js 16 App Router, Prisma/SQLite, hash-router SPA, shadcn/ui)
- Stopped the old scaffold dev server; rsync-mirrored the repo into /home/z/my-project (excluding .git, .env, node_modules, .next, db, skills) so the workspace keeps its own git identity; removed origin remote
- Diagnosed sandbox quirk: a global DATABASE_URL env var (file:/home/z/my-project/db/custom.db) overrides .env — aligned .env on custom.db accordingly
- Wrote .env: absolute DATABASE_URL, generated 64-hex NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000, UPLOAD_DIR, EMAIL_PROVIDER/SMS_PROVIDER=mock, INTRANET_ENFORCEMENT=off (dev)
- bun install (358 pkgs); prisma db push + generate; seeded via `bun prisma/seed.ts` (demo accounts, positions, postings, applications)
- Started `bun run dev` in background (port 3000, ~300ms ready)
- Agent Browser end-to-end verification: public job board, admin sign-in → dashboard (8 applicants / 3 jobs / 16 applications), Review Queue (16 rows, status chips, MQR verdicts), applicant sign-in → portal home + 86% profile + PDS 7-step profile view, mobile iPhone-14 layout + bottom tab bar, footer pushed naturally below content
- Noted for future automation: the custom motion buttons ignore Playwright synthetic clicks — use form.requestSubmit()/JS click in agent-browser flows
- bun run lint clean; dev.log free of runtime errors; committed as "Import FINAL-RMIS (RMIS 2.0)"

Stage Summary:
- RMIS 2.0 is now our own project at /home/z/my-project, fully seeded and verified running on port 3000
- Demo logins (password123): testadmin (ADMIN) / testevaluator (EVALUATOR) / testapplicant + persona applicants
- Env: mock email/SMS (logged to DB), intranet gate off, z-ai-web-dev-sdk wired for scanned-PDF/resume extraction

---
Task ID: 2
Agent: Z.ai Code (main)
Task: Update the header logo to the uploaded mirdc-logo.png

Work Log:
- Verified upload at /home/z/my-project/upload/mirdc-logo.png (898×529 RGBA, transparent background) — contains two variants: plain quatrefoil pattern (left) and the complete seal with MIRDC gear crest (right)
- Probed pixel bounds with sharp: right emblem spans x453-835, y63-445 → exactly 383×383, matching the current mark's canonical square format
- Cropped the right (gear-crest) emblem and replaced public/MIRDC-mark.png (old file backed up to /tmp/MIRDC-mark-backup.png); original upload left untouched
- No code changes required — both call sites (brand-logo.tsx header/nav/auth lockups + layout.tsx favicon) serve the replaced file; updated the brand-logo.tsx doc comment to describe the new mark
- Agent Browser verified all placements: public header (22px crisp), sign-in brand panel, signed-in nav rail, mobile (iPhone 14) header, favicon (200, 35750 bytes = new asset)
- Committed the change

Stage Summary:
- Header logo (and favicon) now uses the uploaded MIRDC seal; all render paths verified in browser on desktop + mobile

---
Task ID: 3
Agent: Z.ai Code (main)
Task: Use uploaded LoginPageBg.jfif as the login page left-panel background

Work Log:
- Inspected upload: 2560x1570 progressive JPEG — photo of the MIRDC building signage (seal + wordmark on gray-blue facade with diagonal light streaks)
- Installed as public/mirdc-building.jpg
- Rewrote AuthBrandPanel (shared by sign-in / sign-up): photo backdrop (object-cover, 25% framing bias so the facade signage stays in crop), ink-blue scrim gradient (0.93→0.30 left-to-right) for text contrast, all panel text remapped ink→white opacities, .eyebrow rows restated with white utilities (token pins --stone), lockup seal on a porcelain chip (black quadrants need separation on photography), watermark inverted to porcelain at 0.08
- Agent Browser verified: sign-in (1440x900 + narrow), sign-up, reset-password (standalone layout, unaffected), mobile iPhone 14 (light card style preserved, panel is lg+ only); footer sticky behavior intact; lint clean
- Committed the change

Stage Summary:
- Login/signup left panel now carries the MIRDC building photograph with institutional white-on-scrim typography; mobile auth unchanged

---
Task ID: 3
Agent: Z.ai Code (main agent)
Task: Fix the MIRDC logo not fitting properly on the header.

Work Log:
- Diagnosed: `public/MIRDC-mark.png` was a zero-padding crop of the uploaded source's right variant (artwork touching all 4 canvas edges). At header size (32px) the quatrefoil read as cramped/clipped, and the seal's white center square melted into the white glass capsule so the gear crest appeared to float on the pinwheel.
- Verified pixel-exactness first: diffed current asset vs a fresh tight crop of `upload/mirdc-logo.png` (0 differing pixels), and measured both variants' alpha bboxes by scanning column ink (left variant x45..425, right/gear variant exactly 383×383 at (453,63)).
- Rebuilt `public/MIRDC-mark.png`: native 383×383 artwork centered on a 448×448 transparent canvas (~7.25% padding per side), no interpolation. Backup of previous asset at /tmp/MIRDC-mark-v2-backup.png.
- Updated `site-header.tsx` brand lockup: mark 32→36px mounted on the porcelain-chip convention already used by jobs board cards + auth brand panel (rounded-full chip, hairline `border-divider/70`, soft shadow) so the emblem gets a defined footprint echoing the 84px-radius pill.
- Browser-verified every surface sharing the asset: desktop header, mobile header (iPhone 14), sign-in brand panel chip + inverted watermark + mobile lockup, vacant-positions job-card chips, desktop rail brand row, mobile workspace strip. Favicon shares the padded file (bonus).
- Removed one-off measurement scripts; `bun run lint` clean; dev.log shows no runtime errors (all API 200).
- Committed as a938e2a "Fix header brand mark fit: padded seal canvas + porcelain chip mount".

Stage Summary:
- Header logo now renders as a complete, centered seal on a defined circular chip; the padded asset improves every BrandLogo call site and the favicon with zero code changes elsewhere.

---
Task ID: 4
Agent: Z.ai Code (main agent)
Task: Header must show the complete two-logo composition from upload/mirdc-logo.png (user: "it composed of two logo but i only see one logo on the header").

Work Log:
- Re-read the user's clarification: upload/mirdc-logo.png is a TWO-logo lockup (plain DOST quatrefoil left + MIRDC gear-crest seal right); the header was only rendering the right variant, which is what the user was reporting since the "did not fit properly" message.
- Built public/MIRDC-header-logo.png (823x415): full ink bbox of the composition (x45..835, y63..445 -> 791x383) extracted from the upload, symmetric 16px transparent padding, no interpolation.
- site-header.tsx: replaced the single-seal BrandLogo chip with the wide two-logo image (height 40px, w-auto, floating on the capsule like the artwork on white paper); removed the now-unused BrandLogo import.
- Kept the single square seal (MIRDC-mark.png, padded in Task 3) for favicon, workspace rails, job cards and auth surfaces.
- Browser-verified (fresh public session): desktop header shows both marks crisply; iPhone 14 mobile capsule shows the lockup next to nav + Sign in. lint clean, dev.log clean.
- Committed as "Show complete two-logo composition in the header".

Stage Summary:
- Header now faithfully carries the agency's two-logo artwork; single-seal asset remains for compact brand contexts.
