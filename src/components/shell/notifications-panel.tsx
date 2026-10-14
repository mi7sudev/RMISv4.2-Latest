"use client";

// ============================================================================
// RMIS — Admin notification center (spec §9.2): bell + popover fed by
// GET /api/admin/stats. Mount + 30s poll (visible tabs only) + refetch on
// open. Badge count = total actionable items.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { navigate } from "@/lib/router";

type AdminStats = {
  pendingReview: number;
  needsAttention: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type Item = { label: string; singular: string; count: number; go: () => void };

export function NotificationCenter() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AdminStats>("/api/admin/stats");
      setStats(data);
    } catch {
      /* silent — stats are non-critical chrome */
    }
  }, []);

  // Mount fetch + 30s poll while the tab is visible.
  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [isAdmin, load]);

  // Refetch whenever the panel opens.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!isAdmin) return null;

  const attention: Item[] = [
    {
      label: "applications awaiting review",
      singular: "application awaiting review",
      count: stats?.pendingReview ?? 0,
      go: () => navigate("review-queue"),
    },
    {
      label: "job deadlines this week",
      singular: "job deadline this week",
      count: stats?.needsAttention.deadlinesThisWeek ?? 0,
      go: () => navigate("recruitment"),
    },
  ];
  const updates: Item[] = [
    {
      label: "incomplete applicant profiles",
      singular: "incomplete applicant profile",
      count: stats?.needsAttention.incompleteProfiles ?? 0,
      go: () => navigate("candidates", { status: "incomplete" }),
    },
  ];
  const system: Item[] = [
    {
      label: "failed logins (24h)",
      singular: "failed login (24h)",
      count: stats?.needsAttention.failedLogins24h ?? 0,
      go: () => navigate("settings", { tab: "audit" }),
    },
  ];
  const groups: { group: string; rows: Item[] }[] = [
    { group: "Needs attention", rows: attention },
    { group: "Updates", rows: updates },
    { group: "System", rows: system },
  ];
  const total = groups.reduce(
    (sum, g) => sum + g.rows.reduce((n, r) => n + r.count, 0),
    0
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative grid h-11 w-11 place-items-center rounded-full text-stone transition-colors hover:bg-fog hover:text-ink"
          aria-label={`Notifications${total > 0 ? ` (${total} new)` : ""}`}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          {total > 0 && (
            <span className="num absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      {/* min(340px, 100vw-2rem): the popover must never exceed a 320px phone
          viewport (Radix can reposition but cannot shrink a fixed width). */}
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-ink">Notifications</p>
          <span className="dlg-pill bg-fog px-2.5 py-0.5 text-[11px] font-medium text-graphite">
            {total} item{total === 1 ? "" : "s"}
          </span>
        </div>

        {total === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-pebble">You&rsquo;re up to date</p>
        ) : (
          <div className="max-h-96 overflow-y-auto scroll-thin p-2">
            {groups.map((g) => {
              const rows = g.rows.filter((r) => r.count > 0);
              if (rows.length === 0) return null;
              return (
                <div key={g.group} className="mb-1">
                  <p className="eyebrow px-3 pb-1 pt-2">{g.group}</p>
                  {rows.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => {
                        setOpen(false);
                        r.go();
                      }}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xs px-3 text-left transition-colors hover:bg-fog"
                    >
                      <span className="text-sm text-stone">
                        <span className="num font-medium text-ink">{r.count}</span>{" "}
                        {r.count === 1 ? r.singular : r.label}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-pebble" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default NotificationCenter;
