// ============================================================================
// RMIS — Staff-extensible dropdown vocabulary (server-side).
// The Job form's type-or-pick fields (Position type, Division, Education,
// Eligibility) start from the CSC/agency registries in lib/constants.ts; this
// module stores every choice staff ADD through the dropdown's "Add" input so
// the vocabularies grow at runtime — no code change needed (scalability
// request 2026-10). Rows live in the DropdownOption table keyed by fieldKey;
// canonical dedup (casefold + collapsed whitespace) keeps near-duplicates
// ("permanent" vs "Permanent ") from mounting as two choices.
// Client-safe constants (FIELD keys + canonical()) live here so both the API
// route and views import the exact same vocabulary contract.
// ============================================================================

/** The form fields whose dropdowns are staff-extensible. */
export const DROPDOWN_FIELDS = [
  "positionType",
  "division",
  "cscEducation",
  "cscEligibility",
] as const;

export type DropdownField = (typeof DROPDOWN_FIELDS)[number];

export function isDropdownField(key: string): key is DropdownField {
  return (DROPDOWN_FIELDS as readonly string[]).includes(key);
}

/** Canonical comparison key: casefold + collapsed inner whitespace. */
export function canonicalOptionValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

export type DropdownOptionWire = {
  value: string;
  label: string;
  hint?: string;
  added?: boolean;
};

/** One grouped vocabulary snapshot — what GET /api/options returns. */
export type DropdownVocabulary = Record<DropdownField, DropdownOptionWire[]>;

export const MAX_OPTION_VALUE = 120;

/**
 * Persist a staff-added choice. Canonical dedup: if the (field, value)
 * already exists under any casing/spacing the EXISTING row wins (no
 * duplicate options ever mount). Returns the wire row and whether it was
 * newly created.
 */
export async function addDropdownOption(input: {
  field: DropdownField;
  value: string;
  label?: string;
  hint?: string | null;
  user: { id: string; username: string; role: string };
}): Promise<{ option: DropdownOptionWire; created: boolean }> {
  const { db } = await import("@/lib/db");
  const { auditLog } = await import("@/lib/audit");

  const value = input.value.replace(/\s+/g, " ").trim();
  const label = (input.label ?? value).replace(/\s+/g, " ").trim();
  const hint = input.hint?.replace(/\s+/g, " ").trim() || null;
  // The dedup identity — "Seasonal", "  seasonal " and "SEASONAL" all land
  // on the same stored row.
  const valueKey = canonicalOptionValue(value);

  const existing = await db.dropdownOption.findFirst({
    where: { fieldKey: input.field, valueKey },
  });

  if (existing) {
    return {
      option: { value: existing.value, label: existing.label, hint: existing.hint ?? undefined, added: true },
      created: false,
    };
  }

  try {
    const row = await db.dropdownOption.create({
      data: {
        fieldKey: input.field,
        value,
        valueKey,
        label,
        hint,
        createdById: input.user.id,
        createdByLabel: `${input.user.username} (${input.user.role})`,
      },
    });

    auditLog({
      userId: input.user.id,
      userLabel: input.user.username,
      userRole: input.user.role,
      action: "REFERENCE_OPTION_ADDED",
      entityType: "DropdownOption",
      entityId: row.id,
      description: `Added "${row.value}" to the ${input.field} dropdown choices`,
    });

    return {
      option: { value: row.value, label: row.label, hint: row.hint ?? undefined, added: true },
      created: true,
    };
  } catch (e) {
    // Concurrent add raced past the findFirst — the (fieldKey, valueKey)
    // unique constraint fired; the winner's row is the answer.
    const code = (e as { code?: string }).code;
    if (code !== "P2002") throw e;
    const row = await db.dropdownOption.findUniqueOrThrow({
      where: { fieldKey_valueKey: { fieldKey: input.field, valueKey } },
    });
    return {
      option: { value: row.value, label: row.label, hint: row.hint ?? undefined, added: true },
      created: false,
    };
  }
}

/** All staff-added choices, grouped by field (rows only — the caller merges
 *  them under the base registries). */
export async function listDropdownOptions(): Promise<{
  positionType: DropdownOptionWire[];
  division: DropdownOptionWire[];
  cscEducation: DropdownOptionWire[];
  cscEligibility: DropdownOptionWire[];
}> {
  const { db } = await import("@/lib/db");
  const rows = await db.dropdownOption.findMany({ orderBy: { createdAt: "asc" } });
  const grouped: DropdownVocabulary = {
    positionType: [],
    division: [],
    cscEducation: [],
    cscEligibility: [],
  };
  for (const r of rows) {
    if (!isDropdownField(r.fieldKey)) continue; // ignore stray keys defensively
    grouped[r.fieldKey].push({
      value: r.value,
      label: r.label,
      hint: r.hint ?? undefined,
      added: true,
    });
  }
  return grouped;
}
