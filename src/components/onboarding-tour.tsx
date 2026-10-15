"use client";

// ============================================================================
// RMIS — Guided onboarding tour (QA 2026-02, applicant module item 1).
// A dependency-free spotlight walkthrough for first-time users: a welcome
// dialog offers "Start the guided tour" or "Skip", then each step spotlights
// a page element ([data-tour] hooks) with a coach card (Back / Next / Skip).
// Dismissal persists to localStorage so the tour never nags again. The
// spotlight uses the classic box-shadow cutout: one absolutely-positioned
// ring element casts the dim over the rest of the page, so no second
// backdrop layer is needed and the target stays fully interactive-looking.
// Task 20 — steps whose target is missing or display:none at the current
// viewport (the home's Job Openings pane is desktop-only now) are skipped
// automatically instead of spotlighting empty space.
// Task 15 — the spotlight ring + coach card now render through a PORTAL to
// document.body. Below lg the workspace shell wraps pages in a
// PullToRefresh scroller whose inner layer carries will-change:transform —
// that turns the layer into a CONTAINING BLOCK for position:fixed, so the
// spotlight/coach silently anchored to it (the coach landed ~1800px above
// the viewport on the profile page's phone layout). Portaling to body
// anchors both elements to the real viewport on every screen; the welcome
// dialog was already safe (Radix portals its own overlay).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Compass } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TourStep = {
  /** CSS selector of the element to spotlight (e.g. `[data-tour="apply-now"]`). */
  selector: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export default function OnboardingTour({
  steps,
  storageKey,
  title = "Welcome!",
  description,
}: {
  steps: TourStep[];
  /** localStorage flag — once set (any value) the tour never shows again. */
  storageKey: string;
  title?: string;
  description: string;
}) {
  const [phase, setPhase] = useState<"welcome" | "active" | "done">("welcome");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const rafRef = useRef(0);
  // Latest steps via ref: callers pass an inline array literal (new identity
  // on every host render — e.g. the applicant home's 30 s poll), and the
  // follow-scroll below must fire on STEP changes only, not on every host
  // re-render, or it would yank the viewport back to the target mid-visit.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // Only offer the tour once per browser.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey)) setPhase("done");
    } catch {
      /* storage unavailable — default to showing the welcome */
    }
  }, [storageKey]);

  const measure = useCallback(() => {
    if (phase !== "active") return;
    const step = steps[index];
    if (!step) return;
    const el = document.querySelector(step.selector);
    // Missing OR display:none targets (viewport-dependent sections) have no
    // box to spotlight — fall back to the centered coach card.
    if (!el || el.getClientRects().length === 0) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [phase, index, steps]);

  // Re-measure on layout changes while active.
  useEffect(() => {
    if (phase !== "active") return;
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const t = window.setInterval(schedule, 400); // catch layout shifts
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.clearInterval(t);
    };
  }, [phase, measure, tick]);

  // QA fix — follow the highlighted element. The spotlight is viewport-fixed,
  // so a target below the fold left it parked off-screen with no cue to scroll
  // (most visible on phones, where the applicant-home sections stack). Bring
  // each new step's target into view: centered, smooth unless the user prefers
  // reduced motion. The scroll listener above re-measures along the way, so
  // the spotlight glides with the element instead of jumping. Fires only when
  // the tour activates or the step changes (never on host re-renders).
  useEffect(() => {
    if (phase !== "active") return;
    const step = stepsRef.current[index];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) return;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: reduced ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, index]);

  const finish = useCallback(() => {
    setPhase("done");
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Travel direction of the last Next/Back press — the skip walk below
  // continues in that direction so Back never bounces forward.
  const dirRef = useRef<1 | -1>(1);
  const prevIndexRef = useRef<number | null>(null);

  // Task 20 — skip steps whose [data-tour] target isn't rendered at the
  // current viewport (e.g. the home's Job Openings pane is desktop-only, so
  // on phones that step would spotlight empty space). A hidden/missing
  // target hops to the nearest visible step in the travel direction — never
  // back to the step just left — and the tour ends early when nothing
  // visible remains ahead.
  useEffect(() => {
    if (phase !== "active") return;
    const step = stepsRef.current[index];
    if (!step) {
      finish();
      return;
    }
    const el = document.querySelector(step.selector);
    if (el && el.getClientRects().length > 0) return;
    const visible = stepsRef.current
      .map((_, i) => i)
      .filter((i) => {
        const e = document.querySelector(stepsRef.current[i].selector);
        return !!e && e.getClientRects().length > 0;
      });
    const ordered = dirRef.current === 1 ? visible : [...visible].reverse();
    const prev = prevIndexRef.current;
    const target = ordered.find((i) => i !== index && i !== prev);
    if (target !== undefined) setIndex(target);
    else finish();
  }, [phase, index, finish]);

  if (phase === "done") return null;

  const step = steps[index];
  const last = index === steps.length - 1;

  // Coach card placement: below the target when it fits, otherwise above;
  // clamped to the viewport with a 16px margin.
  const cardStyle = (() => {
    if (!rect) {
      return { top: "50%", left: "50%", transform: "translate(-50%,-50%)" } as React.CSSProperties;
    }
    const CARD_W = 340;
    // Task 15 — raised from 200: the measured coach card runs ~258px tall
    // with a full step body on a 390px phone, so the 200px estimate let the
    // card overlap the spotlighted element's top edge. 280 keeps the card
    // clear of the target on phones; the "fits below" check scales with it.
    const CARD_H_EST = 280;
    const below = rect.top + rect.height + 12;
    const above = rect.top - CARD_H_EST - 12;
    const top = below + CARD_H_EST < window.innerHeight - 16 ? below : Math.max(16, above);
    const left = Math.min(
      Math.max(16, rect.left + rect.width / 2 - CARD_W / 2),
      window.innerWidth - CARD_W - 16
    );
    return { top, left, width: CARD_W } as React.CSSProperties;
  })();

  return (
    <>
      {/* Spotlight + dim + coach card — Task 15: portal to document.body so
          the fixed positioning is viewport-anchored even inside transformed
          ancestors (the mobile PullToRefresh scroller layer). */}
      {phase === "active" &&
        createPortal(
          <>
            <div
              className="pointer-events-none fixed z-[70]"
              style={{
                top: (rect?.top ?? 0) - PAD,
                left: (rect?.left ?? 0) - PAD,
                width: (rect?.width ?? 0) + PAD * 2,
                height: (rect?.height ?? 0) + PAD * 2,
                borderRadius: 20,
                boxShadow: "0 0 0 9999px rgba(31, 32, 37, 0.55), 0 0 0 4px rgba(255,255,255,0.9)",
                transition: "all 260ms cubic-bezier(0.22,1,0.36,1)",
              }}
              aria-hidden="true"
            />

            <div
              key={`${index}-${tick}`}
              role="dialog"
              aria-modal="false"
              aria-label={`Tour step ${index + 1} of ${steps.length}: ${step.title}`}
              className="dlg-card-plain fixed z-[71] animate-in fade-in slide-in-from-bottom-2 duration-200 p-5 shadow-e4"
              style={cardStyle}
            >
              <p className="eyebrow">
                Step {index + 1} of {steps.length}
              </p>
              <h2 className="mt-1.5 text-base font-medium text-ink">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-body-gray">{step.body}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={finish}
                  className="min-h-[36px] text-xs text-stone underline underline-offset-2 hover:text-ink"
                >
                  Skip tour
                </button>
                <div className="flex items-center gap-2">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        prevIndexRef.current = index;
                        dirRef.current = -1;
                        setIndex((i) => Math.max(0, i - 1));
                        setTick((t) => t + 1);
                      }}
                      className="dlg-ghost min-h-[36px] px-4 text-xs"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      if (last) finish();
                      else {
                        prevIndexRef.current = index;
                        dirRef.current = 1;
                        setIndex((i) => i + 1);
                        setTick((t) => t + 1);
                      }
                    }}
                    className="dlg-cta min-h-[36px] px-5 text-xs font-medium"
                  >
                    {last ? "Finish" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Welcome dialog */}
      <Dialog
        open={phase === "welcome"}
        onOpenChange={(open) => {
          if (!open) finish(); // dismissed via X / outside click = skip
        }}
      >
        <DialogContent className="dlg-card-plain sm:max-w-md" ariaLabel={title}>
          <DialogHeader>
            <div className="mb-1 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-cloud text-metric-blue">
                <Compass className="h-5 w-5" aria-hidden="true" />
              </span>
              <DialogTitle className="text-2xl font-medium leading-[1.1] text-ink">{title}</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed text-body-gray">
              {description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setPhase("active")}
              className="dlg-cta min-h-[44px] w-full px-5 py-2.5 text-sm font-medium"
            >
              Start the guided tour
            </button>
            <button
              type="button"
              onClick={finish}
              className="dlg-ghost min-h-[44px] w-full px-5 py-2.5 text-sm"
            >
              I'll explore on my own
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
