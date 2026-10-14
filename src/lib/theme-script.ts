// ============================================================================
// RMIS — Pre-paint theme bootstrap (server-safe; NO "use client" here so
// layout.tsx can inline it). Task 35.
// Reads localStorage "rmis.theme" and puts the `.dark` class + native
// color-scheme on <html> BEFORE the first frame — a saved dark choice never
// flashes light on reload. The client twin (applyTheme/setTheme in
// lib/theme.ts) keeps the same key and semantics.
// ============================================================================

export const THEME_STORAGE_KEY = "rmis.theme";

export const THEME_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})==="dark"){var d=document.documentElement;d.classList.add("dark");d.style.colorScheme="dark";}}catch(e){}})();`;
