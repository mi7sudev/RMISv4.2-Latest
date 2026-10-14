"use client";

// ============================================================================
// RMIS — Shared client bookmark store for the public job explorer (frontpage)
// and the applicant home "Apply Now" pane. One localStorage key so a job
// saved in either view shows as saved in the other. Client-only, no API.
// ============================================================================

import { useCallback, useState } from "react";

export const SAVED_KEY = "rmis-frontpage-saved-jobs";

/** Client-persisted bookmark list (same store as the frontpage). */
export function useSavedJobs() {
  const [saved, setSaved] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
    } catch {
      return [];
    }
  });

  const toggle = useCallback((id: number) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — in-session state still works */
      }
      return next;
    });
  }, []);

  return { saved, toggle };
}
