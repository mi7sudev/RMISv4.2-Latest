"use client";

// ============================================================================
// RMIS — Yes/No declaration field, shared by the profile sections and the
// generic record dialog. Binary questions (PWD, government service, legal
// disclosures, "currently employed here?") are enterprise DECLARATIONS: both
// answers must be visible at a glance with no hidden default.
//
// Ported 1:1 from rmis-main-ui's YesNoField (src/components/views/profile/
// form-fields.tsx): an inline radio pair — No first / Yes second (government-
// form convention), horizontal with gap-6. BEUI field pass: the group caption
// follows the official field-label grammar (px-1 text-sm font-medium
// text-foreground — the same classes the official Input uses for its own
// label) and min-h-[44px] rows keep the mandated touch target.
// BEUI radio pass: rendered with the OFFICIAL motion/radio RadioGroup —
// gliding layoutId dot, official self-rendered plain-string captions
// ("No"/"Yes" via the label prop), orientation="horizontal" + gap-6, and
// per-item disabled (the official RadioGroup exposes no group-level disabled;
// the official item already fades and re-cursors both control and caption).
// Item ids are preserved through the official id prop (button id + label
// htmlFor identical to the previous DOM), and the required star stays
// byte-identical on the plain group-caption span — it never lived in the
// option captions.
// DEVIATION: the official RadioGroup exposes no aria-label prop, so the
// group's accessible name is preserved on a plain wrapper div
// role="radiogroup" aria-label={label} around the official component — the
// same div[role=radiogroup][aria-label] the previous shadcn group rendered
// (the nested unnamed role=radiogroup is the official component's own DOM).
// ============================================================================

import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";

export function YesNoField({
  label,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  // Repo grammar: No first, Yes second — matches the reference form exactly.
  const options: { val: string; text: string }[] = [
    { val: "no", text: "No" },
    { val: "yes", text: "Yes" },
  ];
  return (
    <div>
      {/* Official BEUI field-label grammar — same classes the official Input
          renders for its own label. */}
      <span className="mb-1.5 block px-1 text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </span>
      {/* Accessible-name deviation: the official RadioGroup takes no
          aria-label prop, so the group name lives on this plain wrapper. */}
      <div role="radiogroup" aria-label={label}>
        <RadioGroup
          value={value ? "yes" : "no"}
          onValueChange={(v) => onChange(v === "yes")}
          orientation="horizontal"
          className="items-center gap-6 pt-1"
        >
          {options.map((o) => (
            <RadioGroupItem
              key={o.val}
              id={`${id}-${o.val}`}
              value={o.val}
              label={o.text}
              disabled={disabled}
              className="min-h-[44px] py-2.5"
            />
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

export default YesNoField;
