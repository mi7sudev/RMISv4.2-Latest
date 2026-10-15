import { cn } from "@/lib/utils";

// ============================================================================
// RMIS — Official brand mark. A single unified emblem (MIRDC-mark.png): the
// MIRDC quatrefoil — black + azure circular quadrants framing a white heart
// that carries the MIRDC gear crest (robot arm pouring molten metal). The
// source PNG is square 383×383 with a TRANSPARENT background, so the mark
// floats directly on the surface behind it (white on the public header, ink
// strip on mobile, light auth cards). `tone` is retained for API
// compatibility with existing call sites but is now a no-op — the unified
// mark carries no divider hairline.
// ============================================================================

export function BrandLogo({
  logoSize = 22,
  tone = "light",
  className,
}: {
  /** Height/width of the mark in px. */
  logoSize?: number;
  /** Retained for call-site compatibility; no visual effect (see above). */
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center p-1",
        className
      )}
      style={{ height: logoSize + 8, width: logoSize + 8 }}
    >
      <img
        src="/MIRDC-mark.png"
        alt="DOST-MIRDC seal"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
    </span>
  );
}
