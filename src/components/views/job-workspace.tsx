"use client";

// ============================================================================
// RMIS — Job workspace (spec §7.10, `#/job?id=<id>&tab=`). Header with
// count-aware delete confirm, edit dialog; Overview (safe-rendered rich text +
// sticky summary + mini pipeline), Pipeline kanban, Candidates — all from the
// evaluator queue filtered to this job.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  AlertTriangle, ClipboardList, FileText,
  Pencil, SquareKanban, Trash2,
} from "lucide-react";
import { Monogram, PageHeader, RefreshButton, RichSection, SectionCard, StatusDot, StatusPill, EmptyNote, EmptyState, nameInitials } from "@/components/ui/shell";
import {
  KanbanCardBody, KanbanColumn, KANBAN_BOARD_CLASS, KANBAN_CARD,
} from "@/components/ui/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch, appliedAgo, deadlineState, formatCurrency, formatDate, fullName, humanize } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus, type StageKey } from "@/lib/status";
import { navigate, useHashRoute, type JobWire, type ApplicantMini } from "@/lib/router";
import { STAGE_VARIANT } from "@/lib/status-ui";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { cn } from "@/lib/utils";
import { JobFormDialog, JobStatusPill } from "@/components/views/recruitment";
import { ghostBadModifier, ghostBtn, ghostBadBtn, ctaBtn, iconBtn } from "@/components/ui/buttons";

type QueueRow = {
  id: number;
  status: string;
  stage: StageKey;
  dateApplied: string;
  applicantId: number;
  applicant: ApplicantMini;
  job: { id: number; title: string; position: { positionTitle: string; placeOfAssignment: string | null } | null };
  match: { verdict: string; metCount: number; requiredCount: number };
  tags: string[];
};

const TABS = ["overview", "pipeline", "candidates"] as const;
type TabKey = (typeof TABS)[number];

// Content panels (RichSection), empty notes, empty states and monogram
// initials are the shared shell primitives (ui/shell) — no local copies.

export default function JobWorkspace() {
  const { params } = useHashRoute();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const rawTab = (params.tab || "overview") as TabKey;
  const tab: TabKey = TABS.includes(rawTab) ? rawTab : "overview";

  const [job, setJob] = useState<JobWire | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!valid) return;
      if (!silent) setError(null);
      try {
        const [jobs, q] = await Promise.all([
          apiFetch<JobWire[]>("/api/jobs?limit=200"),
          apiFetch<{ data: QueueRow[] }>("/api/evaluator/queue?pageSize=100"),
        ]);
        setJob(jobs.find((j) => j.id === id) ?? null);
        setQueue(q.data.filter((r) => r.job?.id === id));
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : "Failed to load the job posting");
      }
    },
    [id, valid]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);
  useFocusRefresh(load);

  const apps = useMemo(() => queue ?? [], [queue]);
  const pipeline = useMemo(() => {
    const map: Record<StageKey, QueueRow[]> = { "Applied": [], "Under Review": [], "Shortlisted": [], "Rejected": [] };
    for (const r of apps) map[stageForStatus(r.status)].push(r);
    return map;
  }, [apps]);

  const deleteJob = async () => {
    if (!job) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/api/jobs/${job.id}?scope=all`, { method: "DELETE" });
      toast.success("Job posting deleted", {
        description: apps.length > 0 ? `${apps.length} linked application(s) and their snapshots were removed.` : undefined,
      });
      setDeleteOpen(false);
      navigate("recruitment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete the job posting");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!valid) {
    return (
      <div className="dlg-card py-6">
        <EmptyState
          icon={ClipboardList}
          title="No job selected"
          description="Open a posting from recruitment to see its workspace."
          action={
            <button type="button" className={ctaBtn} onClick={() => navigate("recruitment")}>
              Go to recruitment
            </button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dlg-card p-8">
        <EmptyState
          icon={AlertTriangle}
          tone="rose"
          title="Couldn't load the job posting"
          description={error}
          action={
            <button type="button" className={ghostBtn} onClick={() => void load()}>
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const vitals = [job.positionType, pos?.itemNumber, pos?.placeOfAssignment, pos?.division].filter(Boolean).join(" · ");
  const salary =
    pos?.salaryAmount != null
      ? formatCurrency(pos.salaryAmount)
      : null;
  const sgStep = [pos?.salaryGrade, pos?.salaryStep].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views,
          with the labelled back affordance for detail pages */}
      <PageHeader
        back={{ label: "Back to Jobs", onClick: () => navigate("recruitment") }}
        title={job.title}
        titleAside={<JobStatusPill job={job} />}
        description={vitals || "-"}
        actions={
          <>
            <RefreshButton onRefresh={() => load(true)} />
            <button type="button" className={ghostBtn} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
            <button type="button" className={ghostBadBtn} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </>
        }
      />

      <Tabs
        variant="pill"
        value={tab}
        onValueChange={(v) => navigate("job", { id: String(id), tab: v })}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SectionCard bodyClassName="space-y-6" title="Posting description" icon={FileText} chipTone="plum">
              <RichSection heading="md" title="Brief description" html={job.briefDescriptionHtml} text={job.briefDescription} />
              <RichSection heading="md" title="Duties & responsibilities" html={job.dutiesHtml} text={job.dutiesResponsibilities} />
              <RichSection heading="md" title="Compensation package" html={job.compensationHtml} text={job.compensationPackage} />
              <RichSection heading="md" title="Other qualifications" html={job.otherQualificationsHtml} text={job.otherQualifications} />
              {!job.briefDescriptionHtml && !job.briefDescription && !job.dutiesHtml && !job.dutiesResponsibilities && !job.compensationHtml && !job.compensationPackage && !job.otherQualificationsHtml && !job.otherQualifications && (
                <EmptyNote>No description published for this posting.</EmptyNote>
              )}
            </SectionCard>

            {/* Sticky summary */}
            <div className="space-y-4 self-start xl:sticky xl:top-6">
              <SectionCard title="Summary" icon={ClipboardList} chipTone="slate">
                <dl>
                  {(
                    [
                      ["Vacancies", <span key="v" className="num text-sm font-medium text-ink">{job.numberOfVacancy ?? "-"}</span>],
                      ["Monthly salary", <span key="s" className="num text-sm font-medium text-ink">{salary ?? "-"}</span>],
                      ["SG · step", <span key="g" className="text-sm font-medium text-ink">{sgStep || "-"}</span>],
                      ["Applications", <span key="a" className="num text-sm font-medium text-ink">{apps.length}</span>],
                      ["Published", <span key="p" className="num text-sm font-medium text-ink">{formatDate(job.publishDate)}</span>],
                      [
                        "Deadline",
                        <span key="d" className={`num text-sm font-medium ${dl.overdue ? "text-[var(--bad)]" : "text-ink"}`}>
                          {formatDate(job.deadlineDate)}
                          {dl.overdue ? " · closed" : ""}
                        </span>,
                      ],
                      ["Processing", <span key="pr" className="num text-sm font-medium text-ink">{formatDate(job.processingDate)}</span>],
                    ] as [string, React.ReactNode][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0">
                      <dt className="text-xs text-body-gray">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>

              {/* Mini pipeline */}
              <SectionCard title="Pipeline" icon={SquareKanban} chipTone="amber">
                <div className="space-y-1">
                  {PIPELINE_STAGES.map((stage) => (
                    <div key={stage} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="flex items-center gap-2.5 text-xs text-body-gray">
                        <StatusDot variant={STAGE_VARIANT[stage]} />
                        {stage}
                      </span>
                      <span className="num text-sm font-medium text-ink">{pipeline[stage].length}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        {/* Pipeline — reference board: bordered columns with dot + label + count headers */}
        <TabsContent value="pipeline" className="mt-4">
          <div className="flex snap-x snap-proximity items-stretch gap-4 overflow-x-auto scroll-thin pb-2 md:grid md:grid-cols-2 xl:grid-cols-4 md:overflow-visible md:pb-0">
            {PIPELINE_STAGES.map((stage) => {
              const rows = pipeline[stage];
              return (
                <KanbanColumn key={stage} label={stage} stage={stage} count={rows.length}>
                  {rows.map((app) => {
                      const position = app.job.position?.positionTitle || app.job.title;
                      const name = fullName(app.applicant);
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className={KANBAN_CARD + " focus-ring w-full cursor-pointer p-4 text-left"}
                          onClick={() => navigate("evaluator-review", { id: String(app.id) })}
                          aria-label={`Review application from ${name}`}
                        >
                          <KanbanCardBody
                            name={name}
                            position={humanize(position)}
                            appliedLabel={`Applied ${appliedAgo(app.dateApplied)}`}
                            match={{ metCount: app.match?.metCount ?? 0, requiredCount: app.match?.requiredCount ?? 0 }}
                            tags={app.tags ?? []}
                          />
                        </button>
                      );
                    })}
                </KanbanColumn>
              );
            })}
          </div>
        </TabsContent>

        {/* Candidates */}
        <TabsContent value="candidates" className="mt-4">
          {apps.length === 0 ? (
            <div className="dlg-card p-6 sm:p-10">
              <EmptyState
                icon={ClipboardList}
                title="No candidates yet"
                description="Applications appear here once candidates apply to this posting."
              />
            </div>
          ) : (
            <div className="dlg-card overflow-hidden">
              {apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="flex min-h-[44px] w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-fog/60 focus-ring"
                  onClick={() => navigate("candidate", { id: String(app.applicantId) })}
                >
                  <span aria-hidden="true" className="contents">
                    <Monogram size={36} className="rounded-full">{nameInitials(fullName(app.applicant))}</Monogram>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(app.applicant)}</p>
                    <p className="mt-0.5 text-xs text-body-gray">
                      {humanize(app.job.title)} · Applied {formatDate(app.dateApplied)}
                    </p>
                  </div>
                  <StatusPill status={app.status} />
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <JobFormDialog open={editOpen} onOpenChange={setEditOpen} job={job} onSaved={() => void load(true)} />

      {/* Count-aware delete confirm (spec §6.2 / §7.10) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this posting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete “{job.title}”
              {apps.length > 0
                ? ` and its ${apps.length} linked application${apps.length === 1 ? "" : "s"} (including their PDS snapshots).`
                : "."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={(e) => {
                e.preventDefault();
                void deleteJob();
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
