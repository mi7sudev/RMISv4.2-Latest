# RMIS v4.1 — Deploy Bundle r5 (2026-10-12)

**CODE-ONLY bundle — contains NO `db/` and NO `upload/`.** Same safety rule
as r4: extracting over a live deployment never touches the production
database or uploaded documents.

r4 → r5 is a wide consolidation release: the client tree was restructured
onto the BEUI design system, the status/badge vocabulary became
single-source, and the auth/public/applicant surfaces gained new flows.
Headlines:

## Status system: one badge language, BEUI motion
- New `src/components/motion/*` BEUI library (AnimatedBadge, Alert, button
  family, card, checkbox/radio/switch/select, date-range-picker, file/OTP
  inputs, morphing popover/modal, editable table, tooltips, tabs, toasts)
  and `src/components/ui/shell.tsx` as the single-source shell primitives
  (PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, pagination,
  skeletons, RichSection…).
- Every status chip in the system — applicant journey, review queue, staff
  tables, pipeline dots, verdict and document pills — speaks ONE mapping:
  `src/lib/status-ui.ts`. Status changes roll with spring motion instead of
  popping.
- The in-review family (Under Review / Screening / Evaluation / Interview)
  renders as the brand-blue info chip everywhere; the amber warning
  triangle (orange danger sign) is gone from every surface.
- Application Progress card: the "In Review" badge now wears the BEUI
  syncing badge — spinning loader + breathing blue tint, label stays "In
  Review". The looping motion is CSS-compositor owned (`animate-spin` +
  `badge-pulse` keyframes in globals.css), so it cannot freeze mid-flight.

## Applicant portal
- Mini profile card wears the same sky gradient as the frontpage "Job
  Opportunities" block.
- Journey cards carry the checkpoint timeline, next-step hint and the full
  detail modal (§7.7) with MQR ledger; saved-jobs bookmarks are shared with
  the public board.
- Sticky footer pinned across every view at every scroll depth (mobile
  safe-area aware); new mobile tab bar, notifications panel and ⌘K command
  menu.

## Auth & account
- Unified brand panel on sign-in AND create-account; CAPTCHA gate
  (`/api/auth/captcha` + turnstile); forgot-password → OTP verify →
  reset-password flow (`/api/auth/forgot-password`, `/verify-otp`,
  `/reset-password`, `/resend-otp`) plus `/api/auth/change-password`.
- First-visit onboarding tour reworked onto the new shell
  (`src/components/onboarding-tour.tsx`).

## Public site, contact & PDS pipeline
- Contact/inquiry pipeline: `/api/contact` → admin Contact Requests view →
  `/api/admin/sms` notify route.
- PDS auto-fill: xlsx extraction + validation (`src/lib/pds-extract.ts`,
  `src/lib/pds-validate.ts`, `/api/applicant/documents/extract`).

## Restructure & hygiene
- `workspaces/*`, `dash/*` and the legacy shadcn primitive pile were
  replaced by the `views/*` + `motion/*` + `ui/shell.tsx` layout; ~200 dead
  files removed.
- `db-schema.txt` regenerated from the current 20-table Prisma schema.
- `prisma/seed.ts` added to the bundle.

## Deploy (server rmis-mirdc, live root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
cd /home/rmis-mirdc/Desktop/RMISv4.1          # confirm with: pm2 describe rmis | grep -i cwd
tar -xzf rmis-deploy-2026-10-12.tar.gz -C .   # code-only — no db/upload risk
npm install
npx prisma generate        # generate ONLY — never db push
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
```

Then hard-refresh the browser (Ctrl+Shift+R).

## Carried from r4 (unchanged)

Onboarding tour, job-form Item No. + Plantilla single-vacancy rule, light
mode by default. r4 = r3 + tour + item-no + light-default; r3 = r2 + auth
brand panel + header scroll-pulse fix; r2 = r1 + standalone-path ENOENT fix
+ Fast-Track removal + DEPLOYMENT.md §0.

# RMIS v4.1 — Deploy Bundle r4 (2026-09-30)

**CODE-ONLY bundle — contains NO `db/` and NO `upload/`.** Safe to extract
over a live deployment: your production database and uploaded documents are
never touched. (r1–r3 shipped a seed `db/custom.db` and upload fixtures;
extracting those over a live root overwrites real data — this revision
removes that footgun entirely.)

## New feature: first-visit onboarding tour (all roles)

Once per user, auto-opens ~1s after they land on their home view after
sign-in; any dismissal (X, Esc, or Finish) permanently marks it as seen for
that user on that browser. New: `src/components/ui/tour.tsx` (spotlight
tour — follows scroll, keyboard Esc/←/→, reduced-motion aware, viewport-
clamped card) and `src/components/onboarding/onboarding-tour.tsx`
(per-user/per-surface gating, waits for targets to mount).

- Applicant (`applicant-home.tsx`): welcome → Complete Your Profile (only
  while the profile is incomplete) → Open Positions → Your Applications.
- Admin (`admin/dashboard.tsx`): welcome → Needs Attention → Active
  Recruitment → Latest Applications.
- Evaluator (`dash/views/queue.tsx`): welcome (+ Qualified-only switch) →
  Pipeline/List view tabs → Evaluate Applications. The legacy
  `workspaces/evaluator/review-queue.tsx` is dead code (imported nowhere)
  and was left untouched.
- `dash/kit.tsx`: `Panel` now accepts an optional `id` (backwards-compatible).
- Profile page (applicant, `views/profile-view.tsx`): a 4th tour surface —
  Your Applicant Record → Profile completeness (three-state copy: complete /
  ready-to-mark-complete / which sections are still required) → Auto-Fill
  upload → section navigation. Picks the right nav anchor for desktop vs
  mobile viewports; the spotlight treats hidden responsive twins as missing
  targets (no corner-hole artifacts).

## Job form: Item No. field + Plantilla single-vacancy rule

The create/edit job dialogs had no way to enter the CSC **Item No.** —
every web-created position had `item_number` NULL, even though the job
detail header already printed "Item No. {…}". And vacancy counts were a
free field regardless of employment type.

- Both dialogs (recruitment list `JobFormDialog` + job workspace
  `JobEditDialog`): new **Item No.** input paired with Number of Vacancies.
- **Plantilla / Permanent** (CSC registry synonym): vacancies locked at
  **1** (input disabled, snapped on type change) and Item No. required —
  "each CSC item authorizes one position". Create is blocked until the
  item number is filled; the edit dialog lets you backfill an old
  plantilla job on save.
- **COS / Job Order / Contractual / Temporary** (needs-based): vacancies
  freely editable (default 1), Item No. optional — "usually none".
- Wire-through: `lib/validation.ts` (+`itemNumber`), `POST /api/jobs` +
  `PATCH /api/jobs/[id]` persist it to the position master row
  (create AND edit-backfill). No schema migration — the column existed.
- Public job board and applicant detail views already read
  `position.itemNumber`, so posted plantilla jobs now show their item no.
  everywhere with zero extra work.

## Light mode by default

The app opened on the obsidian (dark) sheet for every browser with no
saved choice (`defaultTheme="dark"`). Now the light sheet is the default:
- `providers/theme-provider.tsx`: `defaultTheme="light"` — OS preference
  stays deliberately ignored (`enableSystem` off) so the default is
  deterministic; the nav toggle remains the single source of truth and a
  user's saved "dark" survives the update (by design).
- `app/layout.tsx`: mobile browser-chrome `themeColor` pinned to the light
  canvas (#F7F8FA) to match what first-open visitors actually see.
- `ui/sonner.tsx`: pre-hydration toast fallback dark → light (cosmetic).

## Carried from r3 (unchanged)

r3 = r2 + two UI fixes: unified auth-page brand hero ("Molding the future
of metal industries" in BOTH sign-in and create-account) and the header
scroll-pulse fix (hysteresis thresholds 64/24). r2 = r1 + Task 40
(standalone-path ENOENT fix) + Task 42 (Fast-Track removal) + DEPLOYMENT.md §0.

## Deploy (server rmis-mirdc, live root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
cd /home/rmis-mirdc/Desktop/RMISv4.1          # confirm with: pm2 describe rmis | grep -i cwd
tar -xzf rmis-deploy-2026-09-29.tar.gz -C .   # code-only — no db/upload risk
npm install
npx prisma generate        # generate ONLY — never db push
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
```

Then hard-refresh the browser (Ctrl+Shift+R). Sign in with an account that
has not seen the tour yet (or clear the `rmis-onboarding-*` localStorage
keys to replay it).

---

# RMIS v4.1 — Deploy Bundle r3 (2026-09-29)

Update to r2. Seed database, upload fixtures and backend code UNCHANGED —
this revision ships two UI fixes on top of r2:

## 1. Auth page — unified brand panel (sign-in AND create-account)
- `src/components/views/signin-view.tsx` — the desktop right-side brand
  column now shows the SAME "Molding the future of metal industries" hero
  in both modes. The create-account variant ("RMIS — Applicant
  registration / Join MIRDC. …") was removed per user feedback.

## 2. Header scroll "pulse" fix (hysteresis)
- `src/components/site-header.tsx` — the condense-on-scroll header used a
  single 40px threshold; on short pages (auth) scroll clamping near the
  page bottom re-crossed it, oscillating condense/expand = the reported
  "pulsing". Now: condense at scrollY > 64px, expand only below 24px —
  the 40px hysteresis gap exceeds the ~20px condense height delta, so the
  feedback loop is impossible; plus mount-time sync for pre-scrolled
  reloads.

---

# RMIS v4.1 — Deploy Bundle r2 (2026-09-29)

Update to `rmis-deploy-2026-09-29.tar.gz` (r1). The tested seed database
(`db/custom.db`) and `upload/` fixtures are UNCHANGED from r1 — only source
code and documentation moved.

## Changes included (r1 → r2)

### 1. Standalone-path fix (production ENOENT on uploads/extraction)
Under pm2 the standalone server runs with CWD = `.next/standalone`, so every
path built from `process.cwd()` pointed inside the build output and broke
after rebuild. All document/secondary-DB paths are now resolved from stable
anchors:

- `src/lib/env.ts` — new helpers: `appRoot()` (cwd-independent anchor via the
  absolute DATABASE_URL), `resolveStoredDocPath()` (resolves stored
  `upload/...` metas against `UPLOAD_DIR`), plus `sqliteFilePath()`.
- `src/app/api/applicant/documents/[id]/route.ts` — document delete unlink
  now uses `resolveStoredDocPath()`.
- `src/app/api/applicant/documents/extract/route.ts` — extraction file read
  now uses `resolveStoredDocPath()`.
- `src/lib/documents.ts` — cleanup unlink now uses `resolveStoredDocPath()`.
- `src/lib/audit-db.ts`, `src/lib/notification-db.ts` — audit.db /
  notifications.db now anchored to `appRoot()/db/` instead of CWD.

### 2. Removed "Fast-Track Apply · PDS Auto-Fill"
- DELETED `src/components/views/fast-track-apply-dialog.tsx` (entire
  upload→extract→auto-apply→MQR in-dialog flow).
- `src/components/apply/apply-flow.tsx`, `src/components/views/jobs-view.tsx`
  — incomplete applicants now get a standard "Finish Your Profile First"
  dialog (government profile-completeness rule) with "Go to My Profile".
- `src/components/views/upload-pds-card.tsx` — profile upload card now
  recommends the Excel (.xlsx) PDS (CS Form 212) — it extracts best.
- Comment hygiene: `src/app/api/jobs/apply/route.ts`,
  `src/app/api/applicant/profile/complete/route.ts`,
  `src/lib/profile-completeness.ts`,
  `src/components/workspaces/applicant/applicant-home.tsx`.
- Backend routes `/api/applicant/profile/auto-apply` and
  `/api/applicant/profile/complete` remain (still used / dormant-valid).

### 3. Documentation
- `DEPLOYMENT.md` — new §0 "AS-EXECUTED PRODUCTION CONFIGURATION" recording
  the live deployment (host, pm2, .env keys, hard-learned rules).

## Deploy steps (server rmis-mirdc, app root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
# 1. Back up current state, then extract this bundle over the app root
tar -xzf rmis-deploy-2026-09-29.tar.gz -C /home/rmis-mirdc/Desktop/RMISv4.1

# 2. Install + build (Node 22 + npm; NO bun on this box)
cd /home/rmis-mirdc/Desktop/RMISv4.1
npm install
npx prisma generate        # generate ONLY — db push is FORBIDDEN against production-data.db
npm run build
cp .env .next/standalone/.env
pm2 restart rmis

# 3. Smoke test
# - applicant upload (.xlsx PDS) → extract → delete document: no ENOENT
# - incomplete applicant clicks Apply → "Finish Your Profile First" dialog
# - audit log + notifications still populate (appRoot-anchored DBs)
```

Do NOT overwrite the server's `db/production-data.db` or `upload/` with
bundle contents — this bundle's `db/custom.db` is the tested SEED for fresh
installs only.

## Known issue NOT addressed by code (edge-side, not app-side)

External-device uploads returning "You do not have permission to perform
this action." are caused by Cloudflare edge security (IP-reputation bot
blocking) returning 403 HTML pages before requests reach this app — proven
by direct probing on 2026-09-29. Fix lives in the registrar/Cloudflare
panel (disable the blocking security feature) — see chat worklog Task 43.
