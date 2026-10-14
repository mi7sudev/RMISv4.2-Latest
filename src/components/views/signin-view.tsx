"use client";

// ============================================================================
// RMIS — Sign-in view (spec §3.3, §7.3): identifier (email or username) +
// password, demo account chips, welcome toast → session refresh → role home.
// BEUI Phase 4 + Task 24: there is no official BEUI sign-in block in the
// registry (beui.dev/r/registry.json — only signup-form exists), so the form
// is COMPOSED from the official BEUI primitives, used unmodified, inside the
// official SignUpForm block's card anatomy (rounded-3xl bordered card, header
// inside, icon-led capsule fields, submit inside):
//   • Input (src/components/motion/input.tsx) — official label/error/success
//     field with shake + animated inline messages, Mail/Lock left icons and
//     the block's Eye/EyeOff password reveal
//   • StatefulButton (src/components/motion/button) — official idle/loading/
//     success/error submit lifecycle ("Signing in…" cascade, "Try again")
// Validation mirrors the official SignUpForm behavior ("reward early, punish
// late"): errors are computed on every change, a field only shows its error
// once blurred (or submit touched everything), and a field in error clears
// the moment it becomes valid. Server failures render in the same form-level
// error line the official block uses, and the StatefulButton flips to its
// error state. Gate-aware Turnstile: the widget only mounts when GET
// /api/auth/captcha says this request arrived on the public applicant door —
// it renders invisibly (interaction-only) and auto-clears humans; the token
// rides along in the login payload. On the employee door the form is captcha-
// free. Bevel pass: lg+ split screen with the shared institutional
// AuthBrandPanel on the left and the form directly on the white canvas on the
// right, inside PublicShell (sticky header + footer). All handlers, API
// calls, and copy are preserved exactly.
// Task 30-b — email-verification gate: when the login endpoint answers 403
// "Please verify your email first — we sent a 6-digit code to your inbox."
// (password was correct, account still unconfirmed), a "Resend verification
// code" text button renders under the form error. It is offered ONLY when
// the error is that gate message AND the identifier looks like an email —
// /api/auth/resend-otp keys on the address, not a username. The endpoint is
// enumeration-safe (always ok({ sent: true })); a 429 surfaces via toast.
// Task 31 — the forgot-password dialog joins the same error contract the
// main form already runs: clicking validates + shakes the email field
// (official Input `error` prop), correcting it clears immediately.
// Field-visibility pass: the card is the profile forms' cloud/60 surface, so
// the official Input capsules (which ship with NO fill — invisible on a
// tinted card) are pinned white through the official classNames.field prop
// with the shared BEUI_FIELD_FILL token (same pass as the profile forms;
// no-op on the white forgot-password dialog).
// Enterprise pass (QA: auth pages read "too simple" — enterprise look across
// the system): the form column gains the shared auth furniture — the mobile
// institutional lockup below lg (the brand panel is hidden there, so the
// page previously had NO brand on phones) and the official-use trust strip
// under the card. The card itself is upgraded to the dlg-card-plain anatomy:
// white fill + lift shadow, a gov.ph letterhead eyebrow over a hairline rule
// heading the form, and the StatefulButton submit. All handlers, API calls,
// validation and copy are preserved exactly.
// Form polish pass (QA: the form column read ugly — dead space and loose
// fragments): "Forgot password?" moves UP onto the Password label row (the
// classic sign-in pattern; the label row is rendered here because the
// official Input's label prop is string-only and vendored), the cross-link
// to sign-up becomes a proper in-card footer line ("New to RMIS? Create an
// account" — mirroring the sign-up card's footer), the redundant
// "Back to vacant positions" link is dropped (the site header owns that
// navigation), and the demo quick-fill is restyled as a quiet fog panel in
// the same visual family as the trust strip. All handlers, API calls,
// validation and copy are preserved exactly.
// ============================================================================

import { cancelBtn } from "@/components/ui/buttons";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/motion/input";
import { StatefulButton } from "@/components/motion/button";
import type { ButtonState } from "@/components/motion/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Turnstile } from "@/components/turnstile";
import type { TurnstileHandle } from "@/components/turnstile";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import {
  AuthMobileLockup,
  AuthSecureStrip,
} from "@/components/auth-enterprise";
import { dialogScroll } from "@/components/ui/shell";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { isEmailShape, useAuthErrors } from "@/components/forms/field-errors";
import { BEUI_FIELD_FILL } from "./profile/beui-form";
import { navigate, ROLE_HOME } from "@/lib/router";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = ["testadmin", "testevaluator", "testapplicant"] as const;

// Task 30-b — the resend affordance is offered only for email-shaped
// identifiers (resend-otp keys on the address, not a username).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Brand panel (lg+): shared institutional AuthBrandPanel — seal lockup,
// Republic/DOST/MIRDC letterhead, "Molding the future of metal industries."
// motto, fact ledger, ghosted-seal watermark.

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

export default function SignInView() {
  const { refresh } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // Official-block password reveal (SignUpForm pattern).
  const [revealPassword, setRevealPassword] = useState(false);
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<ButtonState>("idle");
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // "Reward early, punish late" — official SignUpForm touch semantics.
  const [touched, setTouched] = useState<{ identifier: boolean; password: boolean }>({
    identifier: false,
    password: false,
  });
  const [captcha, setCaptcha] = useState<CaptchaConfig>({ enabled: false, siteKey: null });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const formErrorId = useId();

  // QA 2026-02 — Forgot password (applicants, evaluators, administrators).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  // Task 32 — official SignUpForm timing for the dialog's email field:
  // flags once left, clears the moment it is fixed, submit reveals all.
  const forgotRules = {
    email: !forgotEmail.trim()
      ? "Enter the email on your account"
      : !isEmailShape(forgotEmail.trim())
        ? "Enter a valid email address"
        : undefined,
  };
  const {
    shown: shownForgot,
    touch: touchForgot,
    touchAll: touchAllForgot,
    reset: resetForgot,
  } = useAuthErrors(forgotRules);

  // Task 30-b — resend the signup verification code from the 403 error.
  const [resendVerifyBusy, setResendVerifyBusy] = useState(false);

  const submitForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    touchAllForgot();
    if (Object.values(forgotRules).some(Boolean)) return;
    setForgotBusy(true);
    try {
      const res = await apiFetch<{ message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email: forgotEmail.trim() },
      });
      toast.success("Check your inbox", { description: res.message });
      setForgotOpen(false);
      setForgotEmail("");
      resetForgot();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setForgotBusy(false);
    }
  };

  // Gate-aware captcha: ask the server which door we are on. If the config
  // fetch fails the widget simply stays off — the login endpoint re-checks
  // the gate server-side and will 403 with a clear message if one is needed.
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

  // Task 30-b — offer the resend only for the verification-gate message AND
  // an email-shaped identifier (any other 403/401 gets no affordance).
  const showResendVerification =
    !!formError &&
    formError.includes("verify your email") &&
    EMAIL_SHAPE.test(identifier.trim());

  const handleResendVerification = async () => {
    if (resendVerifyBusy) return;
    setResendVerifyBusy(true);
    try {
      // Enumeration-safe: ok({ sent: true }) regardless of account state.
      await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: { email: identifier.trim() },
      });
      toast.success("Verification code sent", {
        description: "A new 6-digit code is on its way to your inbox.",
      });
    } catch (err) {
      // The rate-limited 429 envelope is the only error path — surface it.
      toast.error(
        err instanceof Error ? err.message : "Could not resend the verification code",
      );
    } finally {
      setResendVerifyBusy(false);
    }
  };

  // Field rules — computed on every change; shown only once touched.
  const identifierError = !identifier.trim() ? "Enter your email or username" : undefined;
  const passwordError = !password ? "Enter your password" : undefined;
  const shownIdentifierError = touched.identifier ? identifierError : undefined;
  const shownPasswordError = touched.password ? passwordError : undefined;

  /** Official SignUpForm reset semantics: an error/success button returns to
      idle the moment any value changes. */
  const resetStatus = () =>
    setStatus((current) => (current === "success" || current === "error" ? "idle" : current));

  const changeIdentifier = (next: string) => {
    setIdentifier(next);
    resetStatus();
    setFormError(undefined);
  };

  const changePassword = (next: string) => {
    setPassword(next);
    resetStatus();
    setFormError(undefined);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched({ identifier: true, password: true });
    if (identifierError || passwordError) return;
    setStatus("loading");
    setFormError(undefined);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password, captchaToken },
      });
      setStatus("success");
      toast.success("Welcome to RMIS");
      const user = await refresh();
      navigate(user ? ROLE_HOME[user.role] : "jobs");
    } catch (err) {
      setStatus("error");
      setFormError(
        err instanceof Error ? err.message : "Sign in failed. Please try again.",
      );
      // Tokens are single-use — mint a fresh one for the next attempt.
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <AuthBrandPanel />

      {/* Form column — the card mirrors the official SignUpForm block
          anatomy (rounded-3xl bordered card, header inside, icon-led capsule
          fields, submit inside); the reduced lg+ vertical padding keeps the
          whole auth page (panel + form + footer) inside a ~800px viewport
          without scrolling. Enterprise pass: mobile lockup heads the column
          below lg, the card is the white lift-shadow content card with a
          letterhead header, and the official-use strip sits under it. */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12 lg:py-7">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Institutional lockup — phones/tablets only (lg+ carries the
              full AuthBrandPanel letterhead alongside) */}
          <AuthMobileLockup className="mb-7" />

          <form
            onSubmit={submit}
            noValidate
            className="flex w-full flex-col gap-5 rounded-3xl border border-border bg-white p-6 shadow-[var(--shadow-lift)]"
          >
            {/* Card header — gov.ph letterhead eyebrow over a hairline rule,
                then the official block's header typography */}
            <div className="flex flex-col gap-1 border-b border-border/70 pb-4">
              <p className="eyebrow">Republic of the Philippines · DOST-MIRDC</p>
              <h2 className="mt-1.5 text-xl font-medium text-ink">
                Welcome back
              </h2>
              <p className="text-sm text-body-gray">
                Sign in with your email or username to continue.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Input
                label="Email or username"
                autoComplete="username"
                placeholder="you@example.gov.ph"
                leftIcon={<Mail />}
                disabled={status === "loading"}
                value={identifier}
                onChange={changeIdentifier}
                onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
                error={shownIdentifierError}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
              />
              {/* Password + inline forgot (form polish pass) — the label row
                  is rendered here so "Forgot password?" sits ON the Password
                  label line instead of floating in dead space between the
                  field and the submit. The external <label htmlFor> binds to
                  the Input via its explicit id, so the accessible name and
                  the official field anatomy are unchanged. */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                  <label
                    htmlFor="signin-password"
                    className="text-sm font-medium text-foreground"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="-mr-1 inline-flex h-5 items-center px-1 text-[13px] font-medium text-metric-blue underline-offset-2 transition-colors hover:text-ink hover:underline focus-ring"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="signin-password"
                  type={revealPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  leftIcon={<Lock />}
                  rightIcon={
                    <button
                      type="button"
                      disabled={status === "loading"}
                      onClick={() => setRevealPassword((prev) => !prev)}
                      aria-label={revealPassword ? "Hide password" : "Show password"}
                      className="text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-ring"
                    >
                      {revealPassword ? <EyeOff /> : <Eye />}
                    </button>
                  }
                  disabled={status === "loading"}
                  value={password}
                  onChange={changePassword}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  error={shownPasswordError}
                  reserveErrorLine
                  classNames={{ field: BEUI_FIELD_FILL }}
                />
              </div>
            </div>

              {/* Gate-aware Turnstile — invisible (interaction-only) while it
                  auto-solves; occupies zero layout space on the staff door,
                  where it never mounts at all. */}
              {captcha.enabled && captcha.siteKey && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={captcha.siteKey}
                  onToken={setCaptchaToken}
                  appearance="interaction-only"
                />
              )}

              {/* Form-level failure — the official block's animated
                  errorMessage line, verbatim pattern. */}
              <AnimatePresence initial={false}>
                {formError ? (
                  <motion.p
                    id={formErrorId}
                    role="alert"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    {formError}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {/* Task 30-b — unverified-applicant 403: resend the 6-digit
                  code right where the error renders (email-shaped
                  identifiers only — resend-otp keys on the address). */}
              {showResendVerification ? (
                <div className="flex justify-center px-1">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendVerifyBusy}
                    className="min-h-[44px] text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Resend verification code
                  </button>
                </div>
              ) : null}

              <StatefulButton
                type="submit"
                size="lg"
                state={status}
                loadingText="Signing in"
                successText="Welcome"
                errorText="Try again"
                aria-describedby={formError ? formErrorId : undefined}
                className="w-full"
              >
                Sign in
              </StatefulButton>

              {/* Card footer — the sign-up card's cross-link line, mirrored:
                  the registration affordance lives INSIDE the card behind a
                  hairline instead of floating under the demo panel. (The old
                  "Back to vacant positions" link is gone — the site header
                  owns that navigation on every auth page.) */}
              <div className="border-t border-border/70 pt-3 text-center text-sm text-body-gray">
                New to RMIS?{" "}
                <button
                  type="button"
                  onClick={() => navigate("signup")}
                  className="inline-flex h-11 -my-3 items-center px-1 text-sm font-medium text-metric-blue underline-offset-2 transition-colors hover:text-ink hover:underline focus-ring"
                >
                  Create an account
                </button>
              </div>
          </form>

          {/* Official-use trust strip — the government-portal convention,
              shared by every auth page (session/audit variant here) */}
          <AuthSecureStrip className="mt-4" />

          {/* Demo access (form polish pass) — a quiet fog panel in the SAME
              visual family as the trust strip above: eyebrow + credential
              hint, compact quick-fill chips, the network note. Replaces the
              old loose border-t section + stray link row. */}
          <div className="mt-4 rounded-2xl border border-border/70 bg-fog/60 px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="eyebrow">Demo access</p>
              <p className="text-[11px] font-medium text-stone">Password: password123</p>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((name) => {
                const selected = identifier === name && password === "password123";
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setIdentifier(name);
                      setPassword("password123");
                      resetStatus();
                      setFormError(undefined);
                    }}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-all duration-150",
                      selected
                        ? "dlg-cta"
                        : "border border-border bg-white/80 text-ink hover:border-foreground/30 hover:bg-white"
                    )}
                  >
                    {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-stone">
              Staff accounts are restricted to the MIRDC intranet; applicants can sign in from any
              network.
            </p>
          </div>
        </div>
      </div>

      {/* Forgot password dialog (QA 2026-02) */}
      <Dialog
        open={forgotOpen}
        onOpenChange={(o) => {
          setForgotOpen(o);
          if (!o) resetForgot();
        }}
      >
        {/* Task 32 — the dialog carries the official SignUpForm card anatomy:
            hairline-bordered white card, auth header typography, gap-5 flow
            of icon-led capsule fields with reserved error lines. */}
        <DialogContent className={`${dialogScroll} rounded-3xl border border-border bg-white sm:max-w-md`} ariaLabel="Reset your password">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-foreground">Reset your password</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Enter the email address on your account (applicants, evaluators, and administrators
              alike) and we'll send you a reset link. The link expires in 30 minutes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForgot} className="flex flex-col gap-5" noValidate>
            <Input
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.gov.ph"
              leftIcon={<Mail />}
              disabled={forgotBusy}
              value={forgotEmail}
              onChange={setForgotEmail}
              onBlur={() => touchForgot("email")}
              error={shownForgot("email")}
              reserveErrorLine
            />
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className={cancelBtn}
              >
                Cancel
              </button>
              <StatefulButton
                type="submit"
                size="md"
                state={forgotBusy ? "loading" : "idle"}
                loadingText="Sending"
                className="min-h-[44px] px-5 py-2.5"
              >
                Send reset link
              </StatefulButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
