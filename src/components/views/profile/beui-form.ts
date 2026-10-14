// ============================================================================
// RMIS glue — official SignUpForm card anatomy as shared class tokens
// (Task 33). Source of truth: the vendored OFFICIAL block at
// src/components/motion/signup-form.tsx (beui.dev/r/signup-form, used
// unmodified on the sign-in/sign-up pages):
//   • card   — "flex w-full max-w-sm flex-col gap-5 rounded-3xl border
//              border-border p-6"
//   • header — "flex flex-col gap-1" with title "text-xl font-semibold
//              tracking-tight text-foreground" and description "text-sm
//              text-muted-foreground"
//   • field  — h-11 capsule, border-border, error =
//              "border-destructive ring-2 ring-destructive/25"
//   • submit — StatefulButton size="lg" full width, footer "text-center
//              text-sm text-muted-foreground"
// The profile 01–07 forms wear this exact look through these tokens while
// keeping their own surface color (cloud/60 tiles, white dialogs) — the one
// sanctioned deviation the brief asks for. Trigger-style controls (official
// Select, DateRangePicker) pin their corner radius via motion inline styles,
// so they align on height/border/bg/focus/error tokens and keep their own
// official geometry. No vendored file is modified.
//
// Field-visibility pass: the official capsule ships with NO fill (it reads as
// white because the auth card is white). On this app's tinted cloud/60 cards
// that transparency renders the field INVISIBLE — same color as the card —
// so every profile field is pinned to an explicit white fill via these
// tokens / the official classNames.field prop (no-op on the white dialogs).
// The SAME pin now covers every tinted card: sign-in (both fields), sign-up
// (SignUpForm capsules via the block's sanctioned classNames.fields
// descendant fill + OTPInput slots via the root className prop) and contact
// (3 Inputs + the Textarea). RULE OF THUMB: any card that gains bg-cloud/60
// must pin its field capsules white in the same pass — a transparent capsule
// on a tinted card is an invisible field.
// ============================================================================

/** Official card shell — add the surface color + padding at the call site. */
export const BEUI_FORM_CARD = "flex w-full flex-col gap-5 rounded-3xl border border-border";

/** Official header block (title + description column). */
export const BEUI_FORM_HEADER = "flex flex-col gap-1";

/** Official title classes (SignUpForm header). */
export const BEUI_FORM_TITLE = "text-xl font-medium text-foreground";

/** Official description classes (SignUpForm header). */
export const BEUI_FORM_DESCRIPTION = "text-sm text-muted-foreground";

/** Official footer line under the submit button. */
export const BEUI_FORM_FOOTER = "text-center text-sm text-muted-foreground";

/** Official field tokens for trigger-style controls (select / daterange):
 *  the same height, border and fill the official Input capsule shows on the
 *  auth pages (white), so mixed grids read as one family — and the fields
 *  stay VISIBLE on the tinted cloud/60 cards (transparent = invisible there).
 *  Corner radius is left to each official control (motion pins it inline). */
export const BEUI_TRIGGER_BASE = "h-11 w-full border-border bg-white";

/** Official Input/Textarea capsule fill for fields hosted on tinted cards —
 *  pass through the official classNames.field prop. The auth pages render
 *  the capsule white implicitly (white card); here it must be explicit. */
export const BEUI_FIELD_FILL = "bg-white";

/** Official error ring — the exact classes the Input field draws on error. */
export const BEUI_TRIGGER_ERROR = "border-destructive ring-2 ring-destructive/25";

/** Official field-label grammar (the classes the official Input renders for
 *  its own label) for controls that draw their label separately. */
export const BEUI_FIELD_LABEL = "mb-1.5 block px-1 text-sm font-medium text-foreground";
