"use client";

// ============================================================================
// RMIS — Reset password view (QA 2026-02, sign-in item 3). Reached from the
// emailed link (#/reset-password?token=…): verifies the token by using it,
// collects a new password twice, then hands the user back to sign-in.
// Rendered inside PublicShell (header + footer).
// Task 31 — the sign-in/sign-up error contract applies here: no
// disabled-for-gaps; official Input `error` shake; reward early.
// Task 32 — the form now CARRIES THE SIGN-IN/SIGN-UP LOOK: the official
// SignUpForm card anatomy (rounded-3xl bordered white card, gap-5 flow,
// Lock-led capsules, reserved error lines), the StatefulButton submit, and
// the block's EXACT timing via useAuthErrors — a field flags once it is
// left and clears the moment it is fixed (rules derived every render).
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/motion/input";
import { StatefulButton } from "@/components/motion/button";
import { useAuthErrors } from "@/components/forms/field-errors";
import { IconChip } from "@/components/ui/shell";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { BrandLogo } from "@/components/brand-logo";
import {
  AuthMobileLockup,
  AuthSecureStrip,
  RMIS_FULL_NAME,
} from "@/components/auth-enterprise";
import { apiFetch } from "@/lib/client";
import { navigate, useHashRoute } from "@/lib/router";

export default function ResetPasswordView() {
  const { params } = useHashRoute();
  const token = params.token ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Task 32 — official SignUpForm timing: rules derived on every render; a
  // field's error shows once it has been left (or the form submitted) and
  // clears the moment the field is fixed.
  const rules = {
    password: !password
      ? "Enter your new password."
      : password.length < 6
        ? "Password must be at least 6 characters"
        : undefined,
    confirm: !confirm
      ? "Re-enter your new password."
      : password && confirm !== password
        ? "Passwords do not match"
        : undefined,
  };
  const { shown, touch, touchAll } = useAuthErrors(rules);

  const missingToken = token.trim() === "";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    touchAll();
    if (Object.values(rules).some(Boolean)) return;
    setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
      toast.success("Password updated", {
        description: "You can now sign in with your new password.",
      });
      setTimeout(() => navigate("signin"), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Institutional lockup — keeps the reset page in the same
              enterprise family as sign-in / sign-up */}
          <AuthMobileLockup className="mb-7" />

          <div className="rounded-3xl border border-border bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">
            {/* Card brand row — lg+ only (below lg the shared mobile lockup
                above the card already carries seal + full name) */}
            <div className="hidden items-center gap-3 lg:flex">
              <BrandLogo logoSize={24} />
              {/* Complete system title as the single brand text (QA: the
                  "RMIS" wordmark line above it was redundant). */}
              <span className="min-w-0 text-balance text-left text-sm font-medium leading-tight text-ink">
                {RMIS_FULL_NAME}
              </span>
            </div>

            <div className="mt-6 flex items-start gap-3.5">
              <IconChip icon={KeyRound} tone="blue" size={44} iconSize={20} />
              <div>
                <h1 className="text-2xl font-medium leading-[1.1] text-ink">Choose a new password</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-body-gray">
                  Pick a strong password of at least 6 characters for your Recruitment Management
                  Information System account.
                </p>
              </div>
            </div>

            {missingToken ? (
              <Alert variant="destructive" className="mt-6">
                <AlertIcon>
                  <AlertCircle />
                </AlertIcon>
                <AlertContent>
                  <AlertDescription>
                    This reset link is missing its token. Please request a new password reset email.
                  </AlertDescription>
                  <AlertAction>
                    <button
                      type="button"
                      onClick={() => navigate("signin")}
                      className="block min-h-[44px] text-sm font-medium text-metric-blue underline underline-offset-2"
                    >
                      Back to sign in
                    </button>
                  </AlertAction>
                </AlertContent>
              </Alert>
            ) : done ? (
              <Alert variant="success" className="mt-6">
                <AlertIcon>
                  <ShieldCheck />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>Redirecting you to the sign-in page…</AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <form onSubmit={submit} className="mt-6 flex w-full flex-col gap-5" noValidate>
                <Input
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  leftIcon={<Lock />}
                  value={password}
                  onChange={setPassword}
                  onBlur={() => touch("password")}
                  error={shown("password")}
                  reserveErrorLine
                />
                <Input
                  id="confirm-password"
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  leftIcon={<Lock />}
                  value={confirm}
                  onChange={setConfirm}
                  onBlur={() => touch("confirm")}
                  error={shown("confirm")}
                  reserveErrorLine
                />
                <StatefulButton
                  type="submit"
                  size="lg"
                  state={busy ? "loading" : "idle"}
                  loadingText="Updating"
                  className="w-full"
                >
                  Update password
                </StatefulButton>
                <button
                  type="button"
                  onClick={() => navigate("signin")}
                  className="block min-h-[44px] w-full text-center text-sm text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
                >
                  Back to sign in
                </button>
              </form>
            )}
          </div>

          {/* Official-use trust strip — the government-portal convention,
              shared by every auth page (session/audit variant here) */}
          <AuthSecureStrip className="mt-4" />
        </div>
      </div>
    </div>
  );
}
