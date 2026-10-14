// ============================================================================
// RMIS — Shell footer, ported from rmis-main-ui's Footer (src/components/
// footer.tsx): hairline top rule, and the GovPH seal —
// `govph-seal-mono-footer.jpg` — anchored bottom-left as a 10%-opacity
// watermark BEHIND the footer contents (seal z-0, contents z-10). Soft
// capsule icon chip — pale Cloud tile with the brand-blue shield; muted
// stone ink for the note.
// Rendered as the last child of the min-h-screen flex column shells —
// `mt-auto` keeps it pinned to the bottom on short pages and pushed down
// naturally on long ones. DO NOT remove mt-auto / relative / overflow-hidden.
// Task 36 (per user): the MOBILE footprint is tightened — smaller vertical
// padding, a tighter stack gap, one notch smaller note text, and a smaller
// seal watermark below sm — while the desktop (sm+) sizing is unchanged.
// Task 37 (per user): the footer height is DECREASED on BOTH breakpoints —
// mobile py-5 → py-3 and desktop sm:py-10 → sm:py-5, with the seal watermark
// scaled to the tighter strip (h-16 / sm:h-36) so it stays a watermark and
// never dictates the height. Everything else (note copy, eyebrow, chips) is
// unchanged.
// Task 38 (per user): phones get an EVEN tighter strip — py-2.5, a 10px note
// with snug leading (the 3-line wrap was the height driver), a size-6 chip
// and an h-12 seal below sm. Desktop (sm+) sizing from Task 37 is unchanged.
// Jeton container alignment: `wide` matches the signed-in workspace grid
// (AppShell main + WorkspaceHeader, 1600px); the default 1200px matches the
// public pages (SiteHeader, landing, jobs board — the spec's page max-width).
// ============================================================================

import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-divider/70 bg-card">
      {/* GovPH seal — bottom-left watermark behind the contents (scaled to
          the Task 38 tighter strip: h-12 below sm, h-36 from sm up) */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 opacity-10">
        <Image
          src="/govph-seal-mono-footer.jpg"
          alt=""
          width={320}
          height={320}
          className="h-12 w-12 object-contain sm:h-36 sm:w-36"
          aria-hidden
        />
      </div>

      {/* Footer content — z-10 so it sits above the seal */}
      {/* Container follows the surrounding shell's grid: 1600px in the
          signed-in workspace (wide), 1200px on public pages (default). */}
      <div
        className={`relative z-10 mx-auto w-full ${wide ? "max-w-[1600px]" : "max-w-[1200px]"} px-4 py-2 sm:px-6 sm:py-5 lg:px-8`}
      >
        <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex max-w-2xl items-start gap-2 text-[10px] leading-snug text-body-gray sm:gap-3 sm:leading-relaxed sm:text-xs">
            {/* Icon chip — soft capsule Cloud tile */}
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-cloud text-metric-blue sm:size-8">
              <ShieldCheck className="size-3 sm:size-4" />
            </span>
            <p>
              Protected under the Data Privacy Act of 2012 (RA 10173). Personal
              information is used solely for recruitment and is accessible only
              to authorized DOST-MIRDC personnel.
            </p>
          </div>
          <p className="eyebrow shrink-0">
            <span className="hidden sm:inline">
              Recruitment Management Information System ·{" "}
            </span>
            © {new Date().getFullYear()} RMIS
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
