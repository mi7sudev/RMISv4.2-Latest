// ============================================================================
// RMIS — THE document-status vocabulary module (single source of truth,
// client-safe). Mirrors lib/status.ts's role for the Application pipeline:
// the five states a Document row moves through (spec §6.4, §8.5) with named
// constants for writers. Previously the union was hand-copied in
// lib/router.ts (DocumentWire), the extract route's outcome type, and the
// writers used raw strings — adding a state meant ~5 scattered edits
// (shotgun surgery) with nothing stopping a misspelling.
//
// Presentation mapping (status → badge) stays in lib/status-ui.ts — this
// module is the vocabulary, not the view.
// ============================================================================

/** Every status this system has ever stored (spec §6.4 lifecycle). */
export const DOCUMENT_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "EXTRACTED",
  "PARTIALLY_EXTRACTED",
  "FAILED",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Named constants for writers — typo-proof, single-sourced. */
export const DOC_STATUS = {
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  EXTRACTED: "EXTRACTED",
  PARTIALLY_EXTRACTED: "PARTIALLY_EXTRACTED",
  FAILED: "FAILED",
} as const satisfies Record<DocumentStatus, DocumentStatus>;
