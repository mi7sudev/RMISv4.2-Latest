"use client";

// ============================================================================
// RMIS — shared audit-feed row (presentation only).
// ONE anatomy for audit-log entries everywhere they stream (analytics activity
// panel, settings audit log). Two parameterized layouts:
//   "feed"   — analytics activity row: action pill, actor, description, time
//   "ledger" — settings audit row: fixed-width time/actor columns + role
// Timestamps keep their full-date tooltip; the action pill rides the neutral
// status-pill primitive at 10px caps.
// ============================================================================

import { cn } from "@/lib/utils";
import { pillClass } from "@/lib/status-ui";
import { formatDateTime, humanize, timeAgo } from "@/lib/client";

export function AuditFeedRow({
  timestamp,
  userLabel,
  userRole,
  action,
  description,
  variant = "feed",
}: {
  timestamp: string;
  userLabel: string | null;
  /** Role badge — ledger variant only (settings audit log). */
  userRole?: string | null;
  action: string;
  description?: string | null;
  variant?: "feed" | "ledger";
}) {
  if (variant === "ledger") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-fog/60">
        <span className="num w-24 shrink-0 text-xs text-body-gray" title={formatDateTime(timestamp)}>
          {timeAgo(timestamp)}
        </span>
        <span className="w-44 shrink-0 truncate">
          <span className="text-[13px] font-medium text-ink">{userLabel ?? "System"}</span>
          {userRole ? <span className="num ml-1.5 text-[11px] text-body-gray">{userRole}</span> : null}
        </span>
        <span className={cn(pillClass("neutral"), "shrink-0 text-[10px] uppercase tracking-[0.04em]")}>
          {humanize(action)}
        </span>
        <span className="min-w-[200px] flex-1 truncate text-[13px] text-body-gray">{description ?? "-"}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-fog/60">
      <span className={cn(pillClass("neutral"), "shrink-0 text-[10px] uppercase tracking-[0.06em]")}>
        {humanize(action)}
      </span>
      <span className="max-w-[240px] truncate text-[13px] font-medium text-ink">
        {userLabel ?? "System"}
      </span>
      <span className="min-w-[160px] flex-1 truncate text-[13px] text-body-gray">
        {description ?? "-"}
      </span>
      <span className="num shrink-0 text-xs text-body-gray">{timeAgo(timestamp)}</span>
    </div>
  );
}
