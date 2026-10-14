// ============================================================================
// RMIS — Cloudflare Turnstile (spec §2/§3): gate-aware human verification.
//
// The employee door (staff hosts, intranet source IPs, direct localhost)
// never sees a challenge. The public applicant door (recruitment.bakalmirdc.site
// or any non-intranet source) must present a Turnstile token that is verified
// server-side against the Cloudflare siteverify API. Tokens are SINGLE-USE
// and expire in ~300 seconds; the widget refreshes itself automatically.
//
// The SECRET key never leaves the server — clients only receive the site key
// via GET /api/auth/captcha when the gate is actually required.
// ============================================================================

import { ApiError, getClientIp } from "@/lib/api";
import { isTrustedGate } from "@/lib/auth";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const CAPTCHA_MESSAGE =
  "Human verification failed. Please wait for the security check to finish and try again.";

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

/** Public config for the client widget — { enabled: false } unless the
 *  request arrives on the public door AND Turnstile is configured. */
export function captchaConfigFor(req: Request): { enabled: boolean; siteKey: string | null } {
  if (!turnstileConfigured() || isTrustedGate(req)) {
    return { enabled: false, siteKey: null };
  }
  return { enabled: true, siteKey: process.env.TURNSTILE_SITE_KEY || null };
}

/** True when THIS request must present a verified token (auth chokepoints). */
export function isCaptchaRequired(req: Request): boolean {
  return turnstileConfigured() && !isTrustedGate(req);
}

/** Cloudflare siteverify. Network failures fail CLOSED — the challenge script
 *  itself is served from Cloudflare, so reachability is a fair expectation. */
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/**
 * Auth chokepoint guard: when the gate demands a captcha, the request must
 * carry a fresh token and it must verify. Missing/invalid → 403 (distinct
 * from the 401 invalid-credentials path, so clients can tell the two apart).
 */
export async function enforceCaptcha(req: Request, token: unknown): Promise<void> {
  if (!isCaptchaRequired(req)) return;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    throw new ApiError(CAPTCHA_MESSAGE, 403);
  }
  const verified = await verifyTurnstile(token, getClientIp(req));
  if (!verified) throw new ApiError(CAPTCHA_MESSAGE, 403);
}
