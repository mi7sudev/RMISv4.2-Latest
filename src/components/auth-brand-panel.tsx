"use client";

// ============================================================================
// RMIS — Auth brand panel (shared by sign-in, sign-up and reset-password,
// lg+ only). Photographic edition:
//
//   · Backdrop — the MIRDC building signage photograph (mirdc-building.jpg),
//     object-cover with the framing biased to 25% so the seal + wordmark on
//     the facade sit in the panel's visual field, not cropped out.
//   · Scrim — a deep ink-blue gradient (strongest behind the copy column,
//     relaxing toward the right edge) keeps the photo visible while giving
//     every text row WCAG-comfortable contrast, light or dark mode.
//   · Ink → porcelain: the previous light-surface palette (text-ink,
//     text-stone, ink hairlines) is remapped to white opacities; the .eyebrow
//     token pins --stone, so the masthead rows restate its typography with
//     explicit white utilities instead.
//   · Lockup — the seal rides a small porcelain chip: on photography the
//     "surface is the elevation" flat rule would sink the black quadrants,
//     so the chip restores separation (gov.ph photo-header convention).
//   · Watermark — the ghosted seal is inverted to porcelain at low opacity,
//     preserving the official-document watermark convention on the photo.
//
// All copy, the fact ledger and the address are unchanged; handlers live in
// the calling views.
// ============================================================================

import { BrandLogo } from "@/components/brand-logo";
import { RMIS_FULL_NAME } from "@/components/auth-enterprise";

/** Institutional anchors — real citations, no marketing adjectives. */
const LEDGER: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Est. 1966", text: "Chartered under Republic Act No. 4724" },
  { label: "CSC", text: "Selection follows merit-based Civil Service Commission rules" },
  { label: "RA 10173", text: "Personal data handled under the Data Privacy Act of 2012" },
];

/** Masthead row — .eyebrow typography with a photo-safe porcelain tone. */
function EyebrowRow({ children, className }: { children: string; className?: string }) {
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-[0.06em] text-white/70 ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden lg:flex lg:w-[42%] xl:w-[46%]">
      {/* Backdrop photograph — MIRDC building signage. Decorative: empty alt,
          aria-hidden, pointer-events-none. Framing biased to 25% so the seal
          + MIRDC wordmark on the facade stay inside the cover crop. */}
      <img
        src="/mirdc-building.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: "25% center" }}
      />

      {/* Scrim — ink-blue wash, strongest behind the copy column, relaxing
          toward the right so the facade photograph reads through. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(112deg, rgba(11,24,34,0.93) 0%, rgba(11,24,34,0.78) 36%, rgba(11,24,34,0.48) 66%, rgba(11,24,34,0.30) 100%)",
        }}
      />

      {/* Ghosted seal — official-document watermark, inverted to porcelain so
          it registers on the photographic ground (decorative). Anchored PAST
          the panel's bottom-right corner; overflow-hidden crops the rest. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -right-14 select-none opacity-[0.08] invert"
      >
        <BrandLogo logoSize={500} />
      </span>

      <div className="relative z-10 flex w-full max-w-[520px] flex-col px-12 pb-6 pt-9 xl:pl-20 xl:pr-16">
        {/* Lockup — the seal on a porcelain chip (photography needs the
            separation the flat rule can't give the black quadrants). */}
        <div className="flex items-center gap-3">
          <BrandLogo
            logoSize={34}
            className="rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          />
          <span className="min-w-0 text-balance text-left text-lg font-medium leading-tight text-white">
            {RMIS_FULL_NAME}
          </span>
        </div>

        {/* Letterhead — gov.ph masthead convention behind a hairline rule */}
        <div className="mt-4 border-t border-white/25 pt-4">
          <EyebrowRow>Republic of the Philippines</EyebrowRow>
          <EyebrowRow className="mt-1.5">Department of Science and Technology</EyebrowRow>
          <EyebrowRow className="mt-1.5">
            Metals Industry Research and Development Center
          </EyebrowRow>
        </div>

        {/* The agency motto — user-directed display heading. Natural
            balanced wrap (no forced break): the panel is narrower below xl,
            and a hard break would widow "future" onto its own line. */}
        <h1 className="font-display mt-7 text-[40px] font-medium leading-[1.06] text-balance text-white">
          Molding the future of metal industries.
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-white/75">
          The official hiring portal of MIRDC. Your profile doubles as your Personal Data Sheet —
          accomplish it once, and every application prefills itself.
        </p>

        {/* Fact ledger — hairline-ruled rows, no icon chips */}
        <dl className="mt-6">
          {LEDGER.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline gap-4 border-t border-white/15 py-2 first:border-t-0 first:pt-0"
            >
              <dt className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-white/70">
                {row.label}
              </dt>
              <dd className="text-[13px] leading-snug text-white/75">{row.text}</dd>
            </div>
          ))}
        </dl>

        {/* Office address — pinned to the panel foot */}
        <p className="mt-auto pt-5 text-xs leading-relaxed text-white/60">
          MIRDC Complex, Gen. Santos Avenue, Bicutan, Taguig City
        </p>
      </div>
    </aside>
  );
}
