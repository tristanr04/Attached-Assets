import { parseOptionalText, parseRequiredText } from "./billableItemInput";
import { parsePositiveId } from "./requestValues";
import { normalizeTemplateItems, type NormalizedTemplateItems } from "./templateItems";

type Item = Record<string, unknown>;

const MAX_ITEMS = 100;
const ITEM_TEXT_LIMIT = 500;

const ITEM_FIELDS = {
  labor: new Set(["name", "trade", "classification", "laborClassificationId", "hours"]),
  equipment: new Set(["name", "catalogEquipmentId", "hours", "quantity"]),
  material: new Set(["name", "quantity", "unit", "catalogMaterialId"]),
} as const;

function sanitizeItems(
  value: unknown,
  kind: keyof typeof ITEM_FIELDS,
): { valid: true; items: Item[] } | { valid: false; error: string } {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    return { valid: false, error: `Template ${kind} items must be an array of at most ${MAX_ITEMS} items` };
  }

  const items: Item[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { valid: false, error: `Template ${kind} item is invalid` };
    }
    const record = raw as Item;
    if (Object.keys(record).some((key) => !ITEM_FIELDS[kind].has(key))) {
      return { valid: false, error: `Template ${kind} item contains an unsupported field` };
    }

    const name = parseRequiredText(record.name, ITEM_TEXT_LIMIT);
    if (!name) return { valid: false, error: `Template ${kind} item name is required` };
    const item: Item = { name };

    for (const field of kind === "labor" ? ["trade", "classification"] : kind === "material" ? ["unit"] : []) {
      const parsed = parseOptionalText(record[field], ITEM_TEXT_LIMIT);
      if (record[field] !== undefined && parsed === undefined) {
        return { valid: false, error: `Template ${kind} item ${field} is invalid` };
      }
      if (parsed !== undefined) item[field] = parsed;
    }

    const idField = kind === "labor"
      ? "laborClassificationId"
      : kind === "equipment" ? "catalogEquipmentId" : "catalogMaterialId";
    if (record[idField] !== undefined && record[idField] !== null) {
      const id = parsePositiveId(record[idField]);
      if (id === null) return { valid: false, error: `Template ${kind} item ${idField} is invalid` };
      item[idField] = id;
    }
    if (kind !== "material" && record.hours !== undefined) item.hours = record.hours;
    if (kind === "equipment" && record.quantity !== undefined) item.quantity = record.quantity;
    if (kind === "material" && record.quantity !== undefined) item.quantity = record.quantity;
    items.push(item);
  }
  return { valid: true, items };
}

export function canManageTemplateConfiguration(role: string): boolean {
  return role === "admin" || role === "supervisor";
}

export function normalizeConfiguredTemplateItems(
  laborValue: unknown,
  equipmentValue: unknown,
  materialValue: unknown,
  useConfiguredLaborHours: boolean,
): NormalizedTemplateItems {
  const labor = sanitizeItems(laborValue, "labor");
  if (!labor.valid) return labor;
  const equipment = sanitizeItems(equipmentValue, "equipment");
  if (!equipment.valid) return equipment;
  const material = sanitizeItems(materialValue, "material");
  if (!material.valid) return material;
  return normalizeTemplateItems(labor.items, equipment.items, material.items, useConfiguredLaborHours);
}

export function normalizeTemplateChecklist(
  value: unknown,
  field: string,
): { valid: true; items: string[] } | { valid: false; error: string } {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    return { valid: false, error: `${field} must be an array of at most ${MAX_ITEMS} items` };
  }
  const items: string[] = [];
  for (const raw of value) {
    const item = parseRequiredText(raw, ITEM_TEXT_LIMIT);
    if (!item) return { valid: false, error: `${field} contains an invalid item` };
    items.push(item);
  }
  return { valid: true, items };
}
