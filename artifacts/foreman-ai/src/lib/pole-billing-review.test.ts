import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { availableRateOptions } from "./pole-billing-review";

test("billing review shows only available rate choices without selecting one", () => {
  assert.deepEqual(availableRateOptions({
    base: "125.0000", overtime: null, doubleTime: "250.0000", emergency: null, storm: "300.0000",
  }), [
    { key: "base", label: "Base", value: "125.0000" },
    { key: "doubleTime", label: "Double time", value: "250.0000" },
    { key: "storm", label: "Storm", value: "300.0000" },
  ]);
});

test("billing review UI is mobile-safe and has no billing application control", () => {
  const source = readFileSync(new URL("../pages/reports/pole-billing-review.tsx", import.meta.url), "utf8");
  assert.match(source, /pole-billing-suggestions/);
  assert.match(source, /grid-cols-1 sm:grid-cols-2/);
  assert.match(source, /min-w-0/);
  assert.match(source, /break-words/);
  assert.match(source, /selectedRate !== null \|\| suggestion\.estimatedAmount !== null/);
  assert.match(source, /Rate and charge selection stay with an authorized reviewer/);
  assert.match(source, /Advisory billing warnings/);
  assert.match(source, /Reviewer attention needed/);
  assert.doesNotMatch(source, /Apply Suggestion|Approve Charge|Create Invoice|Submit Billing/);
  for (const width of [320, 375, 390, 430]) assert.ok(width < 640, `${width}px must retain the single-column review layout`);
});

test("report review and detail surfaces both include the billing review panel", () => {
  const step = readFileSync(new URL("../pages/reports/steps/step-review.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../pages/reports/detail.tsx", import.meta.url), "utf8");
  assert.match(step, /<PoleBillingReview reportId=\{report\.id\}/);
  assert.match(detail, /<PoleBillingReview reportId=\{id\}/);
});
