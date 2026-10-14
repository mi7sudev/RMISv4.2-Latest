"use client";

// ============================================================================
// RMIS — Profile builder · Section 05 Eligibility (spec §7.4). SELECT-first,
// spec-driven form: options come from the CSC eligibility registry merged
// with /api/reference eligibilities, plus "Others". Choosing a name reveals
// only its relevant fields via ELIGIBILITY_SPECS (exam → rating/date/place;
// license → + license no./validity; conferment → Date/Place of Conferment
// written to examDate/examPlace; Others → one free-text title). The title is
// required and stored verbatim so the MQR eligibility matcher can find it.
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

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { BadgeCheck, Check, Pencil, Plus, Trash2 } from "lucide-react";
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
import { CSC_ELIGIBILITY_REGISTRY, ELIGIBILITY_SPECS, canonicalEligibilityName } from "@/lib/constants";
import InlineEntryForm from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog, { type FormFieldConfig, type FormValue } from "./form-dialog";
import { useSectionMutations } from "./section-mutations";
import { SaveHint, useSavedFlash } from "./save-hint";
import type { EligibilityRow } from "./section-types";

const OTHERS = "Others";

type Kind = "exam" | "license" | "conferment" | "custom";

function kindFor(title: string): Kind {
  if (title === OTHERS) return "custom";
  return ELIGIBILITY_SPECS[title]?.kind ?? "exam";
}

function kindOfValue(values: Record<string, FormValue>): Kind {
  return kindFor(String(values.title ?? ""));
}

export default function EligibilitySection({
  items,
  referenceNames,
  onChanged,
}: {
  items: EligibilityRow[];
  referenceNames: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EligibilityRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedFlash, flashSaved] = useSavedFlash();
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, saved
  // flash, parent refresh, busy gating) lives in the shared deep module —
  // this section keeps only its domain concerns: the title validation and
  // the custom-title payload mapping below.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "eligibilities",
    noun: "Eligibility",
    onChanged,
    flashSaved,
  });

  // Registry ∪ reference (deduped CANONICALLY — case/whitespace variants of
  // a name collapse onto the first spelling, so draft vocabulary rows can
  // never mount a near-duplicate option) + Others.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const name of [...CSC_ELIGIBILITY_REGISTRY.map((r) => r.name), ...referenceNames]) {
      const key = canonicalEligibilityName(name);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(name);
      }
    }
    merged.push(OTHERS);
    return merged;
  }, [referenceNames]);

  const initial = editing
    ? {
        title: options.includes(editing.title) ? editing.title : OTHERS,
        customTitle: options.includes(editing.title) ? "" : editing.title,
        rating: editing.rating ?? "",
        examDate: editing.examDate ?? "",
        examPlace: editing.examPlace ?? "",
        licenseNumber: editing.licenseNumber ?? "",
        licenseValidity: editing.licenseValidity ?? "",
      }
    : {};

  const fields: FormFieldConfig[] = useMemo(
    () => [
      {
        key: "title",
        label: "Eligibility",
        type: "select",
        required: true,
        full: true,
        options: options.map((o) => ({ value: o, label: o })),
        helper: "Only the fields relevant to the selected eligibility appear.",
      },
      {
        key: "customTitle",
        label: "Specify Eligibility",
        type: "text",
        required: true,
        full: true,
        placeholder: "e.g. Career Service (Second Level), PD 907 grantee",
        showIf: (v) => kindOfValue(v) === "custom",
      },
      {
        key: "rating",
        label: "Rating",
        type: "text",
        placeholder: "e.g. 86.45",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license";
        },
      },
      {
        key: "examDate",
        label: "Exam Date",
        labelOf: (v) => (kindOfValue(v) === "conferment" ? "Date of Conferment" : "Exam Date"),
        type: "date",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license" || k === "conferment";
        },
      },
      {
        key: "examPlace",
        label: "Exam Place",
        labelOf: (v) => (kindOfValue(v) === "conferment" ? "Place of Conferment" : "Exam Place"),
        type: "text",
        showIf: (v) => {
          const k = kindOfValue(v);
          return k === "exam" || k === "license" || k === "conferment";
        },
      },
      {
        key: "licenseNumber",
        label: "License Number",
        type: "text",
        showIf: (v) => kindOfValue(v) === "license",
      },
      {
        key: "licenseValidity",
        label: "License Validity",
        type: "text",
        placeholder: "e.g. Valid until 2029 / Lifetime",
        showIf: (v) => kindOfValue(v) === "license",
      },
    ],
    [options]
  );

  const save = async (values: Record<string, FormValue>) => {
    // Domain concerns (validation + custom-title mapping) stay here; the
    // network orchestration is the shared deep module. Validation runs
    // BEFORE the hook sets busy — same observable gating as before.
    const isOthers = values.title === OTHERS;
    const title = String(isOthers ? (values.customTitle ?? "") : (values.title ?? "")).trim();
    if (!title) {
      toast.error("Eligibility title is required");
      return;
    }
    const payload = {
      title,
      rating: (values.rating as string) || null,
      examDate: (values.examDate as string) || null,
      examPlace: (values.examPlace as string) || null,
      licenseNumber: (values.licenseNumber as string) || null,
      licenseValidity: (values.licenseValidity as string) || null,
    };
    // Dialog closes the moment the POST settles (hook onSuccess), BEFORE
    // the refresh runs — exact legacy ordering; failures keep it open.
    await saveEntry(payload, editing, () => {
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
      icon={BadgeCheck}
      chipTone="gold"
      title="Eligibility"
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
                <Plus className="h-4 w-4" /> Add Eligibility
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
          submitLabel="Add Eligibility"
          onSubmit={save}
          title="Add your first eligibility"
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div key={row.id} className="rounded-lg bg-cloud/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.title}</p>
                  <p className="num mt-1 text-sm text-stone">
                    {row.rating ? `Rating ${row.rating} · ` : ""}
                    {row.examDate ? `Exam ${formatDate(row.examDate)}` : ""}
                    {row.examPlace ? ` · ${row.examPlace}` : ""}
                    {row.licenseNumber
                      ? `${row.rating || row.examDate ? " · " : ""}License ${row.licenseNumber}`
                      : ""}
                    {row.licenseValidity ? ` (${row.licenseValidity})` : ""}
                    {!row.rating && !row.examDate && !row.licenseNumber ? "Details not specified" : ""}
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
                    aria-label="Delete eligibility"
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
              however many entries exist (mirrors the header Add button).
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
        title={editing ? "Edit Eligibility" : "Add Eligibility"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={fields}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this eligibility?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry. Jobs requiring this eligibility may no longer match your profile.
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
