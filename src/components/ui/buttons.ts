// ============================================================================
// RMIS — THE button system (Jeton edition). Single source of truth for every
// button class combination in the app. The buttons themselves are styled by
// globals.css (.dlg-cta = RMIS Electric Blue primary, .dlg-ghost = white
// secondary — both 12px radius, no drop shadows); these constants add the
// standard layout/anatomy so call sites never re-type them (and never drift).
//
// Geometry (upload/DESIGN-RMIS-FINAL.md): buttons 12px radius; utility icon
// buttons 16px; pills/badges/avatars stay 9999px capsules.
//
// Import from here everywhere:
//   import { ctaBtn, ghostBtn, ghostBadBtn, iconBtn, iconBtnBad } from "@/components/ui/buttons";
// ============================================================================

/** Primary CTA — RMIS Electric Blue button (44px, white ink, hover darkens). */
export const ctaBtn =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";

/** Solid semantic CTAs — decision buttons wear the EXACT color of the
 *  pipeline status they produce (Shortlist → --ok green, the Shortlisted
 *  pill color; Not Qualified → --bad red, the Rejected pill color), so the
 *  action and its outcome status read as one. Same geometry as ctaBtn. */
export const ctaOkBtn =
  "dlg-cta-ok inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";

export const ctaBadBtn =
  "dlg-cta-bad inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary — white ghost button (44px, hairline border). */
export const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Destructive ghost — white button with the functional --bad tint. The ONE
 *  destructive-confirm recipe (AlertDialogAction, row deletes, cancels).
 *  rounded-[12px] explicit: unlike ctaBtn/ghostBtn there is no .dlg-* class
 *  here to set the button step, and rounded-xl now resolves to 16px under the
 *  Jeton radius map — destructive confirms must match every other button. */
export const ghostBadBtn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[var(--bad)]/30 bg-white px-4 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:cursor-not-allowed disabled:opacity-50";

/** 36px quiet square icon button (16px utility radius, cloud tile on hover)
 *  for row quick actions. */
export const iconBtn =
  "grid h-9 w-9 place-items-center rounded-2xl text-stone transition-colors hover:bg-cloud hover:text-ink focus-ring";

/** 36px destructive square icon button for row quick actions. */
export const iconBtnBad =
  "grid h-9 w-9 place-items-center rounded-2xl text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] focus-ring";

/** Modifier-only destructive ghost (append to ghostBtn when a full control
 *  already carries the capsule base, e.g. AlertDialogAction). Class-based —
 *  NOT utilities — because .dlg-ghost's unlayered color/background/border
 *  would beat layered utilities (globals.css .dlg-ghost-bad). */
export const ghostBadModifier = "dlg-ghost-bad";

/** Modifier-only positive ghost (append to ghostBtn) — the mirror of
 *  ghostBadModifier for affirmative secondary actions ("Flip to
 *  Shortlisted"). Same unlayered-token mechanism (globals.css
 *  .dlg-ghost-ok). */
export const ghostOkModifier = "dlg-ghost-ok";

/** Dialog cancel — the one secondary "Cancel" recipe for AlertDialogCancel /
 *  form dialogs (44px ghost). The six profile sections and form-dialog
 *  previously re-typed this identical string by hand. */
export const cancelBtn =
  "dlg-ghost min-h-[44px] px-5 py-2.5 text-sm";
