# RMIS — Domain Glossary

Shared vocabulary for the Recruitment Management Information System. Use these
exact names in code, comments, PRs, and architecture discussions — seams get
named after domain concepts, not after implementation shapes ("the Application
intake module", never "the ApplicationService").

## People & access

- **Applicant** — a User with role `APPLICANT` plus an `Applicant` profile row
  (1:1). Owns profile sections, documents, applications.
- **Evaluator** — staff role `EVALUATOR`; scores applications in the Review
  Queue. **Admin** — staff role `ADMIN`; full operations + settings.
- **Staff gate / intranet tier** — the spec §2.2 network classification
  (private/loopback/CGNAT/link-local = intranet; **LAST** XFF entry is
  authoritative) enforced at three chokepoints: login, session, requireRole.

## Recruitment core

- **Job Posting** (`JobPosting`) — one vacancy listing; deadline-gated,
  publish-gated. **Position** — the qualifying record linked to a posting
  (salary grade, MQR requirements, place of assignment).
- **Application** — an Applicant ↔ JobPosting pairing entering the
  **pipeline**: `Applied → Under Review → Shortlisted → Rejected`
  (vocabulary: `lib/status.ts`). **Active application** — still occupies the
  pipeline, blocks a duplicate apply. **Terminal** (Rejected/Declined/
  Withdrawn) — frees the applicant to **re-apply** to the same posting
  (MOM 2026-10-13).
- **MQR** — Minimum Qualification Requirements; server-side gate on apply
  (`lib/mqr.ts`). **Verdict** — per-requirement `MET | NOT_MET | REVIEW`.
- **Snapshot** — frozen profile data attached to an Application at submit
  time (§8.8), so later profile edits never rewrite history.

## Profile & documents

- **PDS** — Personal Data Sheet (the CS form). Uploading one powers
  **extraction** and **auto-apply** (§8.4): sections are **REPLACE**
  (delete-all + recreate) inside one transaction, personal info is an
  OVERRIDE allowlist.
- **Profile section** — Education / Work Experience / Training / Eligibility /
  Awards; each has ord-ordered rows. Edit is modeled as **delete + recreate**
  client-side (§6.3, no PUT).
- **Profile completion gate** — computed flag + live re-validation that must
  pass before apply (§8.3).
- **Document** — an uploaded file (12 **categories**, 10 MB cap, extension
  allowlist). **Document status** vocabulary (`lib/document-status.ts`):
  `UPLOADED → PROCESSING → EXTRACTED | PARTIALLY_EXTRACTED | FAILED`.

## Communications

- **Notice** — evaluator-sent status email (MOM templates). **Invitation** —
  interview invitation (mode/venue/details). **Regret** — rejection notice.
- **OTP** — 6-digit signup verification code, stored as sha256(code:pepper),
  10-min TTL, 5 attempts.

## Architecture vocabulary (codebase-design skill)

- **Deep module** — lots of behavior behind a small interface. The repo's:
  `lib/api.ts` (`ok/err/handleApi/parseId/getClientIp` — every route's
  envelope, error mode, IP contract), `lib/client.ts`
  (`apiFetch/apiUpload` — the entire client transport), `lib/auth.ts` (route
  guards), `lib/secrets.ts` (every signing key), `lib/job-meta.ts`
  (deadline semantics), `lib/status.ts` / `lib/document-status.ts`
  (vocabularies), `profile/section-mutations.ts` (§6.3 mutation contract).
- **Seam** — where a module's interface lives. **Adapter** — a concrete
  implementation at a seam. **Leverage** — caller capability per interface
  learned; **locality** — change concentrates in one place.
