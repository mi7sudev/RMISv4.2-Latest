"use client";

// ============================================================================
// RMIS glue — Profile builder entry-form core (Task 25; Task 32 timing).
// Extracted from form-dialog.tsx so the SAME field renderer, seeding and
// required-field validation power BOTH the add/edit Dialog AND the inline
// first-entry form (InlineEntryForm) that renders directly on an empty
// section — new applicants see a fillable form instead of an "Add" dead-end.
//
// Task 32 — the error contract is now the OFFICIAL SignUpForm touched
// semantics: "flags a field only once it is left, then clears the moment it
// is fixed." Rules are derived on every render (validateEntry is a cheap
// pure function over the visible fields), touch(key) marks a field left
// (onBlur) so its rule becomes visible, touchAll() (submit) reveals every
// gap at once, and a corrected field's error clears instantly with no
// clearing code anywhere. The old submit-time error map + clear→60ms→
// re-apply re-arm dance is gone — it existed to compensate for the missing
// blur-touch onset. The vendored BEUI Input (src/components/motion/input)
// still supplies the shake + red ring + animated message; text/date/number/
// datalist/textarea fields reserve their error line like the auth pages.
// Select/daterange fields (no official error contract) keep the ShakeField
// submit-onset shake; Task 33 moves their triggers onto the official field
// tokens (h-11, border-border, transparent bg, destructive ring) so the whole
// grid reads as the sign-up family — the corner radius each official control
// pins inline stays its own. No vendored file is modified.
//
// Task 33 — container alignment: the inline first-entry form now wears the
// OFFICIAL SignUpForm card anatomy (rounded-3xl border border-border, gap-5
// rhythm, official header typography, full-width size="lg" StatefulButton,
// centered footer line) via the shared tokens in ./beui-form, while keeping
// its cloud/60 surface color. The dialog host (form-dialog.tsx) mirrors the
// same anatomy on its white surface.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { DateRangePickerDropdown } from "@/components/motion/date-range-picker";
import { StatefulButton } from "@/components/motion/button";
import { Combobox } from "@/components/motion/combobox";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Textarea } from "@/components/forms/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  BEUI_FIELD_FILL,
  BEUI_FORM_CARD,
  BEUI_FORM_DESCRIPTION,
  BEUI_FORM_FOOTER,
  BEUI_FORM_HEADER,
  BEUI_FORM_TITLE,
  BEUI_TRIGGER_BASE,
  BEUI_TRIGGER_ERROR,
} from "./beui-form";
import YesNoField from "./yes-no-field";

export type FormValue = string | number | boolean | null;

export type FormFieldConfig = {
  key: string;
  label: string;
  /** Dynamic label override computed from the current values (e.g. exam vs conferment wording). */
  labelOf?: (values: Record<string, FormValue>) => string;
  type: "text" | "date" | "number" | "textarea" | "select" | "switch" | "checkbox" | "datalist" | "daterange";
  /** Companion key for type "daterange" (the range's end date, e.g. dateTo). */
  toKey?: string;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: { value: string; label: string }[];
  datalistOptions?: string[];
  showIf?: (values: Record<string, FormValue>) => boolean;
  disabledIf?: (values: Record<string, FormValue>) => boolean;
  /** Full-width field in the 2-column grid. */
  full?: boolean;
};

const NONE = "__none__";

/** Values map → official DateRange | null (from required, to optional). */
function buildRange(from: FormValue, to: FormValue) {
  const start = typeof from === "string" && from !== "" ? from : "";
  if (!start) return null;
  return { from: start, to: typeof to === "string" && to !== "" ? to : undefined };
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label className="mb-1.5 block text-xs font-medium text-stone">
      {label}
      {required && <span className="text-dusty-rose"> *</span>}
    </Label>
  );
}

// ── Validation / payload ────────────────────────────────────────────────────

function requiredMessage(f: FormFieldConfig): string {
  return f.type === "select" ? `Select ${f.label.toLowerCase()}.` : `${f.label} is required.`;
}

/** Visible required fields → per-field message map (signup-form tone). */
export function validateEntry(
  fields: FormFieldConfig[],
  values: Record<string, FormValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.key];
    if (f.type === "switch" || f.type === "checkbox") {
      if (v !== true) errors[f.key] = requiredMessage(f);
    } else if (typeof v !== "string" || v.trim() === "") {
      errors[f.key] = requiredMessage(f);
    }
  }
  return errors;
}

/** Values map → API payload (number → number|null, daterange copies its end key). */
export function buildEntryPayload(
  fields: FormFieldConfig[],
  values: Record<string, FormValue>,
): Record<string, FormValue> {
  const payload: Record<string, FormValue> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === "number") payload[f.key] = v === "" || v == null ? null : Number(v);
    else payload[f.key] = v;
    if (f.type === "daterange" && f.toKey) payload[f.toKey] = values[f.toKey];
  }
  return payload;
}

/** `initial` row → flat string/boolean values map (the dialog's seed loop). */
export function seedEntryValues(
  fields: FormFieldConfig[],
  initial: Record<string, FormValue | undefined>,
): Record<string, FormValue> {
  const seeded: Record<string, FormValue> = {};
  for (const f of fields) {
    const v = initial[f.key];
    if (f.type === "switch" || f.type === "checkbox") seeded[f.key] = v === true;
    else seeded[f.key] = v == null ? "" : String(v);
    if (f.type === "daterange" && f.toKey) {
      const end = initial[f.toKey];
      seeded[f.toKey] = end == null ? "" : String(end);
    }
  }
  return seeded;
}

// ── State hook (shared by the dialog and the inline form) ───────────────────

export function useEntryForm(
  fields: FormFieldConfig[],
  initial: Record<string, FormValue | undefined>,
  active: boolean,
) {
  const [values, setValues] = useState<Record<string, FormValue>>({});
  // Official SignUpForm touched state (Task 32): a field's rule becomes
  // visible once it has been left (touch on blur) or the form was submitted
  // (touchAll) — and the derived rules make it vanish the moment it is fixed.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // Seed each time the host becomes active (dialog opens / inline mounts).
  // fields/initial are owned by the host and only meaningful at activation:
  // the inline form mounts fresh, the dialog opens after its edit target
  // is committed — re-seeding on their identity would clobber in-flight
  // typing, so only `active` gates the effect. Re-seeding also resets the
  // touched/submitted state so a fresh form starts clean.
  useEffect(() => {
    if (!active) return;
    setValues(seedEntryValues(fields, initial));
    setTouched({});
    setSubmitted(false);
  }, [active]);

  const set = (key: string, value: FormValue) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-clear behaviour hooks (e.g. isPresentWork clears dateTo).
      if (key === "isPresentWork" && value === true) next.dateTo = "";
      return next;
    });
  };

  const visible = useMemo(
    () => fields.filter((f) => !f.showIf || f.showIf(values)),
    [fields, values]
  );

  // Derived rules on EVERY render (Task 32 — official SignUpForm semantics):
  // an error clears the moment its field is fixed, with no clearing code.
  const errs = useMemo(() => validateEntry(visible, values), [visible, values]);

  const touch = useCallback((key: string) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const touchAll = useCallback(() => setSubmitted(true), []);

  /** Error to render — hidden until the field has been left or submitted. */
  const shown = useCallback(
    (key: string) => (touched[key] || submitted ? errs[key] : undefined),
    [touched, submitted, errs]
  );

  /** Touch everything, then return the payload — or null once every gap is
   *  revealed (official SignUpForm submit: all errors appear at once). */
  const submit = (): Record<string, FormValue> | null => {
    touchAll();
    const errsNow = validateEntry(visible, values);
    if (Object.keys(errsNow).length > 0) return null;
    return buildEntryPayload(visible, values);
  };

  return { values, set, visible, shown, touch, touchAll, submit };
}

// ── ShakeField — select/daterange error contract ────────────────────────────

/** Shake + error line for fields that don't own the official error contract
 *  (select, daterange). Same keyframes/duration/message-anatomy as the
 *  vendored Input so mixed grids move and read alike. The message area
 *  reserves one line (min-h-4) exactly like the official reserveErrorLine
 *  contract, so revealing a select's rule never shifts the grid. */
export function ShakeField({ error, children }: { error?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || reduce || !error) return;
    animate(ref.current, { x: [0, -6, 6, -4, 4, -2, 0] }, { duration: 0.45 });
  }, [error, reduce]);

  return (
    <div>
      <div ref={ref}>{children}</div>
      <div className="min-h-4">
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              role="alert"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.2 }}
              className="px-1 text-xs text-destructive"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── EntryFields — the shared field grid ─────────────────────────────────────

export function EntryFields({
  fields,
  values,
  shownError,
  set,
  onBlurField,
}: {
  fields: FormFieldConfig[];
  values: Record<string, FormValue>;
  /** Task 32 — live per-field error (undefined until the field was left or
   *  the form submitted; derived rules make it clear itself once fixed). */
  shownError: (key: string) => string | undefined;
  set: (key: string, value: FormValue) => void;
  /** Marks a field left (onBlur) so its rule becomes visible — auth timing. */
  onBlurField?: (key: string) => void;
}) {
  // Official auth rhythm (Task 33): the reserved error line under every
  // field supplies the row spacing, exactly like the sign-up fields column
  // (gap-1 between reserved fields) — grid columns stay gap-x-3 apart.
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
      {fields.map((f) => {
        const value = values[f.key];
        const disabled = f.disabledIf?.(values) ?? false;
        const label = f.labelOf ? f.labelOf(values) : f.label;
        const err = shownError(f.key);
        // Hoisted so the daterange closure below keeps the string type
        // (TS can't preserve narrowing of f.toKey inside a callback).
        const toKey = f.toKey;
        return (
          <div key={f.key} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
            {/* Converted fields (text/date/number/datalist/textarea) draw
                their own BEUI label; the shared FieldLabel remains only for
                the unconverted select/daterange fields. */}
            {(f.type === "select" || f.type === "daterange") && (
              <FieldLabel label={label} required={f.required} />
            )}

            {(f.type === "text" || f.type === "date" || f.type === "number") && (
              <Input
                type={f.type}
                label={f.required ? `${label} *` : label}
                value={typeof value === "string" ? value : ""}
                placeholder={f.placeholder}
                disabled={disabled}
                error={err}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
                onChange={(next) => set(f.key, next)}
                onBlur={() => onBlurField?.(f.key)}
              />
            )}

            {f.type === "datalist" && (
              /* Type-or-pick field rendered by the official Combobox (same
                 trigger/panel family as the Select) instead of the native
                 browser datalist — ONE dropdown UI across every role. */
              <Combobox
                label={f.required ? `${label} *` : label}
                value={typeof value === "string" ? value : ""}
                onValueChange={(next) => set(f.key, next)}
                options={(f.datalistOptions ?? []).map((o) => ({ value: o, label: o }))}
                placeholder={f.placeholder}
                disabled={disabled}
                error={err}
                reserveErrorLine
                triggerClassName={BEUI_FIELD_FILL}
                contentClassName="z-[60]"
              />
            )}

            {f.type === "textarea" && (
              <Textarea
                label={f.required ? `${label} *` : label}
                value={typeof value === "string" ? value : ""}
                placeholder={f.placeholder}
                disabled={disabled}
                error={err}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
                onChange={(next) => set(f.key, next)}
                onBlur={() => onBlurField?.(f.key)}
              />
            )}

            {/* Official BEUI Date Range Picker — used for from/to date
                pairs (work experience, training). `to` is optional, so an
                open range (e.g. "currently employed") is representable. */}
            {f.type === "daterange" && toKey && (
              <ShakeField error={err}>
                <DateRangePickerDropdown
                  className="flex w-full"
                  label={label}
                  value={buildRange(values[f.key], values[toKey])}
                  onValueChange={(range) => {
                    set(f.key, range?.from ?? "");
                    set(toKey, range?.to ?? "");
                  }}
                  placeholder={f.placeholder ?? "Select dates"}
                  disabled={disabled}
                  triggerClassName={cn(
                    BEUI_TRIGGER_BASE,
                    "justify-start px-3.5 text-sm",
                    err && BEUI_TRIGGER_ERROR
                  )}
                />
              </ShakeField>
            )}

            {f.type === "select" && (
              <ShakeField error={err}>
                <Select
                  className="w-full"
                  value={typeof value === "string" && value !== "" ? value : NONE}
                  onValueChange={(v) => set(f.key, v === NONE ? "" : v)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className={cn(BEUI_TRIGGER_BASE, err && BEUI_TRIGGER_ERROR)}
                  >
                    <span className="sr-only">{label}</span>
                    <SelectValue placeholder={f.placeholder ?? "Select…"} />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    {(f.options ?? []).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={NONE} className="text-stone">
                      Not specified
                    </SelectItem>
                  </SelectContent>
                </Select>
              </ShakeField>
            )}

            {(f.type === "switch" || f.type === "checkbox") && (
              <YesNoField
                label={label}
                required={f.required}
                disabled={disabled}
                value={value === true}
                onChange={(v) => set(f.key, v)}
              />
            )}

            {f.helper && <p className="mt-1 text-xs text-body-gray">{f.helper}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── InlineEntryForm — first-entry form rendered directly on empty sections ──

export default function InlineEntryForm({
  fields,
  busy = false,
  submitLabel = "Save entry",
  onSubmit,
  title = "Add your first entry",
}: {
  fields: FormFieldConfig[];
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (values: Record<string, FormValue>) => void | Promise<void>;
  title?: string;
  description?: string;
}) {
  const { values, set, visible, shown, touch, submit } = useEntryForm(fields, {}, true);

  // Task 33 — OFFICIAL SignUpForm card anatomy: rounded-3xl bordered card,
  // gap-5 rhythm, official header typography, full-width size="lg"
  // StatefulButton, centered footer line (./beui-form tokens). The cloud/60
  // surface color is preserved per the brief — the one sanctioned deviation
  // from the auth card, which sits on the white canvas.
  return (
    <div className={cn(BEUI_FORM_CARD, "bg-cloud/60 p-4 sm:p-6")}>
      <div className={BEUI_FORM_HEADER}>
        <p className={BEUI_FORM_TITLE}>{title}</p>
        <p className={BEUI_FORM_DESCRIPTION}>
          Fill it in here and press save — no dialog needed.
        </p>
      </div>

      <EntryFields fields={visible} values={values} shownError={shown} set={set} onBlurField={touch} />

      <StatefulButton
        type="button"
        onClick={() => {
          const payload = submit();
          if (payload) void onSubmit(payload);
        }}
        size="lg"
        state={busy ? "loading" : "idle"}
        loadingText="Saving"
        className="w-full"
      >
        {submitLabel}
      </StatefulButton>

      <p className={BEUI_FORM_FOOTER}>
        Fields marked <span className="text-dusty-rose">*</span> are required.
      </p>
    </div>
  );
}
