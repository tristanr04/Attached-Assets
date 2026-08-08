import assert from "node:assert/strict";
import test from "node:test";

import {
  billingRateVersionToken,
  buildPoleBillingSuggestions,
  parsePoleBillingReviewRequest,
  validatePoleBillingReviewSelection,
  type BillingSuggestionItem,
} from "../lib/poleBillingSuggestions";
import type { ConfirmedPoleFact } from "../lib/poleFactHistory";

function fact(id: number, value: unknown, photoId = 10, fieldKey = "quantities"): ConfirmedPoleFact {
  return {
    id, photoId, analysisRunId: 20, analysisVersion: 2, fieldKey, value,
    decisionAction: "accept", confirmedByUserId: 30, confirmedAt: new Date("2026-08-07T12:00:00Z"),
  };
}

function item(overrides: Partial<BillingSuggestionItem> = {}): BillingSuggestionItem {
  return {
    id: 7, companyId: 1, category: "work_units", name: "Three-phase tangent",
    billingCode: "3PT", customer: "Utility A", unitType: "each", baseRate: "125.0000",
    overtimeRate: "150.0000", doubleTimeRate: null, emergencyRate: null, stormRate: "175.0000",
    active: true, effectiveDate: "2026-01-01", expirationDate: null, ...overrides,
  };
}

test("creates review-only suggestions from exact foreman-confirmed item IDs", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: " utility a ",
    facts: [fact(1, [{ billableItemId: 7, quantity: 2.5 }])], items: [item()],
  });
  assert.equal(result.suggestions.length, 1);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.warnings.map(warning => warning.code), ["rate_context_required"]);
  assert.equal(result.suggestions[0]?.state, "review_required");
  assert.equal(result.suggestions[0]?.canApply, false);
  assert.equal(result.suggestions[0]?.selectedRate, null);
  assert.equal(result.suggestions[0]?.estimatedAmount, null);
  assert.match(result.suggestions[0]?.rateVersionToken ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(result.suggestions[0]?.rateOptions, {
    base: "125.0000", overtime: "150.0000", doubleTime: null, emergency: null, storm: "175.0000",
  });
});

test("parses an exact human rate review without accepting hidden billing fields", () => {
  const token = billingRateVersionToken(item());
  assert.deepEqual(parsePoleBillingReviewRequest({
    factId: 1, billableItemId: 7, quantity: 2.5, rateType: "storm", rateVersionToken: token,
  }, "billing-review:fixture-1"), {
    factId: 1, billableItemId: 7, quantity: 2.5, rateType: "storm", rateVersionToken: token,
    idempotencyKey: "billing-review:fixture-1",
  });
  assert.throws(() => parsePoleBillingReviewRequest({
    factId: 1, billableItemId: 7, quantity: 2.5, rateType: "storm", rateVersionToken: token,
    estimatedAmount: 999,
  }, "billing-review:fixture-1"), /Unsupported billing review field/);
});

test("validates a human-selected rate snapshot but keeps application disabled", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(1, { billableItemId: 7, quantity: 2.5 })], items: [item()],
  });
  const suggestion = result.suggestions[0]!;
  const review = validatePoleBillingReviewSelection(suggestion, parsePoleBillingReviewRequest({
    factId: 1, billableItemId: 7, quantity: 2.5, rateType: "storm",
    rateVersionToken: suggestion.rateVersionToken,
  }, "billing-review:fixture-2"));
  assert.equal(review.selectedRateSnapshot, "175.0000");
  assert.equal(review.canApply, false);
  assert.equal(review.estimatedAmount, null);
});

test("rejects stale source, quantity, rate version, and unavailable rate choices", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(1, { billableItemId: 7, quantity: 2.5 })], items: [item()],
  });
  const suggestion = result.suggestions[0]!;
  const base = parsePoleBillingReviewRequest({
    factId: 1, billableItemId: 7, quantity: 2.5, rateType: "storm",
    rateVersionToken: suggestion.rateVersionToken,
  }, "billing-review:fixture-3");
  for (const changed of [
    { factId: 2 },
    { billableItemId: 8 },
    { quantity: 3 },
    { rateVersionToken: "0".repeat(64) },
    { rateType: "doubleTime" as const },
  ]) assert.throws(() => validatePoleBillingReviewSelection(suggestion, { ...base, ...changed }));
});

test("rate version token changes with company billing context and rate edits", () => {
  const original = billingRateVersionToken(item());
  for (const changed of [
    { companyId: 2 }, { billingCode: "3PT-NEW" }, { customer: "Utility B" }, { effectiveDate: "2026-02-01" },
    { expirationDate: "2026-12-31" }, { stormRate: "180.0000" },
    { updatedAt: "2026-08-08T12:00:00.000Z" },
  ]) assert.notEqual(billingRateVersionToken(item(changed)), original);
});

test("review requests require supported rate types, bounded values, and durable retry keys", () => {
  const token = billingRateVersionToken(item());
  const base = { factId: 1, billableItemId: 7, quantity: 1, rateType: "base", rateVersionToken: token };
  assert.throws(() => parsePoleBillingReviewRequest({ ...base, rateType: "holiday" }, "billing-review:fixture-4"), /rate type/);
  assert.throws(() => parsePoleBillingReviewRequest({ ...base, quantity: 1.0009 }, "billing-review:fixture-4"), /identifiers or quantity/);
  assert.throws(() => parsePoleBillingReviewRequest(base, "short"), /Idempotency-Key/);
});

test("warns when confirmed work has no exact billable-item reference", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(9, ["replace-transformer"], 10, "visibleWorkActions")], items: [],
  });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.warnings[0]?.code, "possible_missing_charge");
  assert.deepEqual(result.warnings[0]?.factIds, [9]);
});

test("warns when confirmed analysis records missing documentation", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(10, ["transformer nameplate close-up"], 10, "missingEvidence")], items: [],
  });
  assert.equal(result.warnings[0]?.code, "missing_documentation");
  assert.deepEqual(result.warnings[0]?.factIds, [10]);
});

test("warns when a confirmed item has no rate without inventing an amount", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(11, { billableItemId: 7, quantity: 1 })],
    items: [item({ baseRate: null, overtimeRate: null, stormRate: null })],
  });
  assert.equal(result.warnings[0]?.code, "missing_rate");
  assert.equal(result.suggestions[0]?.selectedRate, null);
  assert.equal(result.suggestions[0]?.estimatedAmount, null);
});

test("does not create a rate warning when exactly one review option exists", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [fact(12, { billableItemId: 7, quantity: 1 })],
    items: [item({ overtimeRate: null, stormRate: null })],
  });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.canApply, false);
});

test("ignores non-quantity facts and rejects hidden or unsafe quantity data", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: null,
    facts: [
      fact(1, { billableItemId: 7, quantity: 1 }, 10, "visibleWorkActions"),
      fact(2, { billableItemId: 7, quantity: 1, selectedRate: 1 }),
      fact(3, { billableItemId: 7, quantity: 1.0009 }),
      fact(4, { billableItemId: 7, quantity: -2 }),
    ],
    items: [item({ customer: null })],
  });
  assert.equal(result.suggestions.length, 0);
  assert.deepEqual(result.conflicts.map(conflict => conflict.code), [
    "invalid_confirmed_quantity", "invalid_confirmed_quantity", "invalid_confirmed_quantity",
  ]);
});

test("fails closed for foreign, missing, inactive, stale, and customer-restricted items", () => {
  const cases: Array<[Partial<BillingSuggestionItem>, string, string | null]> = [
    [{ companyId: 2 }, "unavailable_company_item", "Utility A"],
    [{ active: false }, "inactive_item", "Utility A"],
    [{ effectiveDate: "2026-09-01" }, "rate_not_effective", "Utility A"],
    [{ expirationDate: "2026-07-31" }, "rate_not_effective", "Utility A"],
    [{ customer: "Utility B" }, "customer_mismatch", "Utility A"],
  ];
  for (const [overrides, code, customer] of cases) {
    const result = buildPoleBillingSuggestions({
      companyId: 1, reportDate: "2026-08-07", customer,
      facts: [fact(1, { billableItemId: 7, quantity: 1 })], items: [item(overrides)],
    });
    assert.equal(result.suggestions.length, 0);
    assert.equal(result.conflicts[0]?.code, code);
  }
});

test("duplicate confirmed item references never sum or become suggestions", () => {
  const result = buildPoleBillingSuggestions({
    companyId: 1, reportDate: "2026-08-07", customer: "Utility A",
    facts: [
      fact(1, { billableItemId: 7, quantity: 1 }, 10),
      fact(2, { billableItemId: 7, quantity: 2 }, 11),
    ],
    items: [item()],
  });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.conflicts[0]?.code, "duplicate_item");
  assert.deepEqual(result.conflicts[0]?.factIds, [1, 2]);
});
