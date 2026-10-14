"use client";

// ============================================================================
// RMIS — the single-route hash-routed SPA (spec §13 navigation model).
// SessionProvider → router → AppShell(view-specific chrome) → View.
// ============================================================================

import { useEffect, useSyncExternalStore } from "react";
import { SessionProvider, useSession } from "@/components/session-provider";
import { useHashRoute, navigate, ROLE_HOME, type Role } from "@/lib/router";
import { AppShell, PublicShell } from "@/components/shell/app-shell";
import PublicLanding from "@/components/views/public-landing";
import SignInView from "@/components/views/signin-view";
import SignUpView from "@/components/views/signup-view";
import ResetPasswordView from "@/components/views/reset-password-view";
import ContactView from "@/components/views/contact-view";
import JobsView from "@/components/views/jobs-view";
import ApplicantHome from "@/components/views/applicant-home";
import ProfileView from "@/components/views/profile-view";
import ReviewQueue from "@/components/views/review-queue";
import ReviewWorkspace from "@/components/views/review-workspace";
import Recruitment from "@/components/views/recruitment";
import JobWorkspace from "@/components/views/job-workspace";
import Candidates from "@/components/views/candidates";
import CandidateDetail from "@/components/views/candidate-detail";
import CommandCenter from "@/components/views/command-center";
import Analytics from "@/components/views/analytics";
import Settings from "@/components/views/settings";
import AccountSettings from "@/components/views/account-settings";

let mounted = false;
const mountListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  queueMicrotask(() => {
    mounted = true;
    mountListeners.forEach((l) => l());
  });
}

function useMounted() {
  return useSyncExternalStore(
    (cb) => {
      mountListeners.add(cb);
      return () => mountListeners.delete(cb);
    },
    () => mounted,
    () => false
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen flex flex-col bg-fog" aria-busy="true" aria-label="Loading">
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* .skel shimmer blocks (not bg-fog-on-cloud, which was near-invisible
            against the .dlg-card surface) — same anatomy as the views' own
            skeletons so the boot state predicts the loaded layout. */}
        <div className="dlg-card p-8 space-y-6">
          <div className="skel h-10 w-2/3" />
          <div className="skel h-4 w-1/2" />
          <div className="skel h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

function Router() {
  const { user, loading } = useSession();
  const route = useHashRoute();
  const mountedFlag = useMounted();
  const { view } = route;

  // Redirect signed-in users away from auth views.
  useEffect(() => {
    if (!loading && user && (view === "signin" || view === "signup")) {
      navigate(ROLE_HOME[user.role]);
    }
  }, [loading, user, view]);

  if (!mountedFlag || loading) return <LoadingShell />;

  // ── Anonymous ────────────────────────────────────────────────────────────
  if (!user) {
    // Auth views live inside the public shell so they carry the same sticky
    // header (brand + Positions + orange Sign-in CTA) and footer as every
    // other public page — previously they rendered bare with no chrome.
    if (view === "signin")
      return (
        <PublicShell>
          <SignInView />
        </PublicShell>
      );
    if (view === "signup")
      return (
        <PublicShell>
          <SignUpView />
        </PublicShell>
      );
    if (view === "reset-password")
      return (
        <PublicShell>
          <ResetPasswordView />
        </PublicShell>
      );
    if (view === "contact") return <PublicShell><ContactView /></PublicShell>;
    if (view === "vacant-positions") return <PublicShell><JobsView /></PublicShell>;
    return <PublicLanding />;
  }

  // ── Role-based views (spec §13 view registry) ────────────────────────────
  const role: Role = user.role;
  let content: React.ReactNode;

  if (role === "APPLICANT") {
    if (view === "profile") content = <ProfileView />;
    else if (view === "account-settings") content = <AccountSettings />;
    else if (view === "vacant-positions") content = <JobsView />;
    else content = <ApplicantHome />;
  } else if (role === "EVALUATOR") {
    if (view === "evaluator-review") content = <ReviewWorkspace />;
    else if (view === "review-queue") content = <ReviewQueue />;
    else if (view === "candidates") content = <Candidates />;
    else if (view === "candidate") content = <CandidateDetail />;
    else if (view === "recruitment") content = <Recruitment />;
    else if (view === "job") content = <JobWorkspace />;
    else if (view === "analytics") content = <Analytics />;
    else if (view === "settings") content = <Settings />;
    else if (view === "account-settings") content = <AccountSettings />;
    else if (view === "vacant-positions") content = <JobsView />;
    else content = <ReviewQueue />;
  } else {
    // ADMIN
    if (view === "operations") content = <CommandCenter />;
    else if (view === "recruitment") content = <Recruitment />;
    else if (view === "job") content = <JobWorkspace />;
    else if (view === "candidates") content = <Candidates />;
    else if (view === "candidate") content = <CandidateDetail />;
    else if (view === "review-queue") content = <ReviewQueue />;
    else if (view === "evaluator-review") content = <ReviewWorkspace />;
    else if (view === "analytics") content = <Analytics />;
    else if (view === "settings") content = <Settings />;
    else if (view === "account-settings") content = <AccountSettings />;
    else if (view === "vacant-positions") content = <JobsView />;
    else content = <CommandCenter />;
  }

  return (
    <AppShell view={view} params={route.params}>
      {content}
    </AppShell>
  );
}

export default function Page() {
  return (
    <SessionProvider>
      <Router />
    </SessionProvider>
  );
}
