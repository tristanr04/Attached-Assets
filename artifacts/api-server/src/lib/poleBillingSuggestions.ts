import type { ConfirmedPoleFact } from "./poleFactHistory";

export interface BillingSuggestionItem {
  id: number;
  companyId: number;
  category: string;
  name: string;
  billingCode: string | null;
  customer: string | null;
  unitType: string | null;
  baseRate: string | null;
  overtimeRate: string | null;
  doubleTimeRate: string | null;
  emergencyRate: string | null;
  stormRate: string | null;
  active: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
}

export interface BillingSuggestionConflict {
  code:
    | "invalid_confirmed_quantity"
    | "unavailable_company_item"
    | "inactive_item"
    | "rate_not_effective"
    | "customer_mismatch"
    | "duplicate_item";
  billableItemId: number | null;
  factIds: number[];
  message: string;
}

interface ConfirmedQuantity {
  billableItemId: number;
  quantity: number;
  fact: ConfirmedPoleFact;
}

const MAX_QUANTITY = 1_000_000;

function hasAtMostThreeDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 1_000) - value * 1_000) < 1e-8;
}

function parseQuantityRecord(value: unknown): { billableItemId: number; quantity: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => key !== "billableItemId" && key !== "quantity")) return null;
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.billableItemId) || Number(record.billableItemId) <= 0) return null;
  if (typeof record.quantity !== "number" || !Number.isFinite(record.quantity)) return null;
  if (record.quantity <= 0 || record.quantity > MAX_QUANTITY || !hasAtMostThreeDecimals(record.quantity)) return null;
  return { billableItemId: Number(record.billableItemId), quantity: record.quantity };
}

export function extractConfirmedBillingReferences(facts: ConfirmedPoleFact[]): {
  references: ConfirmedQuantity[];
  conflicts: BillingSuggestionConflict[];
} {
  const references: ConfirmedQuantity[] = [];
  const conflicts: BillingSuggestionConflict[] = [];

  for (const fact of facts) {
    if (fact.fieldKey !== "quantities") continue;
    const values = Array.isArray(fact.value) ? fact.value : [fact.value];
    for (const value of values) {
      const parsed = parseQuantityRecord(value);
      if (!parsed) {
        conflicts.push({
          code: "invalid_confirmed_quantity",
          billableItemId: null,
          factIds: [fact.id],
          message: "A confirmed quantity is malformed and must be entered manually.",
        });
        continue;
      }
      references.push({ ...parsed, fact });
    }
  }
  return { references, conflicts };
}

function normalizedCustomer(value: string | null): string | null {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  return normalized || null;
}

export function buildPoleBillingSuggestions(input: {
  companyId: number;
  reportDate: string;
  customer: string | null;
  facts: ConfirmedPoleFact[];
  items: BillingSuggestionItem[];
}) {
  const extracted = extractConfirmedBillingReferences(input.facts);
  const conflicts = [...extracted.conflicts];
  const items = new Map(input.items.filter(item => item.companyId === input.companyId).map(item => [item.id, item]));
  const referencesByItem = new Map<number, ConfirmedQuantity[]>();
  for (const reference of extracted.references) {
    const group = referencesByItem.get(reference.billableItemId) ?? [];
    group.push(reference);
    referencesByItem.set(reference.billableItemId, group);
  }

  const suggestions: Array<Record<string, unknown>> = [];
  for (const [billableItemId, references] of referencesByItem) {
    if (references.length > 1) {
      conflicts.push({
        code: "duplicate_item",
        billableItemId,
        factIds: references.map(reference => reference.fact.id),
        message: "The same billable item appears more than once; review the source photos and quantity manually.",
      });
      continue;
    }
    const reference = references[0];
    const item = items.get(billableItemId);
    if (!item) {
      conflicts.push({
        code: "unavailable_company_item",
        billableItemId,
        factIds: [reference.fact.id],
        message: "The confirmed item is unavailable in this company's billing catalog.",
      });
      continue;
    }
    if (!item.active) {
      conflicts.push({ code: "inactive_item", billableItemId, factIds: [reference.fact.id], message: "The confirmed item is inactive." });
      continue;
    }
    if ((item.effectiveDate && input.reportDate < item.effectiveDate)
      || (item.expirationDate && input.reportDate > item.expirationDate)) {
      conflicts.push({
        code: "rate_not_effective",
        billableItemId,
        factIds: [reference.fact.id],
        message: "The item's rate version is not effective on the report date.",
      });
      continue;
    }
    const itemCustomer = normalizedCustomer(item.customer);
    const reportCustomer = normalizedCustomer(input.customer);
    if (itemCustomer && itemCustomer !== reportCustomer) {
      conflicts.push({
        code: "customer_mismatch",
        billableItemId,
        factIds: [reference.fact.id],
        message: "The item is restricted to a different customer.",
      });
      continue;
    }

    suggestions.push({
      state: "review_required",
      canApply: false,
      billableItem: {
        id: item.id,
        category: item.category,
        name: item.name,
        billingCode: item.billingCode,
        customer: item.customer,
        unitType: item.unitType,
      },
      quantity: reference.quantity,
      rateOptions: {
        base: item.baseRate,
        overtime: item.overtimeRate,
        doubleTime: item.doubleTimeRate,
        emergency: item.emergencyRate,
        storm: item.stormRate,
      },
      selectedRate: null,
      estimatedAmount: null,
      source: {
        factId: reference.fact.id,
        photoId: reference.fact.photoId,
        analysisRunId: reference.fact.analysisRunId,
        analysisVersion: reference.fact.analysisVersion,
        confirmedByUserId: reference.fact.confirmedByUserId,
        confirmedAt: reference.fact.confirmedAt,
      },
    });
  }

  return {
    reviewRequired: true,
    canApply: false,
    suggestions,
    conflicts,
  };
}
