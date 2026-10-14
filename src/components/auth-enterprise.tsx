"use client";

// ============================================================================
// RMIS — Shared enterprise auth furniture (sign-in, sign-up, reset password).
//
// QA pass (user: the auth pages read "too simple" — make them enterprise
// looking across the whole system). Two reusable pieces, one anatomy used by
// EVERY auth page so the family can never drift apart:
//
//   · AuthMobileLockup — below lg the AuthBrandPanel is hidden and the auth
//     pages had NO brand at all (a bare form floating on white). This compact
//     institutional lockup — official seal + RMIS wordmark over the complete
//     system title — heads the form column on phones and tablets, mirroring
//     the letterhead the lg+ panel carries.
//
//   · AuthSecureStrip — the government-portal trust strip that sits directly
//     under every auth card: authorized-use / audit notice (RA 8792
//     convention) and the RA 10173 data-privacy line. Hairline card, pale fog
//     fill, brand-blue shield — the same "surface is the elevation" language
//     as the rest of the shell.
//
// Presentation only — no state, no handlers.
// ============================================================================

import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

/** The complete system name — one source of truth for every lockup.
    Official form carries the acronym in parentheses (user QA). */
export const RMIS_FULL_NAME = "Recruitment Management Information System (RMIS)";

/**
 * Compact brand lockup for the auth pages' form column below lg (the lg+
 * AuthBrandPanel owns the brand up there). Left-aligned with the card. The
 * gov.ph letterhead eyebrow itself lives in each card's header — this lockup
 * carries only the seal + complete system name so the masthead never prints
 * twice in a row.
 */
export function AuthMobileLockup({ className }: { className?: string }) {
  return (
    <div className={cn("lg:hidden", className)}>
      <div className="flex items-center gap-3">
        <BrandLogo logoSize={40} />
        {/* Complete system title as the single brand text (QA: the "RMIS"
            wordmark line above it was redundant — the title carries the
            "(RMIS)" acronym). */}
        <span className="min-w-0 text-balance text-left text-[15px] font-medium leading-tight text-ink">
          {RMIS_FULL_NAME}
        </span>
      </div>
    </div>
  );
}

/**
 * Trust strip under an auth card. Variant picks the compliance copy:
 *   · "session" — authorized-use/audit notice (sign-in, reset password)
 *   · "privacy" — RA 10173 data-privacy notice (registration)
 */
export function AuthSecureStrip({
  variant = "session",
  className,
}: {
  variant?: "session" | "privacy";
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-border/70 bg-fog/60 px-4 py-3",
        className,
      )}
    >
      <ShieldCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-metric-blue"
        aria-hidden="true"
      />
      {variant === "session" ? (
        <p className="text-[11px] leading-relaxed text-stone">
          Official government information system. Authorized use only — access is
          recorded and audited for security.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-stone">
          Personal data is collected for recruitment purposes only and protected
          under the Data Privacy Act of 2012 (RA 10173).
        </p>
      )}
    </div>
  );
}
