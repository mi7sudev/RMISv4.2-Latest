"use client";

// ============================================================================
// RMIS — Workspace header for the signed-in shell: breadcrumb
// (workspace › current view) + ⌘K search trigger + admin notification center.
// Desktop only (lg+): on mobile the row is removed (per request) — views
// carry their own headers there, search lives in the bottom ExpandableTabs
// navs (MobileTabBar) and the admin bell moved to the mobile top bar.
// The row (and its ⌘K listener + CommandMenu) stays MOUNTED below lg — the
// CSS-only hide keeps the keyboard shortcut alive on tablet/desktop keyboards.
// ============================================================================

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import CommandMenu from "@/components/shell/command-menu";
import { NotificationCenter } from "@/components/shell/notifications-panel";
import { NAV_CONFIG } from "@/components/shell/nav-rail";
import { useSession } from "@/components/session-provider";
import { humanize } from "@/lib/client";
import type { ViewParams } from "@/lib/router";

// Labels for views that do NOT sit in the rail (detail views, the public
// board). Rail views take their label from the user's role NAV_CONFIG below,
// so the breadcrumb always agrees with the rail (QA 2026-02: ADMIN sees
// "Users" for candidates; the jobs views read "Jobs", never "Positions").
const VIEW_LABELS: Record<string, string> = {
  job: "Job Workspace",
  candidate: "Candidate Profile",
  "evaluator-review": "Review",
  jobs: "Vacant Positions",
  operations: "Dashboard",
  recruitment: "Jobs",
  candidates: "Candidates",
  "review-queue": "Review Queue",
  analytics: "Analytics",
  settings: "Settings",
  home: "My Application",
  profile: "My Profile",
  "account-settings": "Account Settings",
};

export function WorkspaceHeader({
  view,
  params,
}: {
  view: string;
  params?: ViewParams;
}) {
  const { user } = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command menu (spec §13).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Role-aware label: the rail's NAV_CONFIG entry wins for views that live
  // in the rail (ADMIN "candidates" → "Users", "recruitment" → "Jobs");
  // everything else falls back to VIEW_LABELS, then humanize.
  const railLabel = user
    ? (NAV_CONFIG[user.role] ?? [])
        .flatMap((g) => g.items)
        .find((i) => i.view === view)?.label
    : undefined;
  const label = railLabel ?? VIEW_LABELS[view] ?? humanize(view) ?? "Workspace";

  return (
    // hidden below lg (Task 21): mobile drops this title + search row; the
    // subtree stays mounted so ⌘K still works wherever a keyboard exists.
    <div className="hidden w-full lg:block">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 pb-1 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        {/* Breadcrumb — mobile shows only the current label */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:inline-flex">
              <span className="text-sm text-stone">Workspace</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-sm font-medium text-ink">{label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCmdOpen(true)}
            className="dlg-ghost flex min-h-[44px] items-center gap-2 px-4 text-sm text-stone"
            aria-label="Search (Command menu)"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded-md border border-border bg-fog px-1.5 py-0.5 text-[11px] font-normal text-pebble sm:inline">
              ⌘K
            </kbd>
          </button>
          {user?.role === "ADMIN" && <NotificationCenter />}
        </div>
      </div>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}

export default WorkspaceHeader;
