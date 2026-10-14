// ============================================================================
// RMIS — JWT + session cookie (spec §3.1)
// JWT HS256 via jose; claims { id, email, name, role }; cookie
// `next-auth.session-token`, httpOnly, sameSite=lax, path=/, 24h expiry;
// secure only on HTTPS.
// ============================================================================

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAppSecret } from "@/lib/secrets";

export const SESSION_COOKIE = "next-auth.session-token";
const MAX_AGE = 60 * 60 * 24; // 24 hours

export type SessionClaims = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EVALUATOR" | "APPLICANT";
};

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getAppSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAppSecret());
    if (!payload || typeof payload.id !== "string") return null;
    return {
      id: payload.id,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as SessionClaims["role"]) || "APPLICANT",
    };
  } catch {
    return null;
  }
}

function isHttps(req: Request): boolean {
  if (process.env.NEXTAUTH_URL?.startsWith("https://")) return true;
  return (req.headers.get("x-forwarded-proto") || "").includes("https");
}

export async function setSessionCookie(req: Request, token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: isHttps(req),
  });
}

export async function clearSessionCookie(req: Request) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: isHttps(req),
  });
}
