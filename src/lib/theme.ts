"use client";

// ============================================================================
// RMIS — Appearance theme (light / dark). Task 35.
// Persisted in localStorage "rmis.theme"; applied as the `.dark` class on
// <html> — the target of globals.css' `@custom-variant dark` and of the
// `.dark { … }` token override block ("Bevel Night": only the semantic CSS
// variables flip, every utility/class that consumes them follows).
// layout.tsx carries a pre-paint inline script with the SAME read so a saved
// dark choice never flashes light on reload.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export type Theme = "light" | "dark";

export { THEME_STORAGE_KEY };

/** Current choice (SSR-safe: reads "light" on the server). */
export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Apply the class + native color-scheme (form controls, scrollbars). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Persist + apply + broadcast so every mounted useTheme() instance syncs. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — session-only theme */
  }
  window.dispatchEvent(new Event("rmis:theme"));
}

export function toggleTheme() {
  setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
}

/** Reactive theme for UI (settings toggle, quick dark-mode rows). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(readStoredTheme());
    const sync = () => setThemeState(readStoredTheme());
    window.addEventListener("rmis:theme", sync);
    // Cross-tab agreement.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rmis:theme", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const change = useCallback((next: Theme) => {
    setTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(
    () => change(document.documentElement.classList.contains("dark") ? "light" : "dark"),
    [change]
  );

  return { theme, setTheme: change, toggle };
}
