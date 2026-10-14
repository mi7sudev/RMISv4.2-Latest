"use client";

// ============================================================================
// RMIS — Jobs board + in-flow detail (spec §7.1 items 2–4, §8.7 deadline
// rules, §13 polling cadence). LIST: sticky search rail, division facets,
// sort, 8-per-page pagination, expandable quick view with 6 QuickFacts.
// Task 20 — split surface: below lg the page IS the home "Job Openings"
// section (shared JobListCard list of open postings) filtered by a
// single-line search bar + Sort select — the simple counterpart of the
// desktop board's rail (no facets/pagination); the full board renders at
// lg+ only.
// DETAIL (#/jobs?job=<id>): hero, MQR ledger, sections, vitals, sticky
// summary rail with Apply / applied-state / Cancel. 20s silent poll + focus
// refetch (silent = swap state only when the JSON changed).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useApplyFlow } from "@/components/apply/apply-dialogs";
import { useSession } from "@/components/session-provider";
import { ghostBadBtn } from "@/components/ui/buttons";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleTrigger,
} from "@/components/motion/collapsible";
import { Input } from "@/components/motion/input";
import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@/components/motion/select-morph";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize } from "@/lib/client";
import { isActiveApplicationStatus } from "@/lib/status";
import { BrandLogo } from "@/components/brand-logo";
import { divisionName } from "@/lib/constants";
import { navigate, useHashRoute } from "@/lib/router";
import type { JobWire } from "@/lib/router";
import { EmptyState, ErrorCard, PageHeader, StatusPill } from "@/components/ui/shell";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { JobListCard } from "@/components/views/jobs/job-openings-card";
import { jobIsActive } from "@/lib/job-meta";
import { useSavedJobs } from "@/lib/use-saved-jobs";

const PAGE_SIZE = 8;
type SortKey = "newest" | "deadline" | "salary";

// QA 2026-02: Position Category buckets. In the CSC vocabulary "Permanent" and
// "Temporary" are plantilla items (1:1 with an item number), while "Contract
// of Service" and "Job Order" are non-plantilla (COS) engagements.
function matchesCategory(positionType: string | null, category: string): boolean {
  const t = (positionType ?? "").toUpperCase();
  const isCos = t.includes("COS") || t.includes("CONTRACT") || t.includes("JOB ORDER");
  const isPlantilla = t.includes("PLANTILLA") || t.includes("PERMANENT") || t.includes("TEMPORARY");
  if (category === "COS") return isCos;
  return isPlantilla || (!isCos && t.length > 0); // anything else non-COS (e.g. Casual) is plantilla-graded
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function divisionShort(code: string | null | undefined): string {
  if (!code) return "-";
  return divisionName(code).split(" · ")[0] || code;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sgLabel(grade: string | null | undefined, step: string | null | undefined): string {
  if (!grade) return "-";
  return step ? `SG${grade}/${step}` : `SG${grade}`;
}

function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

/** % of the application window elapsed between publish and deadline (0–100). */
function deadlineProgress(job: JobWire): number {
  const start = new Date(job.publishDate ?? job.publishedAt).getTime();
  const end = job.deadlineDate ? new Date(job.deadlineDate).getTime() : Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return job.deadlineDate ? 100 : 0;
  const pct = ((Date.now() - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

function DeadlinePill({ job, className }: { job: JobWire; className?: string }) {
  const dl = deadlineState(job.deadlineDate);
  return (
    <span
      className={`status-pill num ${
        dl.overdue
          ? "status-bad"
          : dl.closingSoon
            ? "status-warn"
            : "status-neutral"
      } ${className ?? ""}`}
    >
      {dl.label}
    </span>
  );
}

function RichOrPlain({ html, text }: { html?: string | null; text?: string | null }) {
  if (html && html.trim()) {
    return (
      <div
        className="rich-text text-sm leading-relaxed text-stone"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (text && text.trim()) {
    return <p className="whitespace-pre-line text-sm leading-relaxed text-stone">{text}</p>;
  }
  return <p className="text-sm text-stone">Not provided.</p>;
}

// ErrorCard is the shared shell primitive (ui/shell) — no local copy.

// ── Quick view (6 QuickFacts + actions) ─────────────────────────────────────

function QuickView({
  job,
  onApply,
  onDetail,
}: {
  job: JobWire;
  onApply: (job: JobWire) => void;
  onDetail: (job: JobWire) => void;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  const brief = job.briefDescription?.trim()
    ? job.briefDescription
    : job.briefDescriptionHtml
      ? stripHtml(job.briefDescriptionHtml)
      : "";
  const facts: [string, string][] = [
    ["Item No.", pos?.itemNumber || "-"],
    ["Vacancies", job.numberOfVacancy == null ? "-" : String(job.numberOfVacancy)],
    ["Salary Grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Monthly Salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "-"],
    ["Published", formatDate(job.publishDate ?? job.publishedAt)],
    ["Deadline", formatDate(job.deadlineDate)],
  ];
  return (
    <div className="mt-4 space-y-4 border-t border-divider pt-4">
      {brief ? (
        <p className="line-clamp-4 text-sm leading-relaxed text-stone">{brief}</p>
      ) : (
        <p className="text-sm text-stone">No brief description provided.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-3">
            <p className="text-xs text-stone">{label}</p>
            <p className="num mt-0.5 truncate text-sm text-ink" title={value}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onApply(job)}
          disabled={dl.overdue}
          className="dlg-cta min-h-[44px] px-6 text-sm disabled:pointer-events-none disabled:opacity-50"
        >
          Apply now
        </button>
        <button onClick={() => onDetail(job)} className="dlg-ghost min-h-[44px] px-6 text-sm">
          Read full description
        </button>
      </div>
    </div>
  );
}

// ── Board row card ──────────────────────────────────────────────────────────

function JobCard({
  job,
  expanded,
  onToggle,
  onApply,
  onDetail,
}: {
  job: JobWire;
  expanded: boolean;
  onToggle: (id: number) => void;
  onApply: (job: JobWire) => void;
  onDetail: (job: JobWire) => void;
}) {
  const pos = job.position;
  const salary = pos?.salaryAmount ?? null;
  // MOM 2026-10-13 — "Applied" reflects an ACTIVE application only; a
  // previously rejected/withdrawn attempt does not lock the posting.
  const applied = (job.applications ?? []).some((a) => isActiveApplicationStatus(a.status));
  const dl = deadlineState(job.deadlineDate);
  return (
    <article className="dlg-card lift p-4 sm:p-6">
      <div className="flex items-center gap-4">
        {/* Official unified brand mark — anchors the card the way a company
            logo does on every top-ranked job-board design. The seal sits on
            a white cloud-plain chip (surface = elevation, Bevel rule — no
            border, no shadow) and is vertically centered on the row so it
            reads as the anchor of the WHOLE card instead of drifting up
            beside the deadline pill. */}
        <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-white sm:grid">
          <BrandLogo logoSize={40} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DeadlinePill job={job} />
            {applied && <StatusPill status="Applied" />}
          </div>
          <h3 className="mt-2 text-lg font-medium text-ink">{humanize(job.title)}</h3>
          <p className="mt-1 text-sm text-stone">
            {pos?.placeOfAssignment || "-"} ·{" "}
            {job.positionType ? humanize(job.positionType) : "-"}
            {pos?.salaryGrade ? <span className="num"> · SG {pos.salaryGrade}</span> : null}
            <span className={dl.overdue ? "text-[var(--bad)]" : undefined}>
              {" "}
              ·{" "}
              {job.deadlineDate ? `Closes ${formatDate(job.deadlineDate)}` : "Open until filled"}
            </span>
          </p>
          <p className="num mt-1.5 text-[15px] font-medium text-ink">
            {salary != null ? formatCurrency(salary) : "Competitive"}
            {salary != null && <span className="font-normal text-stone">/mo</span>}
          </p>
        </div>
        <button
          onClick={() => onToggle(job.id)}
          aria-label={expanded ? "Collapse quick view" : "Expand quick view"}
          aria-expanded={expanded}
          className="dlg-ghost grid h-11 w-11 shrink-0 place-items-center text-ink"
        >
          {expanded ? (
            <Minus className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {expanded && <QuickView job={job} onApply={onApply} onDetail={onDetail} />}
    </article>
  );
}

// ── Detail: summary rail ────────────────────────────────────────────────────

function SummaryCard({
  job,
  onApply,
  onCancel,
  cancelling,
}: {
  job: JobWire;
  onApply: (job: JobWire) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);
  // MOM 2026-10-13 — re-application: an active application shows the applied
  // state + Cancel; a rejected/withdrawn history shows the re-apply path.
  const applied = (job.applications ?? []).some((a) => isActiveApplicationStatus(a.status));
  const priorAttempt = !applied && (job.applications?.length ?? 0) > 0;
  const rows: [string, string][] = [
    ["Vacancies", job.numberOfVacancy == null ? "-" : String(job.numberOfVacancy)],
    ["Monthly salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "-"],
    ["Salary grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Applications", String(job.applicationCount ?? 0)],
    ["Published", formatDate(job.publishDate ?? job.publishedAt)],
    ["Deadline", formatDate(job.deadlineDate)],
    ["Processing", formatDate(job.processingDate)],
  ];
  return (
    <div className="dlg-card p-6">
      <p className="text-sm font-medium text-ink">Position Summary</p>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-stone">{label}</dt>
            <dd
              className={`num text-right text-ink ${
                label === "Deadline" && dl.overdue ? "text-[var(--bad)]" : ""
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Application-window progress — visualizes the publish→deadline span */}
      {job.deadlineDate && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-stone">
              Posted <span className="num">{formatDate(job.publishDate ?? job.publishedAt)}</span>
            </span>
            <span className={dl.overdue ? "text-[var(--bad)]" : "text-stone"}>
              Closes <span className="num">{formatDate(job.deadlineDate)}</span>
            </span>
          </div>
          {/* Track contrasts the surface: white-on-cloud / cloud-on-white. */}
          <div className="mt-2 h-1.5 overflow-hidden bg-white" role="presentation">
            <div
              className={`h-full transition-[width] duration-500 ${
                dl.overdue ? "bg-[var(--bad)]" : dl.closingSoon ? "bg-[var(--warn)]" : "bg-metric-blue"
              }`}
              style={{ width: `${deadlineProgress(job)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        <Alert variant="success" open={applied} className={applied ? "mb-3" : undefined}>
          <AlertIcon>
            <Check />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Successfully Applied</AlertTitle>
            <AlertDescription>Your application is in the pipeline.</AlertDescription>
          </AlertContent>
        </Alert>
        {/* MOM 2026-10-13 — the applicant may re-apply after a rejection. */}
        <Alert variant="warning" open={priorAttempt} className={priorAttempt ? "mb-3" : undefined}>
          <AlertIcon>
            <Clock />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Previous application not shortlisted</AlertTitle>
            <AlertDescription>You may re-apply to this posting while it remains open.</AlertDescription>
          </AlertContent>
        </Alert>
        {applied ? (
          <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="dlg-ghost min-h-[44px] w-full text-sm" disabled={cancelling}>
                  Cancel Application
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="dlg-card-plain">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display text-2xl text-ink">
                    Cancel this application?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-body-gray">
                    Your application for {humanize(job.title)} will be withdrawn. You can apply
                    again while the position is open.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="dlg-ghost min-h-[44px] px-6 text-sm">
                    Keep application
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onCancel}
                    className={`${ghostBadBtn} px-6`}
                  >
                    Cancel application
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        ) : (
          <>
            <button
              onClick={() => onApply(job)}
              disabled={dl.overdue}
              className="dlg-cta min-h-[44px] w-full text-sm disabled:pointer-events-none disabled:opacity-50"
            >
              {priorAttempt ? "Re-apply" : "Submit Application"}
            </button>
            {dl.overdue && (
              <p className="mt-2 text-center text-xs text-stone">
                The deadline for this position has passed.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Detail: body ────────────────────────────────────────────────────────────

function DetailBody({ job }: { job: JobWire }) {
  const pos = job.position;
  const dl = deadlineState(job.deadlineDate);

  const mqrRows: [string, string | null | undefined][] = [
    ["Education", pos?.cscEducation],
    ["Work Experience", pos?.cscWorkExperience],
    ["Training", pos?.cscTraining],
    ["Eligibility", pos?.cscEligibilityGroup],
    ["License / Certification", pos?.license],
  ];
  const visibleMqr = mqrRows.filter(([, v]) => v && !/^(n\/?a|none|na)\.?$/i.test(v.trim()));

  const vitals: [string, string][] = [
    ["Division", divisionShort(pos?.division)],
    ["Item No.", pos?.itemNumber || "-"],
    ["Vacancies", job.numberOfVacancy == null ? "-" : String(job.numberOfVacancy)],
    ["Position Type", job.positionType ? humanize(job.positionType) : "-"],
    ["Salary Grade", sgLabel(pos?.salaryGrade, pos?.salaryStep)],
    ["Monthly Salary", pos?.salaryAmount != null ? formatCurrency(pos.salaryAmount) : "-"],
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Hero */}
      <section className="dlg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <DeadlinePill job={job} />
          {(job.applications ?? []).some((a) => isActiveApplicationStatus(a.status)) && (
            <StatusPill status="Applied" />
          )}
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink sm:text-card-heading">{humanize(job.title)}</h1>
        <p className="mt-2 text-sm text-stone">
          {pos?.placeOfAssignment || "-"} · {divisionName(pos?.division)} ·{" "}
          {job.positionType ? humanize(job.positionType) : "-"}
        </p>
      </section>

      {/* Sections */}
      <section className="dlg-card space-y-8 p-6 sm:p-8">
        <div>
          <h2 className="text-lg font-medium text-ink">Brief Description</h2>
          <div className="mt-3">
            <RichOrPlain html={job.briefDescriptionHtml} text={job.briefDescription} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Minimum Qualification Requirements</h2>
          <div className="mt-3 overflow-hidden rounded-2xl bg-white">
            {visibleMqr.length > 0 ? (
              visibleMqr.map(([label, value], i) => (
                <div
                  key={label}
                  className={`grid gap-1 p-4 sm:grid-cols-[200px_1fr] sm:gap-4 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-sm leading-relaxed text-stone">{value}</p>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-stone">
                No minimum requirements published for this position.
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Duties &amp; Responsibilities</h2>
          <div className="mt-3">
            <RichOrPlain
              html={job.dutiesHtml}
              text={job.dutiesResponsibilities}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Compensation Package</h2>
          <div className="mt-3">
            <RichOrPlain html={job.compensationHtml} text={job.compensationPackage} />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-ink">Other Qualifications</h2>
          <div className="mt-3">
            <RichOrPlain
              html={job.otherQualificationsHtml}
              text={job.otherQualifications}
            />
          </div>
        </div>

        {/* Vitals + dates */}
        <div>
          <h2 className="text-lg font-medium text-ink">Position Details</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vitals.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white p-4">
                <p className="text-xs text-stone">{label}</p>
                <p className="num mt-0.5 truncate text-sm text-ink" title={value}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-stone">Published</p>
              <p className="num mt-0.5 text-sm text-ink">{formatDate(job.publishDate ?? job.publishedAt)}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-stone">Deadline</p>
              <p className={`num mt-0.5 flex items-center gap-1.5 text-sm ${dl.overdue ? "text-[var(--bad)]" : "text-ink"}`}>
                {/* Hue never carries state alone — the overdue date gets the
                    same Clock glyph the recruitment table pairs with it. */}
                {dl.overdue && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {formatDate(job.deadlineDate)}
                {job.deadlineDate ? ` · ${dl.label}` : ""}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs text-stone">Processing</p>
              <p className="num mt-0.5 text-sm text-ink">{formatDate(job.processingDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function JobsView() {
  const route = useHashRoute();
  const detailParam = route.params.job ?? null;
  const { user } = useSession();

  // Shell contract (responsive fix 3-a): PublicShell's <main> is a bare flex
  // column (no padding), so the anonymous board paints its own 1600px public-
  // grid container + gutters + vertical rhythm (QA wide-screen pass: was
  // 1200px — oversized side margins on wide monitors; now matches the
  // landing and the workspace shell). AppShell's <main> already
  // carries the 1600px workspace container (px-4 py-6 sm:px-6 sm:py-8 lg:px-8),
  // so signed-in views must not repeat it (double gutters ~128px at lg) — a
  // plain w-full wrapper keeps identical spacing since AppShell main provides
  // the same py.
  const shellPad = user
    ? "w-full"
    : "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8";

  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  // QA 2026-02: Position Category facet — Plantilla vs Contractual/COS.
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Mobile Job Openings filter (single line): free-text search + sort —
  // the simple counterpart of the desktop board's full search/facet rail.
  const [openQuery, setOpenQuery] = useState("");
  const [openSort, setOpenSort] = useState<SortKey>("newest");
  const lastJson = useRef("");

  const { requestApply, dialogs } = useApplyFlow();
  // Task 20 — the mobile layout is the home "Job Openings" section, which
  // carries the shared bookmark store (same localStorage key as the
  // frontpage explorer and the applicant home pane).
  const { saved, toggle: toggleSave } = useSavedJobs();

  const load = useCallback(async (silent: boolean) => {
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      const json = JSON.stringify(data);
      if (!silent || json !== lastJson.current) {
        lastJson.current = json;
        setJobs(data);
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load positions");
    }
  }, []);

  // Mount + 20s silent poll + refetch on focus (spec §13 cadence).
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 20_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Facet counts over the full corpus.
  const facets = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs ?? []) {
      const code = j.position?.division;
      if (!code) continue;
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [jobs]);

  // Filtering + sorting.
  const filtered = useMemo(() => {
    let list = jobs ?? [];
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((j) =>
        `${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""}`
          .toLowerCase()
          .includes(needle)
      );
    }
    if (divisionFilter.length > 0) {
      list = list.filter((j) => divisionFilter.includes(j.position?.division ?? ""));
    }
    if (categoryFilter.length > 0) {
      list = list.filter((j) => categoryFilter.some((c) => matchesCategory(j.positionType, c)));
    }
    const deadlineTime = (j: JobWire) =>
      j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    } else if (sort === "deadline") {
      sorted.sort((a, b) => deadlineTime(a) - deadlineTime(b));
    } else {
      sorted.sort((a, b) => (b.position?.salaryAmount ?? -1) - (a.position?.salaryAmount ?? -1));
    }
    return sorted;
  }, [jobs, query, divisionFilter, categoryFilter, sort]);

  // Task 20 — mobile corpus: open postings only (deadline not passed),
  // newest published first — the exact list rule the home section used.
  const openJobs = useMemo(
    () =>
      (jobs ?? [])
        .filter((j) => jobIsActive(j.deadlineDate))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [jobs]
  );

  // Mobile filter + sort over the open corpus — same needle rule (title,
  // position title, item number) and the same three comparators as the
  // desktop board, minus the facets/pagination.
  const openJobsFiltered = useMemo(() => {
    let list = openJobs;
    const needle = openQuery.trim().toLowerCase();
    if (needle) {
      list = list.filter((j) =>
        `${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""}`
          .toLowerCase()
          .includes(needle)
      );
    }
    const deadlineTime = (j: JobWire) =>
      j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (openSort === "newest") {
      sorted.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    } else if (openSort === "deadline") {
      sorted.sort((a, b) => deadlineTime(a) - deadlineTime(b));
    } else {
      sorted.sort((a, b) => (b.position?.salaryAmount ?? -1) - (a.position?.salaryAmount ?? -1));
    }
    return sorted;
  }, [openJobs, openQuery, openSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };
  const toggleDivision = (code: string) => {
    setDivisionFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setPage(1);
  };
  const toggleCategory = (code: string) => {
    setCategoryFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setPage(1);
  };
  const clearFilters = () => {
    setQuery("");
    setDivisionFilter([]);
    setCategoryFilter([]);
    setPage(1);
  };
  const toggleExpanded = (id: number) => setExpandedId((prev) => (prev === id ? null : id));
  const openDetail = (job: JobWire) => navigate("vacant-positions", { job: String(job.id) });

  const applyTo = useCallback(
    (job: JobWire) => {
      requestApply(job);
    },
    [requestApply]
  );

  // Cancel application (only while an ACTIVE application exists — spec §7.7;
  // MOM 2026-10-13: rejected/withdrawn rows are terminal and never cancelled).
  const appliedId = useMemo(() => {
    const detail = detailParam ? (jobs ?? []).find((j) => j.id === Number(detailParam)) : null;
    return detail?.applications?.find((a) => isActiveApplicationStatus(a.status))?.id ?? null;
  }, [detailParam, jobs]);

  const cancelApplication = useCallback(async () => {
    if (appliedId == null) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${appliedId}`, { method: "DELETE" });
      toast.success("Application cancelled", {
        description: "Your application was withdrawn. You can apply again while the position is open.",
      });
      await load(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the application");
    } finally {
      setCancelling(false);
    }
  }, [appliedId, load]);

  // ── Detail mode ───────────────────────────────────────────────────────────
  if (detailParam && /^\d+$/.test(detailParam)) {
    const detailId = Number(detailParam);
    const detail = jobs?.find((j) => j.id === detailId) ?? null;

    return (
      <div className={shellPad}>
        <button
          onClick={() => navigate("vacant-positions")}
          className="mb-5 flex min-h-[44px] items-center gap-2 text-sm text-body-gray hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Vacant Positions
        </button>

        {jobs === null && error === null ? (
          <div className="space-y-6">
            <div className="dlg-card space-y-4 p-8">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="dlg-card space-y-3 p-8">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ) : error !== null ? (
          <ErrorCard description={error} onRetry={() => void load(false)} />
        ) : detail === null ? (
          <div className="dlg-card">
            <EmptyState
              icon={Search}
              title="Position not found"
              description="This position may have closed or is no longer published."
              action={
                <button onClick={() => navigate("vacant-positions")} className="dlg-cta min-h-[44px] px-7 text-sm">
                  Back to Vacant Positions
                </button>
              }
            />
          </div>
        ) : (
          // Two-column from lg (matches the filter rail breakpoint): below
          // xl the sticky summary used to render AFTER the whole long
          // description, pushing the primary Apply CTA a full scroll away
          // on exactly-lg desktops.
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <DetailBody job={detail} />
            {/* Session-aware sticky offset: the public SiteHeader is sticky
                h-16, the signed-in shell has no sticky chrome at lg+. */}
            <aside className={`lg:sticky ${user ? "lg:top-6" : "lg:top-20"}`}>
              <SummaryCard
                job={detail}
                onApply={applyTo}
                onCancel={() => void cancelApplication()}
                cancelling={cancelling}
              />
            </aside>
          </div>
        )}

        {dialogs}
      </div>
    );
  }

  // ── List mode ─────────────────────────────────────────────────────────────
  const activeFilterCount = (query.trim() ? 1 : 0) + divisionFilter.length + categoryFilter.length;

  // One rail definition, two mount points (mobile collapsible + lg sidebar).
  // The id suffix keeps the duplicate DOM valid — two inputs must never share
  // one id (aria-label wiring / a11y lookups would hit the hidden copy).
  const filterRail = (sfx: string) => (
    <div className="dlg-card p-5">
      <Input
        id={`job-search-${sfx}`}
        aria-label="Search positions"
        leftIcon={<Search />}
        value={query}
        onChange={(next) => changeQuery(next)}
        placeholder="Search positions…"
      />

      {/* QA 2026-02: Position Category facet — Plantilla vs COS. */}
      <p className="eyebrow mt-5 px-1">Position Category</p>
      <div className="mt-2 space-y-0.5">
        {[
          { code: "PLANTILLA", label: "Plantilla" },
          { code: "COS", label: "COS (Contract of Service)" },
        ].map(({ code, label }) => (
          <label
            key={code}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-white/70"
          >
            <Checkbox
              checked={categoryFilter.includes(code)}
              onCheckedChange={() => toggleCategory(code)}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-body-gray">{label}</span>
            <span className="num text-xs text-stone">
              {(jobs ?? []).filter((j) => matchesCategory(j.positionType, code)).length}
            </span>
          </label>
        ))}
      </div>

      <p className="eyebrow mt-5 px-1">Division</p>
      <div className="mt-2 space-y-0.5">
        {facets.map(([code, count]) => (
          <label
            key={code}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-white/70"
          >
            <Checkbox
              checked={divisionFilter.includes(code)}
              onCheckedChange={() => toggleDivision(code)}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-body-gray" title={divisionName(code)}>
              {divisionShort(code)}
            </span>
            <span className="num text-xs text-stone">{count}</span>
          </label>
        ))}
        {facets.length === 0 && <p className="px-2 py-2 text-sm text-stone">No divisions on file</p>}
      </div>

      {(query.trim() || divisionFilter.length > 0) && (
        <button
          onClick={clearFilters}
          className="min-h-[44px] px-2 text-sm text-body-gray underline underline-offset-2 hover:text-ink"
        >
          Clear filters
        </button>
      )}
    </div>
  );

  let content: React.ReactNode;
  if (jobs === null && error === null) {
    content = (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dlg-card p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-3 h-6 w-2/3" />
            <Skeleton className="mt-2 h-4 w-full" />
          </div>
        ))}
      </div>
    );
  } else if (error !== null && jobs === null) {
    content = <ErrorCard description={error} onRetry={() => void load(false)} />;
  } else if ((jobs ?? []).length === 0) {
    content = (
      <div className="dlg-card">
        <EmptyState
          icon={Briefcase}
          title="No vacant positions"
          description="There are no published postings at the moment. Check back soon."
        />
      </div>
    );
  } else if (filtered.length === 0) {
    content = (
      <div className="dlg-card">
        <EmptyState
          icon={Search}
          title="No positions match your filters"
          description="Try a different search term or clear the filters."
          action={
            <button onClick={clearFilters} className="dlg-ghost min-h-[44px] px-6 text-sm">
              Clear filters
            </button>
          }
        />
      </div>
    );
  } else {
    content = (
      <>
        <div className="space-y-4">
          {pageItems.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggle={toggleExpanded}
              onApply={applyTo}
              onDetail={openDetail}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5"
            aria-label="Pagination"
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current === 1}
              aria-label="Previous page"
              className="dlg-ghost focus-ring grid h-11 w-11 place-items-center disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {pageWindow(current, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="grid h-11 w-8 place-items-center text-sm text-stone">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === current ? "page" : undefined}
                  className={
                    p === current
                      ? "focus-ring grid h-11 min-w-11 place-items-center rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
                      : "focus-ring grid h-11 min-w-11 place-items-center rounded-full px-3 text-sm text-body-gray transition-colors hover:bg-cloud hover:text-ink"
                  }
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={current === totalPages}
              aria-label="Next page"
              className="dlg-ghost focus-ring grid h-11 w-11 place-items-center disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <div className={shellPad}>
      {/* ── Mobile · Job Openings (Task 20) — the applicant home's browsing
          section relocated below lg: same header, same JobListCard rows
          (in-place quick view + bookmarks), open postings only, filtered by
          a single-line [search bar] + [Sort] — the simple counterpart of the
          desktop board's rail (no facets/pagination). The full Vacant
          Positions board remains a desktop (lg+) surface. ================ */}
      <section aria-label="Job Openings" className="lg:hidden">
        <div className="border-b border-border pb-4">
          <p className="eyebrow">Job Openings</p>
          <h1 className="mt-1.5 text-xl font-medium tracking-[0.01em] text-ink sm:text-2xl">
            Apply Now
          </h1>
        </div>

        {/* Single-line filter — [search bar] + [Sort] on one row, nothing
            else. Sort options match the desktop board's trio. */}
        <div className="mt-4 flex items-center gap-2">
          <Input
            id="job-search-openings"
            aria-label="Search positions"
            leftIcon={<Search />}
            value={openQuery}
            onChange={setOpenQuery}
            placeholder="Search positions…"
            className="min-w-0 flex-1"
          />
          <MorphSelect
            className="w-[124px] shrink-0"
            value={openSort}
            onValueChange={(v) => setOpenSort(v as SortKey)}
          >
            <MorphSelectTrigger className="min-h-[44px]">
              <span className="sr-only">Sort job openings</span>
              <MorphSelectValue />
            </MorphSelectTrigger>
            <MorphSelectContent>
              <MorphSelectItem value="newest">Newest</MorphSelectItem>
              <MorphSelectItem value="deadline">Deadline</MorphSelectItem>
              <MorphSelectItem value="salary">Salary desc</MorphSelectItem>
            </MorphSelectContent>
          </MorphSelect>
        </div>

        <div className="mt-5">
          {jobs === null && error === null ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="dlg-card p-5">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="mt-2 h-5 w-1/2" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : error !== null && jobs === null ? (
            <ErrorCard description={error} onRetry={() => void load(false)} />
          ) : openJobs.length === 0 ? (
            <div className="dlg-card">
              <EmptyState
                icon={Briefcase}
                tone="amber"
                title="No open positions right now"
                description="New postings appear here as soon as they are published."
              />
            </div>
          ) : openJobsFiltered.length === 0 ? (
            <div className="dlg-card">
              <EmptyState
                icon={Search}
                title="No positions match your search"
                description="Try a different term or clear the search to see every opening."
                action={
                  <button onClick={() => setOpenQuery("")} className="dlg-ghost min-h-[44px] px-6 text-sm">
                    Clear search
                  </button>
                }
              />
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {openJobsFiltered.map((job) => (
                <JobListCard
                  key={job.id}
                  job={job}
                  applied={(job.applications ?? []).some((a) => isActiveApplicationStatus(a.status))}
                  expanded={expandedId === job.id}
                  saved={saved.includes(job.id)}
                  onToggle={() => toggleExpanded(job.id)}
                  onSave={() => toggleSave(job.id)}
                  onOpen={() => navigate("vacant-positions", { job: String(job.id) })}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Desktop · Vacant Positions board (lg+) — PageHeader, sticky
          search/facet rail, sort, 8-per-page pagination. Task 20: hidden
          below lg, where the Job Openings list above takes over. */}
      <div className="hidden lg:block">
        {/* QA 2026-02: page named to match its slug (#/vacant-positions).
            Enterprise page header (PageHeader) — shared anatomy across ALL
            pages, public board included (Task 35 layout refactor). */}
        <PageHeader
          className="mb-8"
          title="Vacant Positions"
          description={
            <span className="num">
              {filtered.length} Result{filtered.length === 1 ? "" : "s"}
            </span>
          }
          actions={
            <>
              <span className="hidden text-sm text-body-gray sm:inline">Sort</span>
              <MorphSelect
                className="w-[140px] sm:w-[170px]"
                value={sort}
                onValueChange={(v) => {
                  setSort(v as SortKey);
                  setPage(1);
                }}
              >
                <MorphSelectTrigger className="min-h-[44px]">
                  <span className="sr-only">Sort results</span>
                  <MorphSelectValue />
                </MorphSelectTrigger>
                <MorphSelectContent>
                  <MorphSelectItem value="newest">Newest</MorphSelectItem>
                  <MorphSelectItem value="deadline">Deadline</MorphSelectItem>
                  <MorphSelectItem value="salary">Salary desc</MorphSelectItem>
                </MorphSelectContent>
              </MorphSelect>
            </>
          }
        />

      <div className="items-start lg:flex lg:gap-6">
        {/* Search rail — sticky on desktop, collapsible on mobile */}
        <aside
          className={`mb-4 w-full lg:sticky ${user ? "lg:top-6" : "lg:top-20"} lg:mb-0 lg:w-72 lg:shrink-0`}
        >
          <div className="lg:hidden">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger
                render={<button className="dlg-ghost flex min-h-[44px] w-full items-center justify-between px-5 text-sm" />}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <CollapsibleIndicator className="text-current" />
              </CollapsibleTrigger>
              <CollapsibleContent contentClassName="pt-3">{filterRail("m")}</CollapsibleContent>
            </Collapsible>
          </div>
          <div className="hidden lg:block">{filterRail("d")}</div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          {/* Active-filter chips — presentation of existing filter state */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {query.trim() && (
                <span className="dlg-pill inline-flex items-center gap-1.5 bg-cloud py-1.5 pl-3 pr-2 text-xs font-medium text-ink">
                  &ldquo;{query.trim()}&rdquo;
                  {/* Dismiss button: the ::after inset extends the 28px visual
                      disc to a 40px+ touch target (36px minimum rule). */}
                  <button
                    onClick={() => changeQuery("")}
                    aria-label="Clear search filter"
                    className="focus-ring relative -mr-2 grid h-7 w-7 place-items-center rounded-full text-stone hover:bg-white/70 hover:text-ink after:absolute after:-inset-1.5 after:rounded-full after:content-['']"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {divisionFilter.map((code) => (
                <span
                  key={code}
                  className="dlg-pill inline-flex items-center gap-1.5 bg-cloud py-1.5 pl-3 pr-2 text-xs font-medium text-ink"
                >
                  {divisionShort(code)}
                  {/* Same padded hit zone as the search-chip dismiss. */}
                  <button
                    onClick={() => toggleDivision(code)}
                    aria-label={`Remove ${divisionShort(code)} filter`}
                    className="focus-ring relative -mr-2 grid h-7 w-7 place-items-center rounded-full text-stone hover:bg-white/70 hover:text-ink after:absolute after:-inset-1.5 after:rounded-full after:content-['']"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="inline-flex min-h-[36px] items-center text-xs text-body-gray underline underline-offset-2 hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}

          {content}
        </div>
      </div>
      </div>

      {dialogs}
    </div>
  );
}
