"use client";

// ============================================================================
// RMIS — Applicant journey info button + modal (spec §13 sidebar): a small
// circular (!) affordance PINNED TO THE BOTTOM of the navigation, directly
// ABOVE the active-user profile card (avatar + name + role — APPLICANT role
// only). It renders in the light desktop rail (variant "rail", default) and
// in the white mobile drawer (variant "drawer") — both surfaces carry the
// same circle → divider → profile-card bottom stack. Clicking it opens the
// "How hiring works" infographic as a modal dialog. The steps mirror the
// REAL recruitment pipeline (src/lib/status.ts): Applied → Under Review →
// Shortlisted, after which the process continues offline — HR emails
// schedule the interview, skills exam and appointment face-to-face
// (MOM 2026-09-03 flow). The disc is SOLID BRAND BLUE with a white (!) — a
// deliberate visual twin of the profile avatar beneath it, so the
// affordance reads instantly. Collapsed rail: the circle recenters,
// tooltip flips to the right — same affordance, icon-only (consistent with
// the other rail items).
// ============================================================================

import {
  BadgeCheck,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  Inbox,
  Mail,
  ScanSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/motion/tooltip";

type JourneyStep = {
  icon: LucideIcon;
  label: string;
  description: string;
};

/** Mirrors the system's actual pipeline + the offline MOM steps. Step glyphs
 *  share the stage vocabulary (STAGE_GLYPH in lib/status-ui): Apply = Inbox
 *  (the application lands in HR's queue), Under review = ScanSearch — the
 *  same shape the staff-side stage dots and queue filter chips speak. */
const STEPS: JourneyStep[] = [
  {
    icon: Inbox,
    label: "Apply",
    description: "Submit your application on the Jobs board.",
  },
  {
    icon: ScanSearch,
    label: "Under review",
    description: "HR evaluates your credentials and documents.",
  },
  {
    icon: BadgeCheck,
    label: "Shortlisted",
    description: "You get the good-news email — congrats!",
  },
  {
    icon: CalendarCheck,
    label: "Face-to-face",
    description: "Interview, skills exam and appointment in person.",
  },
];

// ── Shared journey modal ────────────────────────────────────────────────────

/** The "How hiring works" infographic dialog — one source for every trigger
 *  (desktop rail disc, mobile identity card disc, mobile menu row). */
function JourneyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dlg-card-plain max-h-[90dvh] overflow-y-auto scroll-thin sm:max-w-md" ariaLabel="How hiring works">
        <DialogHeader>
          <DialogDescription className="eyebrow text-stone">Your journey</DialogDescription>
          <DialogTitle className="font-display text-xl text-ink">
            How hiring works
          </DialogTitle>
        </DialogHeader>

        <ol className="mt-1">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1;
            return (
              <li key={step.label} className="grid grid-cols-[auto_1fr] gap-x-3.5">
                {/* Node column — icon disc + connector rail down to the next step */}
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{
                      background: "color-mix(in srgb, var(--primary) 12%, white)",
                      color: "var(--primary)",
                    }}
                  >
                    <step.icon className="h-4 w-4" />
                  </span>
                  {!last && (
                    <span
                      aria-hidden="true"
                      className="my-1 w-px flex-1"
                      style={{ background: "var(--divider)" }}
                    />
                  )}
                </div>
                {/* Copy column */}
                <div className={last ? "pb-0.5" : "pb-4"}>
                  <p className="text-sm font-medium text-ink">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-body-gray">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Ties into the email-notice pipeline — HR notices arrive by email. */}
        <p
          className="mt-1 flex items-start gap-2.5 border-t pt-4 text-xs leading-relaxed text-stone"
          style={{ borderTopColor: "var(--divider)" }}
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} aria-hidden="true" />
          <span>
            Status updates land in your email from{" "}
            <span className="font-medium text-ink">DOST-MIRDC Recruitment</span> — the same
            address that schedules your interview.
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function RailJourneyInfo({
  collapsed = false,
  variant = "rail",
}: {
  collapsed?: boolean;
  /** "rail" = dark desktop rail (disc inset 8px to twin the avatar);
   *  "drawer" = white mobile drawer (disc flush with the account avatar). */
  variant?: "rail" | "drawer";
}) {
  // BEUI phase 6: the official Center Morph Modal trigger can't nest inside
  // Radix's asChild Tooltip chain, so the shared button now drives a
  // controlled Dialog — same affordance, hover tooltip intact.
  const [open, setOpen] = useState(false);
  const trigger = (
    <button
      type="button"
      aria-label="How hiring works"
      title="How hiring works"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className={`group flex min-h-[44px] w-full items-center rounded-full text-[var(--rail-text)] transition-colors hover:bg-[var(--rail-hover-bg)] hover:text-ink ${
        collapsed ? "justify-center px-0" : variant === "drawer" ? "px-0" : "px-2"
      }`}
    >
      {/* Solid brand-blue disc + white (!) — matches the profile avatar's
          size and fill directly below, so the two read as a set. */}
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-150 group-hover:scale-[1.06] group-hover:brightness-110"
        style={{
          background: "var(--primary)",
          color: "#ffffff",
          boxShadow: "var(--shadow-e2)",
        }}
      >
        <CircleAlert className="h-4 w-4" />
      </span>
    </button>
  );

  return (
    <>
      {/* Tooltip + dialog share one trigger element — the button opens the
          modal on click while hover still shows the affordance label. BEUI
          description mode (no asLabel): the trigger already carries the real
          accessible name aria-label="How hiring works", so the tooltip is
          supplementary (aria-describedby) and never replaces it; the native
          title attribute is also untouched. */}
      <Tooltip content="How hiring works" side="right" arrow>
        {trigger}
      </Tooltip>

      <JourneyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Menu-row trigger for the journey modal — the official preview's Row
 *  pattern (icon · label · chevron) so it can live inside an Expandable
 *  Tabs panel (mobile Positions section panel). */
export function RailJourneyInfoRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="How hiring works"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        {/* Same (!) glyph as the journey disc — the two triggers read as one
            affordance across surfaces. */}
        <CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">How hiring works</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <JourneyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default RailJourneyInfo;
