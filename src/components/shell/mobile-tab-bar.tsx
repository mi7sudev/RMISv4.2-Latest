"use client";

// ============================================================================
// RMIS — Mobile navigation tab bar (BEUI Phase 14/15). The official Expandable
// Tabs block running its AUTHENTIC state machine, glued to the hash router:
//   • The CURRENT VIEW's tab always wears its labelled pill — the word
//     ("Home" / "Jobs" / "Profile") shows EVEN WHEN EVERY PANEL IS CLOSED.
//     That is the block's own active-tab rendering: value = open ?? restingId
//     keeps a tab officially active at rest (you-are-here, Task-12 verdict).
//   • Collapsed (no panel open) the shell sits at the ORIGINAL closed-bar
//     HEIGHT (54px). The block's open-shell minimum would be 66px purely
//     from its hidden sizer's dock reserve (inline paddingBottom 56 + pt-2
//     8 + border 2), so while collapsed we shave that reserve through the
//     OFFICIAL classNames.panel prop → [padding-bottom:44px]! on the sizer
//     → it measures 8+0+44 = 52 and the block itself computes
//     max(52+2, 54) = 54 — its own spring lands on the original bar height.
//     The class also lands on the visible panel container, where a bottom
//     padding is inert (content is top-anchored). Zero vendored edits.
//   • Tap any tab → navigates AND opens that section's labelled-pill + panel
//     (the block's original open geometry). The panel REMAINS while you are
//     in the section. APPLICANT sections:
//       Home → "Application" row (→ #/home, the My Application page)
//       Jobs → "Find" + "How hiring works" rows. "Find" (Task 21, per
//              user) is the mobile search entry and lives INSIDE the Jobs
//              expandable — NOT as a nav tab — and opens the ⌘K command
//              menu. Staff reach the same palette from a Find row inside
//              their Account panel (dense 6–8-tab staff bars can't grow
//              another icon without overflowing a 390px phone).
//       Profile → "Profile" row (→ #/profile). The old "Account" identity
//                 row is REMOVED (Task 36, per user): the dedicated Account
//                 Settings page owns account management now, and Sign out
//                 lives on that page's Session card.
//       Settings (Task 35, per user — the bar now reads Home · Jobs ·
//              Profile · Settings) → "Account settings" row (the dedicated
//              Account Settings page: dark/light mode, change password,
//              help & support, sign out) + a one-tap Dark/Light theme
//              toggle row.
//     "Jobs" is a mobile-only tab for the public board #/vacant-positions
//     (the desktop rail reaches the board from Home's job card grid).
//     Other roles keep the same machine with panel-free nav tabs + the
//     Account tab's identity panel.
//   • The block emits onValueChange(null) for THREE different causes; a
//     capture-phase pointerdown/keydown pair records the press ORIGIN so a
//     null can be routed: a press INSIDE the shell (active-tab tap) toggles
//     the resting section's panel; an outside tap or Escape closes the panel
//     only — the current view's word pill persists either way.
//   • Navigation from OUTSIDE the bar (brand tap, job cards, command menu)
//     closes any open panel — unless the new view is owned by the very tab
//     whose panel is open (detail views rest on their parent, and a tab
//     tap's own route landing must not swallow the fresh panel).
//   • Closed nav-tab contents are invisible zero-height width spacers: the
//     block derives its shell size from the largest content in its hidden
//     sizer. The spacers AND the panels mirror one formula, so the shell is
//     the SAME WIDTH collapsed and open (opening only grows it upward) —
//     the applicant shell holds ~217px in both states, staff 351px.
//   • Spacing (Fix 2, per user): the OPEN pill row keeps the block's
//     AUTHENTIC justify-between — no clustering override — so with the
//     width-matched shell the open row is pixel-identical to the closed one
//     (flush edges, even gaps, zero horizontal shift). Small bars (≤4 tabs
//     — the applicant's) spread with a per-gap bonus (+18px each) applied
//     to the SHARED shell so both states get it; dense 6–8-tab staff bars
//     keep the authentic tight layout in both states.
//   • Right-half mirror (Fix 1, per user): an ACTIVE pill on the right half
//     of the bar reads (name · icon) with the icon hugging the dock's right
//     edge — the mirror of the left half's (icon · name) — via positional
//     selectors on classNames.bar keyed by the tab count (see
//     MIRROR_BAR_CLASS). Applies to the resting pill and the open pill
//     alike; unknown tab counts fall back to the authentic icon-first pill.
// Long rail labels read as cramped phone pills, so the bar uses short forms
// ("Review Queue" → "Review"; "Dashboard" fits as-is). Geometry
// constants mirror the vendored block's internals and label widths are
// measured with the block's own hidden-span technique so the two agree.
// Desktop (lg+) never renders any of this.
// ============================================================================

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Briefcase,
  ChevronRight,
  CircleUserRound,
  FileText,
  LogOut,
  Moon,
  Search,
  Settings2,
  Sun,
  UserCog,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  ExpandableTabs,
  type ExpandableTabsItem,
} from "@/components/motion/expandable-tabs";
import CommandMenu from "@/components/shell/command-menu";
import {
  NAV_CONFIG,
  PARENT_VIEW,
  displayNameOf,
  initialsOf,
  performSignOut,
} from "@/components/shell/nav-rail";
import { RailJourneyInfoRow } from "@/components/shell/rail-journey-info";
import { useSession } from "@/components/session-provider";
import { useTheme } from "@/lib/theme";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

/** Long rail labels, shortened for phone pills (bar-only wording). */
const MOBILE_LABELS: Record<string, string> = {
  // QA 2026-02: "Command Center" is now "Dashboard" — short enough to fit the
  // phone pill as-is, so it needs no abbreviation.
  "Review Queue": "Review",
};

// ── Geometry — mirrors expandable-tabs.tsx internals (see header note) ──────
const TAB_W = 32; // icon-only tab width
const BAR_GAP = 4; // gap-1 between tabs
const BAR_PAD = 16; // p-2 horizontal padding (8 + 8)
const ROOT_BORDER = 2; // shell border width
const PILL_CHROME = 49; // active tab: pl-2.5 10 + icon 16 + label gap 7 + pr-4 16
const SIZER_X_PAD = 16; // sizer px-2 — padding the block adds around content
const COLLAPSED_SIZER_CLASS = "[padding-bottom:44px]!"; // see comment below (literal so Tailwind scans it)
const CLOSED_EXTRA_GAP = 18; // per-gap breathing room, both states (user-tuned width)

// ── Right-half active-pill mirror (Fix 1, per user) ─────────────────────────
// The block renders EVERY expanded pill icon-first (icon · name) — correct
// for tabs near the dock's LEFT edge, wrong for tabs on the RIGHT half,
// which sit closer to the right side and must read (name · icon) with the
// icon hugging the dock's right edge (mirror symmetry, like the closed
// bar's justify-between spread).
//
// Injected CSS-only through the official classNames.bar slot — the DOM order
// of the block's pill is FIXED (icon span first, label span second), so the
// mirror targets the ACTIVE tab positionally, keyed by the mobile TAB COUNT
// (nav items + the staff Account tab): the split starts at child ⌈n/2⌉+1 —
// 4 tabs → n+3, 6 → n+4, 7 → n+5. Unknown counts yield undefined = the
// block's authentic icon-first rendering (safe fallback).
//
// Geometry contract (each piece is exact — do not improvise):
//  • flex-row-reverse flips the fixed DOM, and the block's OWN justify-start
//    then packs the pill's content toward the right edge — that IS the mirror.
//  • pl-4! / pr-2.5! is the EXACT mirror of the block's pl-2.5 / pr-4: same
//    26px total chrome, so the block's pill-width formula still fits to the
//    pixel. Never change the total.
//  • mr-[7px] on the label (>span:last-child) moves the block's 7px
//    icon↔label gap to the label's right side. The block animates the
//    label's margin-LEFT; in row-reverse that animated margin rides
//    harmlessly as invisible margin inside the left padding, so the label
//    grows leftward from a fixed right anchor — mirroring the left tabs'
//    rightward growth.
//  • shrink-0! on the label is CRITICAL: without it the flex button shrinks
//    the label by exactly the added margin and the text clips (E2E-caught:
//    "Settings" clipped 54→47px). The overflow must ride as invisible
//    margin. Never omit it.
//  • Targets ONLY the active tab ([aria-selected=true]) and applies in BOTH
//    states — the resting pill and the open-panel pill.
// All strings are literal source text so the Tailwind scanner sees them.
const MIRROR_BAR_CLASS: Record<number, string> = {
  4: "[&>[role=tab][aria-selected=true]:nth-child(n+3)]:flex-row-reverse [&>[role=tab][aria-selected=true]:nth-child(n+3)]:pl-4! [&>[role=tab][aria-selected=true]:nth-child(n+3)]:pr-2.5! [&>[role=tab][aria-selected=true]:nth-child(n+3)>span:last-child]:mr-[7px] [&>[role=tab][aria-selected=true]:nth-child(n+3)>span:last-child]:shrink-0!",
  6: "[&>[role=tab][aria-selected=true]:nth-child(n+4)]:flex-row-reverse [&>[role=tab][aria-selected=true]:nth-child(n+4)]:pl-4! [&>[role=tab][aria-selected=true]:nth-child(n+4)]:pr-2.5! [&>[role=tab][aria-selected=true]:nth-child(n+4)>span:last-child]:mr-[7px] [&>[role=tab][aria-selected=true]:nth-child(n+4)>span:last-child]:shrink-0!",
  7: "[&>[role=tab][aria-selected=true]:nth-child(n+5)]:flex-row-reverse [&>[role=tab][aria-selected=true]:nth-child(n+5)]:pl-4! [&>[role=tab][aria-selected=true]:nth-child(n+5)]:pr-2.5! [&>[role=tab][aria-selected=true]:nth-child(n+5)>span:last-child]:mr-[7px] [&>[role=tab][aria-selected=true]:nth-child(n+5)>span:last-child]:shrink-0!",
};

// Collapsed dock-reserve shave. The hidden sizer's INLINE paddingBottom (56 =
// bar 52 + dock gap 4) is the only reason a resting pill state is 66px tall;
// the block computes openSize.height = max(sizer 64 + border 2, closed 54).
// Overriding the padding to 44 (bar 52 − the sizer's pt-2 8) while collapsed makes
// the sizer measure 8 + 0 + 44 = 52, so the block itself targets
// max(52 + 2, 54) = 54 — the ORIGINAL closed-bar height — and its own spring
// animates there. Official classNames prop; the vendored block is untouched.
//
// Spacing (Fix 2, per user): the earlier "open bar clusters tight" polish
// (justify-start gap-2 on the OPEN bar) packed the pill row left with a
// ~42px dead hole on the right and made the navs visibly jump the moment a
// panel opened. It is GONE — the bar slot now carries ONLY the right-half
// mirror, so the block's AUTHENTIC justify-between runs in BOTH states.
// Because the shell is width-matched (the spacers AND the panels mirror one
// formula, below), the open pill row lands PIXEL-IDENTICAL to the closed
// one: flush to both dock edges, evenly distributed gaps, and the mirrored
// right-half pill hugs the dock's right edge exactly as it does at rest.
// Opening a panel grows the island UPWARD without the navs shifting at all.
// The per-gap breathing bonus (+18px, user-tuned width) applies to the
// SHARED shell so BOTH states get it equally, and only for small tab sets
// (≤4 tabs); dense 6–8-tab staff bars keep the authentic tight layout
// (already at the phone's width limit).

/** Shell width needed for an n-tab bar whose `labelWidth` pill is expanded. */
function rowShellWidth(n: number, labelWidth: number) {
  return (n - 1) * (TAB_W + BAR_GAP) + PILL_CHROME + labelWidth + BAR_PAD + ROOT_BORDER;
}

/** Menu row — the official preview's Row pattern (icon · label · chevron). */
function MenuRow({
  icon: Icon,
  label,
  onClick,
  danger = false,
  chevron = true,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted",
        danger ? "text-[var(--bad)]" : "text-foreground"
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", danger ? "text-[var(--bad)]" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!danger && chevron && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

type TabEntry = { id: string; label: string; icon: LucideIcon };

/**
 * Mirrors the block's own hidden-span measurement (same classes), so the
 * spacer widths track the exact label widths the block's pill will use —
 * fonts swapping included (ResizeObserver, same as the block).
 */
function useLabelWidths(entries: TabEntry[]) {
  const refs = useRef<Map<string, HTMLSpanElement | null>>(new Map());
  const [widths, setWidths] = useState<Record<string, number>>({});

  // `entries` is memoized per role, so this callback (and the observer
  // below) only re-create when the tab set actually changes.
  const measure = useCallback(() => {
    const next: Record<string, number> = {};
    for (const { id } of entries) {
      const node = refs.current.get(id);
      if (node) next[id] = Math.ceil(node.offsetWidth);
    }
    setWidths((current) => {
      const ids = Object.keys(next);
      const same =
        ids.length === Object.keys(current).length &&
        ids.every((id) => current[id] === next[id]);
      return same ? current : next;
    });
  }, [entries]);

  useLayoutEffect(() => {
    measure();
  }, [measure, entries]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const { id } of entries) {
      const node = refs.current.get(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [measure, entries]);

  const setRef = useCallback((id: string, node: HTMLSpanElement | null) => {
    refs.current.set(id, node);
  }, []);

  return { widths, setRef };
}

export function MobileTabBar({ view }: { view: string }) {
  const { user } = useSession();
  // Appearance theme — the Settings panel's one-tap Dark/Light row (Task 35).
  const { theme, toggle } = useTheme();
  // The expanded panel: a nav section id or "account" (the non-applicant
  // Account tab); null = collapsed — the current view's word pill stays via
  // value = open ?? restingId.
  const [open, setOpen] = useState<string | null>(null);
  // ⌘K command menu — opened by the Jobs panel's "Find" row (applicant) or
  // the Account panel's "Find" row (staff).
  const [cmdOpen, setCmdOpen] = useState(false);

  // The block emits onValueChange(null) for three different causes. A
  // capture-phase pointerdown/keydown pair records the press ORIGIN (inside
  // the shell vs outside vs Escape) BEFORE the block's own listeners run, so
  // handleValueChange can route the null: active-tab tap → toggle, outside /
  // Escape → close only.
  const shellRef = useRef<HTMLDivElement>(null);
  const downInsideRef = useRef(false);
  const escRef = useRef(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      downInsideRef.current = !!shellRef.current?.contains(e.target as Node);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") escRef.current = true;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const role = user?.role;
  // Only the applicant's three sections (Home / Jobs / Profile) carry
  // expandable panels; other roles keep panel-free nav tabs + the Account
  // tab's identity panel.
  const sectionPanels = role === "APPLICANT";

  const closePanel = useCallback(() => {
    setOpen(null);
  }, []);

  // Tab entries with mobile labels — stable identity for the measure hook.
  // APPLICANT: Home · Jobs · Profile · Settings (Task 35). Jobs is
  // mobile-only (the public board #/vacant-positions); Home/Profile icons
  // come from NAV_CONFIG so rail and bar stay twins.
  const entries = useMemo<TabEntry[]>(() => {
    if (role === "APPLICANT") {
      const railItems = (NAV_CONFIG.APPLICANT ?? []).flatMap((g) => g.items);
      const home = railItems.find((i) => i.view === "home");
      const profile = railItems.find((i) => i.view === "profile");
      const list: TabEntry[] = [];
      if (home) list.push({ id: home.view, label: home.label, icon: home.icon });
      list.push({ id: "vacant-positions", label: "Jobs", icon: Briefcase });
      if (profile) list.push({ id: profile.view, label: profile.label, icon: profile.icon });
      // Task 35 (per user): the fourth nav — HOME · JOBS · PROFILE · SETTINGS.
      // The expandable opens onto the dedicated Account Settings page
      // (dark/light mode · change password · help & support).
      list.push({ id: "account-settings", label: "Settings", icon: Settings2 });
      return list;
    }
    const list = (role ? NAV_CONFIG[role] ?? [] : []).flatMap((g) => g.items).map((item) => ({
      id: item.view,
      label: MOBILE_LABELS[item.label] ?? item.label,
      icon: item.icon,
    }));
    list.push({ id: "account", label: "Account", icon: CircleUserRound });
    return list;
  }, [role]);

  const hasAccountTab = entries.some((e) => e.id === "account");

  const { widths, setRef } = useLabelWidths(entries);

  // Detail views rest on their parent (desktop-rail parity) — used to ink
  // the closed bar's "you are here" icon and to keep a panel open across
  // detail-view navigation.
  const activeKey = PARENT_VIEW[view] ?? view;
  const restingId = entries.some((e) => e.id === activeKey) ? activeKey : null;

  // A panel belongs to its section: navigation from OUTSIDE the bar (brand
  // tap, job cards, command menu) closes it — unless the new view is owned
  // by the very tab whose panel is open (a tab tap's own route landing must
  // not swallow the fresh panel, and detail views keep their parent's panel).
  useEffect(() => {
    setOpen((cur) => (cur && cur === (PARENT_VIEW[view] ?? view) ? cur : null));
  }, [view]);

  // Block wiring — the authentic state machine plus router glue:
  //   a nav id → navigate (applicant sections open their panel, which then
  //   REMAINS while you're in the section); "account" → identity panel; null
  //   → routed by press ORIGIN: a press inside the shell (active-tab tap)
  //   toggles the section panel, an outside tap or Escape closes the panel
  //   only — the resting word pill survives both (value falls back to
  //   restingId).
  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next === "account") {
        setOpen("account");
        return;
      }
      if (next === null) {
        const esc = escRef.current;
        const inside = downInsideRef.current;
        escRef.current = false;
        downInsideRef.current = false;
        if (!esc && inside) {
          // Active-tab tap: close an open panel, or re-open the resting
          // section's panel (applicant sections only — staff tabs are
          // panel-free).
          setOpen((cur) => (cur ? null : sectionPanels && restingId ? restingId : null));
        } else {
          closePanel();
        }
        return;
      }
      setOpen(sectionPanels ? next : null);
      navigate(next);
    },
    [closePanel, sectionPanels, restingId]
  );

  if (!user) return null;

  const n = entries.length;
  // Roomy bars (the applicant's 3 navs) get the spread/collapse spacing
  // polish; staff bars with 6–8 tabs are at the phone width limit and keep
  // the authentic justify-between layout in both states.
  const roomy = n <= 4;
  const labelWidth = (id: string) => widths[id] ?? 0;
  // Width match (user): the OPEN shell must be exactly as wide as the navs'
  // closed bar, so the component never changes width — opening a panel only
  // grows it UPWARD. panelW = closedShell − sizer px-2 − border; the block's
  // openSize then = max(panel + chrome, spacers, closedSize) = closedShell.
  const widestLabel = entries.reduce((m, e) => Math.max(m, labelWidth(e.id)), 0);
  const panelW =
    rowShellWidth(n, widestLabel) +
    (roomy ? (n - 1) * CLOSED_EXTRA_GAP : 0) -
    SIZER_X_PAD -
    ROOT_BORDER;
  // Invisible sizer content that guarantees a shell fits this tab's pill row.
  // The spacers mirror the same formula as panelW, so open and closed shells
  // agree to the pixel (see the width-match note above).
  const spacerFor = (id: string) =>
    Math.max(
      0,
      rowShellWidth(n, labelWidth(id)) -
        SIZER_X_PAD -
        ROOT_BORDER +
        (roomy ? (n - 1) * CLOSED_EXTRA_GAP : 0)
    );

  // Identity card — avatar block + sign out, the staff Account tab's panel
  // (non-applicant only; the applicant's Profile expandable no longer opens
  // it — Task 36 removed that row since the dedicated Account Settings page
  // owns account management and its Session card holds Sign out). At the
  // width-matched panel the role pill moves to its own right-aligned line
  // (dense staff cards keep it inline).
  const rolePill = (
    <span className="dlg-pill shrink-0 bg-fog px-2.5 py-0.5 text-[11px] font-medium text-graphite">
      {user.role}
    </span>
  );
  const accountPanel = (
    <div className="flex flex-col gap-0.5" style={{ width: panelW }}>
      {/* Staff reach Find here (Task 21): their dense 6–8-tab bar can't take
          another icon without overflowing a 390px phone, so the ⌘K palette
          opens from the Account panel instead. */}
      {!sectionPanels && (
        <MenuRow icon={Search} label="Find" onClick={() => setCmdOpen(true)} />
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          {initialsOf(user)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{displayNameOf(user)}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        {!roomy && rolePill}
      </div>
      {roomy && <div className="-mt-1 flex justify-end px-3 pb-1">{rolePill}</div>}
      <MenuRow icon={LogOut} label="Sign out" danger onClick={performSignOut} />
    </div>
  );

  // Applicant section panels — one menu per nav (the official preview's
  // Menu pattern: icon · label · chevron rows). Width = panelW so the open
  // shell exactly matches the navs' closed width (width-match note above).
  const sectionPanel = (id: string): ReactNode => {
    if (id === "home") {
      return (
        <div className="flex flex-col gap-0.5" style={{ width: panelW }}>
          <MenuRow icon={FileText} label="Application" onClick={() => navigate("home")} />
        </div>
      );
    }
    if (id === "vacant-positions") {
      return (
        <div className="flex flex-col gap-0.5" style={{ width: panelW }}>
          {/* Find (Task 21, per user): the mobile search entry lives inside
              the Jobs expandable — not as a nav tab. */}
          <MenuRow icon={Search} label="Find" onClick={() => setCmdOpen(true)} />
          <RailJourneyInfoRow />
        </div>
      );
    }
    if (id === "profile") {
      // Task 36 (per user): the "Account" identity row is gone — account
      // management (including Sign out) lives on the dedicated Account
      // Settings page, reached from the Settings tab.
      return (
        <div className="flex flex-col gap-0.5" style={{ width: panelW }}>
          <MenuRow icon={UserRound} label="Profile" onClick={() => navigate("profile")} />
        </div>
      );
    }
    if (id === "account-settings") {
      return (
        <div className="flex flex-col gap-0.5" style={{ width: panelW }}>
          <MenuRow
            icon={UserCog}
            label="Account settings"
            onClick={() => navigate("account-settings")}
          />
          <MenuRow
            icon={theme === "dark" ? Sun : Moon}
            label={theme === "dark" ? "Light mode" : "Dark mode"}
            chevron={false}
            onClick={toggle}
          />
        </div>
      );
    }
    return <div aria-hidden="true" style={{ width: 0, height: 0 }} />;
  };

  const navTabs: ExpandableTabsItem[] = entries
    .filter((e) => e.id !== "account")
    .map((e) => {
      const Icon = e.icon;
      return {
        id: e.id,
        label: e.label,
        // The closed bar's "you are here" cue: the current view's icon inks
        // dark (official content prop — the block tints the rest muted).
        icon: <Icon className={cn("h-4 w-4", e.id === restingId && "text-ink")} />,
        content:
          sectionPanels && open === e.id ? (
            sectionPanel(e.id)
          ) : (
            // Zero-height width spacer: feeds the block's hidden sizer so an
            // open shell always fits this tab's pill row; renders nothing.
            <div aria-hidden="true" style={{ width: spacerFor(e.id), height: 0 }} />
          ),
      };
    });

  // Account tab — non-applicant roles only (the applicant reaches the same
  // identity card via Profile → Account). While closed its content is a zero
  // spacer so the width-matched panel never leaks into the shell width.
  const accountTab: ExpandableTabsItem | null = hasAccountTab
    ? {
        id: "account",
        label: "Account",
        icon: <CircleUserRound className="h-4 w-4" />,
        content:
          open === "account" ? (
            accountPanel
          ) : (
            <div aria-hidden="true" style={{ width: 0, height: 0 }} />
          ),
      }
    : null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] lg:hidden">
        <div className="pointer-events-auto" ref={shellRef}>
          <ExpandableTabs
            items={accountTab ? [...navTabs, accountTab] : navTabs}
            // You-are-here: the current view's tab stays officially active
            // while no panel is open, so the block renders its word pill.
            value={open ?? restingId}
            onValueChange={handleValueChange}
            className="shadow-[0_12px_40px_rgba(31,32,37,0.18)]"
            // Collapsed: shave the sizer's dock reserve so the block lands
            // on the original 54px closed-bar height (see COLLAPSED_SIZER_CLASS).
            // Both states: the right-half active-pill mirror rides the bar
            // slot (Fix 1) — and ONLY the mirror (Fix 2): no open-state
            // clustering override, so the block's authentic justify-between
            // runs collapsed AND open and the width-matched rows are
            // pixel-identical. Unknown tab counts yield undefined = the
            // block's authentic icon-first rendering.
            classNames={
              open === null
                ? { panel: COLLAPSED_SIZER_CLASS, bar: MIRROR_BAR_CLASS[n] }
                : { bar: MIRROR_BAR_CLASS[n] }
            }
          />
        </div>
      </div>
      {/* Hidden label measurement — the block's own technique and classes,
          so spacer widths track the real pill widths (fonts included). */}
      <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 -z-10 flex opacity-0">
        {entries.map(({ id, label }) => (
          <span
            key={id}
            ref={(node) => {
              setRef(id, node);
            }}
            className="whitespace-nowrap text-sm font-medium leading-none"
          >
            {label}
          </span>
        ))}
      </div>
      {/* ⌘K palette — opened by the Jobs panel's "Find" row (applicant) or
          the Account panel's "Find" row (staff); the desktop workspace
          header keeps its own trigger. Rendered here so both mobile entry
          points share one menu. */}
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}

export default MobileTabBar;
