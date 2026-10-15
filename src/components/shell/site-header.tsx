"use client";

// ============================================================================
// RMIS — Public header (Jeton "Top Navigation Bar", blue edition): a Paper
// White frosted nav pill (84px radius — the spec's nav step), floating over
// the page and remaining available as content moves beneath. The sticky
// wrapper is pointer-events-none so the pill's side gaps never create dead
// zones (the old full-bar takeover is gone); the pill itself is
// pointer-events-auto. The 1600px container matches the landing/jobs grid
// AND the signed-in workspace shell (the spec's page max-width — QA: the
// old 1200px pill left oversized margins on wide screens). 24px edge insets
// (16px on mobile) keep the
// brand mark and conversion control clear of the rounded ends; 16px internal
// control spacing. Brand text =
// Ink 18px/25.2 weight 500 +0.16px tracking (text-brand-nav); secondary
// links = Body Gray 16px/22.4 weight 500 (text-nav); the sign-in/dashboard
// conversion control is the RMIS Electric Blue pill (dlg-cta, 12px radius).
// All navigation behavior is preserved exactly.
// ============================================================================

import { useSession } from "@/components/session-provider";
import { RMIS_FULL_NAME } from "@/components/auth-enterprise";
import { navigate, ROLE_HOME, useHashRoute } from "@/lib/router";

export function SiteHeader() {
  const { user } = useSession();
  const { view } = useHashRoute();
  const onSignInView = view === "signin";

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        className="glass pointer-events-auto mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 rounded-[84px] border border-divider/70 px-4 sm:px-6"
        aria-label="Primary"
      >
        {/* Brand — the complete system title IS the brand text (QA: the
            "RMIS" wordmark line above it was redundant — the title already
            carries the "(RMIS)" acronym). min-w-0 lets it wrap to two lines
            when the capsule is narrow instead of overflowing the pill. */}
        <button
          onClick={() => navigate("home")}
          className="flex min-h-[44px] items-center gap-3"
          aria-label="RMIS — Recruitment Management Information System home"
        >
          {/* Official header lockup — the COMPLETE two-logo composition from
              the official artwork (upload/mirdc-logo.png): the plain DOST
              quatrefoil paired with the MIRDC gear-crest seal, exactly as
              the agency supplies it. Rendered as one wide image floating on
              the capsule (transparent background); the single-square seal
              (MIRDC-mark.png) remains for favicon, rails and cards. */}
          <img
            src="/MIRDC-header-logo.png"
            alt="DOST-MIRDC emblems"
            style={{ height: 40 }}
            className="w-auto shrink-0"
          />
          <span className="hidden min-w-0 text-balance text-left text-[15px] font-medium leading-tight tracking-[0.01em] text-ink sm:block">
            {RMIS_FULL_NAME}
          </span>
        </button>

        {/* Right cluster — 16px internal control spacing (gap-4). The
            "Vacant Positions" board link was retired (user direction:
            browsing happens on the frontpage's search + sort explorer now)
            — Contact is the only secondary link; the Sign in / Dashboard
            capsule stays the cluster's single strong control. */}
        <div className="flex items-center gap-4">
          {view !== "contact" && (
            <button
              onClick={() => navigate("contact")}
              className="text-nav hidden min-h-[44px] items-center whitespace-nowrap px-3 font-medium text-body-gray transition-colors hover:text-ink sm:inline-flex sm:px-4"
            >
              Contact
            </button>
          )}

          {user ? (
            <button
              onClick={() => navigate(ROLE_HOME[user.role])}
              className="dlg-cta text-nav inline-flex min-h-[44px] items-center whitespace-nowrap px-5 font-medium"
            >
              Dashboard
            </button>
          ) : (
            !onSignInView && (
              <button
                onClick={() => navigate("signin")}
                className="dlg-cta text-nav inline-flex min-h-[44px] items-center whitespace-nowrap px-5 font-medium"
                aria-label="Sign in to RMIS"
              >
                Sign in
              </button>
            )
          )}
        </div>
      </nav>
    </header>
  );
}

export default SiteHeader;
