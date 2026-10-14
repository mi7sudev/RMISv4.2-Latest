"use client";

// ============================================================================
// RMIS — Profile builder · Section 02 Education (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (no update
// endpoints — §6.3). Course uses the official Combobox fed from
// /api/reference courses. AddEntryButton: dashed "Add additional entry" slot
// at the foot of the list — reachable at any list length.
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with entries on file the section opens as a quiet preview — the
// entry tiles render WITHOUT the per-row Edit/Delete cluster and without any
// Add affordance. Editing is an explicit session:
//   • "Edit Profile" reveals the row actions, the header Add button and the
//     foot dashed slot (mutations still persist immediately, per entry);
//   • "Done Editing" returns to the preview.
// An EMPTY section boots straight into edit mode (the inline first-entry form
// IS the add path) — there is nothing to preview yet, mirroring section 01's
// new-record boot. No draft state exists here, so the view-level unsaved
// navigation guard does not apply to this section.
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { Check, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
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
import { humanize } from "@/lib/client";
import { EDUCATION_LEVELS } from "@/lib/constants";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { useSectionMutations } from "./section-mutations";
import { SaveHint, useSavedFlash } from "./save-hint";
import type { EducationRow } from "./section-types";

export default function EducationSection({
  items,
  courses,
  onChanged,
}: {
  items: EducationRow[];
  courses: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, saved
  // flash, parent refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "educations",
    noun: "Education entry",
    onChanged,
    flashSaved,
  });

  // Shared field config — powers both the add/edit dialog and the inline
  // first-entry form shown while the section is empty (Task 25).
  const fields: FormFieldConfig[] = [
    {
      key: "educationLevel",
      label: "Education Level",
      type: "select",
      options: EDUCATION_LEVELS.map((l) => ({ value: l, label: l })),
    },
    {
      key: "course",
      label: "Course / Degree",
      type: "datalist",
      datalistOptions: courses,
      placeholder: "Start typing to see suggestions",
    },
    { key: "schoolName", label: "School Name", type: "text", required: true, full: true },
    { key: "yearFrom", label: "Year From", type: "text", placeholder: "YYYY" },
    { key: "yearTo", label: "Year To", type: "text", placeholder: "YYYY" },
    { key: "yearGraduated", label: "Year Graduated", type: "text", placeholder: "YYYY" },
    { key: "unitsEarned", label: "Units Earned", type: "text" },
    { key: "awards", label: "Awards / Honors Received", type: "text", full: true },
  ];

  const initial = editing
    ? {
        educationLevel: editing.educationLevel ?? "",
        course: editing.course ?? "",
        schoolName: editing.schoolName ?? "",
        yearFrom: editing.yearFrom ?? "",
        yearTo: editing.yearTo ?? "",
        yearGraduated: editing.yearGraduated ?? "",
        unitsEarned: editing.unitsEarned ?? "",
        awards: editing.awards ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    // On success the hook fires onSuccess right after the toast — the
    // dialog closes the moment the POST settles, BEFORE the refresh runs
    // (exact legacy ordering). On failure nothing closes: retry in place.
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
      icon={GraduationCap}
      chipTone="plum"
      title="Education"
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
                <Plus className="h-4 w-4" /> Add Education
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
          fields={fields}
          busy={busy}
          submitLabel="Add Education"
          onSubmit={save}
          title="Add your first education entry"
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="rounded-lg bg-cloud/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {row.educationLevel ? humanize(row.educationLevel) : "Education entry"}
                    {row.course ? `, ${row.course}` : ""}
                  </p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.schoolName ?? "-"}
                    {row.yearFrom || row.yearTo ? ` · ${row.yearFrom ?? "?"}–${row.yearTo ?? "Ongoing"}` : ""}
                    {row.yearGraduated ? ` · Graduated ${row.yearGraduated}` : ""}
                  </p>
                  {(row.unitsEarned || row.awards) && (
                    <p className="mt-0.5 text-xs text-stone">
                      {row.unitsEarned ? `Units: ${row.unitsEarned}` : ""}
                      {row.unitsEarned && row.awards ? " · " : ""}
                      {row.awards ? `Honors: ${row.awards}` : ""}
                    </p>
                  )}
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
                    aria-label="Delete education entry"
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
              however many entries exist (mirrors the header Add Education).
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
        title={editing ? "Edit Education" : "Add Education"}
        description="Entries are saved against your profile for MQR evaluation."
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={fields}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this education entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile.
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
