"use client";

// ============================================================================
// RMIS — Profile builder · section mutations (the deep mutation module).
//
// The five entry sections (education, work experience, training,
// eligibility, awards) share ONE mutation contract, and before this module
// that contract existed as five hand-copied orchestration blocks:
//
//   · spec §6.3 — EDITS ARE DELETE + RECREATE (there are no update
//     endpoints) — the invariant itself was duplicated ×5;
//   · successes toast "{noun} added" / "{noun} updated" / "{noun} removed";
//   · failures toast the server's verbatim { error } message (via the
//     ApiClientError the client seam throws) with the shared fallback;
//   · every save flashes the header save indicator, then awaits the
//     parent refresh; busy gates the dialog/inline form the whole time;
//   · the dialog closes and editing clears the moment the POST settles —
//     BEFORE the refresh runs — and stays open on any failure.
//
// Interface (everything a caller must know):
//   const { saveEntry, removeEntry, busy } = useSectionMutations({
//     resource, noun, onChanged, flashSaved,
//   });
//   · saveEntry(values, editing, onSuccess?) — DELETE+recreate when
//     `editing` is present, plain POST otherwise; toasts; calls onSuccess
//     right after the toast (the caller's hook to close its own dialog);
//     flashes; awaits onChanged. Resolves TRUE when the record is on file,
//     FALSE on any failure — never throws.
//   · removeEntry(id, onSuccess?) — DELETE + toast, then onSuccess (the
//     caller clears its confirm-dialog state) before awaiting the parent
//     refresh — the exact legacy ordering. Resolves TRUE when removed;
//     never throws. Does not touch `busy` (row deletes were never gated
//     on it).
//   · busy — single in-flight flag for SaveHint / dialog submit buttons.
//
// Sections keep their own domain concerns (field configs, payload mapping,
// dialog/confirm state) and hand this module exactly the network
// orchestration — so a change to the §6.3 contract or the toast language
// lands in ONE place (locality), and the next entry section gets the whole
// pipeline through a four-option interface (leverage).
// ============================================================================

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { apiFetch } from "@/lib/client";

export type SectionMutationOptions = {
  /** Resource segment under /api/applicant — e.g. "educations", "awards". */
  resource: string;
  /** Domain noun for the toasts — "Education entry", "Award", "Eligibility". */
  noun: string;
  /** Parent refresh, awaited after every settled change (as today). */
  onChanged: () => void | Promise<void>;
  /** Saved-indicator flash — save path only (removes never flashed). */
  flashSaved: () => void;
};

export function useSectionMutations({
  resource,
  noun,
  onChanged,
  flashSaved,
}: SectionMutationOptions) {
  const [busy, setBusy] = useState(false);

  /** Create (or delete+recreate) one entry. `editing` is the row being
      replaced — only `{ id }` is read, so full rows pass structurally. */
  const saveEntry = useCallback(
    async (
      values: Record<string, unknown>,
      editing: { id: number } | null | undefined,
      onSuccess?: () => void,
    ): Promise<boolean> => {
      setBusy(true);
      try {
        if (editing)
          await apiFetch(`/api/applicant/${resource}/${editing.id}`, { method: "DELETE" });
        await apiFetch(`/api/applicant/${resource}`, { method: "POST", body: values });
        toast.success(editing ? `${noun} updated` : `${noun} added`);
        onSuccess?.();
        flashSaved();
        await onChanged();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unable to save this entry");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [resource, noun, onChanged, flashSaved],
  );

  /** Remove one entry. Fires onSuccess after the toast (caller clears its
      confirm-dialog state) and then awaits the parent refresh — the exact
      legacy ordering. Resolves TRUE on success so failures stay visible;
      never throws. */
  const removeEntry = useCallback(
    async (id: number, onSuccess?: () => void): Promise<boolean> => {
      try {
        await apiFetch(`/api/applicant/${resource}/${id}`, { method: "DELETE" });
        toast.success(`${noun} removed`);
        onSuccess?.();
        await onChanged();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unable to remove this entry");
        return false;
      }
    },
    [resource, noun, onChanged],
  );

  return { saveEntry, removeEntry, busy };
}
