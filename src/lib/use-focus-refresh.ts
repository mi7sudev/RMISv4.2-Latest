"use client";

// ============================================================================
// RMIS — shared refetch-on-focus hook (spec §13).
// Calls `refresh` when the window regains focus or the tab becomes visible
// again. Refreshes fired within 5 s of the previous one are deduped so a
// focus event landing right after a silent poll never double-hits the API.
// Pure behavior: no fetching, no business logic — views pass their own loader.
// ============================================================================

import { useEffect, useRef } from "react";

export function useFocusRefresh(refresh: () => void) {
  const lastRef = useRef(0);

  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastRef.current < 5_000) return;
      lastRef.current = now;
      refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);
}
