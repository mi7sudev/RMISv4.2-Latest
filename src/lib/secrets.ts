// ============================================================================
// RMIS — Application secret seam (spec §3.1). THE single source for every
// signing key / OTP pepper: NEXTAUTH_SECRET wins; a derived development
// fallback keeps the sandbox flows testable; PRODUCTION FAILS FAST when the
// secret is unset — a publicly-derived key would let anyone forge admin
// session cookies against such a deployment.
//
// Previously this fallback was copy-pasted in FOUR places (lib/jwt.ts,
// lib/otp.ts, forgot-password, reset-password — all documented "same
// derivation contract"), so the contract was enforced by comment only.
// Interface: getAppSecret() (bytes, for jose SignJWT/jwtVerify) and
// getAppSecretText() (string, for HMAC/hash peppers) — zero params, the
// precedence/fallback/warn-once policy hidden behind the seam.
//
// Design note (design-it-twice, light): (a) import-time constant rejected —
// env timing is fragile and a prod throw at import crashes without a clear
// route-level error; (b) per-call-site injection rejected — Speculative
// Generality, no second adapter exists for a config read; (c) lazy getter
// chosen — deep (policy hidden), local (one file), zero interface cost for
// the four call sites.
// ============================================================================

let cachedBytes: Uint8Array | null = null;
let warned = false;

/** Resolves the secret text: env wins, dev fallback, prod gate. */
function resolveSecretText(): string {
  const s = process.env.NEXTAUTH_SECRET || "";
  if (s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] NEXTAUTH_SECRET must be set in production — refusing to sign with the derived development secret."
    );
  }
  if (!warned) {
    console.warn("[auth] NEXTAUTH_SECRET is not set — using a derived development secret.");
    warned = true;
  }
  return "rmis-dev-secret::" + (process.env.DATABASE_URL || "local") + "::do-not-use-in-production";
}

/** Signing key bytes (jose HS256). Same value within one process. */
export function getAppSecret(): Uint8Array {
  if (!cachedBytes) cachedBytes = new TextEncoder().encode(resolveSecretText());
  return cachedBytes;
}

/** Secret as text — for hash peppers (OTP codes) and HMAC keys. */
export function getAppSecretText(): string {
  return resolveSecretText();
}
