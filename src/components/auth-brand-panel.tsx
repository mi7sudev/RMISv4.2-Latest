"use client";

// ============================================================================
// RMIS — Auth brand panel (shared by sign-in and sign-up, lg+ only).
//
// QA 2026-02 "de-slop" pass: the previous panel read as template marketing —
// generic headline, three pastel icon pills, giant letterform watermark. This
// rebuild follows the conventions of a real government instrument instead:
//
//   · Lockup — the official seal sits flat on the panel (no capsule, no
//     shadow; "surface is the elevation").
//   · Letterhead — Republic / DOST / agency masthead behind a hairline rule,
//     the gov.ph document convention, set in the Bevel eyebrow style.
//   · Headline — the agency motto "Molding the future of metal industries."
//     replaces the generic career slogan (user-directed copy).
//   · Fact ledger — real anchors (charter year, hiring rules, privacy law)
//     as hairline-ruled definition rows; icon pills removed entirely.
//   · Watermark — the ghosted seal borrows the official-document watermark
//     convention (decorative, pointer-events-none).
//   · Foot — the office address, pinned to the panel bottom.
//
// Hero Sky gradient and the display type scale are unchanged design-system
// tokens; all handlers and copy live in the calling views.
// ============================================================================

import { BrandLogo } from "@/components/brand-logo";
import { RMIS_FULL_NAME } from "@/components/auth-enterprise";

/** Institutional anchors — real citations, no marketing adjectives. */
const LEDGER: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Est. 1966", text: "Chartered under Republic Act No. 4724" },
  { label: "CSC", text: "Selection follows merit-based Civil Service Commission rules" },
  { label: "RA 10173", text: "Personal data handled under the Data Privacy Act of 2012" },
];

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden hero-sky lg:flex lg:w-[42%] xl:w-[46%]">
      {/* Ghosted seal — official-document watermark (decorative). Anchored
          PAST the panel's bottom-right corner so only the seal's crown arcs
          into the quiet lower zone: a deliberate watermark that fills the
          ledger-to-address gap instead of a clipped sticker floating
          mid-panel. overflow-hidden crops the off-canvas remainder. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -right-14 select-none opacity-[0.05]"
      >
        <BrandLogo logoSize={500} />
      </span>

      <div className="relative z-10 flex w-full max-w-[520px] flex-col px-12 pb-6 pt-9 xl:pl-20 xl:pr-16">
        {/* Lockup — flat: the seal sits directly on the panel surface.
            QA: the complete system title is the brand text (the "RMIS"
            wordmark line above it was redundant — the title carries the
            acronym). Natural wrap keeps the institutional masthead shape. */}
        <div className="flex items-center gap-3">
          <BrandLogo logoSize={34} />
          <span className="min-w-0 text-balance text-left text-lg font-medium leading-tight text-ink">
            {RMIS_FULL_NAME}
          </span>
        </div>

        {/* Letterhead — gov.ph masthead convention behind a hairline rule */}
        <div className="mt-4 border-t border-ink/20 pt-4">
          <p className="eyebrow">Republic of the Philippines</p>
          <p className="eyebrow mt-1.5">Department of Science and Technology</p>
          <p className="eyebrow mt-1.5">Metals Industry Research and Development Center</p>
        </div>

        {/* The agency motto — user-directed display heading. Natural
            balanced wrap (no forced break): the panel is narrower below xl,
            and a hard break would widow "future" onto its own line. */}
        <h1 className="font-display mt-7 text-[40px] font-medium leading-[1.06] text-balance text-ink">
          Molding the future of metal industries.
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-stone">
          The official hiring portal of MIRDC. Your profile doubles as your Personal Data Sheet —
          accomplish it once, and every application prefills itself.
        </p>

        {/* Fact ledger — hairline-ruled rows, no icon chips */}
        <dl className="mt-6">
          {LEDGER.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline gap-4 border-t border-ink/10 py-2 first:border-t-0 first:pt-0"
            >
              <dt className="eyebrow w-20 shrink-0">{row.label}</dt>
              <dd className="text-[13px] leading-snug text-stone">{row.text}</dd>
            </div>
          ))}
        </dl>

        {/* Office address — pinned to the panel foot */}
        <p className="mt-auto pt-5 text-xs leading-relaxed text-stone">
          MIRDC Complex, Gen. Santos Avenue, Bicutan, Taguig City
        </p>
      </div>
    </aside>
  );
}
