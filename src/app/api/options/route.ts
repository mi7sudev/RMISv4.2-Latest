// ============================================================================
// RMIS — Staff-extensible dropdown vocabulary (scalability request 2026-10).
//   GET  /api/options  → every staff-added choice, grouped by form field
//                        (positionType / division / cscEducation /
//                        cscEligibility). EVALUATOR or ADMIN — these power
//                        the Job form's type-or-pick fields.
//   POST /api/options  → add a choice at runtime through the dropdown's
//                        "Add" input; body { field, value, label?, hint? }.
//                        Canonical dedup (casefold + collapsed whitespace):
//                        re-adding an existing choice under any casing
//                        returns the stored row instead of duplicating it.
//                        Choices persist in the DropdownOption table, so the
//                        whole vocabulary grows without a code change.
// ============================================================================

import { ok, handleApi, ApiError } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import {
  DROPDOWN_FIELDS,
  MAX_OPTION_VALUE,
  addDropdownOption,
  isDropdownField,
  listDropdownOptions,
  type DropdownField,
} from "@/lib/dropdown-options";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: Request) => {
  await requireEvaluatorFromReq(req);
  return ok(await listDropdownOptions());
});

export const POST = handleApi(async (req: Request) => {
  const user = await requireEvaluatorFromReq(req);

  const body = (await req.json().catch(() => null)) as {
    field?: unknown;
    value?: unknown;
    label?: unknown;
    hint?: unknown;
  } | null;

  const field = typeof body?.field === "string" ? body.field : "";
  if (!isDropdownField(field)) {
    throw new ApiError(
      `Unknown dropdown field. Valid fields: ${DROPDOWN_FIELDS.join(", ")}`,
      400,
    );
  }

  const value = typeof body?.value === "string" ? body.value.trim() : "";
  if (!value) {
    throw new ApiError("Enter the choice to add", 400);
  }
  if (value.length > MAX_OPTION_VALUE) {
    throw new ApiError(`Choices are limited to ${MAX_OPTION_VALUE} characters`, 400);
  }

  const label = typeof body?.label === "string" ? body.label.trim() : undefined;
  const hint = typeof body?.hint === "string" ? body.hint.trim() : undefined;

  const { option, created } = await addDropdownOption({
    field: field as DropdownField,
    value,
    label: label || undefined,
    hint: hint ?? null,
    user: { id: user.id, username: user.username, role: user.role },
  });

  return ok({ option, created }, created ? 201 : 200);
});
