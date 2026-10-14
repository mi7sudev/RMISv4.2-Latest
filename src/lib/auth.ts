// ============================================================================
// RMIS — Route guards + two-tier network access (spec §2, §12)
// Role derivation: User.role column (ADMIN | EVALUATOR | APPLICANT).
// Staff intranet tier: classification per spec §2.2 (private/loopback/CGNAT/
// link-local/IPv6-ULA = intranet; last XFF entry is authoritative). Enforcement
// is controlled by INTRANET_ENFORCEMENT ("on"|"off") — implemented at the three
// chokepoints (login, session, requireRole) exactly as the spec defines.
// ============================================================================

import { db } from "@/lib/db";
import { ApiError, getClientIp } from "@/lib/api";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "@/lib/jwt";
import type { Role } from "@/lib/router";

export type { Role };
export type AuthedUser = {
  claims: SessionClaims;
  id: string;
  username: string;
  email: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  applicantId: number | null;
};

// Intranet classification uses the SAME spoof-resistant IP contract as
// audit/rate-limiting (lib/api.ts getClientIp — LAST XFF entry).

function isPrivateIp(ip: string): boolean {
  if (ip === "unknown" || ip === "::1" || ip === "127.0.0.1") return true; // direct on-box = trusted
  // IPv6-mapped IPv4 (::ffff:10.0.0.1 — Node/Next often synthesizes this
  // form for direct connections) — unwrap and classify as plain IPv4.
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];
  if (ip.startsWith("127.")) return true; // loopback range (covers ::ffff:127.x)
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const m172 = ip.match(/^172\.(\d+)\./);
  if (m172) { const n = Number(m172[1]); if (n >= 16 && n <= 31) return true; }
  if (ip.startsWith("169.254.") || ip.startsWith("100.64.") || ip.startsWith("100.65.") || ip.startsWith("100.66.") || ip.startsWith("100.67.") || ip.startsWith("100.68.") || ip.startsWith("100.69.")) return true;
  // CGNAT 100.64/10 broadly
  const m100 = ip.match(/^100\.(\d+)\./);
  if (m100) { const n = Number(m100[1]); if (n >= 64 && n <= 127) return true; }
  // IPv6 ULA fc00::/7
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

export function isIntranetRequest(req: Request): boolean {
  const enforcement = (process.env.INTRANET_ENFORCEMENT || "off").toLowerCase();
  if (enforcement === "off") return true;
  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return true;
  const cidrs = (process.env.INTRANET_CIDRS || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const cidr of cidrs) {
    const [base, bitsRaw] = cidr.split("/");
    const bits = Number(bitsRaw || "32");
    if (ip === base) return true;
    const baseN = ipv4ToInt(base); const ipN = ipv4ToInt(ip);
    if (baseN === null || ipN === null) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((baseN & mask) === (ipN & mask)) return true;
  }
  return false;
}

// ── Two-door host classification ────────────────────────────────────────────
// The production topology exposes two doors (Caddy): the employee door at
// https://10.10.120.102 and the public applicant door at
// http://recruitment.bakalmirdc.site (HTTPS at the Cloudflare edge). Both
// proxy to the same Next.js server, so the door a request came through is
// identified by its Host header (Caddy sets x-forwarded-host) before
// falling back to the source-IP classification above.

/** The host this request was addressed to (first x-forwarded-host entry wins,
 *  then the Host header). "unknown" = direct/same-box call (no proxy). */
export function requestHost(req: Request): string {
  const xfh = req.headers.get("x-forwarded-host");
  if (xfh) {
    const first = xfh.split(",")[0]?.trim().toLowerCase();
    if (first) return first;
  }
  const host = req.headers.get("host");
  return host ? host.toLowerCase() : "unknown";
}

function hostAllowlist(env: string | undefined): string[] {
  return (env || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Hosts served on the employee door (RMIS_INTRANET_HOSTS). */
export function isStaffHost(host: string): boolean {
  return hostAllowlist(process.env.RMIS_INTRANET_HOSTS).includes(host);
}

/** Hosts served on the public applicant door (RMIS_PUBLIC_HOSTS). */
export function isPublicHost(host: string): boolean {
  return hostAllowlist(process.env.RMIS_PUBLIC_HOSTS).includes(host);
}

/** Loopback hosts (dev boxes, same-box health probes) — trusted like the
 *  intranet: 127.0.0.1:3000, localhost:3000, [::1]:3000, *.localhost. */
export function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/:\d+$/, "").toLowerCase();
  return (
    bare === "localhost" ||
    bare.endsWith(".localhost") ||
    bare === "127.0.0.1" ||
    bare === "::1" ||
    bare === "[::1]"
  );
}

/**
 * Trust decision used by the auth chokepoints and the captcha gate.
 * Precedence: an unidentifiable host (same-box call with no Host at all) is
 * trusted like the intranet; an explicit staff host is the employee door;
 * an explicit public host is the applicant door; loopback hosts (direct dev
 * / health access) are trusted; anything else (unknown proxy domain) falls
 * back to the source-IP classification.
 */
export function isTrustedGate(req: Request): boolean {
  const host = requestHost(req);
  if (host === "unknown") return true;
  if (isStaffHost(host)) return true;
  if (isPublicHost(host)) return false;
  if (isLoopbackHost(host)) return true;
  return isIntranetRequest(req);
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return null;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export const STAFF_INTRANET_MESSAGE =
  "Staff accounts can only be used from the MIRDC intranet. Please connect to the office network or VPN and try again.";

/** Read + verify the session cookie and re-check the user row (fail closed). */
export async function getSessionFromReq(req: Request): Promise<AuthedUser | null> {
  const jar = await import("next/headers").then((m) => m.cookies());
  let token: string | undefined = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    const alt = req.headers.get("cookie") || "";
    const m = alt.match(/(?:__Secure-)?next-auth\.session-token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.id },
    include: { applicant: { select: { id: true, isProfileComplete: true } } },
  });
  if (!user || user.blocked) return null;
  const applicantId = user.applicant?.id ?? null;
  return {
    claims,
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as Role,
    firstName: user.firstName,
    lastName: user.lastName,
    applicantId,
  };
}

async function requireAuth(req: Request): Promise<AuthedUser> {
  const user = await getSessionFromReq(req);
  if (!user) throw new ApiError("Unauthorized", 401);
  return user;
}

async function requireRole(req: Request, roles: Role[]): Promise<AuthedUser> {
  const user = await requireAuth(req);
  if ((user.role === "EVALUATOR" || user.role === "ADMIN") && !isIntranetRequest(req)) {
    throw new ApiError(STAFF_INTRANET_MESSAGE, 403);
  }
  if (!roles.includes(user.role)) throw new ApiError("Forbidden: insufficient role", 403);
  return user;
}

export function requireApplicantFromReq(req: Request) {
  return requireRole(req, ["APPLICANT"]);
}

/** EVALUATOR or ADMIN. */
export function requireEvaluatorFromReq(req: Request) {
  return requireRole(req, ["EVALUATOR", "ADMIN"]);
}

export function requireAdminFromReq(req: Request) {
  return requireRole(req, ["ADMIN"]);
}

export { requireAuth };

/** Resolve the applicant profile row for the signed-in applicant. */
export async function requireApplicantRow(req: Request) {
  const user = await requireApplicantFromReq(req);
  const applicant = await db.applicant.findUnique({ where: { userId: user.id } });
  if (!applicant) throw new ApiError("Applicant profile not found", 404);
  return { user, applicant };
}
