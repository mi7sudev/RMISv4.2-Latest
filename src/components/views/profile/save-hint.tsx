"use client";

// ============================================================================
// RMIS — Presentation-only save-state indicator for the profile builder
// section headers (spec §7.4). Shows "Saving…" while a mutation is in flight,
// "Saved ✓" after it succeeds, plus optional draft/error hints: dirty →
// "Unsaved changes" (neutral), error → bad-tinted hint (pass a string to
// customize the message). Purely visual: it never triggers, delays, or
// changes any save — callers wire it to their existing state.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Flash state for sections whose mutations are inline (not autosaved). */
export function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2600);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return [saved, flash];
}

export function SaveHint({
  saving,
  saved,
  dirty = false,
  error,
}: {
  saving: boolean;
  saved: boolean;
  /** Draft has unsaved edits (autosave sections) — neutral quiet hint. */
  dirty?: boolean;
  /** Save failure — bad tint. Pass a string to customize the message. */
  error?: string | boolean;
}) {
  if (saving)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs leading-none text-body-gray">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving…
      </span>
    );
  if (error)
    return (
      <span className="text-xs leading-none text-[var(--bad)]">
        {typeof error === "string" ? error : "Save failed. Click Save Changes"}
      </span>
    );
  if (dirty) return <span className="text-xs leading-none text-stone">Unsaved changes</span>;
  if (saved)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs leading-none text-[var(--ok)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" aria-hidden="true" /> Saved ✓
      </span>
    );
  return null;
}
