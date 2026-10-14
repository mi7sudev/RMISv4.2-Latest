"use client";

// ============================================================================
// RMIS — Admin dashboard (spec §7.12, `#/operations`). Needs-attention
// KPI tiles (total headline), active recruitment list, recent activity, and the
// overview aside. Data: /api/admin/stats + /api/jobs + /api/evaluator/queue;
// 30 s silent poll + focus refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Briefcase, CalendarClock, ChartColumn, Clock,
  Inbox, LayoutDashboard, RefreshCw, UserX,
} from "lucide-react";
import {
  EmptyState, IconChip, Monogram, nameInitials, PageHeader, SkeletonRows, StatCell, StatLedger,
  StatLedgerSkeleton, StatusPill,
} from "@/components/ui/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, deadlineState, formatDate, fullName } from "@/lib/client";
import { navigate } from "@/lib/router";
import { getStatusMeta, stageForStatus, PIPELINE_STAGES } from "@/lib/status";
import { STAGE_VIZ } from "@/lib/status-ui";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { ghostBtn } from "@/components/ui/buttons";

type Stats = {
  totalUsers: number;
  admins: number;
  applicants: number;
  evaluators: number;
  activeJobs: number;
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  byStatus: { status: string; count: number }[];
  recent: {
    id: number;
    status: string;
    dateApplied: string;
    applicant: { id: number; firstName: string | null; lastName: string | null };
    jobId: number;
    jobTitle: string;
    positionTitle: string | null;
  }[];
  needsAttention: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type JobRow = {
  id: number;
  title: string;
  positionType: string | null;
  numberOfVacancy: number | null;
  deadlineDate: string | null;
  publishedAt: string;
  isActive: boolean;
  applicationCount: number;
  position: { placeOfAssignment: string | null; division: string | null } | null;
};

/** Stage colors for the pipeline sparkline — the shared STAGE_VIZ map
    (same tokens as the analytics funnel). */
const STAGE_SPARK = STAGE_VIZ;

/** Tiny stacked pipeline bar for the stat card aside — built only from byStatus wire data. */
function PipelineSpark({ byStatus }: { byStatus: { status: string; count: number }[] }) {
  const buckets = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: byStatus.reduce((sum, d) => (stageForStatus(d.status) === stage ? sum + d.count : sum), 0),
  }));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;
  return (
    <span className="flex h-1.5 w-16 shrink-0 overflow-hidden bg-fog" aria-hidden>
      {buckets.map((b) =>
        b.count > 0 ? (
          <span
            key={b.stage}
            style={{ width: `${(b.count / total) * 100}%`, background: STAGE_SPARK[b.stage] }}
          />
        ) : null
      )}
    </span>
  );
}

const SUMMARY_TONE_TEXT: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
};

/** Icon tint for the aside summary lines: green when clear, tone when flagged. */
function summaryTone(count: number, alertTone: "warn" | "bad"): "ok" | "warn" | "bad" {
  return count === 0 ? "ok" : alertTone;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [s, j] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<JobRow[]>("/api/jobs?limit=50"),
      ]);
      setStats(s);
      setJobs(j);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(load);

  const manualRefresh = useCallback(() => {
    setSpin(true);
    void load(true).finally(() => setTimeout(() => setSpin(false), 500));
  }, [load]);

  const activeJobs = useMemo(() => (jobs ?? []).filter((j) => j.isActive).slice(0, 6), [jobs]);
  const attentionTotal = stats
    ? stats.pendingReview +
      stats.needsAttention.deadlinesThisWeek +
      stats.needsAttention.incompleteProfiles +
      stats.needsAttention.failedLogins24h
    : 0;

  const refreshButton = (
    <button type="button" className={ghostBtn} onClick={manualRefresh}>
      <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} aria-hidden />
      Refresh
    </button>
  );

  // Shared enterprise page header (PageHeader) — identical anatomy on every
  // workspace view across all roles (Task 35 layout refactor).
  const header = (
    <PageHeader
      title="Dashboard"
      description="Live operational snapshot of recruitment, pipeline health, and system activity."
      actions={refreshButton}
    />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load the dashboard"
            description={error}
            action={
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (!stats || jobs === null) {
    return (
      <div className="space-y-6">
        {header}
        <StatLedgerSkeleton />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SkeletonRows rows={2} rowClassName="h-6 w-40" />
            <SkeletonRows rows={5} rowClassName="h-[72px] rounded-lg" />
            <SkeletonRows rows={5} rowClassName="h-[64px] rounded-lg" />
          </div>
          <div>
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* min-w-0: activity rows' truncate meta text must not widen the auto track
            on phones (observed OV=51 at 320px) */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Needs attention */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-base font-medium text-ink">Needs attention</h2>
              <span className="text-xs text-stone">
                <span className="num">{attentionTotal}</span> item{attentionTotal === 1 ? "" : "s"} across the board
              </span>
            </div>
            {/* Institutional stat ledger (shared StatLedger): one white band,
                hairline gaps, the numbers carry the hierarchy — no boxed
                cards, no icon chips. */}
            <StatLedger>
              <StatCell
                label="Awaiting review"
                value={stats.pendingReview}
                hint="Open →"
                onClick={() => navigate("review-queue")}
                aside={<PipelineSpark byStatus={stats.byStatus} />}
              />
              <StatCell
                label="Deadlines this week"
                value={stats.needsAttention.deadlinesThisWeek}
                hint="Open →"
                onClick={() => navigate("recruitment")}
              />
              <StatCell
                label="Incomplete profiles"
                value={stats.needsAttention.incompleteProfiles}
                hint="Open →"
                onClick={() => navigate("candidates", { status: "incomplete" })}
              />
              <StatCell
                label="Failed logins"
                value={stats.needsAttention.failedLogins24h}
                hint="Last 24 h · Open →"
                onClick={() => navigate("settings", { tab: "audit" })}
              />
            </StatLedger>
          </section>

          {/* Active recruitment */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-medium text-ink">Active recruitment</h2>
              <button type="button" className={ghostBtn} onClick={() => navigate("recruitment")}>
                View all
              </button>
            </div>
            {activeJobs.length === 0 ? (
              <div className="dlg-card p-6 sm:p-10">
                <EmptyState
                  icon={Briefcase}
                  title="No active job postings right now"
                  description="Publish a posting in recruitment to start receiving applications."
                  action={
                    <button
                      type="button"
                      className="dlg-cta inline-flex min-h-[44px] items-center gap-2 px-5 text-sm"
                      onClick={() => navigate("recruitment")}
                    >
                      Open recruitment
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="dlg-card overflow-hidden">
                {activeJobs.map((j) => {
                  const dl = deadlineState(j.deadlineDate);
                  const urgent = !dl.overdue && dl.closingSoon;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-fog/60 focus-ring"
                      onClick={() => navigate("job", { id: String(j.id) })}
                    >
                      <IconChip icon={Briefcase} tone="amber" size={36} iconSize={16} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{j.title}</p>
                        <p className="mt-0.5 truncate text-xs text-stone">
                          {[j.positionType, j.position?.placeOfAssignment, j.position?.division].filter(Boolean).join(" · ") || "-"}
                        </p>
                      </div>
                      <span
                        className={`num inline-flex shrink-0 items-center gap-1.5 text-xs ${
                          dl.overdue ? "text-pebble" : urgent ? "text-[var(--bad)]" : "text-stone"
                        }`}
                      >
                        {urgent ? <Clock className="h-3.5 w-3.5" aria-hidden /> : null}
                        {dl.overdue ? "Closed" : `Deadline ${formatDate(j.deadlineDate)}`}
                      </span>
                      <StatusPill
                        variant="neutral"
                        status={`${j.applicationCount} application${j.applicationCount === 1 ? "" : "s"}`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="space-y-3">
            <h2 className="text-base font-medium text-ink">Recent activity</h2>
            {stats.recent.length === 0 ? (
              <div className="dlg-card p-6 sm:p-10">
                <EmptyState
                  icon={Inbox}
                  title="No applications yet"
                  description="Recent applications will appear here as candidates apply."
                  compact
                />
              </div>
            ) : (
              <div className="dlg-card overflow-hidden">
                {stats.recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-fog/60 focus-ring"
                    onClick={() => navigate("candidate", { id: String(r.applicant.id) })}
                  >
                    <span aria-hidden="true" className="contents">
                      <Monogram size={28} className="rounded-full">{nameInitials(fullName(r.applicant))}</Monogram>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{fullName(r.applicant)}</p>
                      <p className="mt-0.5 truncate text-xs text-stone">
                        {[r.positionTitle || r.jobTitle, formatDate(r.dateApplied)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusPill status={r.status} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Overview aside */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <div className="dlg-card p-5">
            <div className="flex items-center gap-3">
              <IconChip icon={LayoutDashboard} tone="slate" size={36} iconSize={16} />
              <h2 className="text-base font-medium text-ink">Overview</h2>
            </div>
            <dl className="mt-3">
              {(
                [
                  ["Applicants", stats.applicants],
                  ["Active jobs", stats.activeJobs],
                  ["Applications", stats.totalApplications],
                  ["Shortlisted", stats.shortlisted],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-0"
                >
                  <dt className="text-xs text-stone">{label}</dt>
                  <dd className="num text-sm font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="dlg-ghost mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-4 text-sm"
              onClick={() => navigate("analytics")}
            >
              <ChartColumn className="h-4 w-4" aria-hidden />
              Open Analytics
            </button>
          </div>
          {/* Quiet ledger tile — fog panel so the alerts read as one anchored
              group under the cloud Overview card, not loose text on paper. */}
          <div className="space-y-2.5 rounded-lg bg-fog p-4">
            {(
              [
                [CalendarClock, stats.needsAttention.deadlinesThisWeek, "posting deadline(s) within 7 days", "warn"],
                [UserX, stats.needsAttention.blockedUsers, "blocked account(s)", "bad"],
                [AlertTriangle, stats.needsAttention.failedLogins24h, "failed login(s) in the last 24 h", "bad"],
              ] as [typeof CalendarClock, number, string, "warn" | "bad"][]
            ).map(([Icon, count, label, alertTone]) => (
              <p key={label} className="flex items-center gap-2 text-xs text-stone">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${SUMMARY_TONE_TEXT[summaryTone(count, alertTone)]}`}
                  aria-hidden
                />
                <span>
                  <span className="num">{count}</span> {label}
                </span>
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
