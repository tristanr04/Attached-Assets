export interface PoleBillingRateOptions {
  base: string | null;
  overtime: string | null;
  doubleTime: string | null;
  emergency: string | null;
  storm: string | null;
}

const RATE_LABELS: Array<[keyof PoleBillingRateOptions, string]> = [
  ["base", "Base"],
  ["overtime", "Overtime"],
  ["doubleTime", "Double time"],
  ["emergency", "Emergency"],
  ["storm", "Storm"],
];

export function availableRateOptions(options: PoleBillingRateOptions) {
  return RATE_LABELS.flatMap(([key, label]) => {
    const value = options[key];
    return value === null ? [] : [{ key, label, value }];
  });
}
