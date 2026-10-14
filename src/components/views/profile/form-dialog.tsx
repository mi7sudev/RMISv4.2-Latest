"use client";

// ============================================================================
// RMIS — Generic entity form dialog for profile sections 02–06 (spec §7.4).
// A field-config driven Dialog. Since Task 25 the field grid, seeding,
// values state and required-field validation live in the shared entry-form
// core (./entry-form) — the same core that powers the inline first-entry
// form on empty sections. Task 32 — submit follows the official SignUpForm
// touched timing through that core: the button is never disabled for gaps;
// clicking reveals every gap at once; a field's rule appears once it is
// left (onBlur) and clears the moment it is fixed. The submit button runs
// the official StatefulButton loading lifecycle. Binary questions
// (type "switch" / "checkbox") render the shared YesNoField.
// SAVE = delete + recreate is handled by the calling section; this dialog
// only collects values.
// Task 33 — the panel wears the OFFICIAL SignUpForm card anatomy: official
// header typography (text-xl tracking-tight + text-sm muted), the gap-5
// card rhythm and a full-width size="lg" StatefulButton submit (./beui-form
// tokens) on the dialog's existing white surface — same look as the
// sign-in/sign-up cards, bg color preserved.
// ============================================================================

import { cancelBtn } from "@/components/ui/buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatefulButton } from "@/components/motion/button";
import { cn } from "@/lib/utils";
import {
  BEUI_FORM_DESCRIPTION,
  BEUI_FORM_HEADER,
  BEUI_FORM_TITLE,
} from "./beui-form";
import {
  EntryFields,
  useEntryForm,
  type FormFieldConfig,
  type FormValue,
} from "./entry-form";

export type { FormFieldConfig, FormValue };

export default function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel = "Save",
  busy = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  fields: FormFieldConfig[];
  initial: Record<string, FormValue | undefined>;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (values: Record<string, FormValue>) => void | Promise<void>;
}) {
  const { values, set, visible, shown, touch, submit } = useEntryForm(fields, initial, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Task 33 — official card anatomy: rounded-3xl bordered white panel
          (bg preserved) with the SignUpForm gap-5 rhythm; the header uses
          the block's own title/description classes. */}
      <DialogContent
        className="max-h-[90dvh] w-full gap-5 overflow-y-auto scroll-thin rounded-3xl border border-border bg-white sm:max-w-2xl"
        ariaLabel={title}
      >
        <DialogHeader className={cn(BEUI_FORM_HEADER, "text-left")}>
          <DialogTitle className={BEUI_FORM_TITLE}>{title}</DialogTitle>
          {description && (
            <DialogDescription className={BEUI_FORM_DESCRIPTION}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <EntryFields fields={visible} values={values} shownError={shown} set={set} onBlurField={touch} />

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cancelBtn}
          >
            Cancel
          </button>
          <StatefulButton
            type="button"
            onClick={() => {
              const payload = submit();
              if (payload) void onSubmit(payload);
            }}
            size="lg"
            state={busy ? "loading" : "idle"}
            loadingText="Saving"
            className="w-full sm:flex-1"
          >
            {submitLabel}
          </StatefulButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
