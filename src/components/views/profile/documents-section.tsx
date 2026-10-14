"use client";

// ============================================================================
// RMIS — Profile builder · Section 07 Supporting Documents (spec §7.4, §10).
// Storage-only by design (no extraction here). Uploads land in the default
// SUPPORTING category (server default — no category picker in the UI).
// Rows show name / size / category / date (+ status pill for extractable
// categories, extraction error via tooltip) with single and checkbox batch
// delete. Rows are clickable: the name/chip area (or the eye button) opens a
// preview modal — PDFs render inline in an iframe, images in an <img>,
// Word/Excel fall back to a download card. Checkbox and delete stay
// independent.
// Upload surface: the OFFICIAL UploadCN FolderUpload block (shadcn registry
// @uploadcn/folder-upload — used exactly per its docs, not recreated):
// a folder that opens on hover/drag, files fly in, and its front panel shows
// live progress. Transport lives in a createAdapter adapter (the official
// extension point): one POST per file to /api/applicant/documents with TRUE
// byte progress via the client layer's apiUpload seam (lib/client — the ONE
// owner of transport + { error } envelope + verbatim 401/403/413/415/500
// fallbacks), same FormData file+category contract. Client
// validation mirrors the server rules (extension allowlist → reject, 10 MB
// cap → reject) so bad files fail before a byte is sent. Uploads run one at
// a time (concurrency 1, SQLite-safe). Edit mode is a two-column workspace —
// uploaded files list on the LEFT, the upload folder on the RIGHT (stacked,
// folder first, on phones).
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with files on record the section opens as a quiet preview — the
// upload folder, checkboxes and delete buttons are hidden; rows stay
// clickable (and the eye button stays) because OPENING a document is a read
// action. "Edit Profile" reveals the two-column workspace; "Done Editing"
// returns to the preview. An EMPTY record boots straight into edit mode
// (there is nothing to preview yet, mirroring section 01's new-record boot).
// Mutations are immediate, so no draft/unsaved guard applies here.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { createAdapter } from "@uploadcn/core";
import { useUploadProgress, useUploader } from "@uploadcn/react";
import { toast } from "@/lib/toast";
import { Check, Eye, FileText, Paperclip, Pencil, Trash2 } from "lucide-react";
import { DocumentPreviewModal, documentStatusChip, fileKind } from "@/components/ui/document-preview";
import { FolderUpload } from "@/components/folder-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, SectionCard, StatusPill } from "@/components/ui/shell";
import { ghostBadBtn, iconBtnBad, cancelBtn } from "@/components/ui/buttons";
import { Tooltip, TooltipProvider } from "@/components/motion/tooltip";
import { apiFetch, apiUpload, formatDate, humanize } from "@/lib/client";
import { UPLOAD_ACCEPT } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";
import { SaveHint, useSavedFlash } from "./save-hint";

/** Client-side mirror of the server contract (route.ts): the accept string
    derives from the ONE shared allowlist (lib/validation UPLOAD_EXTENSIONS —
    the server imports the same list for its 415 backstop) + the 10 MB cap.
    Bad files are rejected before a byte is sent. */
const DOCUMENT_ACCEPT = UPLOAD_ACCEPT;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB (spec §10 → server 413)

export default function DocumentsSection({
  docs,
  onChanged,
}: {
  docs: DocumentWire[];
  onChanged: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<DocumentWire | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();
  // Task 41 — section-level edit gate: an empty record boots in edit mode
  // (the upload folder IS the add path), a populated record boots as preview.
  const [editMode, setEditMode] = useState(() => docs.length === 0);

  const openPreview = (doc: DocumentWire) => setPreview(doc);

  // Cross-batch counters for the refresh gate in onComplete below.
  const uploadedCountRef = useRef(0);
  const settledCountRef = useRef(0);

  // The RMIS documents adapter — the OFFICIAL createAdapter extension point.
  // One sequential POST per file (concurrency 1 below, SQLite-safe) with
  // TRUE XHR byte progress via the client layer's apiUpload seam (lib/client
  // owns transport, envelope parsing and the verbatim error fallbacks);
  // files land in the default SUPPORTING category.
  const documentsAdapter = useMemo(
    () =>
      createAdapter<DocumentWire>(async ({ file, signal, onProgress }) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "SUPPORTING");
        return await apiUpload<DocumentWire>("/api/applicant/documents", fd, {
          onProgress,
          signal,
        });
      }),
    [],
  );

  // The official useUploader engine, wired per the UploadCN docs. Server
  // rules mirrored client-side (accept + maxSize → rejected before upload);
  // duplicates allowed (a re-exported file may repeat); no auto-retry —
  // failures surface verbatim and the user retries deliberately.
  const uploader = useUploader<DocumentWire>({
    adapter: documentsAdapter,
    accept: DOCUMENT_ACCEPT,
    maxSize: MAX_UPLOAD_SIZE,
    concurrency: 1,
    duplicates: "allow",
    retry: false,
    onSuccess: (item) => {
      uploadedCountRef.current += 1;
      toast.success(`${item.file.name} uploaded`);
    },
    onError: (_item, error) => toast.error(error.message),
    onReject: (item) =>
      toast.error(
        item.issues[0]?.message ?? `${item.file.name} was not accepted`,
      ),
    onComplete: async () => {
      // Queue drained — refresh the table below only when the settled-OK
      // count grew (retries and failed runs stay quiet).
      if (uploadedCountRef.current > settledCountRef.current) {
        settledCountRef.current = uploadedCountRef.current;
        flashSaved();
        await onChanged();
      }
    },
  });
  // Live queue state — the SaveHint rides the official engine, not a local
  // counter.
  const uploading = useUploadProgress(uploader).isUploading;

  const runDelete = async (ids: string[]) => {
    setDeleting(true);
    let okCount = 0;
    for (const id of ids) {
      try {
        await apiFetch(`/api/applicant/documents/${id}`, { method: "DELETE" });
        okCount += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "A document could not be deleted");
      }
    }
    setDeleting(false);
    setDeleteTargets(null);
    setSelected(new Set());
    if (okCount > 0) {
      toast.success(okCount === 1 ? "Document deleted" : `${okCount} documents deleted`);
      await onChanged();
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The uploaded-files list — shared by the two-column edit workspace and
  // the full-width read-only preview (Task 41 gate controls checkbox/delete).
  const filesList =
    docs.length === 0 ? (
      <EmptyState compact icon={Paperclip} tone="slate" title="No documents on file yet" description="Upload credentials HR will need for verification." />
    ) : (
      <TooltipProvider delay={150}>
        {/* No inner max-height below lg: the section column is already a
            bounded scroller — a nested scroll pane traps touch gestures
            on phones. The cap returns on lg where the column is roomy. */}
        <div className="space-y-2 overflow-y-auto scroll-thin pr-1 lg:max-h-96">
          {docs.map((doc) => {
            const chip = documentStatusChip(doc);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg bg-cloud/60 px-3 py-2.5 transition-colors hover:bg-cloud"
              >
                {editMode && (
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => toggle(doc.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${doc.originalName}`}
                    className="shrink-0"
                  />
                )}
                {/* Clickable view target: chip + name/meta open the preview modal.
                    Task 41: the checkbox renders only in edit mode, so the
                    row leads with the file in preview. */}
                <button
                  type="button"
                  onClick={() => openPreview(doc)}
                  className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-ring"
                  aria-label={`View ${doc.originalName}`}
                >
                  <span className="chip chip-slate h-6 shrink-0 px-2 text-[10px] font-medium tracking-wide" aria-hidden="true">
                    {fileKind(doc.originalName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium text-ink transition-colors group-hover:text-primary group-focus-visible:text-primary"
                      title={doc.originalName}
                    >
                      {doc.originalName}
                    </p>
                    <p className="num text-xs text-stone">
                      {humanize(doc.category)} · {Math.max(1, Math.round(doc.size / 1024))} KB · {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </button>
                {chip && (
                  <Tooltip content={doc.extractionError} arrow>
                    <span className="inline-flex shrink-0 cursor-default">
                      <StatusPill status={chip.label} variant={chip.variant} pulse={chip.pulse} className="shrink-0 cursor-default" />
                    </span>
                  </Tooltip>
                )}
                {/* Eye button: white hover on cloud/60 rows. Viewing a
                    document is a READ action — it stays in the preview. */}
                <button
                  type="button"
                  onClick={() => openPreview(doc)}
                  aria-label={`View ${doc.originalName}`}
                  className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone transition-colors hover:bg-white hover:text-ink"
                >
                  <Eye className="h-4 w-4" />
                </button>
                {/* Task 41 — delete lives behind the edit gate. */}
                {editMode && (
                  <button
                    type="button"
                    onClick={() => setDeleteTargets([doc.id])}
                    aria-label={`Delete ${doc.originalName}`}
                    className={iconBtnBad}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    );

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      icon={FileText}
      chipTone="slate"
      title="Supporting Documents"
      description={
        editMode
          ? "Editing — uploads and removals apply immediately."
          : "Read-only preview — click Edit Profile to make changes."
      }
      actions={
        editMode ? (
          <div className="flex flex-wrap items-center gap-3">
            <SaveHint saving={uploading} saved={savedFlash} />
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Done Editing
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </button>
        )
      }
    >
      {editMode ? (
        /* Two-column edit workspace — uploaded files list on the LEFT,
           the official FolderUpload folder on the RIGHT. On phones it
           stacks folder-first (the primary action) with the list below. */
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Upload folder — the official UploadCN block, wired per its
              docs (<FolderUpload uploader={…} name={…} />): a folder that
              opens on hover/drag, files fly in, the front shows live
              progress. Transport lives in the createAdapter adapter above. */}
          <div className="order-1 rounded-3xl border border-border bg-cloud/60 p-4 lg:order-2">
            <FolderUpload
              uploader={uploader}
              name="Supporting Documents"
              title="Drop files into Supporting Documents"
              description="Files upload one at a time · max 10 MB each"
            />
          </div>

          {/* Uploaded files list — left column on desktop. */}
          <div className="order-2 min-w-0 lg:order-1">
            {/* Batch action bar (Task 41: edit-session only) */}
            {selected.size > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-cloud/60 px-4 py-2">
                <span className="num text-xs text-stone">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setDeleteTargets([...selected])}
                  disabled={deleting}
                  className="focus-ring inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-medium text-[var(--bad)] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete selected
                </button>
              </div>
            )}
            {filesList}
          </div>
        </div>
      ) : (
        /* Read-only preview — the list alone, full width (Task 41). */
        <div className="mt-4">
          {filesList}
        </div>
      )}

      <AlertDialog open={deleteTargets !== null} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">
              {deleteTargets !== null && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} documents?` : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              The file will be permanently removed from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTargets) void runDelete(deleteTargets);
              }}
              disabled={deleting}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document preview modal — click a row to view it here (shared component) */}
      <DocumentPreviewModal
        doc={preview}
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      />
    </SectionCard>
  );
}
