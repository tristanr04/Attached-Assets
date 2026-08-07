import { parseDecimalInput } from "./numericInput";

const RATE_FIELDS = [
  "baseRate",
  "overtimeRate",
  "doubleTimeRate",
  "stormRate",
  "emergencyRate",
  "perDiemRate",
  "travelRate",
] as const;

export function normalizeLaborClassificationNumbers(
  input: Record<string, unknown>,
): { ok: true; values: Record<string, string | null> } | { ok: false; field: string } {
  const values: Record<string, string | null> = {};

  for (const field of RATE_FIELDS) {
    if (!(field in input)) continue;
    if (input[field] === null || input[field] === "") {
      values[field] = null;
      continue;
    }
    const parsed = parseDecimalInput(input[field], {
      min: 0,
      max: 99_999_999.99,
      scale: 2,
    });
    if (parsed === null) return { ok: false, field };
    values[field] = parsed;
  }

  if ("minimumBillableHours" in input) {
    if (input.minimumBillableHours === null || input.minimumBillableHours === "") {
      values.minimumBillableHours = null;
    } else {
      const parsed = parseDecimalInput(input.minimumBillableHours, {
        min: 0,
        max: 999.99,
        scale: 2,
      });
      if (parsed === null) return { ok: false, field: "minimumBillableHours" };
      values.minimumBillableHours = parsed;
    }
  }

  return { ok: true, values };
}
