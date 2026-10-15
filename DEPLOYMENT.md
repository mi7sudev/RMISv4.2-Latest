# RMIS 2.0 — DEPLOYMENT RUNBOOK (v2 · Two-Tier Access)

> **What changed vs. v1.** The previous setup ran RMIS as a single instance on the
> VM, reached through the SSH tunnel used during development (VS Code Remote-SSH).
> That single door is now split into **two network tiers**:
>
> | Tier | Who | Where it lives | Rule |
> |---|---|---|---|
> | **Applicant portal** | Job applicants (public) | **Public domain** (HTTPS) | Sign-in & applications from ANY network |
> | **Staff tier** | ADMIN · EVALUATOR (MIRDC employees) | **Intranet only** | Sign-in, sessions, and staff APIs resolve ONLY from the intranet Wi-Fi / office LAN |
>
> Rationale: all employees are on the intranet Wi-Fi, so staff functionality is
> gated at the network layer — a stolen staff password is useless from the
> internet.
>
> ⟪Note: this file merges the user-supplied v2 runbook draft with the in-repo v1
> (`DEPLOYMENT.md`) and is corrected against the shipped code. Where your v1 has
> environment-specific values (VM host, IPs, DNS provider, certificates), keep
> them and merge into the placeholders marked `⟪…⟫` below.⟫

---

## 0. AS-EXECUTED PRODUCTION CONFIGURATION — SOURCE OF TRUTH (2026-09-29)

> This section records the deployment that is **actually LIVE**. Where anything
> later in this file differs, **this section wins**. §2–§10 remain the generic
> Linux guide; §11 is the middleware-VM (Windows) variant — RMIS production
> does **not** run there.

### 0.1 Server & process

| Item | Value |
|---|---|
| Host | `rmis-mirdc` — Ubuntu Linux, intranet IP **`10.10.120.102`** (SSH user `rmis-mirdc`, VS Code Remote-SSH) |
| App root | `/home/rmis-mirdc/Desktop/RMISv4.1` |
| Runtime | Node v22.23.3 + npm 10.9.9 (`npm install`; no bun on this box — use `npx tsx` for scripts with `set -a && source .env && set +a`) |
| Process manager | pm2, app name **`rmis`** → `node .next/standalone/server.js` (fork); `pm2 save` done; run the `pm2 startup systemd` sudo line for boot persistence |
| Listen | `0.0.0.0:3000` — staff & applicants (for now) reach `http://10.10.120.102:3000` |

### 0.2 Production `.env` (as deployed — secrets masked)

Two copies must exist and match: app-root `.env` **and** runtime copy `.next/standalone/.env`.

```ini
DATABASE_URL=file:/home/rmis-mirdc/Desktop/RMISv4.1/db/production-data.db
NEXTAUTH_SECRET=⟪64-hex, unique to this server⟫
NEXTAUTH_URL=http://10.10.120.102:3000
UPLOAD_DIR=/home/rmis-mirdc/Desktop/RMISv4.1/upload
INTRANET_ENFORCEMENT=on
EMAIL_PROVIDER=middleware
EMAIL_MIDDLEWARE_URL=http://10.10.120.43:3232
EMAIL_MIDDLEWARE_API_KEY=⟪shared relay token⟫
EMAIL_MIDDLEWARE_SYSTEM=DOST-MIRDC Recruitment
```

Rules learned the hard way:
- `DATABASE_URL` must be **absolute** — relative paths resolve against `.next/standalone` at runtime.
- `custom.db` is refused by name in production; production data is `db/production-data.db` (copied from the bundle's tested `custom.db` on first deploy).
- After ANY `.env` change: `cp .env .next/standalone/.env && pm2 restart rmis`.
- The old instance (v3.4 era, pm2 pid 118573) was retired on 2026-09-29; its registrations after the bundle snapshot did **not** carry over.

### 0.3 Topology — two tiers, as built

- **Staff door (ADMIN / EVALUATOR):** `http://10.10.120.102:3000` — intranet only, enforced by client-IP classification.
- **Applicant door (planned):** `recruitment.bakalmirdc.site` → DNS A record → office public IP → edge forwards **80 → 10.10.120.102:3000**. Caddy TLS later via [`deploy/Caddyfile.public`](deploy/Caddyfile.public). **The app needs zero changes for this.**
- ❗ **`RMIS_PUBLIC_HOSTS` / `RMIS_INTRANET_HOSTS` do NOT exist in this app.** The tier gate is purely IP-based (`INTRANET_ENFORCEMENT=on` + automatic private-range classes + optional `INTRANET_CIDRS`). There are no host-based env vars to set — don't hunt for them.
- **Verified live 2026-09-29:** staff login from external IP → `403`; from intranet → `200`; `/api/health` → `{"status":"healthy","checks":{"app":"ok","database":"ok"}}`.

### 0.4 Email relay (mirdc_middleware)

- Runs on the Windows VM at **`http://10.10.120.43:3232`** — updated `index.js` deployed and smoke-tested 2026-09-29 (`GET /health` → `{"status":"ok"}`).
- RMIS → relay contract: `POST /sendMail` with `{ api: ⟨shared token⟩, system: "DOST-MIRDC Recruitment", to, subject, message: ⟨RAW HTML⟩ }` — never send an `html` object (switches the relay into its EJS template that HTML-escapes branded markup); relay sends HTML only (wrap plain-text sends in `<br>`); relay auto-logs every send to the central IT log service (`10.10.120.43:1404`).
- **Reply-To (Task 14, 2026-10):** RMIS now sends `from: "MIRDC HR Office" <recruitment@mirdc.dost.gov.ph>` (MOM 2026-10-13) AND `replyTo: "MIRDC HR Office" <recruitment@mirdc.dost.gov.ph>` on every message — applicant replies must land in the **recruitment** mailbox, not the system mailer. The relay MUST pass `replyTo` through to nodemailer (a plain `transporter.sendMail(req.body)` passthrough does this). **Verify on the VM after deploy:** send one notice and confirm the received mail's `Reply-To:` header is `recruitment@mirdc.dost.gov.ph`; if the relay pins its own Reply-To (`systems@…`), update the relay's `index.js` (drop-in lives in `deploy/mirdc_middleware/`) to honor `req.body.replyTo`. Override the address with `EMAIL_REPLY_TO` in `.env` if the office ever routes replies elsewhere.
- Optional hardening (not yet enabled): set `MIDDLEWARE_API_KEY` on the VM to make auth strict — confirm no other consumer breaks first.

### 0.4b Document extraction architecture (which parts need AI)

- **Standard PDS Excel (CSC Form 212) → NO AI.** A deterministic ExcelJS cell
  parser (`src/lib/pds-parser.ts`) reads the form directly — instant, exact,
  free, works with **zero** API keys. This is the path most uploads take.
- **AI fallback (needs `AI_API_KEY`, NVIDIA):** scanned-PDF/image PDS,
  non-standard layouts the parser doesn't recognize, resumes, and other
  extractable categories (certificates, COEs → EDUCATION/WORK_EXPERIENCE/
  TRAINING/ELIGIBILITY/AWARD/ACCOMPLISHMENT). Without the key these report
  *"Document extraction is not configured on this server."*
- **AI-free regardless of key:** PDS profile-photo extraction (pulled from the
  file's embedded images) and plain document upload/storage.
- ⚠️ `AI_API_KEY` is **not set** on this server (2026-09-29) — Excel PDS works;
  scanned PDFs/resumes/certificates will not extract until the key is added
  (free at build.nvidia.com, `nvapi-…` → `.env` → `cp .env .next/standalone/.env`
  → `pm2 restart rmis`).

### 0.5 Update / redeploy (this server)

```bash
cd /home/rmis-mirdc/Desktop/RMISv4.1
# upload the new source bundle via VS Code Remote-SSH — NEVER overwrite db/ or upload/
npm install
npx prisma generate        # generate ONLY — prisma db push is FORBIDDEN against production-data.db
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
curl -s http://127.0.0.1:3000/api/health   # → {"status":"healthy",...}
```

Data (`db/`, `upload/`) lives outside the build output — updates never touch it.

### 0.6 Go-live status (as of 2026-09-29)

- [x] Deploy + health green (pm2 `rmis`, saved)
- [x] Two-tier matrix: `403` external / `200` intranet
- [x] Middleware relay reachable at `10.10.120.43:3232`
- [ ] Real accounts: sign in as `testadmin` → Users → **deactivate** `testevaluator`, `testapplicant` → create real ADMIN (12+ char password) → sign in as real admin → **deactivate** `testadmin` (deactivate, never delete — keeps profiles/audit rows referentially intact)
- [ ] Settings ▸ Email Notices → **Send test email** (as the real admin)
- [ ] `npm run backup` smoke test, then nightly cron: `30 2 * * * cd /home/rmis-mirdc/Desktop/RMISv4.1 && npm run backup >> /home/rmis-mirdc/rmis-backup.log 2>&1`
- [ ] Copy `.env` to the secrets store
- [ ] Domain door DNS + edge forward (§0.3)

---

## 1. Access policy (what the app enforces)

RMIS ships with the staff tier **already implemented** at three chokepoints
(`src/lib/access-tier.ts`, `src/lib/auth.ts`, `src/app/api/auth/login/route.ts`,
`src/app/api/session/route.ts`):

1. **Login** — `POST /api/auth/login`: ADMIN/EVALUATOR credentials from a
   non-intranet client IP → `403` + audit `LOGIN_BLOCKED_EXTERNAL`.
2. **Session** — `GET /api/session`: an existing staff cookie presented from a
   non-intranet network resolves to `{ user: null }` (fail closed) + audit
   `STAFF_ACCESS_BLOCKED_EXTERNAL`.
3. **Every guarded staff API** (`requireRole` / `requireRoleFromReq`) — `403`
   for staff calls from a non-intranet network, even with a valid cookie
   (staff file downloads are gated the same way).

**How "intranet" is decided** — the request's client IP (the **last** entry of
`X-Forwarded-For`, i.e. the hop added by *your own* edge proxy — this defeats
client-side header spoofing) is classed as intranet when it is:

- loopback (`127.0.0.1`, `::1`) — on-box traffic,
- RFC 1918 private — `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
- CGNAT `100.64.0.0/10`, link-local `169.254.0.0/16`, IPv6 ULA `fc00::/7`,
- or any subnet you add to `INTRANET_CIDRS` (e.g. the intranet Wi-Fi NAT range).

Applicants are **never** gated: `APPLICANT` sign-in works from any network.

User-facing message (shown on the sign-in screen when staff try from outside):
> "Staff access is restricted to the MIRDC intranet. Administrators and
> evaluators must sign in from the office network (or VPN). Applicants can
> sign in from any network."

---

## 2. Topology — Option A (recommended): one instance, two doors

One RMIS instance on the VM serves both tiers; the reverse proxy fronts it on
80/443. The **public domain** is the applicant door; employees on the intranet
Wi-Fi reach the *same* app (optionally via an internal hostname) and the app
gates staff sign-in by client-IP class.

```text
                       INTERNET                          INTRANET Wi-Fi (office LAN)
                           │                                       │
              careers.mirdc.gov.ph ⟪your domain⟫        rmis.mirdc.local ⟪optional⟫
                           │                                       │
                    ┌──────▼───────────────────── VM ──────────────▼──────┐
                    │  nginx/Caddy :443 (TLS)  — overwrite X-Forwarded-For │
                    │                 │                                    │
                    │        RMIS (Next.js :3000)                          │
                    │        SQLite  db/production-data.db (+ audit.db,    │
                    │        notifications.db, upload/ documents)          │
                    └──────────────────────────────────────────────────────┘
   Applicant (public IP)  → 200 sign-in / apply                 │
   Staff     (public IP)  → 403 LOGIN_BLOCKED_EXTERNAL          │
   Staff     (10.x Wi-Fi) → 200 sign-in → dashboards ◄──────────┘
```

- One database, one process, one deploy — staff and applicant features ship together.
- The "porting to intranet" is *policy*: staff must be on the office network to
  sign in (enforced), applicants never are.
- Optional: an internal-only hostname (`rmis.mirdc.local` or `http://10.x.x.x`)
  for staff convenience; it proxies to the same :3000.

### Option B (only if policy demands a hard split)

Two listeners on the same VM: the public vhost proxies to an applicant-bound
instance, and a staff instance binds **only** to the LAN interface
(`HOST=10.x.x.x`, never exposed by the firewall). Both read the same database —
if you keep SQLite, run **one** instance against the DB file and proxy the
second door to it (two Next.js processes on one SQLite file is not advised).
For 99% of cases Option A + the built-in gate is sufficient and simpler.

---

## 3. Environment (`.env` on the VM)

```bash
# Database — the production data file (migrated legacy records live here).
# ⚠️ NOT db/custom.db: the app FAILS FAST at startup if production points at
# custom.db (that is the old dev scratch database — see src/lib/env.ts).
DATABASE_URL=file:/home/⟪vm-user⟫/rmis/db/production-data.db

# Staff intranet tier — MUST be "on" in production
INTRANET_ENFORCEMENT=on
# Intranet Wi-Fi / office subnets beyond the automatic private classes.
# Use the NAT range employees actually browse from (check the DHCP pool):
INTRANET_CIDRS=10.20.0.0/16

# Session
NEXTAUTH_SECRET=⟪openssl rand -base64 32⟫        # required — dev fallback is not for prod
NEXTAUTH_URL=https://careers.mirdc.gov.ph        # https ⇒ Secure cookies

# PDS auto-extract (Document Intelligence) — optional; app runs without it
AI_API_KEY=⟪nvapi-… free key from build.nvidia.com⟫

# Email notices — REQUIRED for real delivery. Without a real provider, shortlist /
# interview / regret notices are recorded to the email ledger but NEVER sent.
# (The app warns loudly at startup if production runs with the mock provider.)
#
# OPTION A (office gateway — ₱0, no external vendor): the mirdc_middleware VM.
#   The updated drop-in index.js lives in deploy/mirdc_middleware/ of this repo.
#   Emails leave via the office mailbox systems@mirdc.dost.gov.ph.
EMAIL_PROVIDER=middleware
EMAIL_MIDDLEWARE_URL="http://⟪middleware-vm-ip⟫:3232"
EMAIL_MIDDLEWARE_API_KEY="⟪shared middleware token (body.api)⟫"
EMAIL_MIDDLEWARE_SYSTEM="DOST-MIRDC Recruitment"
# Task 14 — applicant email replies are routed here via the Reply-To header
# (default recruitment@mirdc.dost.gov.ph). Override ONLY if the office wants
# replies to land elsewhere.
# EMAIL_REPLY_TO="recruitment@mirdc.dost.gov.ph"
#
# OPTION B (Resend HTTP API — free tier 100/day):
# EMAIL_PROVIDER=resend
# RESEND_API_KEY=⟪re_… from resend.com⟫
# EMAIL_FROM="RMIS <no-reply@mirdc.gov.ph>"
```

> - `INTRANET_ENFORCEMENT=off` disables the tier entirely — use only for local
>   development. Never in production.
> - **Never run `prisma db push` (or `db:deploy`) against this database.** The
>   schema is a 1:1 map of the migrated legacy DB and is already in sync; a
>   push can drop/rename legacy columns. There is no `db:push` npm script on
>   purpose — schema work happens in dev against a copy, never on the VM.
> - `.env` is gitignored and must never be committed (it was untracked from
>   git history in the Sept 2026 audit — keep it that way; if this repo ever
>   gains a remote, purge history and rotate `NEXTAUTH_SECRET` first).

---

## 4. Reverse proxy — the anti-spoofing contract

**The edge proxy MUST overwrite `X-Forwarded-For` with the socket IP.** If it
appends (nginx `$proxy_add_x_forwarded_for`) or trusts inbound chains, an
applicant could send `X-Forwarded-For: 10.0.0.5` and impersonate the intranet.
The app reads only the **last** XFF entry, so an overwriting proxy makes that
entry always the true client address.

Ready-to-copy configs live in [`deploy/Caddyfile.public`](deploy/Caddyfile.public)
and [`deploy/Caddyfile.intranet`](deploy/Caddyfile.intranet). Equivalent nginx:

```nginx
# /etc/nginx/sites-available/rmis — PUBLIC door (applicants + staff-on-LAN)
server {
    listen 443 ssl http2;
    server_name careers.mirdc.gov.ph;              # ⟪public domain⟫

    ssl_certificate     /etc/letsencrypt/live/careers.mirdc.gov.ph/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/careers.mirdc.gov.ph/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;   # OVERWRITE — never append
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;  # future realtime
        proxy_set_header Connection        "upgrade";
        client_max_body_size 12m;                          # PDS / document uploads
    }
}
server { listen 80; server_name careers.mirdc.gov.ph; return 301 https://$host$request_uri; }

# OPTIONAL — staff-only convenience door on the LAN interface
server {
    listen 10.20.0.5:80;                            # ⟪VM's LAN IP⟫ — not a public IP
    server_name rmis.mirdc.local;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;   # still overwrite
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy (equivalent — this repo's dev gateway uses the same pattern)

```caddy
careers.mirdc.gov.ph {
    tls ⟨lets-email@mirdc.gov.ph⟩
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}   # overwrite, not append
        header_up X-Real-IP      {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
http://10.20.0.5:80 {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Real-IP      {remote_host}
    }
}
```

---

## 5. Firewall (ufw)

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH                              # your management path
sudo ufw allow 80,443/tcp                           # public doors
# NO extra public ports — the app (:3000) is loopback-only behind the proxy
sudo ufw enable
```

Ensure the Next.js process listens on `127.0.0.1:3000` (standalone default) so
nothing bypasses the proxy; if it binds `0.0.0.0`, restrict :3000 in ufw to
`10.20.0.0/16` or loopback only.

---

## 6. Deploy / update

```bash
# on the VM (or via your VS Code SSH flow)
cd /home/⟪vm-user⟫/rmis
git pull                                      # or rsync from your machine
bun install --frozen-lockfile
bun run db:generate                           # Prisma client only — NEVER db push
bun run build                                 # standalone output
sudo systemctl restart rmis                   # unit below
curl -s http://127.0.0.1:3000/api/health      # → {"status":"healthy", …}
```

`/etc/systemd/system/rmis.service`:

```ini
[Unit]
Description=RMIS 2.0 (Next.js standalone)
After=network.target

[Service]
WorkingDirectory=/home/⟪vm-user⟫/rmis
EnvironmentFile=/home/⟪vm-user⟫/rmis/.env
ExecStart=/usr/local/bin/bun .next/standalone/server.js
# If the native better-sqlite3 module misbehaves under Bun on your VM,
# switch to the battle-tested Node runtime instead:
# ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
User=⟪vm-user⟫

[Install]
WantedBy=multi-user.target
```

DNS: `careers.mirdc.gov.ph` → A/AAAA record → the VM's public IP (or the office
edge NAT with 80/443 forwarded). Internal name `rmis.mirdc.local` → internal DNS
or `/etc/hosts` for staff machines.

---

## 7. Acceptance test matrix (run after every deploy)

| # | Scenario | How | Expected |
|---|---|---|---|
| 1 | Applicant signs in from the internet | Mobile data → sign in as an applicant account | `200` — session works |
| 2 | Applicant browses/applies from the internet | Open the public domain, view jobs, apply | Fully functional |
| 3 | Staff signs in **on the intranet Wi-Fi** | Office LAN → staff credentials | `200` — dashboards load |
| 4 | Staff signs in from **outside** (mobile data) | Staff credentials on the public domain | `403` "Staff access is restricted to the MIRDC intranet…" + audit `LOGIN_BLOCKED_EXTERNAL` |
| 5 | Valid staff cookie replayed from outside | Sign in at the office, switch to mobile data, reload | Session resolves signed-out (fail closed) + audit `STAFF_ACCESS_BLOCKED_EXTERNAL` |
| 6 | Spoofed intranet header from outside | `curl -H 'X-Forwarded-For: 10.20.0.9' …/api/auth/login` from the internet | Still `403` (proxy overwrites XFF; app reads only the proxy-set hop) |
| 7 | Rate-limit lockout still armed | 3 bad passwords on one identifier | Progressive lockout — 4th attempt refused for 30 s, ladder up to 10 min on repeats |
| 8 | Health probe | `curl http://127.0.0.1:3000/api/health` | `{"status":"healthy","checks":{"app":"ok","database":"ok"}}` |

Local equivalents used to validate this build (loopback counts as intranet):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 8.8.8.8' \
  -d '{"identifier":"⟪staff⟫","password":"⟪pw⟫"}'     # → 403 blocked
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 10.20.5.5' \
  -d '{"identifier":"⟪staff⟫","password":"⟪pw⟫"}'     # → 200 allowed
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.7' \
  -d '{"identifier":"⟪applicant⟫","password":"⟪pw⟫"}' # → 200 allowed (any network)
```

All three were executed against this build: 403 / 200 / 200, and the block was
verified in the audit table (`LOGIN_BLOCKED_EXTERNAL`, ip `8.8.8.8`).

---

## 8. Operations

- **Audit review** — ADMIN → Settings ▸ Audit Log: watch `LOGIN_BLOCKED_EXTERNAL`
  / `STAFF_ACCESS_BLOCKED_EXTERNAL` spikes (credential stuffing from outside).
- **Intranet range change** (DHCP re-plan, new office VLAN): update
  `INTRANET_CIDRS` in `.env`, `sudo systemctl restart rmis`. No code change.
- **Emergency lockdown toggle**: set `INTRANET_ENFORCEMENT=off` + restart only
  if a false-positive IP class is locking staff out during an incident — never
  leave it off.
- **False positive triage**: staff blocked on the office Wi-Fi ⇒ their egress IP
  is outside the configured classes (e.g. unusual NAT) — read the blocked audit
  row's `ipAddress`, add that subnet to `INTRANET_CIDRS`.
- **Backups** — the repo ships a safe online backup script (consistent SQLite
  read-lock snapshot, safe while the app is live; 14-run retention):

  ```bash
  npm run backup          # → backups/⟪timestamp⟫/{production-data.db, audit.db,
                          #    notifications.db, upload/}
  # nightly (crontab -e):
  # 30 2 * * * cd /home/⟪vm-user⟫/rmis && npm run backup >> /var/log/rmis-backup.log 2>&1
  # off-machine copy (recommended):
  # 0 3 * * * rsync -a /home/⟪vm-user⟫/rmis/backups/ ⟪backup-server⟫:/backups/rmis/
  ```

  Also keep `.env` backed up (secrets store, not the repo).
- **Test accounts** — the dev/test logins (`testadmin`, `testevaluator`,
  `testapplicant` — password `password123`) must NOT survive go-live (§9).

---

## 9. Go-live checklist (server-side, one-time)

1. **Deactivate the test logins** (any `test*` account ships with weak passwords):

   ```bash
   bun scripts/create-admin.ts --deactivate testadmin
   bun scripts/create-admin.ts --deactivate testevaluator
   bun scripts/create-admin.ts --deactivate testapplicant
   ```

2. **Create the real administrator / evaluators** (refuses weak passwords):

   ```bash
   bun scripts/create-admin.ts --email ⟪real.admin@mirdc.gov.ph⟫ --password '⟪S3cure!Passw0rd⟫' --name "⟪Name⟫"
   bun scripts/create-admin.ts --email ⟪hr.staff@mirdc.gov.ph⟫ --password '⟪S3cure!Passw0rd⟫' --name "⟪Name⟫" --role evaluator
   ```

   Applicants self-register through the public sign-up page — no script needed.
3. **Fresh `NEXTAUTH_SECRET`** on the VM (differs from dev; rotation invalidates
   all sessions — users just re-login).
4. **Email env vars** (§3) — verify with Settings ▸ Email Notices → "Send test
   email" after first deploy.
5. **Install the backup cron** (§8) + off-machine rsync.
6. **Run the acceptance matrix** (§7) and record the results.
7. *(Optional, maintenance window)* hot-path indexes if application volume grows
   into the thousands — `applications(application_status)`,
   `applications(date_applied)`, `jobpostings(deadline_date)`,
   `up_users(email/username)` — added via manual `CREATE INDEX`, never db push.

---

## 10. Troubleshooting quick hits

- **"Refusing to connect to 'custom.db' in production"** — `DATABASE_URL` still
  points at the dev scratch DB. Set it to `db/production-data.db` (§3).
- **"Missing required environment variables: …"** — `.env` missing/incomplete at
  the project root; the validator names exactly what's absent.
- **Login works on LAN but sessions don't stick** — `NEXTAUTH_URL` must match
  the URL users type **exactly** (scheme + host + port, no trailing slash).
- **"RESEND_API_KEY is required when EMAIL_PROVIDER=resend"** — pick one: set
  the key + `EMAIL_FROM`, or drop back to `EMAIL_PROVIDER=mock` while testing
- **"EMAIL_MIDDLEWARE_URL is required when EMAIL_PROVIDER=middleware"** — set
  the mirdc_middleware VM base URL (e.g. `http://10.10.x.x:3232`) **and**
  `EMAIL_MIDDLEWARE_API_KEY`. Probe the gateway with
  `curl http://⟪vm⟫:3232/health` → must answer `{"status":"ok"}`
  (ledger-only, nothing delivered).
- **Staff can't sign in ANYWHERE** — a proxy is forwarding/allowing a spoofed
  XFF chain. Ensure the overwrite config from §4, then check the Audit Log for
  the classified address and adjust `INTRANET_CIDRS` if it's a legit office range.

---

## 11. Windows Server quick path (middleware VM variant — VS Code Remote-SSH)

> **Scope note (2026-09-29):** RMIS production does **not** run on the Windows
> VM — §0 is the live deployment (Linux `10.10.120.102`). This section stays as
> the reference for the **mirdc_middleware email gateway** that lives on that
> VM (`:3232`, reachable from RMIS at `10.10.120.43`), and as the Windows
> variant guide should RMIS ever move there.

The middleware VM is **Windows Server** (OpenSSH for Remote-SSH; the
`mirdc_middleware` email gateway runs there on `:3232`). Sections
2–10 assume Linux/systemd — this section is the Windows equivalent. File layout: `C:\rmis`.

### 11.0 One-time prerequisites (admin PowerShell on the VM)

```powershell
winget install OpenJS.NodeJS.LTS      # RMIS needs Node ≥ 20.9 (Next 16).
                                      # The middleware keeps its own runtime — don't touch it.
# reopen the terminal so PATH picks up Node 22, then:
node -v
# Bash-brick for the npm scripts (build/start use cp/tee) — needs Git for Windows:
winget install Git.Git
npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
npm i -g pm2                          # keep-alive for RMIS + the middleware
```

### 11.1 Upload the bundle (VS Code Remote-SSH)

1. VS Code → Extensions → install **Remote - SSH** → `Remote-SSH: Connect to Host…`
   → `administrator@⟪vm-ip⟫` → open folder `C:\`.
2. Download `rmis-deploy-⟪date⟫.tar.gz` (from the dev workspace) onto your PC,
   drag it into `C:\` via the VS Code Explorer, then on the VM:

```powershell
mkdir C:\rmis
tar -xf C:\rmis-deploy-⟪date⟫.tar.gz -C C:\rmis
```

   The bundle ships `src/ prisma/ scripts/ public/ deploy/ db/ upload/` and all
   configs — **not** `node_modules`, `.next`, or `.env` (native modules must be
   installed on the VM; secrets must not travel in archives).

### 11.2 `C:\rmis\.env` (production values — §3 with Windows paths)

```ini
DATABASE_URL=file:C:/rmis/db/production-data.db
NEXTAUTH_SECRET=⟪fresh 64-hex — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"⟫
NEXTAUTH_URL=http://⟪vm-ip⟫:3000
UPLOAD_DIR=C:/rmis/upload
INTRANET_ENFORCEMENT=on
# Optional — Document Intelligence (PDS auto-extract):
# AI_API_KEY=⟪key⟫

# Email — office gateway (mirdc_middleware runs on THIS same VM):
EMAIL_PROVIDER=middleware
EMAIL_MIDDLEWARE_URL=http://127.0.0.1:3232
EMAIL_MIDDLEWARE_API_KEY=⟪any shared token; must match MIDDLEWARE_API_KEY if strict mode is ever enabled⟫
EMAIL_MIDDLEWARE_SYSTEM=DOST-MIRDC Recruitment
```

⚠️ `UPLOAD_DIR` is NOT optional on Windows/standalone: without it, uploads land
inside `.next/standalone\upload` and are wiped on the next build. `DATABASE_URL`
must be **absolute with forward slashes** — the runtime's raw-SQLite reader and
Prisma both consume the same string, and a relative path would resolve against
`.next\standalone` at runtime.

### 11.3 Data — continue with the tested data, or start fresh

```powershell
# KEEP the data tested during development (recommended): the live file is
# custom.db; production refuses that name by design — copy it over:
cd C:\rmis
Copy-Item db\custom.db db\production-data.db -Force
Copy-Item db\custom.db-wal db\production-data.db-wal -Force -ErrorAction SilentlyContinue
Copy-Item db\custom.db-shm db\production-data.db-shm -Force -ErrorAction SilentlyContinue
# → run ONLY prisma generate below. NEVER db push against the copied data.

# FRESH start instead: skip the copies, then:
#   Remove-Item db\production-data.db* -ErrorAction SilentlyContinue
#   npx prisma db push
```

### 11.4 Install, generate, build, run

```powershell
cd C:\rmis
npm install               # Node 22 — prebuilds for better-sqlite3/sharp
npx prisma generate       # client only (see §11.3 for db push rules)
npm run build             # script-shell=bash → the Linux build script works verbatim
# PowerShell fallback (if you skipped the script-shell setting):
#   npx next build
#   Copy-Item -Recurse -Force .next\static .next\standalone\.next\
#   Copy-Item -Recurse -Force public .next\standalone\

Copy-Item .env .next\standalone\.env   # runtime env for the standalone server

# smoke run (foreground — just to verify):
$env:NODE_ENV="production"; $env:HOSTNAME="0.0.0.0"; $env:PORT="3000"
node .next\standalone\server.js
# another terminal:  curl http://127.0.0.1:3000/api/health  → {"status":"healthy",...}
# Ctrl+C the smoke run, then hand it to pm2:
pm2 start C:\rmis\.next\standalone\server.js --name rmis
pm2 save
```

Standalone `server.js` defaults to `0.0.0.0:3000` with `NODE_ENV=production`
already baked in; the copied `.env` supplies everything else.

```powershell
# firewall (once, admin):
New-NetFirewallRule -DisplayName "RMIS 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Then open `http://⟪vm-ip⟫:3000` from any office PC. `NEXTAUTH_URL` must match
that URL exactly (§10). Boot persistence: wrap `pm2 resurrect` with
pm2-installer (github.com/Unitech/pm2-installer) or NSSM — same treatment the
middleware needs.

### 11.5 Staff accounts + go-live (§9 on Windows)

Bun auto-loads `.env` on Windows too: `winget install OvenSh.Bun`, or without
Bun: `$env:DATABASE_URL="file:C:/rmis/db/production-data.db"; npx tsx scripts/create-admin.ts …`

```powershell
# keep-data deploys ship the test logins — deactivate them (§9.1):
bun scripts/create-admin.ts --deactivate testadmin
bun scripts/create-admin.ts --deactivate testevaluator
bun scripts/create-admin.ts --deactivate testapplicant
# real staff (§9.2), then the §7 acceptance matrix + §9 email test:
#   Settings ▸ Email Notices → "Send test email" (middleware: 127.0.0.1:3232)
```

### 11.6 Updating RMIS later

Repeat §11.1–§11.4 **without** re-copying the database and without `db push`
(§6 rule: generate only), then `pm2 restart rmis`. `upload/` and `db/` live
outside the build output — updates never touch data. Nightly backup on Windows:
Task Scheduler → `cd C:\rmis && npm run backup` (§8 — script is cross-platform
Node).
