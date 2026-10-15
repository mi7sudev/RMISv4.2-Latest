"use client";

// ============================================================================
// RMIS — Candidate registry (spec §7.11). Server-paginated (25/page) master
// list from /api/admin/applicants with KPI tiles, debounced search, profile
// status / has-account filters, list rows with quick-view modal, and a kanban
// mode over the evaluator queue. 20 s silent poll + focus refresh.
// Enterprise polish pass: Bevel stat cards, single-card filter toolbar,
// table-card rows with hover quick-view, EmptyState, skeleton loading.
// Reference-board pass: kanban rebuilt on the shared ui/kanban primitives —
// dot+label+count columns, pastel avatars, match badge, position / applied
// relative date rows and credential tags. Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  AlertTriangle, ArrowUpRight, KeyRound, LayoutGrid, List, Mail,
  Phone, Search, UserCheck, UsersRound,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/motion/select";
import { Input } from "@/components/motion/input";
import {
  EmptyState, IconChip, KpiCard, PageHeader, Pagination, RefreshButton, SegmentedControl, SkeletonKpis,
  SkeletonRows, StatusDot, StatusPill, dialogScroll,
} from "@/components/ui/shell";
import {
  KanbanAvatar, KanbanCardBody, KanbanColumn, KANBAN_BOARD_CLASS, KANBAN_CARD,
} from "@/components/ui/kanban";
import { apiFetch, appliedAgo, formatDate, fullName, humanize } from "@/lib/client";
import { useSession } from "@/components/session-provider";
import { PIPELINE_STAGES, isRejectedStatus, stageForStatus, type StageKey } from "@/lib/status";
import { STAGE_GLYPH, STAGE_VARIANT, variantForCompletion } from "@/lib/status-ui";
// BEUI Phase 5 — official virtualized Table (beui.dev/r/table, vendored
// verbatim at src/components/motion/table). Alignment only via sanctioned props.
import { Table, type TableColumn } from "@/components/motion/table";
import { navigate, useHashRoute } from "@/lib/router";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ghostBtn, ctaBtn, iconBtn } from "@/components/ui/buttons";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type ApplicantRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
  hasAccount: boolean;
  user: { id: string; email: string; username: string; role: string; blocked: boolean } | null;
  applicationCount: number;
};

type EduRow = Record<string, unknown>;

type ApplicantDetail = ApplicantRow & {
  middleName: string | null;
  contactNumber: string | null;
  civilStatus: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  educations: EduRow[];
  workExperiences: EduRow[];
  documents: { id: string; originalName: string; category: string; status: string; filePath: string; size: number }[];
  applications: { id: number; status: string; dateApplied: string; jobId: number; positionTitle: string | null; jobTitle: string }[];
};

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string; position: { positionTitle: string; placeOfAssignment: string | null } | null };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
};

const PAGE_SIZE = 25;

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  return t;
}

// ── Quick-view modal ────────────────────────────────────────────────────────

function CandidateModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) {
      setDetail(null);
      setError(null);
      return;
    }
    let alive = true;
    apiFetch<ApplicantDetail>(`/api/admin/applicants/${id}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load the candidate");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const apps = detail?.applications ?? [];
  const countBy = (stage: StageKey) => apps.filter((a) => stageForStatus(a.status) === stage).length;
  const anyRejected = apps.some((a) => isRejectedStatus(a.status));

  return (
    <Dialog open={id !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "sm:max-w-lg")} ariaLabel="Candidate quick view">
        <DialogHeader>
          <DialogTitle className="text-xl font-medium text-foreground">Candidate</DialogTitle>
          <DialogDescription>Quick identity and pipeline snapshot.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-4 text-sm text-[var(--bad)]">{error}</p>
        ) : !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <KanbanAvatar name={fullName(detail)} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{fullName(detail)}</p>
                <p className="num text-xs text-pebble">#{detail.id}</p>
              </div>
              <span className="ml-auto shrink-0">
                <StatusPill
                  status={detail.isProfileComplete ? "Complete" : "Incomplete"}
                  variant={variantForCompletion(detail.isProfileComplete)}
                />
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.emailAddress && (
                <a
                  href={`mailto:${detail.emailAddress}`}
                  className="dlg-pill focus-ring inline-flex min-h-[36px] items-center gap-1.5 bg-fog px-3 text-xs text-ink transition-colors hover:bg-cloud"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {detail.emailAddress}
                </a>
              )}
              {detail.mobileNumber && (
                <a
                  href={`tel:${detail.mobileNumber}`}
                  className="dlg-pill focus-ring inline-flex min-h-[36px] items-center gap-1.5 bg-fog px-3 text-xs text-ink transition-colors hover:bg-cloud"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {detail.mobileNumber}
                </a>
              )}
            </div>

            {/* Mini pipeline dots: Submitted → Review → Shortlisted */}
            <div className="rounded-lg bg-cloud/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {(["Applied", "Under Review", "Shortlisted"] as StageKey[]).map((stage, i) => (
                  <div key={stage} className="flex flex-1 items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <StatusDot variant={countBy(stage) > 0 ? STAGE_VARIANT[stage] : "neutral"} glyph={countBy(stage) > 0 ? STAGE_GLYPH[stage] : undefined} />
                      <span className="text-xs text-stone">{["Submitted", "Review", "Shortlisted"][i]}</span>
                      <span className="num text-xs text-ink">{countBy(stage)}</span>
                    </div>
                  </div>
                ))}
                {anyRejected && <StatusPill status="Not Selected" variant="bad" />}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-stone">Education</p>
              {detail.educations.length === 0 ? (
                <p className="mt-1 text-xs text-pebble">No education entries.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.educations.slice(0, 2).map((e, i) => (
                    <li key={i} className="text-sm text-ink">
                      {[s(e.degree) || s(e.course), s(e.schoolName)].filter(Boolean).join(" · ") || "-"}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="status-pill status-neutral">
                Documents: <span className="num">{detail.documents.length}</span>
              </span>
              <span className="status-pill status-neutral">
                Applications: <span className="num">{detail.applicationCount ?? apps.length}</span>
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Close
          </button>
          {detail && (
            <button type="button" className={ctaBtn} onClick={() => navigate("candidate", { id: String(detail.id) })}>
              View full profile
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

export default function Candidates() {
  // QA 2026-02: admins manage ALL registered users here ("Users"); for
  // evaluators the same registry is framed as "Candidates" who applied.
  const { user: sessionUser } = useSession();
  const isAdminView = sessionUser?.role === "ADMIN";
  const { params } = useHashRoute();
  const initialStatus = params.status === "complete" || params.status === "incomplete" ? params.status : "all";

  const [rows, setRows] = useState<ApplicantRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "complete" | "incomplete">(initialStatus as "all" | "complete" | "incomplete");
  const [hasAccount, setHasAccount] = useState<"all" | "yes" | "no">("all");
  const [mode, setMode] = useState<"list" | "kanban">("list");
  const [modalId, setModalId] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debounced) sp.set("search", debounced);
        if (status !== "all") sp.set("status", status);
        if (hasAccount !== "all") sp.set("hasAccount", hasAccount);
        const res = await apiFetch<{ data: ApplicantRow[]; total: number }>(`/api/admin/applicants?${sp.toString()}`);
        setRows(res.data);
        setTotal(res.total);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load candidates");
      }
    },
    [page, debounced, status, hasAccount]
  );

  const loadQueue = useCallback(async (silent = true) => {
    try {
      const res = await apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100");
      setQueue(res.data);
    } catch {
      /* silent — kanban is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode === "kanban") void loadQueue();
  }, [mode, loadQueue]);

  // 20 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) {
        void load(true);
        if (mode === "kanban") void loadQueue();
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [load, loadQueue, mode]);
  useFocusRefresh(useCallback(() => {
    void load(true);
    if (mode === "kanban") void loadQueue();
  }, [load, loadQueue, mode]));

  // Debounced search (350 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const list = rows ?? [];
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const completeOnPage = list.filter((r) => r.isProfileComplete).length;
  const accountsOnPage = list.filter((r) => r.hasAccount).length;

  // BEUI Phase 5 — column defs for the official Table. Quick view lives in the
  // trailing action cell (the block has no row-click prop); always visible now
  // that rows are virtualized (no group/row hover stage).
  // QA 2026-02 fix — Candidate is flexible (no declared width) and the fixed
  // widths sum to 370px so the table fits the 960px card at 1280×720 (the old
  // 620px fixed name column pushed the quick view out of the viewport).
  const ROW_H = 64;
  // Task 39 (per user, mobile) — responsive columns at the call site: below
  // md the 370px fixed widths crush the flexible Candidate column to the
  // block's 64px floor. Phones get a 3-column set that fits — Candidate
  // (flexible, avatar hidden), Profile pill, and the quick-view action; the
  // per-row application count stays available in the quick view. sm+ keeps
  // the full 4-column table.
  const isMobile = useIsMobile();
  const candidateColumns: TableColumn<(typeof list)[number]>[] = isMobile
    ? [
        {
          key: "name",
          header: "Candidate",
          // Declared: see the recruitment note — the block's filler col would
          // otherwise take half the leftover under table-layout:fixed.
          width: "166px",
          cell: (r) => {
            const name = fullName(r);
            return (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="num truncate text-xs text-stone">
                  {[r.emailAddress, r.mobileNumber].filter(Boolean).join(" · ") || "No contact on file"}
                </p>
              </div>
            );
          },
        },
        {
          key: "isProfileComplete",
          header: "Profile",
          width: "120px",
          cell: (r) => (
            <StatusPill
              status={r.isProfileComplete ? "Complete" : "Incomplete"}
              variant={variantForCompletion(r.isProfileComplete)}
            />
          ),
        },
        {
          key: "actions",
          header: "",
          width: "72px",
          align: "right",
          cell: (r) => {
            const name = fullName(r);
            return (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={`Quick view ${name}`}
                  title="Quick view"
                  onClick={() => setModalId(r.id)}
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            );
          },
        },
      ]
    : [
    {
      key: "name",
      header: "Candidate",
      cell: (r) => {
        const name = fullName(r);
        return (
          <div className="flex items-center gap-3">
            <KanbanAvatar name={name} size={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
              <p className="num truncate text-xs text-stone">
                {[r.emailAddress, r.mobileNumber].filter(Boolean).join(" · ") || "No contact on file"} · #{r.id}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: "isProfileComplete",
      header: "Profile",
      width: "140px",
      cell: (r) => (
        <StatusPill
          status={r.isProfileComplete ? "Complete" : "Incomplete"}
          variant={variantForCompletion(r.isProfileComplete)}
        />
      ),
    },
    {
      key: "applicationCount",
      header: "Applications",
      width: "140px",
      cell: (r) => (
        <span className="num text-[13px] text-stone">
          {r.applicationCount} application{r.applicationCount === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "90px",
      align: "right",
      cell: (r) => {
        const name = fullName(r);
        return (
          <div className="flex items-center justify-end">
            <button
              type="button"
              className={iconBtn}
              aria-label={`Quick view ${name}`}
              title="Quick view"
              onClick={() => setModalId(r.id)}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      },
    },
  ];

  const kanban = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of queue ?? []) map[stageForStatus(r.status)].push(r);
    return map;
  }, [queue]);

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title={isAdminView ? "Users" : "Candidates"}
        description={
          isAdminView
            ? "All registered system accounts: profiles, logins, and pipeline activity."
            : "Every candidate on file: profiles, logins, and pipeline activity."
        }
        actions={
          <>
            <SegmentedControl
              ariaLabel="Candidates view mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "list", label: "List", icon: List },
                { value: "kanban", label: "Kanban", icon: LayoutGrid },
              ]}
            />
            <RefreshButton onRefresh={() => load(true)} />
          </>
        }
      />

      {/* KPI tiles — canonical shell KpiCards */}
      {!error && (rows === null ? (
        <SkeletonKpis count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard label="Total on file" value={total} icon={UsersRound} tone="info" hint="all registered candidates" />
          <KpiCard label="Showing" value={`${start}–${end}`} icon={List} tone="neutral" hint={`of ${total}`} />
          <KpiCard label="Complete profiles" value={completeOnPage} icon={UserCheck} tone="ok" hint="on this page" />
          <KpiCard label="Has login" value={accountsOnPage} icon={KeyRound} tone="neutral" hint="on this page" />
        </div>
      ))}

      {/* Filter toolbar — white card row */}
      <div className="dlg-card flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-56">
          <Input
            aria-label="Search candidates"
            leftIcon={<Search />}
            placeholder="Search name, email, employee no., mobile…"
            value={search}
            onChange={(next) => setSearch(next)}
          />
        </div>
        <Select
          className="w-40 shrink-0"
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        >
          <SelectTrigger className="min-h-[44px]">
            <span className="sr-only">Profile status</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All profiles</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
        <Select
          className="w-40 shrink-0"
          value={hasAccount}
          onValueChange={(v) => {
            setHasAccount(v as typeof hasAccount);
            setPage(1);
          }}
        >
          <SelectTrigger className="min-h-[44px]">
            <span className="sr-only">Has account</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            <SelectItem value="yes">Has login</SelectItem>
            <SelectItem value="no">No login</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load candidates"
            description={error}
            action={
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
            }
          />
        </div>
      ) : rows === null ? (
        // Skeleton inside the same .dlg-card shell the loaded list uses
        // (matching recruitment's loading anatomy — the bare row skeleton
        // previously floated on the canvas).
        <div className="dlg-card p-6">
          <SkeletonRows rows={6} rowClassName="h-16 rounded-lg" />
        </div>
      ) : mode === "list" ? (
        <div className="space-y-3">
          {list.length === 0 ? (
            <div className="dlg-card p-6 sm:p-10">
              <EmptyState
                icon={UsersRound}
                title="No candidates match"
                description="Try a different search, or clear the profile and account filters."
              />
            </div>
          ) : (
            <div className="dlg-card table-card overflow-hidden">
              {/* In-card header band — same anatomy as the recruitment table */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
                <IconChip icon={UsersRound} tone="slate" size={36} iconSize={16} />
                <h2 className="text-base font-medium text-ink">{isAdminView ? "Accounts" : "Candidates"}</h2>
                <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                  {list.length} on page
                </span>
              </div>
              {/* BEUI Phase 5 — official virtualized Table; header band and
                  Pagination below remain the unchanged RMIS anatomy */}
              <Table
                data={list}
                columns={candidateColumns}
                getRowId={(r) => String(r.id)}
                rowHeight={ROW_H}
                height={(list.length + 1) * ROW_H}
                className={cn(
              "rounded-none border-0 [&_table]:w-full",
              // Task 39 (mobile): the block's td/th wear px-4; below sm that
              // steals 8px per cell from the tight 3-column budget — px-3
              // keeps the declared widths ellipsis-free on phones.
              "max-sm:[&_td]:px-3 max-sm:[&_th]:px-3"
            )}
              />
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <Pagination
              page={page}
              pageCount={Math.ceil(total / PAGE_SIZE)}
              total={total}
              onPage={setPage}
              unit="candidates"
            />
          )}
        </div>
      ) : (
        /* Kanban — reference board: bordered columns with dot + label + count headers */
        <div className={KANBAN_BOARD_CLASS}>
          {PIPELINE_STAGES.map((stage) => {
            const cards = kanban[stage];
            return (
              <KanbanColumn key={stage} label={stage} stage={stage} count={cards.length}>
                {cards.map((c) => {
                    const position = c.job.position?.positionTitle || c.job.title;
                    const name = fullName(c.applicant);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={KANBAN_CARD + " focus-ring w-full cursor-pointer p-4 text-left"}
                        onClick={() => navigate("candidate", { id: String(c.applicantId) })}
                        aria-label={`Open ${name}'s candidate profile`}
                      >
                        <KanbanCardBody
                          name={name}
                          position={humanize(position)}
                          appliedLabel={`Applied ${appliedAgo(c.dateApplied)}`}
                          match={{ metCount: c.match?.metCount ?? 0, requiredCount: c.match?.requiredCount ?? 0 }}
                          tags={c.tags ?? []}
                        />
                      </button>
                    );
                  })}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      <CandidateModal id={modalId} onClose={() => setModalId(null)} />
    </div>
  );
}
