"use client";

// ============================================================================
// RMIS — Application shells (spec §13): AppShell for signed-in users
// (NavRail + mobile top bar + WorkspaceHeader + main + Footer) and
// PublicShell for the anonymous jobs board (SiteHeader + main + Footer).
// Sticky-footer rule: root is min-h-screen flex flex-col; main is flex-1;
// footer sits at mt-auto.
// Mobile (Task 21): the WorkspaceHeader row (page title + search) renders
// lg+ only; on <lg the top brand bar carries the admin notification bell
// (search itself lives in the bottom ExpandableTabs bar).
// Mobile refresh (Task 34): below lg the workspace main column becomes the
// OFFICIAL BEUI PullToRefresh container (src/components/motion/pull-to-refresh,
// vendored byte-sacred) — the column is height-bounded (100dvh) and the
// container scrolls internally, which is the scroll model the block requires
// (its pull only engages at its own scrollTop 0). Releasing past the
// threshold re-fetches the session AND remounts the active view (fresh data
// fetch on mount), exactly the native pull-to-refresh contract. lg+ keeps
// the classic document-flow layout untouched.
// Task 34-b — conflict fixes: the Footer now travels INSIDE the scroller
// (contentClassName flex column; the keyed view wrapper flex-grows so the
// footer still pins to the bottom on short pages) — it scrolls with the page
// like on desktop instead of sitting pinned under the pull area, so pulling
// moves the whole page as one and the footer can never clash with the view.
// Only the bottom-nav clearance stays outside the scroller.
// ============================================================================

import { useCallback, useState } from "react";
import { useSession } from "@/components/session-provider";
import { BrandLogo } from "@/components/brand-logo";
import { RMIS_FULL_NAME } from "@/components/auth-enterprise";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { NavRail } from "@/components/shell/nav-rail";
import { NotificationCenter } from "@/components/shell/notifications-panel";
import { WorkspaceHeader } from "@/components/shell/workspace-header";
import { Footer } from "@/components/shell/footer";
import { SiteHeader } from "@/components/shell/site-header";
import { PullToRefresh } from "@/components/motion/pull-to-refresh";
import { useIsBelowLg } from "@/hooks/use-below-lg";
import { cn } from "@/lib/utils";
import { navigate, ROLE_HOME } from "@/lib/router";
import type { ViewParams } from "@/lib/router";

export function AppShell({
  view,
  params,
  children,
}: {
  view: string;
  params: ViewParams;
  children: React.ReactNode;
}) {
  const { user, refresh } = useSession();
  // Official BEUI PullToRefresh runs below lg only (the shell's own mobile
  // boundary — the same breakpoint the top brand bar / bottom tab bar use).
  const belowLg = useIsBelowLg();
  // Bumped after each completed pull so the active view REMOUNTS and re-runs
  // its mount-time data fetches — the native pull-to-refresh contract.
  const [contentEpoch, setContentEpoch] = useState(0);
  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      refresh(),
      // minimum perceptible hold so the indicator animation reads (the demo
      // block holds its own feed for 900 ms for the same reason)
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]);
    setContentEpoch((epoch) => epoch + 1);
  }, [refresh]);

  return (
    // Mobile: the height chain is BOUNDED (h-dvh, no body scroll) so the
    // PullToRefresh container can be the workspace scroller; lg+ keeps the
    // classic min-h-screen document flow.
    <div
      className={cn(
        "flex flex-col",
        belowLg ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      )}
    >
      <div className={cn("flex flex-1 items-stretch", belowLg && "min-h-0")}>
        {/* Desktop left rail (lg+) */}
        <NavRail view={view} />

        {/* Content column */}
        <div className={cn("flex min-w-0 flex-1 flex-col", belowLg && "min-h-0")}>
          {/* Mobile top bar — light rail strip. Composed inline instead of
              the .rail class: a horizontal bar takes a bottom hairline, not
              the rail's right-side border. Navigation itself lives in the
              bottom ExpandableTabs bar (MobileTabBar); this row keeps the
              brand-as-home affordance. */}
          <div className="sticky top-0 z-40 flex h-16 items-center gap-1.5 border-b border-[var(--rail-border)] bg-[linear-gradient(180deg,var(--rail-bg-top)_0%,var(--rail-bg-bottom)_100%)] px-3 text-[var(--rail-text)] sm:px-4 lg:hidden">
            <button
              onClick={() => {
                if (user) navigate(ROLE_HOME[user.role]);
              }}
              className="flex min-h-[44px] items-center gap-2.5"
              aria-label="Go to my workspace"
            >
              {/* Official unified brand mark — transparent art, so it floats
                  directly on the light rail strip. The complete system title
                  is the brand text (QA: the "RMIS" wordmark line above it
                  was redundant — the title carries the acronym). */}
              <BrandLogo logoSize={22} tone="light" />
              <span className="min-w-0 text-balance text-left text-[13px] font-medium leading-tight text-ink">
                {RMIS_FULL_NAME}
              </span>
            </button>
            {/* Admin bell lives here below lg (Task 21): the workspace header
                row that used to host it is desktop-only now. */}
            <div className="ml-auto flex items-center">
              {user?.role === "ADMIN" && <NotificationCenter />}
            </div>
          </div>

          <WorkspaceHeader view={view} params={params} />

          {belowLg ? (
            /* Mobile — the OFFICIAL BEUI PullToRefresh container IS the
                workspace scroller: main bounds the column remainder, the
                block scrolls internally and its pull engages at scrollTop 0
                (its own contract). Refresh = session re-fetch + view remount
                (fresh mount-time data fetch), then the indicator settles.
                The keyed view wrapper flex-grows inside the block's content
                column so the Footer (rendered right after it, inside the
                scroller) sits pinned at the bottom on short pages and is
                pushed down naturally on long ones — footer and content move
                as ONE page under the pull (Task 34-b). */
            <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
              <PullToRefresh
                ariaLabel="Workspace content"
                className="flex-1"
                contentClassName="flex flex-col"
                onRefresh={handlePullRefresh}
              >
                {/* Keyed by view AND the refresh epoch so each navigation
                    replays the mount transition and each completed pull
                    replays it again over fresh data. */}
                <div
                  key={`${view}:${contentEpoch}`}
                  className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 px-4 py-6 sm:px-6 sm:py-8"
                >
                  {children}
                </div>
                {/* Mobile footer — INSIDE the scroller: appears at the end of
                    the scroll exactly like the desktop page (mt-auto pins it
                    on short pages), and it rides the pull translation with
                    the content instead of clashing with it. */}
                <Footer wide />
              </PullToRefresh>
              {/* Bottom-nav clearance stays OUTSIDE the scroller: the fixed
                  ExpandableTabs bar overlays the viewport bottom, so the
                  scroller itself ends above it (bar 52 + 12px float margin
                  + safe-area) — fully scrolled, the footer clears the bar. */}
              <div aria-hidden="true" className="h-[calc(72px+env(safe-area-inset-bottom))] shrink-0" />
            </main>
          ) : (
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              {/* Keyed by view so each navigation replays the subtle mount
                  transition (tw-animate-css) — one place for every workspace view. */}
              <div
                key={`${view}:${contentEpoch}`}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                {children}
              </div>
            </main>
          )}

          {/* lg+ footer — document flow, after the page content. The mobile
              footer renders inside the PullToRefresh scroller instead. */}
          {!belowLg && <Footer wide />}

          {/* Mobile bottom-nav clearance (lg+ branch only — below lg the
              clearance lives inside main, after the scroller): the fixed
              ExpandableTabs bar overlays the viewport bottom, so the column
              reserves its height (bar 52 + 12px float margin + safe-area)
              below the footer — fully scrolled, the footer clears the bar. */}
          {!belowLg && (
            <div aria-hidden="true" className="h-[calc(72px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />
          )}
        </div>
      </div>

      {/* Mobile navigation — official BEUI Expandable Tabs block (drawer
          removed): floating bottom bar whose panels navigate per section. */}
      <MobileTabBar view={view} />
    </div>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* flex-col so full-bleed children (auth split-screen) can flex-1 to the
          viewport between the sticky header and the sticky footer. */}
      <main className="flex w-full flex-1 flex-col">{children}</main>
      {/* wide = the 1600px footer grid, matching the workspace shell and the
          widened public pages (QA wide-screen pass). */}
      <Footer wide />
    </div>
  );
}

export default AppShell;
