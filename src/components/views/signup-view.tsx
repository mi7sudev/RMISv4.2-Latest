"use client";

// ============================================================================
// RMIS — Registration view (spec §3.4, §7.2).
// BEUI Phase 4: the form itself is now the OFFICIAL BEUI SignUpForm block
// (beui.dev/r/signup-form, registry @beui/signup-form) — vendored verbatim at
// src/components/motion/signup-form.tsx and used unmodified. RMIS alignment
// happens only through the block's sanctioned props:
//   • validate       → RMIS rules (spec §3.4): first+last name, password ≥ 6,
//                      RA 10173 data-privacy consent message
//   • onSubmit       → register → OTP verification → auto-login →
//                      profile-builder flow (register splits the official
//                      single Name field into firstName/lastName for
//                      registerSchema)
//   • errorMessage   → server failure rendered by the block's animated form-
//                      level error line (docs example pattern: set + throw)
//   • footer         → "Sign in" link (docs example pattern)
// Gate-aware Turnstile still wraps the block: on the public applicant door the
// widget mounts invisibly (interaction-only) below the card and its token
// rides along with the register call. Tokens are single-use, so after a
// successful registration the widget is reset and we briefly wait for a fresh
// token before the auto-login — if one doesn't arrive in time we fall back to
// the sign-in page (existing path). On the employee door the form is captcha-
// free. The RA 10173 notice that the block's Terms checkbox refers to is
// rendered directly beneath the card.
// Task 30-b — email verification gate: registration no longer auto-logs in.
// After the register call succeeds the SignUpForm card unmounts and an OTP
// card (identical official card anatomy) takes over, running the OFFICIAL
// BEUI OTPInput (src/components/motion/otp-input.tsx, used unmodified) against
// POST /api/auth/verify-otp. The register endpoint already emailed the first
// 6-digit code fire-and-forget; a "Resend code" text button (60s cooldown)
// posts /api/auth/resend-otp. Once the code verifies, the EXISTING auto-login
// sequence runs unchanged (Turnstile reset → fresh token → login → profile
// builder; fallback → sign-in page). The submitted credentials are parked in
// a ref for that step — view-owned state only; the official blocks stay
// untouched.
// Field-visibility pass: both cards wear the profile forms' cloud/60 tint,
// and the official field capsules ship with NO fill (they read white only on
// white cards — invisible here). The SignUpForm pin rides its sanctioned
// classNames.fields prop (a descendant fill targeting the Input capsules'
// data-state attribute — no vendored line changes), and the OTPInput slots
// (data-active carriers) get the same fill through the root className prop.
// Enterprise pass (QA: auth pages read "too simple" — enterprise look across
// the system): the form column gains the shared auth furniture — mobile
// institutional lockup below lg (no brand existed there before), white
// lift-shadow cards (the dlg-card-plain anatomy; the .dark .bg-white sweep
// keeps night mode on the raised dark surface), a gov.ph letterhead eyebrow
// heading the OTP card, and the RA 10173 trust strip shared by every auth
// page. All handlers, API calls, validation and copy are preserved exactly.
// Form polish pass (QA: the auth pages read ugly — align the two cards):
// the SignUpForm card gains the sign-in card's letterhead anatomy through
// the block's SANCTIONED props only — title as a two-line node (gov.ph
// eyebrow over the title, aria-hidden so the accessible name stays
// "Create your account"), classNames.header carrying the hairline rule,
// and classNames.footer carrying the matching footer hairline. The footer
// cross-link gets the sign-in card's padded hit-area treatment. The
// vendored block is untouched. All handlers, API calls, validation and
// copy are preserved exactly.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  SignUpForm,
  type SignUpErrors,
  type SignUpValues,
} from "@/components/motion/signup-form";
import { OTPInput, type OTPStatus } from "@/components/motion/otp-input";
import { Turnstile } from "@/components/turnstile";
import type { TurnstileHandle } from "@/components/turnstile";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import {
  AuthMobileLockup,
  AuthSecureStrip,
} from "@/components/auth-enterprise";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate } from "@/lib/router";
import { toast } from "@/lib/toast";

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

/** Wait up to `timeoutMs` for the widget to mint a fresh single-use token. */
function waitForToken(get: () => string | null, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const token = get();
      if (token) {
        clearInterval(timer);
        resolve(token);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 150);
  });
}

/** "juan.delacruz@example.com" → "j•••@example.com" — masks the local part,
    keeps the domain (OTP card hint). Non-email shapes pass through as-is. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email.slice(0, 1)}•••@${email.slice(at + 1)}`;
}

/** RMIS validation rules (spec §3.4) through the block's official
    `validate` hook — replaces the BEUI built-ins (8-char minimum, generic
    name/terms copy) without touching the official component. */
function validateRmis(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "Enter your full name";
  } else if (name.split(/\s+/).length < 2) {
    // registerSchema requires non-empty firstName AND lastName.
    errors.name = "Enter your first and last name";
  } else if (name.length > 160) {
    errors.name = "Name is too long";
  }

  if (!values.email.trim() || !/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm your password";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (!values.terms) {
    errors.terms = "Please accept the data-privacy notice to continue";
  }

  return errors;
}

export default function SignUpView() {
  const { refresh } = useSession();

  // Controlled values — the auto-login step reuses email/password, and the
  // Turnstile wiring stays in this view (the block stays captcha-agnostic).
  const [values, setValues] = useState<SignUpValues>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    terms: false,
  });
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Task 30-b — email verification step. After register succeeds the form
  // card unmounts and the OTP card takes over; the credentials are parked
  // here so the post-verification auto-login (the pre-existing sequence) can
  // reuse them without a second form pass.
  const [step, setStep] = useState<"form" | "otp">("form");
  const pendingCredsRef = useRef<{ email: string; password: string } | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpStatus, setOtpStatus] = useState<OTPStatus>("idle");
  const [otpError, setOtpError] = useState<string | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false); // synchronous duplicate-submit guard
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const counting = resendIn > 0;

  const [captcha, setCaptcha] = useState<CaptchaConfig>({ enabled: false, siteKey: null });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const captchaTokenRef = useRef<string | null>(null);

  const handleToken = (token: string | null) => {
    captchaTokenRef.current = token;
    setCaptchaToken(token);
  };

  // Gate-aware captcha: ask the server which door we are on. If the config
  // fetch fails the widget simply stays off — the register/login endpoints
  // re-check the gate server-side and will 403 with a clear message.
  useEffect(() => {
    let cancelled = false;
    apiFetch<CaptchaConfig>("/api/auth/captcha")
      .then((cfg) => {
        if (!cancelled) setCaptcha(cfg);
      })
      .catch(() => {
        /* widget stays off; server-side chokepoint still applies */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 60s resend cooldown ticker — ticks only while counting.
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  // Called with valid values only — the block ran validateRmis first.
  const submit = async (v: SignUpValues) => {
    setFormError(undefined);

    // Official single Name field → registerSchema's firstName/lastName.
    const [firstName, ...rest] = v.name.trim().split(/\s+/);
    const lastName = rest.join(" ");

    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          email: v.email.trim(),
          firstName,
          lastName,
          password: v.password,
          captchaToken,
        },
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Registration failed. Please try again.",
      );
      // Tokens are single-use — mint a fresh one for the next attempt.
      handleToken(null);
      turnstileRef.current?.reset();
      throw err; // block flips its StatefulButton to the error state
    }

    // Task 30-b — the account was created CONFIRMED FALSE and the register
    // endpoint already emailed the first 6-digit code (fire-and-forget
    // server-side). Instead of the old immediate auto-login, hand over to
    // the OTP card: the auto-login sequence runs only after verification.
    pendingCredsRef.current = { email: v.email.trim(), password: v.password };
    setOtpEmail(v.email.trim());
    setOtpValue("");
    setOtpStatus("idle");
    setOtpError(undefined);
    setResendIn(60);
    setStep("otp");
  };

  // Auto-login after verification (spec §3.4) — the exact sequence the
  // registration flow ran before Task 30-b. The register call consumed the
  // single-use captcha token, so on the public door we reset the widget and
  // wait for a fresh one first; if one doesn't arrive in time we fall back
  // to the sign-in page (existing path).
  const autoLoginAfterVerification = async () => {
    const creds = pendingCredsRef.current;
    try {
      let loginToken: string | null = captchaToken;
      if (captcha.enabled) {
        handleToken(null);
        turnstileRef.current?.reset();
        loginToken = await waitForToken(() => captchaTokenRef.current, 6000);
      }
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: {
          identifier: creds?.email ?? "",
          password: creds?.password ?? "",
          captchaToken: loginToken,
        },
      });
      toast.success("Welcome to RMIS");
      // Route to the profile builder BEFORE the session refresh commits:
      // the Router bounces signed-in users off auth views, and the auto-
      // login above already set the session cookie while we are still on
      // #/signup — refreshing first would let that redirect win the race
      // and re-route to the applicant home instead of the builder.
      navigate("profile");
      await refresh();
    } catch {
      toast.success("Account created", {
        description: "Sign in with your new account to continue.",
      });
      navigate("signin");
    }
  };

  // The official block fires onComplete on the empty→full transition only —
  // a rejected code must be edited (or re-issued) before it can fire again.
  const completeVerify = async (code: string) => {
    if (verifyingRef.current) return; // duplicate-submission guard
    verifyingRef.current = true;
    setVerifying(true);
    try {
      await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: { email: otpEmail, code },
      });
      setOtpStatus("success");
      await autoLoginAfterVerification();
    } catch (err) {
      // Server message ("not valid or has expired…", lockout, 429) renders
      // through the block's error line — the slots shake on status "error".
      setOtpStatus("error");
      setOtpError(
        err instanceof Error
          ? err.message
          : "That code is not valid or has expired. Request a new one if it keeps failing.",
      );
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (counting || resending || verifying || otpStatus === "success") return;
    setResending(true);
    try {
      await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: { email: otpEmail },
      });
      // Fresh code — clear the slots so the official onComplete can fire on
      // the next complete entry. The new code rides in the (re-)sent email.
      setOtpValue("");
      setOtpStatus("idle");
      setOtpError(undefined);
      setResendIn(60);
    } catch (err) {
      // Enumeration-safe endpoint; the 429 envelope is the only error path.
      toast.error(
        err instanceof Error ? err.message : "Could not resend the code. Please try again.",
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <AuthBrandPanel />

      {/* Form column — the official BEUI SignUpForm card (form step) or the
          OTP verification card (otp step) on the white canvas; the lg+ brand
          panel carries brand + heading. Enterprise pass: mobile lockup heads
          the column below lg, both cards are the white lift-shadow content
          cards, and the RA 10173 trust strip sits under them. */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Institutional lockup — phones/tablets only (lg+ carries the
              full AuthBrandPanel letterhead alongside) */}
          <AuthMobileLockup className="mb-7" />

          {step === "form" ? (
            <SignUpForm
              values={values}
              onValuesChange={setValues}
              validate={validateRmis}
              onSubmit={submit}
              errorMessage={formError}
              /* Two-line title node (form polish pass): the gov.ph letterhead
                  eyebrow sits over the title exactly like the sign-in card's
                  header — aria-hidden so the heading's accessible name stays
                  "Create your account". Both spans are phrasing content, so
                  the block's <h2> stays valid. */
              title={
                <>
                  <span
                    aria-hidden="true"
                    className="eyebrow mb-1.5 block"
                  >
                    Republic of the Philippines · DOST-MIRDC
                  </span>
                  <span className="block">Create your account</span>
                </>
              }
              description="Register to apply for positions at DOST-MIRDC."
              /* White content card — the dlg-card-plain anatomy (the
                 .dark .bg-white sweep keeps night mode correct). The header
                 and footer carry the sign-in card's hairline rules through
                 the block's sanctioned classNames hooks. */
              className="bg-white shadow-[var(--shadow-lift)]"
              classNames={{
                header: "border-b border-border/70 pb-4",
                footer: "border-t border-border/70 pt-4",
                /* Field-visibility on the tinted card: pin the official Input
                   capsules white through the descendant fill — the capsules
                   are the only data-state carriers inside the fields wrapper,
                   so this hits exactly them (same pass as BEUI_FIELD_FILL;
                   no vendored edits). */
                fields: "[&_[data-state]]:bg-white",
              }}
              footer={
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("signin")}
                    className="inline-flex h-11 -my-3 items-center px-1 text-sm font-medium text-metric-blue underline-offset-2 transition-colors hover:text-ink hover:underline focus-ring"
                  >
                    Sign in
                  </button>
                </>
              }
            />
          ) : (
            <div className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-border bg-white p-6 shadow-[var(--shadow-lift)]">
              {/* Card header — gov.ph letterhead eyebrow over a hairline
                  rule, then the official block's header typography */}
              <div className="flex flex-col gap-1 border-b border-border/70 pb-4">
                <p className="eyebrow">Republic of the Philippines · DOST-MIRDC</p>
                <h2 className="mt-1.5 text-xl font-medium text-ink">
                  Verify your email
                </h2>
                <p className="text-sm text-body-gray">
                  Enter the 6-digit code from your inbox to finish creating your
                  account.
                </p>
              </div>

              {/* OFFICIAL BEUI OTPInput — used unmodified: error shakes via
                  the block's own animation, success draws its check, and
                  onComplete fires on the empty→full transition only. */}
              <OTPInput
                label="Verification code"
                hint={`We sent a 6-digit code to ${maskEmail(otpEmail)}.`}
                value={otpValue}
                onChange={(next) => {
                  setOtpValue(next);
                  // Editing the code returns the block to its idle look.
                  if (otpStatus !== "idle") setOtpStatus("idle");
                }}
                onComplete={completeVerify}
                status={otpStatus}
                successMessage="Email verified."
                errorMessage={otpError}
                disabled={verifying || otpStatus === "success"}
                autoFocus
                /* Field-visibility on the tinted card: the official slots
                   ship unfilled (bordered outlines that vanish into the
                   cloud/60 card) — pin them white via the sanctioned root
                   className prop; the slots are the only data-active
                   carriers inside. */
                className="[&_[data-active]]:bg-white"
              />

              {/* Resend — 60s cooldown; disabled while counting, sending,
                  verifying or verified. The endpoint is enumeration-safe and
                  rate-limited; a 429 surfaces via toast. */}
              <div className="flex justify-end px-1">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendIn > 0 || resending || verifying || otpStatus === "success"}
                  className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {/* Gate-aware Turnstile — invisible (interaction-only) while it
              auto-solves; occupies zero layout space on the staff door,
              where it never mounts at all. Mounts on BOTH steps: the post-
              verification auto-login still needs a fresh single-use token. */}
          {captcha.enabled && captcha.siteKey && (
            <Turnstile
              ref={turnstileRef}
              siteKey={captcha.siteKey}
              onToken={handleToken}
              appearance="interaction-only"
            />
          )}

          {/* RA 10173 legal notice — the data-privacy agreement the block's
              Terms checkbox refers to (mandatory consent, spec §3.4).
              Form step only — the OTP card has nothing to consent to. */}
          {step === "form" && (
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
              I have read and accept the data-privacy notice in compliance with the
              Data Privacy Act of 2012 (RA 10173).
            </p>
          )}

          {/* Official-use trust strip — the government-portal convention,
              shared by every auth page (privacy variant: RA 10173 line) */}
          <AuthSecureStrip variant="privacy" className="mt-4" />
        </div>
      </div>
    </div>
  );
}
