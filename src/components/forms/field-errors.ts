"use client";

// ============================================================================
// RMIS glue — shared submit-time field-error contract (Task 31).
// One hook for every hand-built form in the system, extracted from the
// semantics the profile builder has shipped since Task 25 (entry-form.tsx
// useEntryForm.submit + set) and the official SignUpForm block's behavior
// studied on the sign-in/sign-up pages:
//   • "The button is never disabled for gaps; clicking validates and shakes
//     the offending fields."
//   • "Fields show the error the moment submit flags them and a field's
//     error clears as soon as it is corrected" (reward early, punish late).
//   • The vendored BEUI Input (src/components/motion/input) only shakes on a
//     false→true error flip, so a re-submit with the SAME gaps re-arms every
//     shake by clearing first, then re-applying the error map 60 ms later —
//     the identical dance entry-form.tsx performs inline.
// The shake itself (x keyframes, red ring, animated inline message) is the
// official Input's `error` prop — never reimplemented here. Select/date
// fields without an official error contract wrap in entry-form's ShakeField;
// the sanctioned glue Textarea (src/components/forms/textarea) carries the
// identical contract natively.
// Task 25's entry-form.tsx and personal-info-section.tsx predate this hook
// and keep their inline implementations (verified, byte-stable); Task 31
// wires every remaining form (contact, reset password, forgot password,
// job form, user dialogs, notices, direct email) through it instead.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const rearmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (rearmRef.current) clearTimeout(rearmRef.current);
    },
    []
  );

  /** Submit-time flag: clears the map (re-arming every shake), then — when
   *  there is anything to flag — re-applies it after 60 ms. An empty map
   *  simply clears (the happy path never animates). */
  const flagErrors = useCallback((errs: Partial<Record<K, string>>) => {
    setErrors({});
    if (Object.keys(errs).length === 0) return;
    if (rearmRef.current) clearTimeout(rearmRef.current);
    rearmRef.current = setTimeout(() => setErrors(errs), 60);
  }, []);

  /** Reward early: correcting a field clears its error immediately. */
  const clearField = useCallback((key: K) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }, []);

  /** Full reset (dialog closed / form sent / seeded fresh). */
  const clearErrors = useCallback(() => {
    if (rearmRef.current) clearTimeout(rearmRef.current);
    setErrors({});
  }, []);

  return { errors, flagErrors, clearField, clearErrors };
}

/** Email shape shared by the auth pages' semantics — the same pattern the
 *  sign-in view uses to gate the resend affordance and the sign-up block
 *  uses before offering submission. */
export function isEmailShape(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ============================================================================
// Task 32 — the AUTH-EXACT field contract (useAuthErrors).
// The official SignUpForm block's timing, generalized for every glue form:
//   "flags a field only once it is left, then clears the moment it is fixed."
// The caller computes the rules map on EVERY render (derived, not stored —
// that is what makes an error disappear the instant its field becomes
// valid, with no clearing code anywhere). The hook only owns TOUCH state:
//   • touch(key)   — on a field's onBlur; its error becomes visible.
//   • touchAll()   — on submit; every gap becomes visible at once (the
//     official block sets touched for all keys the same way).
//   • shown(key)   — the error to render: undefined until the field has
//     been left (or the form submitted), then the live rule.
//   • reset()      — dialog closed / form sent / seeded fresh.
// The vendored Input shakes when its `error` prop flips false→true, so a
// field shakes exactly when its error first appears (on leave or on
// submit) — the identical onset the sign-in/sign-up pages produce.
// Note: unlike the Task 31 submit-flag hook this replaces, a same-gap
// re-submit does NOT re-shake — the official block behaves the same way
// (the error line simply stays). The dance existed to compensate for the
// missing blur-touch onset; with onset-on-leave it is obsolete.
// Rules must be computed with the SAME copy the auth pages use.
// ============================================================================

export function useAuthErrors<K extends string>(rules: Partial<Record<K, string>>) {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const touch = useCallback((key: K) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const touchAll = useCallback(() => setSubmitted(true), []);

  const reset = useCallback(() => {
    setTouched({});
    setSubmitted(false);
  }, []);

  const shown = useCallback(
    (key: K) => (touched[key] || submitted ? rules[key] : undefined),
    [touched, submitted, rules],
  );

  /** True when any live rule fires — gates the submit path after touchAll. */
  const hasGaps = Object.values(rules).some(Boolean);

  return { shown, touch, touchAll, reset, hasGaps };
}
