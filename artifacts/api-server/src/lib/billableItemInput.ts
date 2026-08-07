import { parseDateOnly } from "./requestValues";
import { parseDecimalInput } from "./numericInput";

export const BILLABLE_CATEGORIES = [
  "labor",
  "equipment",
  "materials",
  "work_units",
  "addon",
  "custom",
] as const;

export type BillableCategory = (typeof BILLABLE_CATEGORIES)[number];

const RATE_FIELDS = [
  "baseRate",
  "overtimeRate",
  "doubleTimeRate",
  "emergencyRate",
  "stormRate",
] as const;

export function parseBillableCategory(value: unknown): BillableCategory | null {
  return typeof value === "string" && BILLABLE_CATEGORIES.includes(value as BillableCategory)
    ? value as BillableCategory
    : null;
}

export function parseRequiredText(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

export function parseOptionalText(
  value: unknown,
  maxLength = 4_000,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > maxLength) return undefined;
  return text.length === 0 ? null : text;
}

export function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parseDateOnly(value) ?? undefined;
}

export function normalizeBillableNumbers(
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
      max: 99_999_999.9999,
      scale: 4,
    });
    if (parsed === null) return { ok: false, field };
    values[field] = parsed;
  }

  if ("defaultQuantity" in input) {
    if (input.defaultQuantity === null || input.defaultQuantity === "") {
      values.defaultQuantity = null;
    } else {
      const parsed = parseDecimalInput(input.defaultQuantity, {
        min: 0,
        max: 9_999_999.999,
        scale: 3,
      });
      if (parsed === null) return { ok: false, field: "defaultQuantity" };
      values.defaultQuantity = parsed;
    }
  }

  return { ok: true, values };
}
