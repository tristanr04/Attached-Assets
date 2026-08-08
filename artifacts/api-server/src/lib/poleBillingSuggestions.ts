import { createHash } from "node:crypto";

import { parseIdempotencyKey } from "./idempotency";
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
  updatedAt?: Date | string;
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

export interface BillingSuggestionWarning {
  code:
    | "possible_missing_charge"
    | "missing_rate"
    | "rate_context_required"
    | "missing_documentation";
  billableItemId: number | null;
  factIds: number[];
  message: string;
}

export interface PoleBillingSuggestion {
  state: "review_required";
  canApply: false;
  billableItem: {
    id: number;
    category: string;
    name: string;
    billingCode: string | null;
    customer: string | null;
    unitType: string | null;
  };
  quantity: number;
  rateVersionToken: string;
  rateOptions: {
    base: string | null;
    overtime: string | null;
    doubleTime: string | null;
    emergency: string | null;
    storm: string | null;
  };
  selectedRate: null;
  estimatedAmount: null;
  source: {
    factId: number;
    photoId: number;
    analysisRunId: number;
    analysisVersion: number;
    confirmedByUserId: number;
    confirmedAt: Date;
  };
}

export type PoleBillingRateType = "base" | "overtime" | "doubleTime" | "emergency" | "storm";

export interface PoleBillingReviewRequest {
  factId: number;
  billableItemId: number;
  quantity: number;
  rateType: PoleBillingRateType;
  rateVersionToken: string;
  idempotencyKey: string;
}

interface ConfirmedQuantity {
  billableItemId: number;
  quantity: number;
  fact: ConfirmedPoleFact;
}

const MAX_QUANTITY = 1_000_000;
const RATE_VERSION_TOKEN = /^[a-f0-9]{64}$/;
const RATE_TYPES = new Set<PoleBillingRateType>(["base", "overtime", "doubleTime", "emergency", "storm"]);

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

export function billingRateVersionToken(item: BillingSuggestionItem): string {
  const updatedAt = item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt ?? "";
  return createHash("sha256").update(JSON.stringify([
    item.companyId, item.id, item.category, item.name, item.billingCode, item.customer, item.unitType, item.active,
    item.effectiveDate, item.expirationDate, updatedAt,
    item.baseRate, item.overtimeRate, item.doubleTimeRate, item.emergencyRate, item.stormRate,
  ])).digest("hex");
}

export function parsePoleBillingReviewRequest(body: unknown, idempotencyHeader: unknown): PoleBillingReviewRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A billing review request is required");
  const record = body as Record<string, unknown>;
  const allowed = new Set(["factId", "billableItemId", "quantity", "rateType", "rateVersionToken"]);
  if (Object.keys(record).some(key => !allowed.has(key))) throw new Error("Unsupported billing review field");
  const parsedQuantity = parseQuantityRecord({ billableItemId: record.billableItemId, quantity: record.quantity });
  if (!parsedQuantity || !Number.isSafeInteger(record.factId) || Number(record.factId) <= 0) {
    throw new Error("Invalid billing review identifiers or quantity");
  }
  if (typeof record.rateType !== "string" || !RATE_TYPES.has(record.rateType as PoleBillingRateType)) {
    throw new Error("Invalid billing rate type");
  }
  if (typeof record.rateVersionToken !== "string" || !RATE_VERSION_TOKEN.test(record.rateVersionToken)) {
    throw new Error("Invalid or missing billing rate version");
  }
  const idempotencyKey = parseIdempotencyKey(idempotencyHeader);
  if (!idempotencyKey) throw new Error("A valid Idempotency-Key is required");
  return {
    factId: Number(record.factId),
    billableItemId: parsedQuantity.billableItemId,
    quantity: parsedQuantity.quantity,
    rateType: record.rateType as PoleBillingRateType,
    rateVersionToken: record.rateVersionToken,
    idempotencyKey,
  };
}

export function validatePoleBillingReviewSelection(
  suggestion: PoleBillingSuggestion,
  request: PoleBillingReviewRequest,
) {
  if (suggestion.state !== "review_required" || suggestion.canApply !== false
    || suggestion.selectedRate !== null || suggestion.estimatedAmount !== null) {
    throw new Error("Unsafe billing suggestion state");
  }
  if (suggestion.source.factId !== request.factId || suggestion.billableItem.id !== request.billableItemId) {
    throw new Error("Billing review no longer matches its confirmed source");
  }
  if (suggestion.quantity !== request.quantity) throw new Error("Confirmed billing quantity changed");
  if (suggestion.rateVersionToken !== request.rateVersionToken) throw new Error("Billing rate version changed");
  const selectedRateSnapshot = suggestion.rateOptions[request.rateType];
  if (selectedRateSnapshot === null) throw new Error("Selected billing rate type is unavailable");
  return {
    reviewValidated: true as const,
    canApply: false as const,
    factId: request.factId,
    billableItemId: request.billableItemId,
    quantity: request.quantity,
    selectedRateType: request.rateType,
    selectedRateSnapshot,
    rateVersionToken: request.rateVersionToken,
    idempotencyKey: request.idempotencyKey,
    estimatedAmount: null,
  };
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

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return true;
}

const WORK_REFERENCE_FIELDS = new Set([
  "visibleWorkActions",
  "matchedWorkActionIds",
  "matchedWorkPackageIds",
  "matchedCatalogItemIds",
]);

const MISSING_DOCUMENTATION_FIELDS = new Set([
  "missingEvidence",
  "missingRequiredEvidence",
  "missingDocumentation",
]);

export function buildPoleBillingSuggestions(input: {
  companyId: number;
  reportDate: string;
  customer: string | null;
  facts: ConfirmedPoleFact[];
  items: BillingSuggestionItem[];
}) {
  const extracted = extractConfirmedBillingReferences(input.facts);
  const conflicts = [...extracted.conflicts];
  const warnings: BillingSuggestionWarning[] = [];
  const items = new Map(input.items.filter(item => item.companyId === input.companyId).map(item => [item.id, item]));
  const referencesByItem = new Map<number, ConfirmedQuantity[]>();
  for (const reference of extracted.references) {
    const group = referencesByItem.get(reference.billableItemId) ?? [];
    group.push(reference);
    referencesByItem.set(reference.billableItemId, group);
  }

  const suggestions: PoleBillingSuggestion[] = [];
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

    const suggestion: PoleBillingSuggestion = {
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
      rateVersionToken: billingRateVersionToken(item),
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
    };
    suggestions.push(suggestion);

    const availableRateCount = Object.values(suggestion.rateOptions).filter(rate => rate !== null).length;
    if (availableRateCount === 0) {
      warnings.push({
        code: "missing_rate",
        billableItemId,
        factIds: [reference.fact.id],
        message: "This confirmed item has no effective rate option; an authorized reviewer must resolve the company rate before billing.",
      });
    } else if (availableRateCount > 1) {
      warnings.push({
        code: "rate_context_required",
        billableItemId,
        factIds: [reference.fact.id],
        message: "Multiple rate types are available. An authorized reviewer must verify base, overtime, double-time, emergency, or storm context.",
      });
    }
  }

  const unmappedWorkFacts = input.facts.filter(fact =>
    WORK_REFERENCE_FIELDS.has(fact.fieldKey) && hasMeaningfulValue(fact.value));
  if (unmappedWorkFacts.length > 0 && extracted.references.length === 0) {
    warnings.push({
      code: "possible_missing_charge",
      billableItemId: null,
      factIds: unmappedWorkFacts.map(fact => fact.id),
      message: "Confirmed work or catalog matches have no exact billable-item quantity reference. Reconcile them manually to avoid a missed charge.",
    });
  }

  const missingDocumentationFacts = input.facts.filter(fact =>
    MISSING_DOCUMENTATION_FIELDS.has(fact.fieldKey) && hasMeaningfulValue(fact.value));
  if (missingDocumentationFacts.length > 0) {
    warnings.push({
      code: "missing_documentation",
      billableItemId: null,
      factIds: missingDocumentationFacts.map(fact => fact.id),
      message: "Required evidence is still missing. Resolve the documented gaps before approving related charges.",
    });
  }

  return {
    reviewRequired: true,
    canApply: false,
    suggestions,
    conflicts,
    warnings,
  };
}
