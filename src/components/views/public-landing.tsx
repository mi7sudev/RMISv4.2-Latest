"use client";

// ============================================================================
// RMIS — Public landing (spec §7.1): a two-pane job explorer in the
// reference-board style — TOP: a Bevel "Hero Sky" rounded-32 gradient field
// carrying the display headline + the agency authority line (the hero CTA
// and the header board link were retired per user direction — browsing
// happens right here); LEFT: a single-line [search bar] + [Sort] filter
// (the board's mobile-Job-Openings pattern: title / item no. / division
// needle, Newest · Deadline · Salary trio) over a register of Cloud Card
// job cards (title · division name · place · salary · clamped snippet · posted
// age · chevron quick-view + bookmark); RIGHT: the full posting pane
// (display title, "View all jobs" register link — MOM 2026-10-13 removed the
// DOST-MIRDC agency line — icon meta rows with full division names,
// posted age, brand-blue Quick apply + ghost Save, description,
// Responsibilities / Qualifications / Compensation sections). The selected
// card carries the brand-blue ring (RMIS Electric Blue #1591dc). Only the
// posting pane is sticky: it grows to its full content height when the
// screen has room (complete description, no internal scrolling) and caps at
// the live viewport — scrolling internally while pinned under the header —
// when it doesn't, never cut off by or hidden behind the footer. The board
// row always reserves at least a full viewport plus a 240px pin phase
// (min-h 100dvh+128px), so the pane has travel room to stay pinned while
// the page scrolls even when the register is shorter than the posting. The
// job list is a plain block that scrolls with the page. Mobile swaps panes
// (list → detail with back).
// Data from GET /api/jobs (30s silent poll + refetch on focus); visitors
// without a session are routed to sign-in by the shared apply gate; saves
// persist in localStorage. Apply actions are cancelled-only on the landing.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Inbox,
  MapPin,
  Search,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { SiteHeader } from "@/components/shell/site-header";
import { Footer } from "@/components/shell/footer";
import { useApplyFlow } from "@/components/apply/apply-dialogs";
import { ctaBtn, ghostBtn } from "@/components/ui/buttons";
import { EmptyState, QuickFact } from "@/components/ui/shell";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon } from "@/components/motion/alert";
import { Input } from "@/components/motion/input";
import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@/components/motion/select-morph";
import { apiFetch, deadlineState, formatCurrency, formatDate, humanize, timeAgo } from "@/lib/client";
import { divisionFullName } from "@/lib/constants";
import { useSavedJobs } from "@/lib/use-saved-jobs";
import { navigate } from "@/lib/router";
import type { JobWire } from "@/lib/router";
import { jobPlace, postedAt, jobDeadlinePassed } from "@/lib/job-meta";
import { cn } from "@/lib/utils";

// ── Bevel accents ───────────────────────────────────────────────────────────

const TITLE_SELECTED = "text-metric-blue";

// Sort keys — the same trio as the Vacant Positions board.
type SortKey = "newest" | "deadline" | "salary";

// ── Helpers ─────────────────────────────────────────────────────────────────

// Posting place/publish-date reads come from lib/job-meta (single source,
// shared with jobs/job-openings-card).

// Bookmarks — shared client store with the applicant home Apply Now pane
// (hook + localStorage key live in lib/use-saved-jobs).

// ── Job card (left register) ────────────────────────────────────────────────

function JobListCard({
  job,
  selected,
  expanded,
  saved,
  onSelect,
  onToggle,
  onSave,
}: {
  job: JobWire;
  selected: boolean;
  expanded: boolean;
  saved: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onSave: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  // MOM 2026-10-13 — cards carry the (new, updated) division NAME; the agency
  // attribution only appears when a position has no division on file.
  const company = pos?.division ? divisionFullName(pos.division) : "DOST-MIRDC";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = jobDeadlinePassed(deadline);

  return (
    <article className={cn("dlg-card lift", selected && "ring-2 ring-metric-blue/60")}>
      {/* Select target — title, company, vitals, snippet */}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        aria-label={`View ${humanize(title)}`}
        className="focus-ring block w-full px-4 pt-4 text-left sm:px-5 sm:pt-5"
      >
        <h3
          className={cn(
            "text-lg font-medium leading-snug",
            selected ? TITLE_SELECTED : "text-ink"
          )}
        >
          {humanize(title)}
        </h3>
        {/* Division/agency de-emphasized to the 14px/500 meta step — it must
            read as an attribution, never as a second title. */}
        <p className="mt-1 text-sm font-medium text-ink">{company}</p>
        <p className="mt-2 text-sm text-stone">{jobPlace(job)}</p>
        {salary != null && <p className="num mt-0.5 text-sm text-stone">{formatCurrency(salary)} per month</p>}
        {job.briefDescription && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone">{job.briefDescription}</p>
        )}
      </button>

      {/* Bottom register — posted age left, quick-view + bookmark right */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 sm:px-3.5">
        <button
          type="button"
          onClick={onSelect}
          className="focus-ring num rounded-full px-2 py-1.5 text-xs text-stone transition-colors hover:text-ink"
          aria-label={`Open ${humanize(title)}`}
        >
          {timeAgo(postedAt(job))}
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse: ${humanize(title)}` : `Quick view: ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <ChevronDown
              className={cn("h-[18px] w-[18px] transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${humanize(title)} from saved` : `Save ${humanize(title)}`}
            className="focus-ring grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-white/70 hover:text-ink"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-current text-metric-blue")} />
          </button>
        </div>
      </div>

      {/* Quick view — inline expansion with the house ease (reduced-motion
          users get a plain opacity crossfade). */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="quickview"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0.15, ease: "linear" }
                : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
            }
            className="overflow-hidden"
          >
            <div className="border-t border-divider px-4 pb-6 pt-4 sm:px-5 sm:pt-5">
              {job.briefDescription && (
                <div>
                  <h4 className="font-display text-lg text-ink">Job description</h4>
                  <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone">
                    {job.briefDescription}
                  </p>
                </div>
              )}
              {/* 3-up everywhere — a 6-up row wraps currency mid-number. */}
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 sm:gap-x-8">
                <QuickFact label="Item No." value={pos?.itemNumber ?? "-"} />
                <QuickFact label="Vacancies" value={String(job.numberOfVacancy ?? "-")} />
                <QuickFact
                  label="Salary Grade"
                  value={
                    pos?.salaryGrade
                      ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}`
                      : "-"
                  }
                />
                <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "-"} />
                <QuickFact label="Published" value={formatDate(job.publishDate)} />
                <QuickFact
                  label="Deadline"
                  value={
                    overdue ? <span className="text-[var(--bad)]">{formatDate(deadline)}</span> : formatDate(deadline)
                  }
                />
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onSelect}
                  className="focus-ring group/link inline-flex min-h-[44px] items-center gap-3 text-sm font-medium text-ink transition-colors hover:text-metric-blue"
                >
                  Read full description
                  <span className="dlg-cta grid h-8 w-8 place-items-center">
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 group-hover/link:translate-x-0.5"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {overdue && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--bad)]">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// ── Detail pane (right) ─────────────────────────────────────────────────────

/** Plain-text posting section rendered as a disc bullet list. */
function TextBullets({ text }: { text: string }) {
  const items = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-stone">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Posting section: sanitized rich HTML when present, else text bullets. */
function PostingSection({ title, html, text }: { title: string; html: string | null; text: string | null }) {
  if (html && html.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-ink">{title}</h3>
        <div className="rich-text text-base leading-relaxed text-stone" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }
  if (text && text.trim()) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-medium text-ink">{title}</h3>
        <TextBullets text={text} />
      </section>
    );
  }
  return null;
}

function JobDetail({
  job,
  saved,
  onApply,
  onSave,
  onBack,
}: {
  job: JobWire;
  saved: boolean;
  onApply: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const salary = pos?.salaryAmount ?? null;
  const deadline = job.deadlineDate;
  const overdue = jobDeadlinePassed(deadline);

  const meta: { icon: typeof MapPin; label: string; num?: boolean; danger?: boolean }[] = [];
  // MOM 2026-10-13 — division meta rows read the full updated division name.
  if (job.position?.division) meta.push({ icon: Building2, label: divisionFullName(job.position.division) });
  if (job.positionType) meta.push({ icon: Briefcase, label: humanize(job.positionType) });
  if (salary != null)
    meta.push({
      icon: Banknote,
      label: `${formatCurrency(salary)} per month${
        pos?.salaryGrade ? ` · SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : ""
      }`,
      num: true,
    });
  meta.push({
    icon: Clock,
    label: overdue ? "Closed: deadline passed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
    num: !overdue && !deadline,
    danger: overdue,
  });

  return (
    <div>
      {/* Mobile — back to the register */}
      <button
        type="button"
        onClick={onBack}
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-metric-blue lg:hidden"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to job list
      </button>

      {/* Posting title — the house page-title step (24px). The pane is a
          document view: it must sit below the 44px hero, not compete. */}
      <h2 className="text-2xl font-medium leading-tight text-ink">
        {humanize(title)}
      </h2>
      {/* MOM 2026-10-13 — "Remove DOST-MIRDC": the agency line (and its
          verified badge) is gone from the posting header — the issuing
          agency is the site itself; only the register link remains. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <button
          type="button"
          onClick={() => navigate("vacant-positions")}
          className="focus-ring text-[15px] text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
        >
          View all jobs
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        <li className="flex items-start gap-2.5 text-base text-stone">
          <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-stone" aria-hidden="true" />
          {jobPlace(job)}
        </li>
        {meta.map((m, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2.5 text-base",
              m.danger ? "font-medium text-[var(--bad)]" : "text-stone"
            )}
          >
            <m.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-stone" aria-hidden="true" />
            <span className={cn(m.num && "num")}>{m.label}</span>
          </li>
        ))}
      </ul>

      <p className="num mt-4 text-sm text-stone">Posted {timeAgo(postedAt(job))}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onApply} disabled={overdue} className={ctaBtn}>
          Quick apply
        </button>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          className={ghostBtn}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden="true" />
          {saved ? "Saved" : "Save"}
        </button>
        {overdue && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--bad)]">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Deadline passed
          </span>
        )}
      </div>

      {/* Posting body */}
      <div className="mt-8 space-y-8 border-t border-divider pt-8">
        {job.briefDescription &&
          job.briefDescription
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-stone">
                {p}
              </p>
            ))}
        <PostingSection title="Responsibilities" html={job.dutiesHtml} text={job.dutiesResponsibilities} />
        <PostingSection
          title="Qualifications"
          html={job.otherQualificationsHtml}
          text={job.otherQualifications}
        />
        <PostingSection title="Compensation" html={job.compensationHtml} text={job.compensationPackage} />
      </div>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export default function PublicLanding() {
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Last non-null error — keeps the BEUI alert's exit animation populated with
  // content while the message state has already cleared.
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (error !== null) setLastError(error);
  }, [error]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Single-line browse filter (user direction: the hero CTA and the header
  // board link are gone — the frontpage register is filtered by a
  // [search bar] + [Sort] row, the board's mobile Job Openings pattern).
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [isDesktop, setIsDesktop] = useState(false);
  const lastJson = useRef("");
  const paneRef = useRef<HTMLDivElement>(null);
  const { saved, toggle: toggleSave } = useSavedJobs();
  // Shared apply gate — anonymous visitors get the sign-in prompt, complete
  // applicants get the confirm flow (same as the board), incomplete profiles
  // are sent to finish their profile first (the fast-track was retired).
  const { requestApply, dialogs } = useApplyFlow();

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

  // Mount + 30s silent poll + refetch on focus (spec §13 cadence).
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Breakpoint sync — desktop keeps both panes; mobile swaps list ↔ detail.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openJobs = useMemo(
    () => (jobs ?? []).filter((j) => !deadlineState(j.deadlineDate).overdue),
    [jobs]
  );

  // Filter + sort over the open corpus — the needle covers every line the
  // register cards actually display: title, position title, item number,
  // division name AND place of assignment (a visitor typing "metrology"
  // must match the card that reads "Metrology Laboratory"). Sort uses the
  // same three comparators as the board (Newest · Deadline · Salary desc).
  const filteredOpenJobs = useMemo(() => {
    let list = openJobs;
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((j) =>
        `${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""} ${
          j.position?.division ? divisionFullName(j.position.division) : ""
        } ${jobPlace(j)}`
          .toLowerCase()
          .includes(needle)
      );
    }
    const deadlineTime = (j: JobWire) =>
      j.deadlineDate ? new Date(j.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    } else if (sort === "deadline") {
      sorted.sort((a, b) => deadlineTime(a) - deadlineTime(b));
    } else {
      sorted.sort((a, b) => (b.position?.salaryAmount ?? -1) - (a.position?.salaryAmount ?? -1));
    }
    return sorted;
  }, [openJobs, query, sort]);

  const selectedJob = useMemo(
    () => openJobs.find((j) => j.id === selectedId) ?? null,
    [openJobs, selectedId]
  );

  // Desktop opens with the first posting pre-selected (reference-board
  // behavior) and snaps to the top of the FILTERED register whenever the
  // current selection is filtered out (search/sort) or closed by a poll —
  // the posting pane never lags the register.
  useEffect(() => {
    if (
      isDesktop &&
      filteredOpenJobs.length > 0 &&
      !filteredOpenJobs.some((j) => j.id === selectedId)
    ) {
      setSelectedId(filteredOpenJobs[0].id);
    }
  }, [isDesktop, filteredOpenJobs, selectedId]);

  useEffect(() => {
    if (selectedId !== null && !openJobs.some((j) => j.id === selectedId)) {
      setSelectedId(openJobs[0]?.id ?? null);
    }
  }, [openJobs, selectedId]);

  // Reference-board behavior — a freshly picked posting opens from the top,
  // even when the previous posting was scrolled deep into its body.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [selectedId]);

  const select = useCallback(
    (id: number) => {
      setSelectedId(id);
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    []
  );

  const saveAndToast = useCallback(
    (job: JobWire) => {
      const wasSaved = saved.includes(job.id);
      toggleSave(job.id);
      toast.success(
        wasSaved
          ? "Removed from your saved jobs"
          : `Saved ${humanize(job.position?.positionTitle || job.title)}`
      );
    },
    [saved, toggleSave]
  );

  const showList = isDesktop || selectedId === null;
  const showDetail = isDesktop || selectedId !== null;

  return (
    // Viewport-adaptive board (no app pinning): a normal min-h-screen flex
    // column whose footer always sits at the real bottom — pinned to the
    // viewport on short pages (mt-auto), pushed down naturally on tall ones.
    // Only the posting pane is sticky (viewport-capped); the register is a
    // plain block that scrolls with the page — see the grid below.
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Wide-screen grid (QA: oversized side margins at 1200px on wide
          monitors) — the landing now shares the workspace shell's 1600px
          page max-width; the floating header pill matches. */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {/* Hero — "Hero Sky" wash field (rounded-3xl = 24px editorial imagery step) anchoring the explorer:
            the Jeton heading step (text-display, 44px) keeps the headline
            institutional rather than poster-scale, then the agency name as
            the quiet proof strip (QA: the emblem itself was dropped — the
            sticky header already carries the DOST mark, and a second one 40px
            below read as a duplicate), then the single .dlg-cta RMIS Electric
            Blue capsule CTA (real marks only). */}
        <section className="hero-sky rounded-3xl p-6 sm:p-8 lg:px-10 lg:py-10">
          {/* QA 2026-02: header renamed to "Job Opportunities" to match the
              Positions tab; the live "N open" pill was removed — it read as
              an unclickable button. */}
          <h1 className="text-display font-display">Job Opportunities</h1>
          {/* Institutional proof — agency name only; the emblem lives in the
              sticky header directly above, so repeating it here read as a
              duplicate seal (user QA). */}
          <div className="mt-4">
            <p className="min-w-0 text-sm font-medium leading-snug text-ink">
              Metals Industry Research and Development Center
            </p>
          </div>
        </section>

        <Alert variant="destructive" open={error !== null} className="mt-6">
          <AlertIcon />
          <AlertContent>
            <AlertDescription>{error ?? lastError}</AlertDescription>
            {error !== null && (
              <AlertAction>
                <button
                  onClick={() => void load(false)}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-metric-blue underline underline-offset-2"
                >
                  Try again
                </button>
              </AlertAction>
            )}
          </AlertContent>
        </Alert>
        {error !== null ? null : jobs === null ? (
          <div className="mt-6 space-y-3.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel h-28" />
            ))}
          </div>
        ) : openJobs.length === 0 ? (
          <div className="dlg-card mt-6">
            <EmptyState
              icon={Inbox}
              title="No open positions right now"
              description="Check back soon or explore the full board for upcoming announcements."
            />
            <div className="pb-8 text-center">
              <button
                onClick={() => navigate("vacant-positions")}
                className="inline-flex min-h-[44px] items-center gap-2 text-sm text-metric-blue underline underline-offset-2 hover:text-ink"
              >
                Go to the full positions board
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          // Viewport-adaptive two-pane board. The posting pane sizes to its
          // own content, capped at the LIVE viewport height (100dvh − 88px
          // sticky offset − 24px breathing room — no fixed pixel constant):
          //   • tall screens — the complete description renders in full with
          //     no internal scrolling; the footer only ever sits BELOW it;
          //   • short screens — the pane caps at the available space and
          //     scrolls internally while pinned under the header, and the
          //     grid-row clamp keeps it above the footer at every position.
          // Sticky needs TRAVEL ROOM: a sticky element only stays put while
          // its containing row is TALLER than itself, and the row height is
          // max(register, posting). When the register is shorter than the
          // posting (few vacancies — e.g. the sandbox's two cards), the row
          // would equal the pane's height and the pane could never pin — it
          // would just scroll away with the page. So the row reserves at
          // least 100dvh + 128px (= the pane's cap + a 240px pin phase on
          // cap-limited screens): the pane rides up with the hero, pins at
          // top-88 for ~240px of scroll, then yields only as the footer
          // rises. With a tall register the row is the register's natural
          // height and this floor is inert.
          // The job list is deliberately NOT sticky — a plain block that
          // scrolls with the page (user clarification).
          <div className="mt-6 grid gap-8 sm:mt-8 lg:min-h-[calc(100dvh+128px)] lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
            {/* Left · the register — plain block, natural height, scrolls
                with the page (NOT sticky, per user clarification). */}
            {showList && (
              <div
                aria-label="Job opportunities list"
                className="scroll-thin"
              >
                {/* Single-line browse filter — [search bar] + [Sort] on one
                    row above the register (user direction: the retired hero
                    CTA / header board link are replaced by this). Sort
                    options match the desktop board's trio. */}
                <div className="flex items-center gap-2">
                  <Input
                    id="landing-search"
                    aria-label="Search positions"
                    leftIcon={<Search />}
                    value={query}
                    onChange={setQuery}
                    placeholder="Search positions…"
                    className="min-w-0 flex-1"
                  />
                  <MorphSelect
                    className="w-[124px] shrink-0"
                    value={sort}
                    onValueChange={(v) => setSort(v as SortKey)}
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

                {filteredOpenJobs.length === 0 ? (
                  <div className="dlg-card mt-3.5">
                    <EmptyState
                      icon={Search}
                      title="No positions match your search"
                      description="Try a different term or clear the search to see every opening."
                      action={
                        <button
                          onClick={() => setQuery("")}
                          className="dlg-ghost min-h-[44px] px-6 text-sm"
                        >
                          Clear search
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-3.5 space-y-3.5">
                    {filteredOpenJobs.map((job) => (
                      <JobListCard
                        key={job.id}
                        job={job}
                        selected={selectedId === job.id}
                        expanded={expandedId === job.id}
                        saved={saved.includes(job.id)}
                        onSelect={() => select(job.id)}
                        onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                        onSave={() => saveAndToast(job)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Right · the posting — ONE sticky, viewport-capped scroller
                (paneRef sits on the scroller itself, so the select-reset
                actually zeroes it). Its natural height is the full posting,
                capped at the live viewport: complete content with no inner
                scroll when the screen has room; capped + internally
                scrollable when it doesn't. Sticky keeps it in view while the
                list scrolls with the page; the grid-row clamp keeps it above
                the footer. On mobile it is a plain block (single-pane swap,
                page scroll). */}
            {showDetail && (
              <div
                ref={paneRef}
                className="scroll-thin lg:sticky lg:top-[88px] lg:self-start lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:pr-2"
              >
                {selectedJob ? (
                  <div className="dlg-card p-6 sm:p-8">
                    <JobDetail
                      job={selectedJob}
                      saved={saved.includes(selectedJob.id)}
                      onApply={() => requestApply(selectedJob)}
                      onSave={() => saveAndToast(selectedJob)}
                      onBack={() => setSelectedId(null)}
                    />
                  </div>
                ) : (
                  <div className="dlg-card">
                    <EmptyState
                      icon={Briefcase}
                      title="Select a position"
                      description="Choose a role from the list to read the full posting."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      <Footer wide />
      {/* Shared apply dialog (confirm / MQR / done), mounted once. */}
      {dialogs}
    </div>
  );
}
