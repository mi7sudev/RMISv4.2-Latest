"use client";

// ============================================================================
// RMIS — PDS upload & auto-extraction (spec §7.5, §8.4), rendered as the
// OPTIONAL "Auto-fill from PDS" row at the FOOT of the profile page
// (credentials-first: manual form filling is the primary path; this is a
// shortcut for applicants who already have a filled CS Form 212).
// Collapsed by default (the resting look); expanding reveals the pipeline:
// upload (category PDS) → extract → auto-apply, with Uploading → Extracting
// → Applying phase progress. ONE-EXTRACTION LOCK: once any extractable
// document is EXTRACTED/PARTIALLY_EXTRACTED the dropzone is replaced by a
// locked strip whose only way back is "Clear Forms & Re-upload" → confirm →
// POST /api/applicant/profile/clear (files stay). Extraction errors show the
// server message + file name + Try Again. Upload surface: the OFFICIAL BEUI
// FileUpload block (variant="centered") — single-slot queue (a fresh pick
// replaces the attempt), old stage progress (20/55/75/90/100) mapped onto
// the block's own progressbar, extract/apply phase label kept as glue above
// the block (those phases are inexpressible via block props). Bevel pass:
// WHITE collapsible card (sits on the record panel's cloud tint), capsule
// destructive actions. Presentation-only changes.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { CloudUpload, Loader2, Lock, RefreshCcw } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleTrigger,
} from "@/components/motion/collapsible";
import { FileUpload, type FileUploadItem } from "@/components/motion/file-upload";
import { ghostBadBtn, cancelBtn } from "@/components/ui/buttons";
import { IconChip } from "@/components/ui/shell";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon } from "@/components/motion/alert";
import { apiFetch } from "@/lib/client";
import { EXTRACTABLE_CATEGORIES } from "@/lib/validation";
import type { DocumentWire } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";

const EXTRACTABLE = EXTRACTABLE_CATEGORIES as readonly string[];

type Phase = "idle" | "uploading" | "extracting" | "applying";

type QualityInfo = {
  score: number;
  grade: string;
  needsReview: number;
  issues?: { severity: string; section: string; field: string; message: string }[];
};

type ExtractResponse = {
  results: { id: string; status: string; error?: string; quality?: QualityInfo }[];
  merged: (Record<string, unknown> & { quality?: QualityInfo }) | null;
  parserPath?: string;
};

type AutoApplyResponse = {
  applied: Record<string, number>;
  replaced: { personal: number };
  totalFilled: number;
  totalReplaced: number;
  message: string;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  uploading: "Uploading your PDS…",
  extracting: "Extracting from your PDS…",
  applying: "Applying to your profile…",
};

export default function PdsUploadCard({
  docs,
  onProfileReplaced,
  onDocsChanged,
}: {
  docs: DocumentWire[];
  /** Called after auto-apply / clear — reloads profile + docs and re-seeds forms. */
  onProfileReplaced: () => void | Promise<void>;
  /** Called when document statuses changed without touching the profile. */
  onDocsChanged: () => void | Promise<void>;
}) {
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; fileName: string } | null>(null);
  // Last non-null error — keeps the BEUI alert's exit animation populated with
  // content while the error state has already cleared.
  const [lastError, setLastError] = useState<{ message: string; fileName: string } | null>(null);
  useEffect(() => {
    if (error !== null) setLastError(error);
  }, [error]);
  const [lastApply, setLastApply] = useState<AutoApplyResponse | null>(null);
  const [quality, setQuality] = useState<QualityInfo | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Official BEUI FileUpload queue — single slot: a fresh pick always
  // replaces the previous attempt (maxFiles={1} would hard-disable the
  // dropzone after the first pick, even a failed one).
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);
  // Single-flight guard: the block's RotateCcw retry AND the Alert's Try
  // Again share one path — one attempt at a time, as before.
  const runningRef = useRef(false);

  const locked = useMemo(
    () => docs.some((d) => EXTRACTABLE.includes(d.category) && (d.status === "EXTRACTED" || d.status === "PARTIALLY_EXTRACTED")),
    [docs]
  );
  const busy = phase !== "idle";
  // The one failing row (single-slot queue) — powers the Alert's Try Again.
  const failingItem = uploadItems.find((it) => it.status === "error") ?? null;

  /** Quiet .num rows describing what the last auto-apply filled, per section. */
  const applyRows = useMemo(() => {
    if (!lastApply) return [];
    const rows: [string, number][] = [
      ["Personal details", lastApply.applied.personal],
      ["Education entries", lastApply.applied.education],
      ["Work experience entries", lastApply.applied.work],
      ["Training entries", lastApply.applied.training],
      ["Eligibility entries", lastApply.applied.eligibility],
      ["Awards", lastApply.applied.awards],
      ["Existing personal values replaced", lastApply.replaced.personal],
    ];
    return rows.filter(([, n]) => n > 0);
  }, [lastApply]);

  /** Patch one queue row — stage progress + real API result statuses. */
  const patchItem = (id: string, patch: Partial<FileUploadItem>) => {
    setUploadItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const runPipeline = async (file: File, itemId: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setLastApply(null);
    setQuality(null);
    try {
      // 1 — Upload (category PDS).
      setPhase("uploading");
      patchItem(itemId, { progress: 20 });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<{ id: string }>("/api/applicant/documents", { method: "POST", formData: fd });

      // 2 — Extract (streaming endpoint; apiFetch tolerates keep-alive bytes).
      setPhase("extracting");
      patchItem(itemId, { progress: 55 });
      const ext = await apiFetch<ExtractResponse>("/api/applicant/documents/extract", {
        method: "POST",
        body: { documentIds: [doc.id] },
      });
      patchItem(itemId, { progress: 75 });

      if (!ext.merged) {
        const failed = ext.results?.find((r) => r.error);
        const message =
          failed?.error ??
          "Extraction failed. Try a filled PDS file: Excel CS Form 212 (.xlsx or legacy .xls, Excel 2019 and older), PDF, DOCX, or a clear photo of the form.";
        setError({ message, fileName: file.name });
        patchItem(itemId, { status: "error", error: message });
        setPhase("idle");
        await onDocsChanged();
        return;
      }
      setQuality(ext.merged.quality ?? null);

      // 3 — Auto-apply (§8.4: personal overrides, sections replace).
      setPhase("applying");
      patchItem(itemId, { progress: 90 });
      const applied = await apiFetch<AutoApplyResponse>("/api/applicant/profile/auto-apply", {
        method: "POST",
        body: { extraction: ext.merged },
      });
      patchItem(itemId, { status: "success", progress: 100 });
      toast.success(`${applied.totalFilled} fields updated`, {
        description:
          applied.totalReplaced > 0
            ? `${applied.totalReplaced} existing value${applied.totalReplaced === 1 ? " was" : "s were"} replaced. Review each section before applying.`
            : "Review each section before applying.",
      });
      setLastApply(applied);
      setPhase("idle");
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong while processing your PDS.";
      setError({ message, fileName: file.name });
      patchItem(itemId, { status: "error", error: message });
      setPhase("idle");
      await onDocsChanged();
    } finally {
      runningRef.current = false;
    }
  };

  const clearProfile = async () => {
    setClearing(true);
    try {
      await apiFetch("/api/applicant/profile/clear", { method: "POST" });
      toast.success("Profile cleared", {
        description: "Your forms are empty again. Upload your PDS to auto-fill them.",
      });
      setClearOpen(false);
      setLastApply(null);
      setQuality(null);
      setUploadItems([]); // post-clear dropzone starts empty (old input reset)
      await onProfileReplaced();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to clear your profile");
    } finally {
      setClearing(false);
    }
  };

  /** Single-slot replace: the block already committed the item — swap the
      queue so the new attempt replaces the old row, then run the pipeline. */
  const handleFilesAdded = (added: FileUploadItem[]) => {
    const item = added[0];
    if (!item?.file) return;
    setUploadItems([item]);
    void runPipeline(item.file, item.id);
  };

  /** Row remove clears the matching error Alert (Try Again needs its row). */
  const handleRemove = (item: FileUploadItem) => {
    setError((prev) => (prev && prev.fileName === item.name ? null : prev));
  };

  /** Block RotateCcw + Alert Try Again share this path. The block pre-flips
      the row to "uploading" on its own retry; the same patch keeps the Alert
      path visually identical (error cleared, progress 0). */
  const retryItem = (item: FileUploadItem) => {
    if (!item.file) return;
    patchItem(item.id, { status: "uploading", error: undefined, progress: 0 });
    void runPipeline(item.file, item.id);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="dlg-card-plain overflow-hidden"
    >
      {/* Compact resting row — the screenshot look: chip · title · drop hints */}
      <CollapsibleTrigger
        render={<button className="flex min-h-[44px] w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-cloud/60" />}
      >
        <IconChip icon={CloudUpload} tone="plum" size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-base font-medium text-ink">Auto-fill from PDS</span>
            <span className="dlg-pill shrink-0 bg-fog px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-graphite">
              Optional
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-stone">
            Already have a filled PDS? We can pre-fill your forms — or skip this and fill them manually.
          </span>
        </span>
        <CollapsibleIndicator className="text-stone" />
      </CollapsibleTrigger>

      <CollapsibleContent contentClassName="border-t border-divider p-4">
        {/* Extract/apply phases are inexpressible via FileUpload props —
            the phase label stays as glue above the block; stage progress
            lives on the block's own progressbar row. */}
        {busy && (
          <p className="mb-4 flex items-center gap-2 text-xs text-stone">
            <Loader2 className="h-3 w-3 animate-spin" /> {PHASE_LABEL[phase]}
          </p>
        )}

        <Alert variant="destructive" open={!!error} className="mb-4">
          <AlertIcon />
          <AlertContent>
            <AlertDescription>
              <p className="font-medium">{error?.message ?? lastError?.message}</p>
              <p>{error?.fileName ?? lastError?.fileName}</p>
            </AlertDescription>
            {error !== null && (
              <AlertAction>
                <button
                  type="button"
                  onClick={() => {
                    if (failingItem) retryItem(failingItem);
                  }}
                  className="dlg-ghost inline-flex min-h-[44px] items-center gap-2 px-5 py-2 text-sm"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Try Again
                </button>
              </AlertAction>
            )}
          </AlertContent>
        </Alert>

        {/* Extraction result — quiet rows with tabular counts */}
        {!busy && (applyRows.length > 0 || quality) && (
          <div className="mb-4 rounded-xl bg-cloud/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-stone">Extraction applied to your profile</p>
              {quality && (
                <p className="flex items-center gap-1.5 text-xs text-stone">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-[2.5rem] items-center justify-center rounded-full px-1.5 text-[11px] font-medium text-white",
                      quality.grade === "A" ? "bg-[var(--ok)]" : quality.grade === "B" ? "bg-metric-blue" : quality.grade === "C" ? "bg-[var(--warn)]" : "bg-[var(--bad)]"
                    )}
                  >
                    {quality.grade} · {quality.score}/100
                  </span>
                  extraction quality
                </p>
              )}
            </div>
            {applyRows.length > 0 && (
              <dl className="mt-2 divide-y divide-divider">
                {applyRows.map(([label, count]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                    <dt className="text-xs text-stone">{label}</dt>
                    <dd className="num text-xs font-medium text-ink">{count}</dd>
                  </div>
                ))}
              </dl>
            )}
            {quality && quality.needsReview > 0 && (
              <p className="mt-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-xs text-ink">
                {quality.needsReview} value{quality.needsReview === 1 ? " needs" : "s need"} review — low-confidence reads
                {quality.issues?.length ? ` and ${quality.issues.length} checker note${quality.issues.length === 1 ? "" : "s"}` : ""}. Please verify them on your forms below.
              </p>
            )}
            {quality && quality.issues && quality.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {quality.issues.slice(0, 3).map((iss, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-stone">
                    · {iss.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {locked ? (
          /* One-extraction lock (§7.5) — the only way back is a full clear. */
          <div className="flex flex-col gap-3 rounded-xl bg-cloud/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IconChip icon={Lock} tone="ink" size={36} iconSize={16} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink">Profile auto-filled from your PDS</p>
                <p className="mt-0.5 text-xs text-stone">
                  Extraction already ran on your documents. Clear your forms to start over.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={clearing}
              className={`${ghostBadBtn} w-fit shrink-0 px-5 py-2.5`}
            >
              {clearing ? "Clearing…" : "Clear Forms & Re-upload"}
            </button>
          </div>
        ) : (
          <FileUpload
            variant="centered"
            multiple={false}
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls,.xlsm"
            title="Upload PDS (CS Form 212)"
            description="XLSX, PDF, DOCX or image · 2017 & 2026 editions · up to 10 MB"
            disabled={busy}
            value={uploadItems}
            onValueChange={setUploadItems}
            onFilesAdded={handleFilesAdded}
            onRemove={handleRemove}
            onRetry={retryItem}
          />
        )}
      </CollapsibleContent>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Clear all forms and re-upload?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This erases ALL of your profile information — personal details, education, work experience, training,
              eligibility, and awards — and marks your profile incomplete again. Your uploaded files stay for HR review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep my data</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void clearProfile();
              }}
              disabled={clearing}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              {clearing ? "Clearing…" : "Clear Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
