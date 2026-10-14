"use client";

// ============================================================================
// RMIS — Desktop left navigation rail (spec §13 view registry, §7.10 nav
// config). LIGHT RAIL (Bevel white sidebar): paper-to-mist gradient, soft
// hover states, blue active indicator, official brand mark. LABELED w-64 by
// default; the collapse toggle sits in the brand row next to the system title
// (persisted in localStorage "rmis.rail-expanded"). When
// collapsed to the w-16 icon-only rail there is NO expand button — clicking
// anywhere on the rail (brand plate or empty chrome) expands it instead.
// Bottom: applicants get the "How hiring works" info circle, then the user
// dropdown with sign out.
// ============================================================================

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Briefcase,
  ChartColumn,
  Gauge,
  House,
  LogOut,
  PanelLeftClose,
  ScanSearch,
  Settings2,
  UserRound,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { RMIS_FULL_NAME } from "@/components/auth-enterprise";
import { RailJourneyInfo } from "@/components/shell/rail-journey-info";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipProvider } from "@/components/motion/tooltip";
import { useSession } from "@/components/session-provider";
import { nameInitials } from "@/components/ui/shell";
import { navigate, ROLE_HOME } from "@/lib/router";
import type { Role, SessionUser } from "@/lib/router";

// ── Navigation config (per role) ────────────────────────────────────────────

export type NavItem = { view: string; label: string; icon: LucideIcon };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV_CONFIG: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      group: "Operations",
      items: [{ view: "operations", label: "Dashboard", icon: Gauge }],
    },
    {
      group: "Recruitment",
      items: [
        { view: "recruitment", label: "Jobs", icon: Briefcase },
        // QA 2026-02: renamed from "Candidates" — this screen lists ALL
        // registered system users, not just applied candidates.
        { view: "candidates", label: "Users", icon: UsersRound },
        { view: "review-queue", label: "Review", icon: ScanSearch },
      ],
    },
    {
      group: "Insights",
      items: [{ view: "analytics", label: "Analytics", icon: ChartColumn }],
    },
    {
      group: "Administration",
      items: [{ view: "settings", label: "Settings", icon: Settings2 }],
    },
  ],
  EVALUATOR: [
    {
      group: "My Work",
      items: [{ view: "review-queue", label: "Review Queue", icon: ScanSearch }],
    },
    {
      group: "Browse",
      items: [
        { view: "candidates", label: "Candidates", icon: UsersRound },
        { view: "recruitment", label: "Jobs", icon: Briefcase },
      ],
    },
    {
      group: "Insights",
      // QA 2026-02: evaluators see recruitment-related analytics only.
      items: [{ view: "analytics", label: "Analytics", icon: ChartColumn }],
    },
    {
      group: "Configuration",
      // QA 2026-02: Email Notices + Contact Requests for evaluators.
      items: [{ view: "settings", label: "Settings", icon: Settings2 }],
    },
  ],
  APPLICANT: [
    { group: "Portal", items: [{ view: "home", label: "Home", icon: House }] },
    { group: "Account", items: [{ view: "profile", label: "Profile", icon: UserRound }] },
  ],
};

/** Detail views highlight their parent rail section. (Exported for the
 *  mobile Expandable Tabs bar, which inks the same parent tab.) */
export const PARENT_VIEW: Record<string, string> = {
  job: "recruitment",
  candidate: "candidates",
  "evaluator-review": "review-queue",
};

// ── Shared helpers ──────────────────────────────────────────────────────────

export async function performSignOut() {
  // Await the server logout BEFORE navigating/reloading (QA: "sometimes I
  // have to sign out twice"): the old fire-and-forget fired the reload while
  // the POST was still in flight, and the unload aborted the request — the
  // session cookie survived, so the reload booted the user back in. The
  // request also rides keepalive so it survives a fast unload regardless,
  // and a 4s guard keeps an unreachable server from trapping the user on a
  // signed-in screen (client state is dropped by the reload either way).
  try {
    await Promise.race([
      fetch("/api/auth/logout", { method: "POST", credentials: "include", keepalive: true }),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* network failure — still sign out locally */
  }
  navigate("signin");
  window.location.reload();
}

export function initialsOf(user: SessionUser): string {
  // Delegates to the shared shell primitive on the composed display name;
  // keeps the username/email two-char fallback for accounts that have no
  // personal name on file.
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  if (name) return nameInitials(name);
  return (user.username?.slice(0, 2) || user.email?.slice(0, 2) || "?").toUpperCase();
}

export function displayNameOf(user: SessionUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.email ||
    "Account"
  );
}

// ── NavRail ─────────────────────────────────────────────────────────────────

export function NavRail({ view }: { view: string }) {
  const { user } = useSession();
  // Enterprise default: labeled rail. localStorage "0" opts out.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem("rmis.rail-expanded") !== "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("rmis.rail-expanded", next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Collapsed rail: clicking anywhere on the rail chrome expands it. Clicks
  // that land on a real control (nav icon buttons, account menu) keep their
  // own behavior — only "empty" chrome expands the rail. The brand plate
  // button handles its own collapsed-state expand below.
  const handleRailClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (expanded) return;
    if ((e.target as HTMLElement).closest("button, a, [role='button']")) return;
    toggleExpanded();
  };

  if (!user) return null;
  const groups = NAV_CONFIG[user.role] ?? [];
  const activeKey = PARENT_VIEW[view] ?? view;

  return (
    <TooltipProvider delay={0}>
      <aside
        onClick={handleRailClick}
        className={`rail sticky top-0 hidden h-dvh shrink-0 flex-col text-[var(--rail-text)] transition-[width] duration-200 lg:flex ${
          expanded ? "w-64" : "w-16 cursor-pointer"
        }`}
      >
        {/* Keyboard path for the click-to-expand rail — there is intentionally
            no VISIBLE expand button when collapsed. */}
        {!expanded && (
          <button type="button" onClick={toggleExpanded} className="sr-only">
            Expand navigation
          </button>
        )}
        {/* Brand → role home when expanded; when collapsed the brand plate is
            the rail's most prominent affordance, so it expands the rail. */}
        <div className={`flex h-16 shrink-0 items-center gap-1 ${expanded ? "px-3" : "justify-center"}`}>
          <button
            onClick={() => (expanded ? navigate(ROLE_HOME[user.role]) : toggleExpanded())}
            className={`flex min-h-[44px] items-center gap-3 ${expanded ? "min-w-0 flex-1" : ""}`}
            aria-label={expanded ? "Go to my workspace" : "Expand navigation"}
          >
            {/* Official unified brand mark — see brand-logo. */}
            {expanded ? (
              <BrandLogo logoSize={22} tone="light" />
            ) : (
              <BrandLogo logoSize={16} tone="light" />
            )}
            {expanded && (
              /* Complete system title as the single brand text (QA: the
                 "RMIS" wordmark line above it was redundant — the title
                 carries the "(RMIS)" acronym). 11px so the 48-character
                 title wraps to exactly two balanced lines inside the w-64
                 rail ("(RMIS)" never orphans onto a third line). */
              <span className="min-w-0 text-balance text-left text-[11px] font-medium leading-snug text-ink">
                {RMIS_FULL_NAME}
              </span>
            )}
          </button>
          {/* Collapse toggle lives next to the brand title (moved from the
              bottom bar) so the expanded rail closes from where it opens. */}
          {expanded && (
            <button
              onClick={toggleExpanded}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--rail-text-dim)] transition-colors hover:bg-[var(--rail-hover-bg)] hover:text-ink"
              aria-label="Collapse navigation"
              title="Collapse navigation"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Sections */}
        <nav className="flex-1 space-y-6 overflow-y-auto scroll-thin px-2.5 py-4" aria-label="Workspace">
          {groups.map((g) => (
            <div key={g.group}>
              {expanded ? (
                <p className="eyebrow mb-2 px-3 text-[var(--rail-text-dim)]">{g.group}</p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-[var(--rail-border)]" aria-hidden="true" />
              )}
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const active = item.view === activeKey;
                  const button = (
                    <button
                      onClick={() => navigate(item.view)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-full text-sm transition-all duration-150 ${
                        expanded ? "px-3.5" : "justify-center px-0"
                      } ${
                        active
                          ? "bg-[var(--rail-active-bg)] font-medium text-ink"
                          : "text-[var(--rail-text)] hover:bg-[var(--rail-hover-bg)] hover:text-ink"
                      }`}
                    >
                      {/* Brand-blue active indicator — small legacy-RMIS accent */}
                      <span
                        aria-hidden="true"
                        className={`absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-opacity duration-200 ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ background: "var(--primary)" }}
                      />
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                          active
                            ? "text-ink"
                            : "text-[var(--rail-text-dim)] group-hover:text-ink"
                        }`}
                        aria-hidden="true"
                      />
                      {expanded && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                  return (
                    <li key={item.view}>
                      {expanded ? (
                        button
                      ) : (
                        <Tooltip content={item.label} side="right" arrow asLabel>
                          {button}
                        </Tooltip>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom: user dropdown (the collapse toggle lives in the brand row).
            APPLICANT rail: the circular (!) hiring-journey affordance sits
            directly above the bottom divider — i.e. ABOVE the spacer line,
            with the active-user profile card still pinned under it. */}
        {user.role === "APPLICANT" && (
          <div className="shrink-0 px-2.5 pb-1.5">
            <RailJourneyInfo collapsed={!expanded} />
          </div>
        )}
        <div className="shrink-0 p-2.5" style={{ borderTop: "1px solid var(--rail-border)" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-full text-left transition-colors hover:bg-[var(--rail-hover-bg)] ${
                  expanded ? "px-2" : "justify-center px-0"
                }`}
                aria-label="Account menu"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-medium text-primary-foreground"
                  style={{ background: "var(--primary)" }}
                >
                  {initialsOf(user)}
                </span>
                {expanded && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {displayNameOf(user)}
                    </span>
                    <span className="block truncate text-xs text-[var(--rail-text-dim)]">{user.role}</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64 rounded-2xl">
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-medium text-ink">
                  {displayNameOf(user)}
                </span>
                <span className="block truncate text-xs text-pebble">{user.email}</span>
                <span className="dlg-pill mt-1.5 inline-flex bg-fog px-2.5 py-0.5 text-[11px] font-medium text-graphite">
                  {user.role}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Task 35 — the dedicated personal Account Settings page
                  (appearance theme, change password, help & support). The
                  mobile bar reaches it from its own Settings tab. */}
              <DropdownMenuItem
                onClick={() => navigate("account-settings")}
                className="cursor-pointer gap-2"
              >
                <UserCog className="h-4 w-4" aria-hidden="true" />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={performSignOut}
                className="cursor-pointer gap-2 text-[var(--bad)] focus:text-[var(--bad)]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default NavRail;
