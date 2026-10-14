"use client";

// ============================================================================
// RMIS — Profile builder (Bevel edition, CREDENTIALS-FIRST per user):
// the page IS the 7-section FORM WORKFLOW — no identity header at all
// (Task 22: the slim strip was removed too; the completion ring lives in the
// Home mini profile and the identity surface is gone with it). While the
// record is incomplete, a quiet foot row above the optional PDS import
// carries the completion note + Mark Complete CTA. PDS auto-fill stays a
// demoted OPTIONAL collapsible at the very foot (manual form filling is
// the primary path; auto-fill is a shortcut).
// Section navigation is breakpoint-split: desktop (lg+) pins a numbered
// workflow band (capsule done/current/ahead chips joined by hairline
// connectors, two-line labels with time estimates); phones get a compact
// iOS-style strip — a sticky rounded white card holding the 7 status cells
// (sliding brand-blue thumb) over a prev/next caption bar. Sections render
// as white dlg-card-plain panels in one full-width column.
// Data logic unchanged: parallel loads, silent reloads, session refresh.
// ============================================================================

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Info,
  ShieldCheck,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorCard, SkeletonRows } from "@/components/ui/shell";
import { cancelBtn, ghostBadBtn } from "@/components/ui/buttons";
import { apiFetch } from "@/lib/client";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { useSession } from "@/components/session-provider";
import { navigate } from "@/lib/router";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import PdsUploadCard from "./profile/pds-upload-card";
import PersonalInfoSection from "./profile/personal-info-section";
import EducationSection from "./profile/education-section";
import WorkExperienceSection from "./profile/work-experience-section";
import TrainingSection from "./profile/training-section";
import EligibilitySection from "./profile/eligibility-section";
import AwardsSection from "./profile/awards-section";
import DocumentsSection from "./profile/documents-section";
import type { ApplicantProfile, ReferenceData } from "./profile/section-types";

const SECTIONS = [
  { n: 1, num: "01", label: "Personal Information", short: "Personal", minutes: 8 },
  { n: 2, num: "02", label: "Education", short: "Education", minutes: 3 },
  { n: 3, num: "03", label: "Work Experience", short: "Work", minutes: 5 },
  { n: 4, num: "04", label: "Training", short: "Training", minutes: 2 },
  { n: 5, num: "05", label: "Eligibility", short: "Eligibility", minutes: 3 },
  { n: 6, num: "06", label: "Awards", short: "Awards", minutes: 2 },
  { n: 7, num: "07", label: "Supporting Documents", short: "Documents", minutes: null as number | null },
];

export default function ProfileView() {
  const { refresh } = useSession();
  const sectionsRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [docs, setDocs] = useState<DocumentWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [seed, setSeed] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  // Task 40 — unsaved-changes guard. PersonalInfoSection (the only section
  // with a live edit session) reports (editing && dirty) upward; any
  // navigation out of section 01 while the flag is up is confirmed BEFORE
  // the section unmounts and drops the draft. pendingNav holds the
  // destination (a section number, or "home" for Return to Portal) until
  // the applicant chooses.
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const handleUnsavedChange = useCallback((u: boolean) => setHasUnsaved(u), []);
  const [pendingNav, setPendingNav] = useState<number | "home" | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  // MOM 2026-10-13 — Character References are REQUIRED before the Education
  // section: derived from the SAVED profile (never the in-progress draft),
  // so the forward-navigation gate lifts the moment a save lands.
  const hasCharacterReference = (profile?.characterReferences ?? []).some(
    (r) => typeof r?.name === "string" && r.name.trim() !== ""
  );

  const loadAll = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, docsRes] = await Promise.all([
        apiFetch<ApplicantProfile>("/api/applicant/profile"),
        apiFetch<DocumentWire[]>("/api/applicant/documents"),
      ]);
      setProfile(profileRes);
      setDocs(docsRes);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load your profile");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ref = await apiFetch<ReferenceData>("/api/reference");
        setReference(ref);
      } catch {
        // Reference data is optional (datalist/eligibility suggestions).
      }
      await loadAll(false);
    })();
  }, [loadAll]);

  const reloadSilent = useCallback(async () => {
    await loadAll(true);
  }, [loadAll]);

  /** After PDS auto-apply / clear: reload AND re-seed the personal form. */
  const onProfileReplaced = useCallback(async () => {
    await loadAll(true);
    setSeed((s) => s + 1);
  }, [loadAll]);

  // ── Completeness (§7.4) — shared math with the Home mini-profile ring ─────
  const { sectionDone, isComplete, canMarkComplete } = computeProfileCompletion(profile, docs);

  const markComplete = async () => {
    setMarking(true);
    try {
      await apiFetch("/api/applicant/profile", { method: "PUT", body: { isProfileComplete: true } });
      toast.success("Profile marked as complete", {
        description: "You can now apply to open positions. HR verifies your credentials at the next stage.",
      });
      setMarkOpen(false);
      await refresh();
      await reloadSilent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to mark your profile complete");
    } finally {
      setMarking(false);
    }
  };

  // ── Mobile stepper: switch section AND bring the rail back into view —
  // tapping "04" while stranded deep inside section 01's long form must not
  // leave the viewport mid-scroll in the old section. Desktop (lg+) skips
  // this: the nav band is sticky above the content, no jump needed.
  const mobileNavRef = useRef<HTMLElement>(null);

  function changeSection(n: number) {
    if (n === active) return;
    setActive(n);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // The strip lives ABOVE the swapped section content, so its document
      // position is layout-stable across the swap — unlike the wrapper's.
      // Double rAF lets React commit the new section first, then we jump
      // INSTANTLY (smooth is canceled by Chrome's scroll-anchoring yank,
      // which fires while the tall section replaces the short one and
      // re-anchors the viewport to keep the old bottom edge in view). The
      // instant jump lands the pinned strip right under the top bar; the
      // 200ms content fade masks the transition.
      // Task 34-b — the workspace page no longer scrolls the WINDOW below
      // lg: the official PullToRefresh container in the app shell is the
      // scroller (window.scrollY is always 0 there). So the jump targets
      // the strip's nearest scrollable ancestor and lands it at that
      // scrollport's top — where the strip (sticky top-0) pins right under
      // the mobile top bar. The window path stays as the fallback for any
      // layout without the container.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = mobileNavRef.current;
          if (!el) return;
          let scroller: HTMLElement | null = el.parentElement;
          while (scroller && scroller !== document.body) {
            const oy = getComputedStyle(scroller).overflowY;
            if (oy === "auto" || oy === "scroll") break;
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) {
            const top =
              el.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop;
            scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          } else {
            const top = el.getBoundingClientRect().top + window.scrollY - 72;
            window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          }
        });
      });
    }
  }

  // Task 40 — guarded navigation: while section 01 holds unsaved edits,
  // every section switch / portal exit routes through the confirm dialog
  // (pendingNav remembers the destination the applicant asked for).
  // MOM 2026-10-13 — the Character Reference section is REQUIRED before
  // proceeding to the Education section: forward moves past section 01 are
  // blocked while the SAVED profile has no named character reference (the
  // applicant is pointed back to Edit Profile → Character References).
  function requestSection(n: number) {
    if (n === active) return;
    if (n > 1 && active <= 1 && !hasCharacterReference) {
      toast.error("Add at least one Character Reference before proceeding to the Education section.", {
        description: "Open Edit Profile in Personal Information and fill the Character References section (required).",
      });
      return;
    }
    if (hasUnsaved) {
      setPendingNav(n);
      setNavOpen(true);
      return;
    }
    changeSection(n);
  }

  function requestPortalExit() {
    if (hasUnsaved) {
      setPendingNav("home");
      setNavOpen(true);
      return;
    }
    navigate("home");
  }

  function confirmLeave() {
    setNavOpen(false);
    const dest = pendingNav;
    setPendingNav(null);
    setHasUnsaved(false); // the section unmounts below; keep the flag in sync
    if (dest === "home") navigate("home");
    else if (dest != null) changeSection(dest);
  }

  // Index of the active section — drives the mobile caption + prev/next.
  const activeIdx = Math.max(
    0,
    SECTIONS.findIndex((s) => s.n === active)
  );

  // The section content column is a bounded scroll container (min/max height
  // with an internal scrollbar), so every freshly-swapped section must land
  // at its own top — otherwise switching from a short into a tall section
  // inherits the previous section's inner scroll offset.
  useEffect(() => {
    sectionsRef.current?.scrollTo({ top: 0 });
  }, [active]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Section nav skeleton — desktop band / mobile strip */}
        <div className="glass hidden border-b border-border px-8 py-4 lg:block">
          <div className="flex gap-6 overflow-hidden">
            {SECTIONS.map((s) => (
              <div key={s.n} className="skel h-9 w-24 shrink-0" />
            ))}
          </div>
        </div>
        <div className="dlg-card-plain p-1.5 lg:hidden">
          <div className="grid grid-cols-7 gap-0.5">
            {SECTIONS.map((s) => (
              <div key={s.n} className="skel h-9 w-full" />
            ))}
          </div>
        </div>
        <div>
          <SkeletonRows rows={4} rowClassName="h-20" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-6">
        {/* Canonical error branch — the shared shell ErrorCard (same anatomy
            as review-queue/recruitment/candidates/jobs-view). */}
        <ErrorCard
          title="Couldn't load your profile"
          description={error}
          onRetry={() => void loadAll(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The view has no PageHeader by design (the sticky step band opens the
          page) — this visually-hidden h1 keeps the document outline valid for
          screen readers and the ⌘K / breadcrumbs context. */}
      <h1 className="sr-only">My Profile</h1>
      {/* ── D. Section navigation (lg+) — sticky numbered workflow band.
              Desktop content column has no sticky header above it, so the
              band pins to the very top of the viewport. NOT scrollable by
              design: the row always fits its container. Below xl the items
              compact (28px chips · 11.5px labels · "Approx" line hidden);
              from xl up the full register renders (32px chips · 13.5px
              labels · "Approx N Min" second line). Hairline connectors are
              flex-1 so they absorb any leftover width. ── */}
      <nav
        aria-label="Profile section steps"
        className="glass sticky top-0 z-20 -mx-4 hidden border-b border-border px-4 py-3 sm:-mx-6 sm:px-6 lg:block lg:-mx-8 lg:px-8"
      >
        <ol className="flex items-center">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.n;
            const done = sectionDone[s.n - 1];
            const reached = done || isActive;
            const approx = s.minutes != null ? `Approx ${s.minutes} Min` : null;
            return (
              <Fragment key={s.n}>
                {i > 0 && <li aria-hidden="true" className="h-px min-w-1 flex-1 bg-divider xl:min-w-4" />}
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => requestSection(s.n)}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Section ${i + 1}: ${s.label}`}
                    className="focus-ring group flex items-center gap-2 py-1 pl-0.5 pr-1 transition-colors xl:gap-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-medium tabular-nums transition-colors duration-200 xl:h-8 xl:w-8 xl:text-[12px]",
                        reached
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-divider bg-white text-stone group-hover:border-metric-blue/40 group-hover:text-ink"
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.num}
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span
                        className={cn(
                          "whitespace-nowrap text-[11px] font-medium transition-colors xl:text-[13px]",
                          reached ? "text-ink" : "text-stone group-hover:text-ink"
                        )}
                      >
                        {s.short}
                      </span>
                      {approx && (
                        <span className="mt-0.5 hidden whitespace-nowrap text-[11px] leading-none text-stone xl:block">
                          {approx}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>

      {/* MOBILE (< lg) — sticky COMPACT iOS-style segmented strip + caption.
          Same anatomy the user liked — 7 status cells with a sliding
          brand-blue thumb (motion layoutId) over a prev/next caption bar —
          tightened (36px cells, slimmer caption, 40px chevrons) and rounded
          like an iOS control: overflow-hidden clips every hover/fill to the
          card's 24px curve, and the sliding thumb carries a 10px radius.
          The strip is a DIRECT child of the tall view root, NOT a grid
          item — a sticky element can never travel past its containing
          block — and it pins under the mobile top bar for the whole
          scroll. Task 34-b: the workspace scroller below lg is now the
          shell's PullToRefresh container, whose top edge ALREADY sits
          under the top bar — so the pin offset is top-0 here (the old
          top-16 left a 64px gap for content to slide through above the
          pinned strip). */}
      <nav ref={mobileNavRef} aria-label="Profile sections" className="dlg-card-plain sticky top-0 z-30 overflow-hidden p-1.5 shadow-e2 lg:hidden">
        <div className="grid grid-cols-7 gap-0.5">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.n;
            const filled = sectionDone[s.n - 1];
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => requestSection(s.n)}
                aria-label={`Section ${i + 1}: ${s.label}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative isolate flex min-h-9 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                  isActive ? "text-primary-foreground" : "text-ink hover:bg-fog"
                )}
              >
                {/* Sliding thumb — rendered INSIDE the active cell so inset-0
                    matches the cell bounds; layoutId slides it between cells
                    on section change. 12px on the 36px cell — the Jeton
                    button step. */}
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="profile-mobile-seg"
                    className="absolute inset-0 -z-10 rounded-[12px] bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 42 }}
                  />
                )}
                <span
                  className={cn(
                    "num text-[10px] font-medium leading-none",
                    isActive ? "text-primary-foreground/85" : "text-stone"
                  )}
                >
                  {s.num}
                </span>
                {filled ? (
                  <CheckCircle2
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary-foreground" : "text-[var(--ok)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : (
                  /* Not filled yet — soft ring, same size/weight as the green
                     check so both states read at a glance (light ring on the
                     blue active cell, where red would clash). */
                  <Circle
                    className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary-foreground/90" : "text-[var(--bad)]")}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Caption + sequential stepping — hairline footer bar with quiet
            chevrons and an aria-live position readout. */}
        <div className="mt-1 flex items-stretch border-t border-border">
          <button
            type="button"
            onClick={() => activeIdx > 0 && requestSection(SECTIONS[activeIdx - 1].n)}
            disabled={activeIdx === 0}
            aria-label="Previous section"
            className="focus-ring grid w-10 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <p
            aria-live="polite"
            className="eyebrow min-w-0 flex-1 truncate py-2 text-center"
          >
            {`Section ${activeIdx + 1} of ${SECTIONS.length} · ${SECTIONS[activeIdx]?.label ?? ""}`}
          </p>
          <button
            type="button"
            onClick={() => activeIdx < SECTIONS.length - 1 && requestSection(SECTIONS[activeIdx + 1].n)}
            disabled={activeIdx === SECTIONS.length - 1}
            aria-label="Next section"
            className="focus-ring grid w-10 shrink-0 place-items-center text-stone transition-colors hover:bg-fog disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* Desktop owns navigation via the sticky band above; this wrapper is
          a single full-width column for the section content. BOUNDED COLUMN
          (lg+ only): min-height keeps sparse sections from collapsing the
          page (footer doesn't jump between swaps); max-height turns tall
          sections (50 trainings) into an internal scrollbar instead of an
          unbounded page. Section 01 is NOT scrollable anywhere: it renders
          at its natural height. Task 34-b — the cap is now lg+ ONLY: below
          lg the workspace page itself is the PullToRefresh scroller, and a
          nested scroll pane both traps touch gestures and hijacks the pull
          (the same trap the documents rows already avoided on phones).
          overflow-anchor none: Chrome must not re-anchor onto the footer
          when a short section is swapped for a tall one. */}
      <div
        ref={sectionsRef}
        className={cn(
          "scroll-thin min-h-[360px] lg:min-h-[420px]",
          active === 1 ? "overflow-visible" : "lg:max-h-[72dvh] lg:overflow-y-auto"
        )}
        style={{ overflowAnchor: "none" }}
      >
        {/* SECTION CONTENT — sections swap with a quiet fade/rise (200ms):
            perceptible placement without choreography. */}
        <div className="min-w-0">
          <div key={active} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            {active === 1 && (
              <PersonalInfoSection
                profile={profile}
                seed={seed}
                refreshSession={refresh}
                onChanged={reloadSilent}
                onUnsavedChange={handleUnsavedChange}
              />
            )}
            {active === 2 && (
              <EducationSection
                items={profile?.educations ?? []}
                courses={(reference?.courses ?? []).map((c) => c.name)}
                onChanged={reloadSilent}
              />
            )}
            {active === 3 && <WorkExperienceSection items={profile?.workExperiences ?? []} onChanged={reloadSilent} />}
            {active === 4 && <TrainingSection items={profile?.trainings ?? []} onChanged={reloadSilent} />}
            {active === 5 && (
              <EligibilitySection
                items={profile?.eligibilities ?? []}
                referenceNames={(reference?.eligibilities ?? []).map((e) => e.name)}
                onChanged={reloadSilent}
              />
            )}
            {active === 6 && <AwardsSection items={profile?.awards ?? []} onChanged={reloadSilent} />}
            {active === 7 && <DocumentsSection docs={docs} onChanged={reloadSilent} />}
          </div>
        </div>
      </div>

      {/* QA 2026-02 — Section progression footer: an explicit Back / Continue
          affordance so it's immediately obvious how to move between the seven
          PDS sections (the desktop step band alone wasn't discoverable).
          handleMobileSectionChange also handles the mobile scroll-recovery. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {activeIdx > 0 ? (
          <button
            type="button"
            onClick={() => requestSection(SECTIONS[activeIdx - 1].n)}
            className="dlg-ghost min-h-[44px] px-6 text-sm"
          >
            <ChevronLeft className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
            Back to {SECTIONS[activeIdx - 1]?.label ?? "previous section"}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}

        {activeIdx < SECTIONS.length - 1 ? (
          <button
            type="button"
            onClick={() => requestSection(SECTIONS[activeIdx + 1].n)}
            className="dlg-cta min-h-[44px] px-7 text-sm font-medium"
          >
            Continue to {SECTIONS[activeIdx + 1]?.label ?? "next section"}
            <ChevronRight className="ml-1.5 inline h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={requestPortalExit}
            className="dlg-cta min-h-[44px] px-7 text-sm font-medium"
          >
            Return to Portal
            <ChevronRight className="ml-1.5 inline h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Completion note + Mark Complete (moved from the removed header,
          Task 22) — a quiet foot row, only while the record is incomplete.
          The percentage ring itself lives in the Home mini profile. ── */}
      {!isComplete && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-stone sm:max-w-xl">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Completion requires your Personal Information (first name, last name, email, mobile number, and at least one character reference) and at least one entry
              each in Education and Work Experiences.
            </span>
          </p>
          {canMarkComplete && (
            <button
              type="button"
              onClick={() => setMarkOpen(true)}
              disabled={marking}
              className="dlg-cta focus-ring inline-flex min-h-[44px] shrink-0 items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mark Complete
            </button>
          )}
        </div>
      )}

      {/* ── OPTIONAL · Auto-fill from PDS — deliberately LAST and collapsed:
              manual form filling is the primary path (credentials-first per
              user); the PDS import is a shortcut for applicants who already
              have a filled CS Form 212. ── */}
      <section aria-label="Optional PDS auto-fill">
        <PdsUploadCard docs={docs} onProfileReplaced={onProfileReplaced} onDocsChanged={reloadSilent} />
      </section>

      {/* Task 40 — unsaved-changes navigation guard: fires when the
          applicant tries to leave section 01 (another section, or the
          portal) while its edit session holds unsaved edits. "Discard &
          leave" continues the ORIGINAL navigation request (pendingNav). */}
      <AlertDialog
        open={navOpen}
        onOpenChange={(o) => {
          setNavOpen(o);
          if (!o) setPendingNav(null);
        }}
      >
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your edits in Personal Information haven&apos;t been saved yet. Leaving this section now will discard
              them — your profile keeps its last saved values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmLeave();
              }}
              className={ghostBadBtn}
            >
              Discard &amp; leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Complete confirm (§7.4) */}
      <AlertDialog open={markOpen} onOpenChange={setMarkOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Mark your profile as complete?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your profile will be ready for application and subject to verification by HR. All statements become part
              of your civil-service application record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={marking}
              className="dlg-cta min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
