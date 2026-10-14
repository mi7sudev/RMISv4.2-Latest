"use client";

// ============================================================================
// RMIS — Profile builder · Section 01 Personal Information (spec §7.4).
// 4 disclosure groups with "X of N completed" micro-labels: Identity,
// Address, Legal Disclosures (conditional detail fields), Character
// References (1–5 rows; empty-name rows filtered at save).
// Task 40 — READ-ONLY PREVIEW BY DEFAULT (user request): the section opens
// as a quiet preview of the SAVED record — plain label/value rows inside the
// same four disclosure groups (never disabled inputs). Editing is an
// explicit session:
//   • "Edit Profile" swaps the preview for the form and seeds the draft
//     from the freshest server profile;
//   • "Save Changes" validates through the Task 32 auth timing, persists,
//     toasts, reloads the parent profile and returns to the preview (with a
//     short "Saved ✓" flash in the header);
//   • "Cancel" returns to the preview — when the draft is dirty it asks
//     first, because in this model autosave is retired: with a Cancel
//     affordance, silent persistence would make "discard" a lie. The view
//     layer (profile-view) additionally guards section navigation while
//     unsaved edits exist via onUnsavedChange.
// A brand-new record (no first name + last name + email yet) boots straight
// into edit mode — there is nothing to preview yet — so first-time
// applicants still land directly on the form.
// BEUI field pass (Task 32/33, unchanged): text fields render the official
// capsule Input (src/components/motion/input), the case-details textarea the
// glue Textarea, selects keep the official BEUI Select on the shared
// beui-form tokens; the Save Changes button runs the official StatefulButton
// loading lifecycle.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { Mail, MapPin, Pencil, Phone, Plus, Scale, User, UserRound, Users } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { CIVIL_STATUS_OPTIONS } from "@/lib/constants";
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
import { cancelBtn, ghostBadBtn } from "@/components/ui/buttons";
import { useAuthErrors, isEmailShape } from "@/components/forms/field-errors";
import { StatefulButton } from "@/components/motion/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleTrigger,
} from "@/components/motion/collapsible";
import { Input } from "@/components/motion/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/forms/textarea";
import { cn } from "@/lib/utils";
import YesNoField from "./yes-no-field";
import { SaveHint, useSavedFlash } from "./save-hint";
import {
  BEUI_FIELD_FILL,
  BEUI_FIELD_LABEL,
  BEUI_TRIGGER_BASE,
} from "./beui-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import type { ApplicantProfile, CharacterReference } from "./section-types";

// ── Draft model ─────────────────────────────────────────────────────────────

type PersonalForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  extensionName: string;
  emailAddress: string;
  mobileNumber: string;
  contactNumber: string;
  birthDate: string;
  birthPlace: string;
  gender: string;
  civilStatus: string;
  citizenship: string;
  ethnicity: string;
  isPwd: boolean;
  presentAddress: string;
  houseNumber: string;
  street: string;
  subdivision: string;
  barangay: string;
  city: string;
  province: string;
  country: string;
  zipCode: string;
  isGovernment: boolean;
  adminCase: boolean;
  adminCaseDetails: string;
  crimeCharge: boolean;
  crimeDate: string;
  crimeCaseStatus: string;
};

const EMPTY_FORM: PersonalForm = {
  firstName: "", middleName: "", lastName: "", extensionName: "",
  emailAddress: "", mobileNumber: "", contactNumber: "",
  birthDate: "", birthPlace: "", gender: "", civilStatus: "", citizenship: "", ethnicity: "",
  isPwd: false,
  presentAddress: "", houseNumber: "", street: "", subdivision: "", barangay: "",
  city: "", province: "", country: "", zipCode: "",
  isGovernment: false, adminCase: false, adminCaseDetails: "",
  crimeCharge: false, crimeDate: "", crimeCaseStatus: "",
};

const EMPTY_REF: CharacterReference = { name: "", title: "", company: "", companyAddress: "", email: "", contact: "" };

const IDENTITY_FIELDS: (keyof PersonalForm)[] = [
  "firstName", "middleName", "lastName", "extensionName", "emailAddress", "mobileNumber",
  "contactNumber", "birthDate", "birthPlace", "gender", "civilStatus", "citizenship", "ethnicity",
];
const ADDRESS_FIELDS: (keyof PersonalForm)[] = [
  "presentAddress", "houseNumber", "street", "subdivision", "barangay", "city", "province", "country", "zipCode",
];

function seedForm(p: ApplicantProfile | null): PersonalForm {
  if (!p) return { ...EMPTY_FORM };
  return {
    firstName: p.firstName ?? "",
    middleName: p.middleName ?? "",
    lastName: p.lastName ?? "",
    extensionName: p.extensionName ?? "",
    emailAddress: p.emailAddress ?? "",
    mobileNumber: p.mobileNumber ?? "",
    contactNumber: p.contactNumber ?? "",
    birthDate: p.birthDate ?? "",
    birthPlace: p.birthPlace ?? "",
    gender: p.gender ?? "",
    civilStatus: p.civilStatus ?? "",
    citizenship: p.citizenship ?? "",
    ethnicity: p.ethnicity ?? "",
    isPwd: p.isPwd === true,
    presentAddress: p.presentAddress ?? "",
    houseNumber: p.houseNumber ?? "",
    street: p.street ?? "",
    subdivision: p.subdivision ?? "",
    barangay: p.barangay ?? "",
    city: p.city ?? "",
    province: p.province ?? "",
    country: p.country ?? "",
    zipCode: p.zipCode ?? "",
    isGovernment: p.isGovernment === true,
    adminCase: p.adminCase === true,
    adminCaseDetails: p.adminCaseDetails ?? "",
    crimeCharge: p.crimeCharge === true,
    crimeDate: p.crimeDate ?? "",
    crimeCaseStatus: p.crimeCaseStatus ?? "",
  };
}

function filledCount(form: PersonalForm, keys: (keyof PersonalForm)[]): number {
  return keys.filter((k) => typeof form[k] === "string" && (form[k] as string).trim() !== "").length;
}

// ── Preview primitives (Task 40) ────────────────────────────────────────────

/** ISO date (YYYY-MM-DD, or a full ISO datetime) → "May 12, 1990".
 *  Unparseable input falls back to the raw string. */
function formatDate(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (raw === "") return "";
  const iso = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function PreviewRow({
  label, value, full,
}: {
  label: string; value: string | null | undefined; full?: boolean;
}) {
  const text = (value ?? "").trim();
  return (
    <div className={cn("min-w-0", full && "sm:col-span-2")}>
      <p className="px-1 text-xs font-medium text-stone">{label}</p>
      <p className="mt-0.5 min-h-[20px] break-words px-1 text-sm leading-relaxed text-ink">
        {text !== "" ? (
          text
        ) : (
          <>
            <span aria-hidden="true" className="text-stone/40">—</span>
            <span className="sr-only">Not provided</span>
          </>
        )}
      </p>
    </div>
  );
}

function PreviewYesNo({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="min-w-0">
      <p className="px-1 text-xs font-medium text-stone">{label}</p>
      <p className={cn("mt-0.5 px-1 text-sm", value ? "font-medium text-ink" : "text-stone")}>
        {value ? "Yes" : "No"}
      </p>
    </div>
  );
}

/** Read-only character reference card — name leads, only the filled rows show. */
function RefPreviewCard({ reference, index }: { reference: CharacterReference; index: number }) {
  const rows: { label: string; value?: string | null }[] = [
    { label: "Title / Position", value: reference.title },
    { label: "Company", value: reference.company },
    { label: "Company Address", value: reference.companyAddress },
    { label: "Email", value: reference.email },
    { label: "Contact No.", value: reference.contact },
  ];
  const filled = rows.filter((r) => (r.value ?? "").trim() !== "");
  return (
    <div className="rounded-3xl border border-border bg-white/80 p-4">
      <p className="text-xs font-medium text-stone">
        Reference <span className="num">{index + 1}</span>
      </p>
      <p className="mt-1 break-words px-1 text-sm font-medium text-ink">{reference.name}</p>
      {filled.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 border-t border-divider pt-2 sm:grid-cols-2">
          {filled.map((r) => (
            <PreviewRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small field primitives (edit mode) ──────────────────────────────────────

// Task 33 — official SignUpForm tokens: the select label uses the exact
// field-label grammar the official Input renders; the select trigger uses
// the official field tokens (h-11 capsule height, border-border, white fill
// — visible on the cloud/60 groups — the trigger's corner radius stays the
// official Select's own).
const labelCls = BEUI_FIELD_LABEL;
const inputCls = BEUI_TRIGGER_BASE;
const NONE = "__none__";

function TextField({
  label, required, helper, value, onChange, type = "text", placeholder, error, icon, onBlur,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  onChange: (v: string) => void; type?: string; placeholder?: string; error?: string;
  icon?: ReactNode; onBlur?: () => void;
}) {
  return (
    <div>
      {/* Official BEUI Input renders its own label; required fields get a
          trailing " *" (the official label prop is a plain string). Passing
          `error` arms the official shake + red ring + message; every field
          reserves its error line (auth rhythm). `icon` renders the official
          left-icon capsule; onBlur passthrough drives the Task 32 touch. */}
      <Input
        type={type}
        label={required ? `${label} *` : label}
        value={value}
        placeholder={placeholder}
        error={error}
        reserveErrorLine
        leftIcon={icon}
        classNames={{ field: BEUI_FIELD_FILL }}
        onChange={onChange}
        onBlur={onBlur}
      />
      {helper && <p className="mt-1 text-xs text-body-gray">{helper}</p>}
    </div>
  );
}

function SelectField({
  label, required, helper, value, options, onChange,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className={labelCls}>
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </Label>
      {/* Official BEUI Select on the official field tokens (Task 33) —
          items must carry plain-string children so the trigger label
          registration resolves (span child = raw value shown). */}
      <Select value={value !== "" ? value : NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className={inputCls}>
          <span className="sr-only">{label}</span>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value={NONE} className="text-stone">
            Not specified
          </SelectItem>
        </SelectContent>
      </Select>
      {helper && <p className="mt-1 text-xs text-body-gray">{helper}</p>}
    </div>
  );
}

/** Collapsible disclosure group — icon + title + "X of N" count + chevron,
 *  content in a cloud-tint sub-panel. Compact default: all open. */
function CollapsibleGroup({
  icon: Icon,
  title,
  done,
  total,
  required = false,
  children,
  defaultOpen = true,
}: {
  icon: typeof UserRound;
  title: string;
  done: number;
  total: number;
  /** MOM 2026-10-13 — renders the red required asterisk after the title. */
  required?: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Task 33 — the group is a SignUpForm-shaped card: rounded-3xl bordered,
  // cloud/60 surface preserved.
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-3xl border border-border bg-cloud/60">
      <CollapsibleTrigger
        render={<button className="flex min-h-[44px] w-full items-center gap-2.5 p-3.5 text-left transition-colors hover:bg-white/60" />}
      >
        <Icon className="h-4 w-4 shrink-0 text-stone" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {title}
          {required && (
            <span className="ml-1 text-[var(--bad)]" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </span>
        <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-stone">
          <span className="num">{done}</span>/<span className="num">{total}</span>
        </span>
        <CollapsibleIndicator className="text-stone" />
      </CollapsibleTrigger>
      <CollapsibleContent contentClassName="border-t border-divider p-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function RefRow({
  index, reference, onChange, onRemove, canRemove,
}: {
  index: number; reference: CharacterReference; onChange: (patch: Partial<CharacterReference>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const fields: { key: keyof CharacterReference; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "title", label: "Title / Position" },
    { key: "company", label: "Company" },
    { key: "companyAddress", label: "Company Address" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact", label: "Contact No." },
  ];
  return (
    <div className="rounded-3xl border border-border bg-white/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-stone">Reference <span className="num">{index + 1}</span></p>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="focus-ring min-h-[44px] px-3 text-xs text-stone underline-offset-4 hover:text-[var(--bad)] hover:underline disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {fields.map((f) => (
          <Input
            key={f.key}
            type={f.type ?? "text"}
            label={f.label}
            value={(reference[f.key] as string | null) ?? ""}
            reserveErrorLine
            onChange={(next) => onChange({ [f.key]: next })}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main section ────────────────────────────────────────────────────────────

export default function PersonalInfoSection({
  profile,
  seed,
  refreshSession,
  onChanged,
  onUnsavedChange,
}: {
  profile: ApplicantProfile | null;
  /** Bump to force a re-seed from the server profile (after PDS auto-apply / clear). */
  seed: number;
  refreshSession: () => Promise<unknown>;
  /** Silent parent reload — fired after a successful save so the preview
   *  renders the server truth, not the pre-save snapshot. */
  onChanged?: () => void | Promise<void>;
  /** Reports whether leaving the section right now would drop unsaved edits
   *  (the view-level navigation guard). Reports false on unmount. */
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  // Task 40 — a brand-new record boots straight into edit mode (nothing to
  // preview yet); an existing record opens as the read-only preview.
  const [editing, setEditing] = useState(() => {
    const p = profile;
    if (!p) return true;
    return (
      (p.firstName ?? "").trim() === "" &&
      (p.lastName ?? "").trim() === "" &&
      (p.emailAddress ?? "").trim() === ""
    );
  });
  const [form, setForm] = useState<PersonalForm>(EMPTY_FORM);
  const [refs, setRefs] = useState<CharacterReference[]>([{ ...EMPTY_REF }]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedFlash, flashSaved] = useSavedFlash();
  const formRef = useRef(form);
  const refsRef = useRef(refs);
  const seededToken = useRef<string>("");

  // Keep latest-value refs in sync after commit (never during render).
  useEffect(() => {
    formRef.current = form;
    refsRef.current = refs;
  }, [form, refs]);

  // Seed (and re-seed on `seed` bumps — PDS auto-apply replaces the record)
  // from the loaded profile. Never re-seeds on plain profile updates, so an
  // in-progress edit session is never clobbered by a silent reload.
  useEffect(() => {
    if (!profile) return;
    const token = `${seed}`;
    if (seededToken.current === token) return;
    seededToken.current = token;
    setForm(seedForm(profile));
    const list = Array.isArray(profile.characterReferences) ? profile.characterReferences : [];
    setRefs(list.length > 0 ? list.map((r) => ({ ...EMPTY_REF, ...r })) : [{ ...EMPTY_REF }]);
    setSaveState("idle");
  }, [profile, seed]);

  // Task 32 — official SignUpForm timing: rules are derived on EVERY render
  // (an error clears the moment its field is fixed); `shown` reveals a rule
  // only once the field has been left (onBlur) or Save Changes was pressed.
  // Typed over ALL PersonalForm keys (not just the ones with rules) so the
  // blur touch covers every field in the section.
  // MOM 2026-10-13 — Email Address and Mobile Number are ALWAYS required
  // (email must also be a valid address shape).
  const rules: Partial<Record<keyof PersonalForm, string>> = {
    firstName: form.firstName.trim() === "" ? "First Name is required." : undefined,
    lastName: form.lastName.trim() === "" ? "Last Name is required." : undefined,
    emailAddress:
      form.emailAddress.trim() === ""
        ? "Email Address is required."
        : !isEmailShape(form.emailAddress.trim())
          ? "Enter a valid email address."
          : undefined,
    mobileNumber: form.mobileNumber.trim() === "" ? "Mobile Number is required." : undefined,
    ...(form.adminCase && form.adminCaseDetails.trim() === ""
      ? { adminCaseDetails: "Describe the administrative case to continue." }
      : {}),
  };
  const { shown, touch, touchAll, reset, hasGaps } = useAuthErrors(rules);

  /** Explicit-save model (Task 40): edits only mark the draft dirty —
   *  persistence happens exclusively through Save Changes. */
  const markDirty = useCallback(() => setSaveState("dirty"), []);

  const save = useCallback(
    async () => {
      setSaveState("saving");
      try {
        const payload: Record<string, string | boolean | CharacterReference[]> = {
          ...formRef.current,
          characterReferences: refsRef.current
            .map((r) => ({
              name: (r.name ?? "").trim(),
              title: (r.title ?? "").trim(),
              company: (r.company ?? "").trim(),
              companyAddress: (r.companyAddress ?? "").trim(),
              email: (r.email ?? "").trim(),
              contact: (r.contact ?? "").trim(),
            }))
            .filter((r) => r.name !== ""), // empty-name rows filtered at save (§7.4)
        };
        await apiFetch("/api/applicant/profile", { method: "PUT", body: payload });
        setSaveState("saved");
        toast.success("Profile changes saved");
        await refreshSession();
        // Reload the parent profile BEFORE leaving edit mode so the preview
        // renders the freshly saved record, not the stale snapshot.
        await onChanged?.();
        flashSaved();
        setEditing(false);
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Save failed. Please try again");
      }
    },
    [refreshSession, onChanged, flashSaved]
  );

  /** Manual save — Task 32 official SignUpForm timing: Save Changes reveals
   *  every gap at once (touchAll) and the save only proceeds when the live
   *  rules are clean; correcting a field clears its rule instantly. */
  const saveManual = useCallback(() => {
    touchAll();
    if (hasGaps) return;
    void save();
  }, [touchAll, hasGaps, save]);

  // ── Edit-session lifecycle (Task 40) ──────────────────────────────────────

  const enterEdit = useCallback(() => {
    if (!profile) return;
    // Seed the draft from the freshest server profile (NOT the stale local
    // form) so every edit session starts from the saved record.
    setForm(seedForm(profile));
    const list = Array.isArray(profile.characterReferences) ? profile.characterReferences : [];
    setRefs(list.length > 0 ? list.map((r) => ({ ...EMPTY_REF, ...r })) : [{ ...EMPTY_REF }]);
    seededToken.current = String(seed); // keep the seed effect from re-firing
    setSaveState("idle");
    reset();
    setEditing(true);
  }, [profile, seed, reset]);

  const exitEdit = useCallback(() => {
    setDiscardOpen(false);
    setEditing(false);
    setSaveState("idle");
    reset();
  }, [reset]);

  /** Cancel — instant exit when the draft is clean; confirm before discarding
   *  real edits. */
  const cancelEdit = useCallback(() => {
    if (saveState === "dirty" || saveState === "error") {
      setDiscardOpen(true);
      return;
    }
    exitEdit();
  }, [saveState, exitEdit]);

  // ── Unsaved-changes reporting for the view-level navigation guard ─────────

  const unsaved = editing && (saveState === "dirty" || saveState === "error");
  const unsavedCbRef = useRef(onUnsavedChange);
  useEffect(() => {
    unsavedCbRef.current = onUnsavedChange;
  });
  useEffect(() => {
    unsavedCbRef.current?.(unsaved);
  }, [unsaved]);
  // Leaving the section (section swap / route change) always clears the guard.
  useEffect(
    () => () => {
      unsavedCbRef.current?.(false);
    },
    []
  );

  const set = useCallback(
    <K extends keyof PersonalForm>(key: K, value: PersonalForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      markDirty();
    },
    [markDirty]
  );

  // ── View model: edit sessions render the draft; preview renders the
  //    server record (seedForm over the profile prop) so both modes share
  //    the same counts/conditionals. ────────────────────────────────────────
  const view = editing ? form : seedForm(profile);
  const namedRefs = (editing
    ? refs
    : Array.isArray(profile?.characterReferences)
      ? profile!.characterReferences!
      : []
  ).filter((r) => (r.name ?? "").trim() !== "");

  const identityDone = filledCount(view, IDENTITY_FIELDS);
  const addressDone = filledCount(view, ADDRESS_FIELDS);
  const legalTotal = 2 + (view.adminCase ? 1 : 0) + (view.crimeCharge ? 2 : 0);
  const legalDone =
    2 +
    (view.adminCase && view.adminCaseDetails.trim() !== "" ? 1 : 0) +
    (view.crimeCharge && view.crimeDate.trim() !== "" ? 1 : 0) +
    (view.crimeCharge && view.crimeCaseStatus.trim() !== "" ? 1 : 0);

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      icon={UserRound}
      chipTone="slate"
      title="Personal Information"
      description={
        editing
          ? "Editing — your changes apply when you save."
          : "Read-only preview — click Edit Profile to make changes."
      }
      actions={
        editing ? (
          <div className="flex flex-wrap items-center gap-3">
            <SaveHint
              saving={saveState === "saving"}
              saved={false}
              dirty={saveState === "dirty"}
              error={saveState === "error" ? "Save failed. Click Save Changes" : undefined}
            />
            <button type="button" onClick={cancelEdit} className={cancelBtn}>
              Cancel
            </button>
            <StatefulButton
              type="button"
              onClick={saveManual}
              state={saveState === "saving" ? "loading" : "idle"}
              loadingText="Saving"
              className="min-h-[44px] px-5 py-2.5 text-sm"
            >
              Save Changes
            </StatefulButton>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Transient "Saved ✓" right after a successful save. */}
            <SaveHint saving={false} saved={savedFlash} />
            <button
              type="button"
              onClick={enterEdit}
              className="dlg-cta focus-ring inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
            </button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        {editing ? (
          <>
            {/* Group 1 — Identity (edit) */}
            <CollapsibleGroup icon={UserRound} title="Identity" done={identityDone} total={IDENTITY_FIELDS.length}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <TextField label="First Name" required placeholder="e.g. Juan" icon={<User />} value={form.firstName} error={shown("firstName")} onChange={(v) => set("firstName", v)} onBlur={() => touch("firstName")} />
                <TextField label="Middle Name" icon={<User />} value={form.middleName} onChange={(v) => set("middleName", v)} onBlur={() => touch("middleName")} />
                <TextField label="Last Name" required placeholder="e.g. Dela Cruz" icon={<User />} value={form.lastName} error={shown("lastName")} onChange={(v) => set("lastName", v)} onBlur={() => touch("lastName")} />
                <TextField
                  label="Extension Name"
                  helper="e.g. Jr., Sr., III"
                  icon={<User />}
                  value={form.extensionName}
                  onChange={(v) => set("extensionName", v)}
                  onBlur={() => touch("extensionName")}
                />
                <TextField
                  label="Email Address"
                  required
                  type="email"
                  helper="Interview invites are sent to this address"
                  icon={<Mail />}
                  value={form.emailAddress}
                  error={shown("emailAddress")}
                  onChange={(v) => set("emailAddress", v)}
                  onBlur={() => touch("emailAddress")}
                />
                <TextField
                  label="Mobile Number"
                  required
                  type="tel"
                  helper="09XXXXXXXXX — notices are also sent here"
                  icon={<Phone />}
                  value={form.mobileNumber}
                  error={shown("mobileNumber")}
                  onChange={(v) => set("mobileNumber", v)}
                  onBlur={() => touch("mobileNumber")}
                />
                <TextField label="Secondary Contact No." type="tel" icon={<Phone />} value={form.contactNumber} onChange={(v) => set("contactNumber", v)} onBlur={() => touch("contactNumber")} />
                <TextField label="Birth Date" type="date" value={form.birthDate} onChange={(v) => set("birthDate", v)} onBlur={() => touch("birthDate")} />
                <TextField label="Birth Place" value={form.birthPlace} onChange={(v) => set("birthPlace", v)} onBlur={() => touch("birthPlace")} />
                <SelectField label="Gender" value={form.gender} options={["Male", "Female"]} onChange={(v) => set("gender", v)} />
                <SelectField
                  label="Civil Status"
                  value={form.civilStatus}
                  options={CIVIL_STATUS_OPTIONS}
                  onChange={(v) => set("civilStatus", v)}
                />
                <TextField label="Citizenship" value={form.citizenship} onChange={(v) => set("citizenship", v)} onBlur={() => touch("citizenship")} placeholder="Filipino" />
                <TextField label="Ethnicity" value={form.ethnicity} onChange={(v) => set("ethnicity", v)} onBlur={() => touch("ethnicity")} />
                <YesNoField label="Person with Disability (PWD)" value={form.isPwd} onChange={(v) => set("isPwd", v)} />
              </div>
            </CollapsibleGroup>

            {/* Group 2 — Address (edit) */}
            <CollapsibleGroup icon={MapPin} title="Address" done={addressDone} total={ADDRESS_FIELDS.length}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField label="Present Address (full)" value={form.presentAddress} onChange={(v) => set("presentAddress", v)} onBlur={() => touch("presentAddress")} />
                </div>
                <TextField label="House Number" value={form.houseNumber} onChange={(v) => set("houseNumber", v)} onBlur={() => touch("houseNumber")} />
                <TextField label="Street" value={form.street} onChange={(v) => set("street", v)} onBlur={() => touch("street")} />
                <TextField label="Subdivision / Village" value={form.subdivision} onChange={(v) => set("subdivision", v)} onBlur={() => touch("subdivision")} />
                <TextField label="Barangay" value={form.barangay} onChange={(v) => set("barangay", v)} onBlur={() => touch("barangay")} />
                <TextField label="City / Municipality" value={form.city} onChange={(v) => set("city", v)} onBlur={() => touch("city")} />
                <TextField label="Province" value={form.province} onChange={(v) => set("province", v)} onBlur={() => touch("province")} />
                <TextField label="Country" value={form.country} onChange={(v) => set("country", v)} onBlur={() => touch("country")} />
                <TextField label="ZIP Code" value={form.zipCode} onChange={(v) => set("zipCode", v)} onBlur={() => touch("zipCode")} />
              </div>
            </CollapsibleGroup>

            {/* Group 3 — Legal Disclosures (edit) */}
            <CollapsibleGroup icon={Scale} title="Legal Disclosures" done={legalDone} total={legalTotal}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <YesNoField label="Are you a government employee?" value={form.isGovernment} onChange={(v) => set("isGovernment", v)} />
                <YesNoField label="Have you been administratively charged?" value={form.adminCase} onChange={(v) => set("adminCase", v)} />
                {form.adminCase && (
                  <div className="sm:col-span-2">
                    <Textarea
                      label="Administrative Case Details *"
                      value={form.adminCaseDetails}
                      onChange={(next) => set("adminCaseDetails", next)}
                      onBlur={() => touch("adminCaseDetails")}
                      error={shown("adminCaseDetails")}
                      reserveErrorLine
                      classNames={{ field: BEUI_FIELD_FILL }}
                      placeholder="Briefly describe the case status and particulars"
                    />
                  </div>
                )}
                <YesNoField label="Have you ever been charged of any crime?" value={form.crimeCharge} onChange={(v) => set("crimeCharge", v)} />
                {form.crimeCharge && (
                  <>
                    <TextField label="Date Filed" type="date" value={form.crimeDate} onChange={(v) => set("crimeDate", v)} onBlur={() => touch("crimeDate")} />
                    <TextField label="Case Status" value={form.crimeCaseStatus} onChange={(v) => set("crimeCaseStatus", v)} onBlur={() => touch("crimeCaseStatus")} />
                  </>
                )}
              </div>
            </CollapsibleGroup>

            {/* Group 4 — Character References (edit) — MOM 2026-10-13: the
                section is REQUIRED before the Education section. */}
            <CollapsibleGroup icon={Users} title="Character References" required done={namedRefs.length} total={5}>
              <div className="space-y-3">
                {refs.map((r, i) => (
                  <RefRow
                    key={i}
                    index={i}
                    reference={r}
                    canRemove={refs.length > 1}
                    onChange={(patch) => {
                      setRefs((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
                      markDirty();
                    }}
                    onRemove={() => {
                      if (refs.length <= 1) {
                        toast.info("At least one character reference row is kept");
                        return;
                      }
                      setRefs((prev) => prev.filter((_, j) => j !== i));
                      markDirty();
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (refs.length >= 5) {
                    toast.info("You can add up to 5 character references");
                    return;
                  }
                  setRefs((prev) => [...prev, { ...EMPTY_REF }]);
                  markDirty();
                }}
                className="dlg-ghost mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 py-2.5 text-sm sm:w-auto sm:px-6"
              >
                <Plus className="h-4 w-4" /> Add Character Reference
              </button>
            </CollapsibleGroup>
          </>
        ) : (
          <>
            {/* Group 1 — Identity (preview) */}
            <CollapsibleGroup icon={UserRound} title="Identity" done={identityDone} total={IDENTITY_FIELDS.length}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                <PreviewRow label="First Name" value={view.firstName} />
                <PreviewRow label="Middle Name" value={view.middleName} />
                <PreviewRow label="Last Name" value={view.lastName} />
                <PreviewRow label="Extension Name" value={view.extensionName} />
                <PreviewRow label="Email Address" value={view.emailAddress} />
                <PreviewRow label="Mobile Number" value={view.mobileNumber} />
                <PreviewRow label="Secondary Contact No." value={view.contactNumber} />
                <PreviewRow label="Birth Date" value={formatDate(view.birthDate)} />
                <PreviewRow label="Birth Place" value={view.birthPlace} />
                <PreviewRow label="Gender" value={view.gender} />
                <PreviewRow label="Civil Status" value={view.civilStatus} />
                <PreviewRow label="Citizenship" value={view.citizenship} />
                <PreviewRow label="Ethnicity" value={view.ethnicity} />
                <PreviewYesNo label="Person with Disability (PWD)" value={view.isPwd} />
              </div>
            </CollapsibleGroup>

            {/* Group 2 — Address (preview) */}
            <CollapsibleGroup icon={MapPin} title="Address" done={addressDone} total={ADDRESS_FIELDS.length}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                <PreviewRow label="Present Address (full)" value={view.presentAddress} full />
                <PreviewRow label="House Number" value={view.houseNumber} />
                <PreviewRow label="Street" value={view.street} />
                <PreviewRow label="Subdivision / Village" value={view.subdivision} />
                <PreviewRow label="Barangay" value={view.barangay} />
                <PreviewRow label="City / Municipality" value={view.city} />
                <PreviewRow label="Province" value={view.province} />
                <PreviewRow label="Country" value={view.country} />
                <PreviewRow label="ZIP Code" value={view.zipCode} />
              </div>
            </CollapsibleGroup>

            {/* Group 3 — Legal Disclosures (preview) — conditional detail rows
                mirror the edit-mode conditionals. */}
            <CollapsibleGroup icon={Scale} title="Legal Disclosures" done={legalDone} total={legalTotal}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                <PreviewYesNo label="Are you a government employee?" value={view.isGovernment} />
                <PreviewYesNo label="Have you been administratively charged?" value={view.adminCase} />
                {view.adminCase && (
                  <PreviewRow label="Administrative Case Details" value={view.adminCaseDetails} full />
                )}
                <PreviewYesNo label="Have you ever been charged of any crime?" value={view.crimeCharge} />
                {view.crimeCharge && (
                  <>
                    <PreviewRow label="Date Filed" value={formatDate(view.crimeDate)} />
                    <PreviewRow label="Case Status" value={view.crimeCaseStatus} />
                  </>
                )}
              </div>
            </CollapsibleGroup>

            {/* Group 4 — Character References (preview) — named rows only,
                name-led cards showing filled fields. MOM 2026-10-13: required
                section (red asterisk) before the Education section. */}
            <CollapsibleGroup icon={Users} title="Character References" required done={namedRefs.length} total={5}>
              {namedRefs.length === 0 ? (
                <p className="px-1 py-2 text-sm text-stone">
                  No character references added yet — this section is required. Click Edit Profile to add at least one (up to 5).
                </p>
              ) : (
                <div className="space-y-3">
                  {namedRefs.map((r, i) => (
                    <RefPreviewCard key={i} reference={r} index={i} />
                  ))}
                </div>
              )}
            </CollapsibleGroup>
          </>
        )}
      </div>

      {/* Task 40 — Cancel with unsaved edits: explicit discard confirmation
          (autosave is retired in the preview/edit model, so Cancel is the
          only path that can silently drop work — it must ask first). */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-stone">
              Your edits to Personal Information haven&apos;t been saved yet. Discarding cannot be undone — your
              profile will keep its last saved values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                exitEdit();
              }}
              className={ghostBadBtn}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
