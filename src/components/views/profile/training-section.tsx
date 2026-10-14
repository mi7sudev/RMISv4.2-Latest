"use client";

// ============================================================================
// RMIS — Profile builder · Section 04 Training (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// "Specify" field appears for Non-Technical / Others training types.
// AddEntryButton: dashed "Add additional entry" slot at the foot of the
// list — reachable at any list length.
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with entries on file the section opens as a quiet preview —
// entry tiles render WITHOUT the per-row Edit/Delete cluster and without any
// Add affordance. "Edit Profile" reveals the row actions, the header Add
// button and the foot dashed slot (mutations still persist immediately, per
// entry); "Done Editing" returns to the preview. An EMPTY section boots
// straight into edit mode (the inline first-entry form IS the add path) —
// there is nothing to preview yet, mirroring section 01's new-record boot.
// No draft state exists here, so the view-level unsaved navigation guard
// does not apply to this section.
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { BookOpen, Check, Pencil, Plus, Trash2 } from "lucide-react";
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
import { SectionCard } from "@/components/ui/shell";
import { ghostBadBtn, iconBtnBad, cancelBtn } from "@/components/ui/buttons";
import { formatDate } from "@/lib/client";
import { TRAINING_TYPES } from "@/lib/constants";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { useSectionMutations } from "./section-mutations";
import { SaveHint, useSavedFlash } from "./save-hint";
import { dateInput, type TrainingRow } from "./section-types";

const TRAINING_OPTIONS = [...TRAINING_TYPES, "Others"];

// Shared field config — powers both the add/edit dialog and the inline
// first-entry form shown while the section is empty (Task 25).
const FIELDS: FormFieldConfig[] = [
  { key: "title", label: "Title of Training", type: "text", required: true, full: true },
  {
    key: "typeOfTraining",
    label: "Type of Training",
    type: "select",
    options: TRAINING_OPTIONS.map((t) => ({ value: t, label: t })),
  },
  {
    key: "specifyTraining",
    label: "Specify",
    type: "text",
    showIf: (v) => v.typeOfTraining === "Non-Technical" || v.typeOfTraining === "Others",
  },
  { key: "numberHours", label: "Number of Hours", type: "number", placeholder: "0" },
  {
    key: "dateFrom",
    toKey: "dateTo",
    label: "Inclusive dates",
    type: "daterange",
    placeholder: "Select training period",
    full: true,
  },
];

export default function TrainingSection({
  items,
  onChanged,
}: {
  items: TrainingRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, saved
  // flash, parent refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "trainings",
    noun: "Training entry",
    onChanged,
    flashSaved,
  });

  const initial = editing
    ? {
        title: editing.title ?? "",
        typeOfTraining: editing.typeOfTraining ?? "",
        specifyTraining: editing.specifyTraining ?? "",
        numberHours: editing.numberHours ?? "",
        dateFrom: dateInput(editing.dateFrom),
        dateTo: dateInput(editing.dateTo),
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    // Dialog closes the moment the POST settles (hook onSuccess), BEFORE
    // the refresh runs — exact legacy ordering; failures keep it open.
    await saveEntry(values, editing, () => {
      setOpen(false);
      setEditing(null);
    });
  };

  const remove = (id: number) =>
    removeEntry(id, () => setDeleteId(null));

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      icon={BookOpen}
      chipTone="emerald"
      title="Training"
      description={
        editMode
          ? "Editing — entries save as you add or change them."
          : "Read-only preview — click Edit Profile to make changes."
      }
      actions={
        editMode ? (
          <div className="flex flex-wrap items-center gap-3">
            <SaveHint saving={busy} saved={savedFlash} />
            {/* Hidden while the section is empty — the inline first-entry form
                below IS the add path (Task 25). */}
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
                className="dlg-ghost inline-flex min-h-[44px] w-fit items-center gap-2 px-5 py-2.5 text-sm"
              >
                <Plus className="h-4 w-4" /> Add Training
              </button>
            )}
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
      {items.length === 0 ? (
        <InlineEntryForm
          fields={FIELDS}
          busy={busy}
          submitLabel="Add Training"
          onSubmit={save}
          title="Add your first training"
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="rounded-lg bg-cloud/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.title ?? "-"}</p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.typeOfTraining ?? "-"}
                    {row.specifyTraining ? ` (${row.specifyTraining})` : ""}
                    {row.numberHours != null ? ` · ${row.numberHours} hrs` : ""}
                    {row.dateFrom ? ` · ${formatDate(row.dateFrom)}` : ""}
                    {row.dateTo ? ` – ${formatDate(row.dateTo)}` : ""}
                  </p>
                </div>
                {/* Task 41 — row actions live behind the edit gate. */}
                {editMode && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    className="focus-ring min-h-[44px] px-3 text-xs font-medium text-stone underline-offset-4 hover:text-ink hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(row.id)}
                    aria-label="Delete training entry"
                    className={iconBtnBad}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                )}
              </div>
            </div>
          ))}
          {/* Add additional entry — always reachable at the foot of the list,
              however many entries exist (mirrors the header Add Training).
              Task 41: hidden in the read-only preview. */}
          {editMode && (
            <AddEntryButton
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            />
          )}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Training" : "Add Training"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={FIELDS}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this training entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile and may change your training-hours total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
