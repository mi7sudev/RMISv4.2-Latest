"use client";

// ============================================================================
// RMIS glue — Profile builder "Add additional entry" affordance. A full-width
// dashed slot rendered BELOW the entry list of the credential sections
// (02 Education · 03 Work · 04 Training · 05 Eligibility · 06 Awards).
//
// Why it exists: while a section is empty the inline first-entry form IS the
// add path (Task 25), but once entries exist the only add affordance was the
// small header button — which scrolls out of reach on lg+ (the section column
// is a bounded internal scroll pane) exactly when an applicant has MANY
// entries and needs another one. The dashed row keeps "add another" reachable
// at the end of any list length; it opens the same Add dialog as the header
// button (no new state, no API change). Same snow fill / ink / 12px radius as
// .dlg-ghost via the unlayered .dlg-ghost-dashed token (a dashed rule reads
// as an additive slot, and a layered border-dashed utility could not override
// .dlg-ghost's border shorthand).
// ============================================================================

import { Plus } from "lucide-react";

export default function AddEntryButton({
  label = "Add additional entry",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dlg-ghost-dashed focus-ring flex min-h-[44px] w-full items-center justify-center gap-2 px-5 py-2.5 text-sm"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
