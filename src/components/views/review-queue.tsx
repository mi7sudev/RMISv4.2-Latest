"use client";

// ============================================================================
// RMIS — Evaluator review queue (spec §7.8). List (default) and Kanban modes
// over /api/evaluator/queue. 15 s silent poll + focus refresh + manual refresh.
// Stage tabs (list), bulk regret letters with confirm. (User direction
// 2026-10: the "Qualified only" lens was removed — the queue always shows
// every application.) Card / row review actions open the ReviewWorkspace in a
// Dialog. List rows carry an always-visible labeled Review button in the
// primary blue capsule (user direction — no hover-reveal arrow; blue fill for
// UI consistency with the stage tabs). Bevel pass: shared page-header anatomy
// + cloud stat cards, capsule segmented toggles, white hairline table-card,
// quiet round row actions. 4-column kanban keeps the shared reference-board
// primitives (dot+label+count columns, pastel avatars, match badge, credential
// tags). Handlers byte-identical.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  ArrowUpRight, Inbox, LayoutGrid, List, MailX, UserRound, Video,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyState, ErrorCard, FilterChip, IconChip, NoteBanner, PageHeader, PriorRejectionPill, RefreshButton, SegmentedControl,
  SkeletonKanban, SkeletonRows, StatusPill, VerdictPill, dialogScroll,
} from "@/components/ui/shell";
import { ghostBadModifier, ghostBadBtn, ghostBtn, iconBtn } from "@/components/ui/buttons";
import {
  KanbanAvatar, KanbanCardBody, KanbanColumn, KANBAN_BOARD_CLASS, KANBAN_CARD, StageDot,
} from "@/components/ui/kanban";
import { apiFetch, appliedAgo, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate } from "@/lib/router";
import { useSession } from "@/components/session-provider";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ReviewWorkspace, NoticeFormDialog } from "@/components/views/review-workspace";
// BEUI Phase 5 — official virtualized Table (beui.dev/r/table, vendored
// verbatim at src/components/motion/table). Alignment only via sanctioned props.
import { Table, type TableColumn } from "@/components/motion/table";

// ── Wire shapes ─────────────────────────────────────────────────────────────

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  reason: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  };
  job: {
    id: number;
    title: string;
    position: { positionTitle: string; placeOfAssignment: string | null } | null;
  };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
  /** MOM 2026-10-13 — prior rejected applications for THIS job listing. */
  priorRejections?: { count: number; lastDate: string | null; lastReason: string | null } | null;
};

type RegretSummary = {
  total: number;
  sent: number;
  alreadySent: number;
  shortlisted: number;
  failed: number;
  notFound: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  // QA 2026-02: administrators can assist with review activities — the scope
  // note below makes that access explicit to avoid evaluator overlap.
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // QA 2026-02 (user direction): List is the default working surface — the
  // kanban board stays available as the secondary spatial overview.
  const [mode, setMode] = useState<"kanban" | "list">("list");
  const [listStage, setListStage] = useState<"All" | StageKey>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [regretOpen, setRegretOpen] = useState(false);
  const [regretBusy, setRegretBusy] = useState(false);
  // MOM 2026-10-13 — bulk-send interview/exam invitations to the shortlisted.
  const [bulkNotice, setBulkNotice] = useState<"interview" | "skills_exam" | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const q = await apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100");
      setQueue(q.data);
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load the review queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 15 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(() => void load(true));

  const applications = useMemo(() => queue ?? [], [queue]);
  const listRows = useMemo(
    () => (listStage === "All" ? applications : applications.filter((r) => stageForStatus(r.status) === listStage)),
    [applications, listStage]
  );

  // BEUI Phase 5 — column defs for the official Table. Review/View is the
  // labeled, always-visible button per QA 2026-02 (user direction); profile
  // shortcut rides in the same action cell.
  // QA 2026-02 fix — the two text columns are flexible (no declared width)
  // and the fixed widths sum to ~510px, so the table fits the 960px card at
  // the default 1280×720 laptop viewport. The old fixed 280+220+140+150+140
  // +190 = 1120px forced a horizontal overflow that pushed the Review/View
  // buttons outside the viewport — clicks looked completely dead.
  const ROW_H = 64;
  // Task 39 (per user, mobile) — responsive columns at the call site: below
  // md the 510px fixed widths crush the two flexible columns to the block's
  // 64px floor. Phones get a 3-column set that fits the viewport — Candidate
  // (flexible, avatar hidden, the POSITION folded into the subtitle), Status,
  // and a single Review/View action (the profile button lives inside the
  // review workspace). sm+ keeps the full 7-column table.
  const isMobile = useIsMobile();
  const queueColumns: TableColumn<(typeof listRows)[number]>[] = isMobile
    ? [
        {
          key: "applicant",
          header: "Candidate",
          // Declared: see the recruitment note — the block's filler col would
          // otherwise take half the leftover under table-layout:fixed.
          width: "106px",
          cell: (row) => {
            const name = fullName(row.applicant);
            const position = row.job.position?.positionTitle || row.job.title;
            return (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-xs text-stone">{humanize(position)}</p>
              </div>
            );
          },
        },
        {
          key: "status",
          header: "Status",
          width: "134px",
          // User QA — the prior-rejection flag lives with the status (stacked
          // under the stage pill), not crammed under the candidate name;
          // PriorRejectionPill compacts to "Rejected ×N" to fit 134px.
          cell: (row) => (
            <div className="flex flex-col items-start gap-1">
              <StatusPill status={row.status} />
              <PriorRejectionPill count={row.priorRejections?.count} />
            </div>
          ),
        },
        {
          key: "actions",
          header: "",
          width: "118px",
          align: "right",
          cell: (row) => {
            const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
            const name = fullName(row.applicant);
            return (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="dlg-cta inline-flex min-h-[36px] items-center gap-1 px-4 text-xs focus-ring"
                  aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
                  title={decided ? "View decision" : "Review"}
                  onClick={() => setSelectedId(row.id)}
                >
                  {decided ? "View" : "Review"}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            );
          },
        },
      ]
    : [
    {
      key: "applicant",
      header: "Candidate",
      cell: (row) => {
        const name = fullName(row.applicant);
        return (
          <div className="flex items-center gap-3">
            <KanbanAvatar name={name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
              <p className="truncate text-xs text-stone">{row.applicant.emailAddress || "No email on record"}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "position",
      header: "Position",
      cell: (row) => {
        const position = row.job.position?.positionTitle || row.job.title;
        const place = row.job.position?.placeOfAssignment ?? null;
        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ink">{humanize(position)}</p>
            <p className="truncate text-xs text-stone">{place || "-"}</p>
          </div>
        );
      },
    },
    {
      key: "dateApplied",
      header: "Applied",
      width: "110px",
      cell: (row) => <span className="num whitespace-nowrap text-[13px] text-stone">{formatDate(row.dateApplied)}</span>,
    },
    {
      key: "status",
      header: "Status",
      // 184px — fits the full "Previously rejected ×N" pill (148px measured)
      // stacked under the stage pill (user QA: the flag moved out of the
      // Candidate cell into Status).
      width: "184px",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={row.status} />
          <PriorRejectionPill count={row.priorRejections?.count} />
        </div>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      width: "120px",
      cell: (row) => <VerdictPill verdict={row.match?.verdict} />,
    },
    {
      key: "actions",
      header: "",
      width: "150px",
      align: "right",
      cell: (row) => {
        const decided = stageForStatus(row.status) === "Shortlisted" || stageForStatus(row.status) === "Rejected";
        const name = fullName(row.applicant);
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="dlg-cta inline-flex min-h-[36px] items-center gap-1 px-4 text-xs focus-ring"
              aria-label={decided ? `View decision for ${name}` : `Review application from ${name}`}
              title={decided ? "View decision" : "Review"}
              onClick={() => setSelectedId(row.id)}
            >
              {decided ? "View" : "Review"}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className={iconBtn}
              aria-label={`Open ${name}'s profile`}
              title="Open profile"
              onClick={() => navigate("candidate", { id: String(row.applicantId) })}
            >
              <UserRound className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      },
    },
  ];
  const rejectedIds = useMemo(
    () => applications.filter((r) => stageForStatus(r.status) === "Rejected").map((r) => r.id),
    [applications]
  );
  // MOM 2026-10-13 — shortlisted cohort for the bulk invitation send.
  const shortlistedIds = useMemo(
    () => applications.filter((r) => stageForStatus(r.status) === "Shortlisted").map((r) => r.id),
    [applications]
  );

  const kanbanColumns = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of applications) map[stageForStatus(r.status)].push(r);
    return map;
  }, [applications]);

  const sendRegrets = async () => {
    setRegretBusy(true);
    try {
      const res = await apiFetch<{ summary: RegretSummary }>("/api/evaluator/applications/regrets", {
        method: "POST",
        body: { applicationIds: rejectedIds },
      });
      const s = res.summary;
      const parts = [
        `${s.sent} sent`,
        `${s.alreadySent} already sent`,
        s.shortlisted ? `${s.shortlisted} shortlisted skipped` : "",
        s.failed ? `${s.failed} failed` : "",
        s.notFound ? `${s.notFound} not found` : "",
      ].filter(Boolean);
      if (s.sent > 0) {
        toast.success(`Regret letters: ${s.sent} sent`, { description: parts.join(" · ") });
      } else {
        toast.info("No new regret letters sent", { description: parts.join(" · ") });
      }
      setRegretOpen(false);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send regret letters");
    } finally {
      setRegretBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Review Queue"
        description="Screen applications, verify minimum qualifications, and advance candidates through the pipeline."
        actions={
          <>
            <StatusPill
              status={`${applications.length} application${applications.length === 1 ? "" : "s"}`}
              variant="neutral"
              className="num"
            />
            <SegmentedControl
              ariaLabel="Queue view mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "kanban", label: "Kanban", icon: LayoutGrid },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <RefreshButton onRefresh={() => load(true)} />
          </>
        }
      />
      {/* QA 2026-02: scope of administrator access to Review */}
      {isAdmin && (
        <NoteBanner label="Administrator access">
          you can view and assist with every evaluation in this queue. Scoring decisions and
          recommendations remain the responsibility of the assigned evaluators.
        </NoteBanner>
      )}

      {/* Stage tabs (list mode only) */}
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...PIPELINE_STAGES] as const).map((s) => {
            const count = s === "All" ? applications.length : applications.filter((r) => stageForStatus(r.status) === s).length;
            const active = listStage === s;
            return (
              <FilterChip key={s} active={active} onClick={() => setListStage(s)} count={count}>
                {s !== "All" && <StageDot stage={s} />}
                {s}
              </FilterChip>
            );
          })}
          {listStage === "Rejected" && rejectedIds.length > 0 && (
            <button type="button" className={ghostBadBtn} onClick={() => setRegretOpen(true)}>
              <MailX className="h-4 w-4" aria-hidden />
              Send regret letters ({rejectedIds.length})
            </button>
          )}
          {/* MOM 2026-10-13 — bulk-send interview/exam notices to the
              shortlisted cohort (per job listing). */}
          {shortlistedIds.length > 0 && (
            <button
              type="button"
              className="focus-ring inline-flex min-h-[36px] items-center gap-2 rounded-full border border-metric-blue/40 bg-metric-blue/10 px-4 text-sm font-medium text-ink transition-colors hover:bg-metric-blue/20"
              onClick={() => setBulkNotice("interview")}
            >
              <Video className="h-4 w-4 text-metric-blue" aria-hidden />
              Send interview invitations ({shortlistedIds.length})
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && <ErrorCard title="Couldn't load the review queue" description={error} onRetry={() => void load()} />}

      {/* Loading skeleton */}
      {!error && queue === null && (
        <>
          {mode === "kanban" ? <SkeletonKanban columns={4} /> : <SkeletonRows rows={8} rowClassName="h-16" />}
        </>
      )}

      {/* Kanban — reference board: tinted columns, floating cards, "N more" expanders */}
      {!error && queue !== null && mode === "kanban" && (
        <div className={KANBAN_BOARD_CLASS}>
          {PIPELINE_STAGES.map((stage) => {
            const rows = kanbanColumns[stage];
            return (
              <KanbanColumn key={stage} label={stage} stage={stage} count={rows.length}>
                {rows.map((row) => {
                    const position = row.job.position?.positionTitle || row.job.title;
                    const name = fullName(row.applicant);
                    return (
                    /* Card container is a div with button semantics — a real
                       <button> here would nest a <button> inside (the profile
                       quick-action) and break HTML validity/hydration. Enter
                       AND Space are handled for keyboard parity. */
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className={KANBAN_CARD + " group/card focus-ring cursor-pointer p-4 text-left"}
                      onClick={() => setSelectedId(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                      aria-label={`Review application from ${name}`}
                    >
                      <KanbanCardBody
                        name={name}
                        position={humanize(position)}
                        appliedLabel={`Applied ${appliedAgo(row.dateApplied)}`}
                        match={{ metCount: row.match?.metCount ?? 0, requiredCount: row.match?.requiredCount ?? 0 }}
                        tags={[...(row.tags ?? [])]}
                        statusFlag={
                          // User QA — the prior-rejection badge is a STATUS
                          // now: it renders on its own line immediately
                          // BEFORE the match-percentage badge instead of
                          // trailing as a credential tag.
                          <PriorRejectionPill count={row.priorRejections?.count} />
                        }
                        action={
                          <button
                            type="button"
                            className={cn(
                              iconBtn,
                              "absolute top-1/2 right-0 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:opacity-100"
                            )}
                            aria-label={`Open ${name}'s profile`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("candidate", { id: String(row.applicantId) });
                            }}
                          >
                            <UserRound className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
                    </div>
                  );
                  })}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      {/* List */}
      {!error && queue !== null && mode === "list" && (
        <div className="space-y-3">
          {listRows.length === 0 ? (
            <div className="dlg-card p-6 sm:p-10">
              <EmptyState
                icon={Inbox}
                title="No applications in the queue"
                description={listStage === "All" ? "Applications appear here once candidates apply." : `No applications in the ${listStage} stage yet.`}
              />
            </div>
          ) : (
            <div className="dlg-card table-card overflow-hidden">
              {/* In-card header band — same anatomy as the recruitment table */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
                <IconChip icon={UserRound} tone="slate" size={36} iconSize={16} />
                <h2 className="text-base font-medium text-ink">Applications</h2>
                <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
                  {listRows.length} in view
                </span>
              </div>
              {/* BEUI Phase 5 — official virtualized Table; the header band
                  above and stage tabs remain the unchanged RMIS anatomy */}
              <Table
                data={listRows}
                columns={queueColumns}
                getRowId={(row) => String(row.id)}
                rowHeight={ROW_H}
                height={(listRows.length + 1) * ROW_H}
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
        </div>
      )}

      {/* Review modal — much wider surface (1440px cap) so the dossier and
          decision rail breathe; bounded dossier sections scroll internally. */}
      <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className={cn(dialogScroll, "rounded-3xl border border-border bg-white", "w-[min(96vw,1440px)] sm:max-w-[1440px]")} ariaLabel="Review application">
          <DialogHeader className="sr-only">
            <DialogTitle className="text-xl font-medium text-foreground">Review application</DialogTitle>
            <DialogDescription>Applicant dossier and decision rail</DialogDescription>
          </DialogHeader>
          {selectedId !== null && (
            <ReviewWorkspace
              applicationId={selectedId}
              bounded
              onClose={() => setSelectedId(null)}
              onDecided={() => void load(true)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk regret confirm */}
      <AlertDialog open={regretOpen} onOpenChange={setRegretOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {rejectedIds.length} regret letter{rejectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Formal regret emails will be sent to every rejected-stage application currently filtered. Shortlisted
              applications are hard-skipped, and applicants who already received a letter are not emailed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={(e) => {
                e.preventDefault();
                void sendRegrets();
              }}
            >
              {regretBusy ? "Sending…" : "Send letters"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MOM 2026-10-13 — bulk interview/exam invitation composer (shared
          NoticeFormDialog in bulk mode; posts to the bulk endpoint). */}
      {bulkNotice && (
        <NoticeFormDialog
          applicationId={shortlistedIds[0] ?? 0}
          kind={bulkNotice}
          bulkIds={shortlistedIds}
          onClose={() => setBulkNotice(null)}
          onSent={() => void load(true)}
        />
      )}
    </div>
  );
}
