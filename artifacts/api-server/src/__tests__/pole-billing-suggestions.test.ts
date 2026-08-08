import assert from "node:assert/strict";
import test from "node:test";

import { buildPoleBillingSuggestions, type BillingSuggestionItem } from "../lib/poleBillingSuggestions";
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
  assert.equal(result.suggestions[0]?.state, "review_required");
  assert.equal(result.suggestions[0]?.canApply, false);
  assert.equal(result.suggestions[0]?.selectedRate, null);
  assert.equal(result.suggestions[0]?.estimatedAmount, null);
  assert.deepEqual(result.suggestions[0]?.rateOptions, {
    base: "125.0000", overtime: "150.0000", doubleTime: null, emergency: null, storm: "175.0000",
  });
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
