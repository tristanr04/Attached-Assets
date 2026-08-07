export interface DecimalOptions {
  min: number;
  max: number;
  scale: number;
  allowZero?: boolean;
}

export function parseDecimalInput(
  value: unknown,
  options: DecimalOptions,
): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  const text = String(value);
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${options.scale}})?$`);
  if (!pattern.test(text)) {
    return null;
  }

  const numeric = Number(text);
  if (
    !Number.isFinite(numeric) ||
    numeric < options.min ||
    numeric > options.max ||
    (options.allowZero === false && numeric === 0)
  ) {
    return null;
  }

  return text;
}

export function parseLaborHours(values: {
  regularHours: unknown;
  overtimeHours: unknown;
  doubleTimeHours: unknown;
}): { regularHours: string; overtimeHours: string; doubleTimeHours: string } | null {
  const options = { min: 0, max: 24, scale: 2 } as const;
  const regularHours = parseDecimalInput(values.regularHours, options);
  const overtimeHours = parseDecimalInput(values.overtimeHours, options);
  const doubleTimeHours = parseDecimalInput(values.doubleTimeHours, options);

  if (
    regularHours === null ||
    overtimeHours === null ||
    doubleTimeHours === null ||
    Number(regularHours) + Number(overtimeHours) + Number(doubleTimeHours) > 24
  ) {
    return null;
  }

  return { regularHours, overtimeHours, doubleTimeHours };
}
