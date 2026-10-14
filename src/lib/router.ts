// ============================================================================
// RMIS — Client-safe shared types (spec wire shapes) + hash router (§13).
// The app is a single-page application with one route (/) and a hash-based
// router of the form #/view?param=value&...
// ============================================================================

"use client";

import { useSyncExternalStore, useCallback } from "react";
import type { DocumentStatus } from "@/lib/document-status";

// ── Wire types ──────────────────────────────────────────────────────────────

export type Role = "ADMIN" | "EVALUATOR" | "APPLICANT";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  middleName?: string | null;
  isActive?: boolean;
  applicant: { id: number; isProfileComplete: boolean } | null;
};

export type PositionWire = {
  id: number;
  itemNumber: string | null;
  positionTitle: string;
  positionType: string | null;
  division: string | null;
  placeOfAssignment: string | null;
  salaryGrade: string | null;
  salaryStep: string | null;
  salaryAmount: number | null;
  cscEducation: string | null;
  cscEligibility: string | null;
  cscEligibilityGroup: string | null;
  cscWorkExperience: string | null;
  cscTraining: string | null;
  license: string | null;
  preferredQualification: string | null;
};

export type JobWire = {
  id: number;
  title: string;
  positionType: string | null;
  // Plantilla postings are 1:1 with a Plantilla Item Number, so the vacancy
  // count is optional (null → render "-"); COS postings carry a real count.
  numberOfVacancy: number | null;
  briefDescription: string | null;
  briefDescriptionHtml: string | null;
  dutiesResponsibilities: string | null;
  dutiesHtml: string | null;
  compensationPackage: string | null;
  compensationHtml: string | null;
  otherQualifications: string | null;
  otherQualificationsHtml: string | null;
  publishDate: string | null;
  deadlineDate: string | null;
  processingDate: string | null;
  publishedAt: string;
  isActive: boolean;
  position: PositionWire | null;
  author: { id: string; firstName: string | null; lastName: string | null } | null;
  applications: { id: number; status: string }[];
  applicationCount: number;
};

export type MqrResults = {
  education: string;
  eligibility: string;
  workExperience: string;
  training: string;
};

export type ApplicationWire = {
  id: number;
  status: string;
  reason?: string | null;
  dateApplied: string;
  applicantId: number;
  jobId: number;
  job?: JobWire & { title: string };
  applicant?: ApplicantMini;
  match?: { verdict: string; metCount: number; requiredCount: number };
  assessments?: unknown[];
};

export type ApplicantMini = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  gender: string | null;
  isProfileComplete: boolean;
};

export type DocumentWire = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  category: string;
  status: DocumentStatus;
  extractionError: string | null;
  extractedAt: string | null;
  qualityScore: number | null;
  createdAt: string;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

// ── Hash router (spec §13 navigation) ───────────────────────────────────────

export type ViewParams = Record<string, string>;
export type Route = { view: string; params: ViewParams };

export const VIEW_ALIASES: Record<string, string> = {
  // QA 2026-02: page name must match the website slug — the public positions
  // board is "Vacant Positions" at #/vacant-positions (legacy #/jobs links
  // keep working through this alias).
  "jobs": "vacant-positions",
  // QA 2026-02 lists the sign-in slug as #/sign-in — accept both spellings.
  "sign-in": "signin",
  "evaluator-queue": "review-queue",
  "admin-dashboard": "operations",
  "admin-jobs": "recruitment",
  "admin-applicants": "candidates",
  "admin-audit-log": "settings",
  "admin-users": "settings",
  "admin-positions": "settings",
  "applicant-details": "candidate",
  "my-applications": "home",
};

export const ROLE_HOME: Record<Role, string> = {
  APPLICANT: "home",
  EVALUATOR: "review-queue",
  ADMIN: "operations",
};

function parseHash(hash: string): Route {
  let h = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = h.split("?");
  const view = pathPart || "home";
  const params: ViewParams = {};
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  const aliased = VIEW_ALIASES[view] || view;
  return { view: aliased, params };
}

let currentRoute: Route = { view: "home", params: {} };
const listeners = new Set<() => void>();

function emit(route: Route) {
  currentRoute = route;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  currentRoute = parseHash(window.location.hash);
  window.addEventListener("hashchange", () => {
    const next = parseHash(window.location.hash);
    if (next.view !== currentRoute.view || JSON.stringify(next.params) !== JSON.stringify(currentRoute.params)) {
      emit(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

export function navigate(view: string, params?: ViewParams) {
  const aliased = VIEW_ALIASES[view] || view;
  const qs = params && Object.keys(params).length
    ? "?" + Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`).join("&")
    : "";
  const target = `#/${aliased}${qs}`;
  if (window.location.hash === target) {
    emit(parseHash(target)); // same-route refresh (e.g. param change)
    return;
  }
  window.location.hash = target;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Cached server snapshot (must be stable — a fresh object per call causes an
// infinite getServerSnapshot loop in React).
const SERVER_SNAPSHOT: Route = { view: "home", params: {} };

export function useHashRoute(): Route {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => currentRoute,
    () => SERVER_SNAPSHOT
  );
}
