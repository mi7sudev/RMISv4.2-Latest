"use client";

// ============================================================================
// RMIS — Cloudflare Turnstile widget (client, explicit rendering).
//
// appearance:
//   "interaction-only" (default) — the challenge runs invisibly and only
//     becomes visible if Cloudflare forces an interactive puzzle. This is
//     what removes the recurring "Success!" confirmation box on every
//     reload/navigation while Managed mode still auto-clears humans.
//   "always" — the classic always-visible 65px checkbox box.
//
// Tokens are SINGLE-USE and expire in ~300s: after consuming or failing an
// attempt, call ref.reset() so the widget mints a fresh token.
// ============================================================================

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

type TurnstileRenderParameters = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "refresh-expired"?: "auto" | "manual" | "never";
  appearance?: "always" | "execute" | "interaction-only";
  theme?: "light" | "dark" | "auto";
  retry?: "auto" | "never";
  "retry-interval"?: number;
};

type TurnstileApi = {
  render: (el: HTMLElement, params: TurnstileRenderParameters) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Load the Turnstile script once per page; later mounts reuse it. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile is browser-only"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      const el = existing ?? document.createElement("script");
      const onReady = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile loaded without API"));
      };
      el.addEventListener("load", onReady, { once: true });
      el.addEventListener(
        "error",
        () => reject(new Error("Failed to load the Turnstile script")),
        { once: true }
      );
      if (!existing) {
        el.src = SCRIPT_SRC;
        el.async = true;
        document.head.appendChild(el);
      }
    });
    // Allow a later mount to retry if the load failed.
    scriptPromise.catch(() => {
      scriptPromise = null;
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

type TurnstileProps = {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** "interaction-only" (default) keeps the widget invisible while it
   *  auto-solves; "always" shows the classic visible challenge box. */
  appearance?: "always" | "interaction-only";
};

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onToken, appearance = "interaction-only" },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef(onToken);

  // Keep the latest callback without re-rendering the widget (the effect
  // below captures it once; Turnstile fires long after mount).
  useEffect(() => {
    tokenRef.current = onToken;
  }, [onToken]);

  const reset = useCallback(() => {
    const api = window.turnstile;
    if (api && widgetIdRef.current !== null) api.reset(widgetIdRef.current);
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = api.render(hostRef.current, {
          sitekey: siteKey,
          theme: "light",
          retry: "auto",
          "refresh-expired": "auto",
          appearance,
          callback: (token) => tokenRef.current(token),
          "expired-callback": () => tokenRef.current(null),
          "error-callback": () => tokenRef.current(null),
        });
      })
      .catch(() => tokenRef.current(null));

    return () => {
      cancelled = true;
      const api = window.turnstile;
      if (api && widgetIdRef.current !== null) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // widget already torn down
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, appearance]);

  return (
    <div
      ref={hostRef}
      className={appearance === "always" ? "min-h-[65px]" : undefined}
      role="group"
      aria-label="Human verification"
    />
  );
});

export default Turnstile;
