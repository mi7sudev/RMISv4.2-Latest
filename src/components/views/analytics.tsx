"use client";

// ============================================================================
// RMIS — Analytics (spec §7.13, `#/analytics`). Pipeline conversion funnel
// (clickable → drill filter), application volume chart (last 30 days,
// recharts), status distribution bar chart, drill-down candidate list, and the
// audit activity feed. Sources: /api/admin/stats + evaluator queue + audit
// logs.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import {
  AlertTriangle, Filter, History, Inbox, ChartPie as ChartPieIcon,
  ShieldCheck, TrendingUp, UsersRound,
} from "lucide-react";
import {
  EmptyState, IconChip, Monogram, nameInitials, PageHeader, RefreshButton, SectionCard, SkeletonKpis, SkeletonRows, StatusDot, StatusPill,
} from "@/components/ui/shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/motion/select";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, getStatusMeta, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { STAGE_GLYPH, STAGE_VARIANT, STAGE_VIZ, glyphForStatus, variantForStatus } from "@/lib/status-ui";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { cn } from "@/lib/utils";
import { ghostBtn } from "@/components/ui/buttons";
import { AuditFeedRow } from "@/components/ui/audit-row";
import { useSession } from "@/components/session-provider";

type Stats = {
  byStatus: { status: string; count: number }[];
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  // QA 2026-02: system/web usage + security counters (admin analytics).
  totalUsers?: number;
  admins?: number;
  evaluators?: number;
  applicants?: number;
  activeJobs?: number;
  needsAttention?: {
    failedLogins24h: number;
    deadlinesThisWeek: number;
    blockedUsers: number;
    incompleteProfiles: number;
  };
};

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string };
  match: { verdict: string; metCount: number; requiredCount: number };
};

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  description: string | null;
};

type Drill = "All" | StageKey;

// ── Data-viz tokens (viz series — STAGE_VIZ in lib/status-ui + CSS vars) ────

const GRID = "var(--border)";
const TICK = { fontSize: 11, fill: "var(--stone)" };
const VIZ_1 = "var(--viz-1)"; // RMIS Electric Blue (lead series)

/** The ONE chart tooltip — token-styled card instead of the recharts default
 *  (whitebox with browser border that fought the card surfaces). */
function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 shadow-e2">
      {label !== undefined && label !== "" && (
        <p className="num text-xs font-medium text-ink">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="num mt-0.5 flex items-center gap-1.5 text-xs text-stone">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color ?? "var(--viz-1)" }}
          />
          <span className="min-w-0 truncate">{entry.name}</span>
          <span className="ml-auto pl-2 font-medium text-ink">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Funnel bar fill per stage — the shared STAGE_VIZ map (blue/gold/green/red). */
const STAGE_BAR = STAGE_VIZ;

/** Donut slice fill for a stored status spelling (stage tokens + fallback). */
function statusSliceColor(status: string): string {
  const key = STAGE_BAR[stageForStatus(status) as StageKey];
  return key ?? "var(--divider)";
}

export default function Analytics() {
  // QA 2026-02: evaluators see recruitment analytics only — the system usage
  // panel and the security/audit activity feed are administrator territory.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>("All");

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      // QA 2026-02: evaluators get recruitment analytics only — the audit
      // feed fetch is skipped entirely for them (admin-only endpoint).
      const [s, q, a] = await Promise.all([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        isAdmin
          ? apiFetch<{ data: AuditRow[]; total: number }>("/api/admin/audit-logs?pageSize=20")
          : Promise.resolve({ data: [] as AuditRow[], total: 0 }),
      ]);
      setStats(s);
      setQueue(q.data);
      setAudit(a.data);
      setAuditTotal(a.total);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load analytics");
    }
  }, [isAdmin]);

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

  const rows = useMemo(() => queue ?? [], [queue]);

  const funnel = useMemo(() => {
    // QA 2026-02 bugfix (user report: "progress bars not working"): the old
    // denominator was the count CURRENTLY sitting in the Applied stage — once
    // every applicant advances (Applied = 0), every percentage collapsed to
    // 0% and all bars went empty. A conversion funnel's denominator is the
    // size of the whole intake pool: rows.length (everyone who applied).
    // Stage shares now always render and sum to ~100%.
    const total = rows.length;
    return PIPELINE_STAGES.map((stage) => {
      const count = rows.filter((r) => stageForStatus(r.status) === stage).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return { stage, count, pct };
    });
  }, [rows]);

  const volume = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = new Date(r.dateApplied);
      if (Number.isNaN(key.getTime())) continue;
      const k = key.toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([day, applications]) => ({
      day: formatDate(`${day}T00:00:00`).replace(/,.*/, ""),
      applications,
    }));
  }, [rows]);

  const drillRows = useMemo(
    () => (drill === "All" ? rows : rows.filter((r) => stageForStatus(r.status) === drill)),
    [rows, drill]
  );

  // Donut slices (zero-count statuses dropped so the ring stays readable).
  const donutData = useMemo(
    () => (stats?.byStatus ?? []).filter((d) => d.count > 0),
    [stats]
  );
  const donutTotal = useMemo(() => donutData.reduce((sum, d) => sum + d.count, 0), [donutData]);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Pipeline health, application volume, and audit activity."
        />
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load analytics"
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

  if (!stats || queue === null || audit === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Pipeline health, application volume, and audit activity."
        />
        <SkeletonKpis count={4} />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonRows rows={5} rowClassName="h-16 rounded-lg" />
          <SkeletonRows rows={5} rowClassName="h-16 rounded-lg" />
        </div>
        <SkeletonRows rows={4} rowClassName="h-16 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Analytics"
        description="Pipeline health, application volume, and audit activity."
        actions={
          <RefreshButton onRefresh={() => load(true)} />
        }
      />

      <div className="space-y-6">
        {/* 1. Pipeline funnel + 3. Status distribution — the funnel card
            stretches to its column height (h-full + flex body) so the pair
            stays balanced; its rows are a hairline ledger (divide-y) whose
            equal-height cells echo the StatLedger band language. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Pipeline conversion"
            description="Click a stage to drill into its applicants. Percentages are of all applications."
            icon={Filter}
            chipTone="plum"
            className="h-full lg:flex lg:flex-col"
            bodyClassName="lg:flex lg:flex-1 lg:flex-col"
          >
            <div className="flex flex-col divide-y divide-[var(--border)] lg:h-full">
              {funnel.map((f) => {
                const active = drill === f.stage;
                return (
                  <button
                    key={f.stage}
                    type="button"
                    className={`focus-ring flex min-h-[44px] w-full flex-col justify-center px-3 py-3 text-left transition-colors lg:flex-1 ${
                      active ? "bg-cloud" : "hover:bg-fog/60"
                    }`}
                    onClick={() => setDrill(drill === f.stage ? "All" : f.stage)}
                    aria-pressed={active}
                  >
                    <div className="flex items-center gap-2.5">
                      <StatusDot variant={STAGE_VARIANT[f.stage]} glyph={STAGE_GLYPH[f.stage]} />
                      <span className="flex-1 text-sm text-ink">{f.stage}</span>
                      <span className="num text-sm font-medium text-ink">{f.count}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fog">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, f.pct)}%`, background: STAGE_BAR[f.stage] }}
                        />
                      </div>
                      <span className="num w-10 shrink-0 text-right text-xs text-body-gray">{f.pct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="Applications per day"
              description="Last 30 days, from the review queue."
              icon={TrendingUp}
              chipTone="plum"
            >
              <div className="mt-2">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={volume} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="analytics-volume-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VIZ_1} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={VIZ_1} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={TICK} tickMargin={8} interval={6} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                    <RTooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="applications"
                      stroke={VIZ_1}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      fill="url(#analytics-volume-fill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard
              title="Status distribution"
              description="All applications by stored status."
              icon={ChartPieIcon}
              chipTone="plum"
            >
              {donutData.length === 0 ? (
                <EmptyState icon={Inbox} tone="plum" title="No applications recorded yet" compact />
              ) : (
                // minmax(0,1fr): the legend rows' nowrap labels must not floor
                // the 1fr track's auto minimum (observed OV=61 at 1024px).
                <div className="mt-2 grid grid-cols-1 items-center gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
                  {/* Donut with centered total — the award-dash staple */}
                  <div className="relative mx-auto h-[200px] w-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RTooltip content={<ChartTooltip />} />
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={64}
                          outerRadius={92}
                          paddingAngle={2}
                          cornerRadius={4}
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((d) => (
                            <Cell key={d.status} fill={statusSliceColor(d.status)} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <p className="num font-display text-[32px] font-medium leading-none tracking-[0.01em] text-ink">
                          {donutTotal}
                        </p>
                        <p className="eyebrow mt-1">
                          Applications
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Legend — glyph status disc + label + count, mirrors funnel rows */}
                  <ul className="space-y-2.5">
                    {donutData.map((d) => (
                      <li key={d.status} className="flex items-center gap-2.5 text-sm">
                        <StatusDot variant={variantForStatus(d.status)} glyph={glyphForStatus(d.status) ?? undefined} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-body-gray">{d.status}</span>
                        <span className="num font-medium text-ink">{d.count}</span>
                        <span className="num w-12 text-right text-xs text-body-gray">
                          {donutTotal > 0 ? `${Math.round((d.count / donutTotal) * 100)}%` : "0%"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* 4. Drill-down */}
        <SectionCard
          title="Drill-down"
          description={drill === "All" ? "All stages." : `Filtered to ${drill}.`}
          icon={UsersRound}
          chipTone="plum"
          actions={
            <Select className="w-full sm:w-[170px]" value={drill} onValueChange={(v) => setDrill(v as Drill)}>
              <SelectTrigger className="min-h-[44px]">
                <span className="sr-only">Stage drill filter</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All stages</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {drillRows.length === 0 ? (
            <EmptyState icon={UsersRound} tone="plum" title="No applicants in this selection" compact />
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto scroll-thin pr-1">
              {drillRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-fog/60 focus-ring"
                  onClick={() => navigate("candidate", { id: String(r.applicantId) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={32} className="rounded-full">{nameInitials(fullName(r.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(r.applicant)}</p>
                    <p className="truncate text-xs text-body-gray">
                      {r.job.title} · Applied {formatDate(r.dateApplied)}
                    </p>
                  </div>
                  <StatusPill status={getStatusMeta(r.status).label} variant={variantForStatus(r.status)} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 5a. System usage & security (QA 2026-02 — admin analytics) */}
        {isAdmin && (
          <SectionCard
            title="System usage & security"
            description="Web usage and security signals for the RMIS deployment"
            icon={ShieldCheck}
            chipTone="emerald"
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  ["Registered accounts", stats?.totalUsers],
                  ["Blocked accounts", stats?.needsAttention?.blockedUsers],
                  ["Failed logins · 24h", stats?.needsAttention?.failedLogins24h],
                  ["Incomplete profiles", stats?.needsAttention?.incompleteProfiles],
                ] as [string, number | undefined][]
              ).map(([label, value]) => (
                // Cloud dlg-card tiles (not white-on-white) so each metric
                // group reads as a distinct inset inside the white card — same
                // tile surface the Settings panels use.
                <div key={label} className="dlg-card p-4">
                  <p className="eyebrow">{label}</p>
                  <p className="num mt-2 text-3xl font-medium tracking-[0.01em] text-ink">{value ?? "-"}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
              {(
                [
                  ["Applicants", stats?.applicants],
                  ["Evaluators", stats?.evaluators],
                  ["Administrators", stats?.admins],
                ] as [string, number | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="dlg-card p-4">
                  <p className="eyebrow">{label}</p>
                  <p className="num mt-2 text-3xl font-medium tracking-[0.01em] text-ink">{value ?? "-"}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-body-gray">
              Recent system activity and the full security/audit log live in{" "}
              <button
                type="button"
                onClick={() => navigate("settings", { tab: "audit" })}
                className="focus-ring rounded text-metric-blue underline underline-offset-2 hover:text-ink"
              >
                Settings → Audit Log
              </button>{" "}
              (administrators only).
            </p>
          </SectionCard>
        )}

        {/* 5. Recent activity (audit feed) — admin only per QA 2026-02 */}
        {isAdmin && (
        <SectionCard
          title="Recent activity"
          description={`${auditTotal} logged event${auditTotal === 1 ? "" : "s"}`}
          icon={History}
          chipTone="plum"
        >
          {audit.length === 0 ? (
            <EmptyState icon={Inbox} tone="plum" title="No audit events recorded yet" compact />
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto scroll-thin pr-1">
              {audit.map((a) => (
                <AuditFeedRow
                  key={a.id}
                  timestamp={a.timestamp}
                  userLabel={a.userLabel}
                  action={a.action}
                  description={a.description}
                />
              ))}
            </div>
          )}
        </SectionCard>
        )}
      </div>
    </div>
  );
}
