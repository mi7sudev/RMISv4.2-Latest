// ============================================================================
// RMIS — In-memory rate limiting (spec §12.1). Resets on process restart
// (documented stopgap). Login: 5 failures / rolling 15 min per IP+identifier
// → progressive lockout ladder 1→3→5→10→15→30 min (escalation remembered
// until a success clears it). Generic sliding window for register/emails.
// ============================================================================

type Bucket = { failures: number; windowStart: number; lockLevel: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();
const generic = new Map<string, number[]>(); // key → array of timestamps

export const LOCKOUT_LADDER_MIN = [1, 3, 5, 10, 15, 30];
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function key(ip: string, identifier: string) {
  return `${ip}:${(identifier || "").toLowerCase()}`;
}

export function checkLoginAllowed(ip: string, identifier: string): { allowed: boolean; retryAfterMinutes?: number } {
  const b = buckets.get(key(ip, identifier));
  if (!b) return { allowed: true };
  const now = Date.now();
  if (b.lockedUntil > now) {
    return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil((b.lockedUntil - now) / 60000)) };
  }
  return { allowed: true };
}

export function recordLoginFailure(ip: string, identifier: string): void {
  const k = key(ip, identifier);
  const now = Date.now();
  const b = buckets.get(k) ?? { failures: 0, windowStart: now, lockLevel: 0, lockedUntil: 0 };
  if (now - b.windowStart > LOGIN_WINDOW_MS) {
    // window lapsed — reset count (never-locked only; escalation remembered)
    if (b.lockLevel === 0) {
      b.failures = 0;
      b.windowStart = now;
    }
  }
  b.failures += 1;
  if (b.failures >= MAX_FAILURES) {
    const level = Math.min(b.lockLevel, LOCKOUT_LADDER_MIN.length - 1);
    const minutes = LOCKOUT_LADDER_MIN[level];
    b.lockedUntil = now + minutes * 60000;
    b.lockLevel = Math.min(b.lockLevel + 1, LOCKOUT_LADDER_MIN.length - 1);
    b.failures = 0;
    b.windowStart = now;
  }
  buckets.set(k, b);
}

export function clearLoginFailures(ip: string, identifier: string): void {
  buckets.delete(key(ip, identifier));
}

/** Generic sliding window (spec §12.1). */
export function consumeRateLimit(keyStr: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMinutes?: number } {
  const now = Date.now();
  const arr = (generic.get(keyStr) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const oldest = arr[0] ?? now;
    return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 60000)) };
  }
  arr.push(now);
  generic.set(keyStr, arr);
  return { allowed: true };
}
