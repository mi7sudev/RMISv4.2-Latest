// ============================================================================
// RMIS — GET /api/auth/captcha (public, gate-aware)
// Tells the sign-in/sign-up views whether to mount the Turnstile widget.
// { enabled: false } on the employee door (staff hosts, intranet IPs, direct
// localhost) or when Turnstile is not configured; { enabled: true, siteKey }
// on the public applicant door. The SECRET key never crosses this boundary.
// ============================================================================

import { handleApi, ok } from "@/lib/api";
import { captchaConfigFor } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  return ok(captchaConfigFor(req));
});
