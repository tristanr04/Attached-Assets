import { parseDecimalInput, parseLaborHours } from "./numericInput";

type Item = Record<string, unknown>;

export type NormalizedTemplateItems =
  | {
      valid: true;
      laborItems: Item[];
      equipmentItems: Item[];
      materialItems: Item[];
    }
  | { valid: false; error: string };

export function normalizeTemplateItems(
  laborItems: Item[],
  equipmentItems: Item[],
  materialItems: Item[],
  useConfiguredLaborHours: boolean,
): NormalizedTemplateItems {
  const normalizedLabor: Item[] = [];
  for (const item of laborItems) {
    const hours = parseLaborHours({
      regularHours: useConfiguredLaborHours ? item.hours ?? 0 : 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
    });
    if (!hours) {
      return { valid: false, error: "Template labor hours must be between 0 and 24 with at most 2 decimals" };
    }
    normalizedLabor.push({ ...item, hours: hours.regularHours });
  }

  const normalizedEquipment: Item[] = [];
  for (const item of equipmentItems) {
    const hours = parseDecimalInput(item.hours ?? 0, {
      min: 0,
      max: 24,
      scale: 2,
    });
    const quantity = parseDecimalInput(item.quantity ?? 1, {
      min: 0,
      max: 999_999.99,
      scale: 2,
      allowZero: false,
    });
    if (hours === null || quantity === null) {
      return { valid: false, error: "Template equipment hours or quantity is invalid" };
    }
    normalizedEquipment.push({ ...item, hours, quantity });
  }

  const normalizedMaterials: Item[] = [];
  for (const item of materialItems) {
    const quantity = parseDecimalInput(item.quantity ?? 0, {
      min: 0,
      max: 9_999_999.999,
      scale: 3,
    });
    if (quantity === null) {
      return { valid: false, error: "Template material quantity is invalid" };
    }
    normalizedMaterials.push({ ...item, quantity });
  }

  return {
    valid: true,
    laborItems: normalizedLabor,
    equipmentItems: normalizedEquipment,
    materialItems: normalizedMaterials,
  };
}
