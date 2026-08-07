import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPoleConfirmationKey,
  buildPoleManualFallbackKey,
  displayPoleValue,
  parseEditedPoleValue,
  reviewedFieldCount,
} from "./pole-analysis-review";

test("pole confirmation keys are bounded and retry-safe", () => {
  const key = buildPoleConfirmationKey(12, 3, "fixture-nonce-001");
  assert.equal(key, "confirm:12:3:fixture-nonce-001");
  assert.ok(key.length <= 128);
  assert.throws(() => buildPoleConfirmationKey(0, 3, "fixture-nonce-001"));
  assert.throws(() => buildPoleConfirmationKey(12, 3, "short"));
});

test("manual fallback keys are bounded and generation-specific", () => {
  const key = buildPoleManualFallbackKey(31, 2, "fixture-nonce-002");
  assert.equal(key, "manual:31:2:fixture-nonce-002");
  assert.ok(key.length <= 128);
  assert.throws(() => buildPoleManualFallbackKey(0, 2, "fixture-nonce-002"));
  assert.throws(() => buildPoleManualFallbackKey(31, 0, "fixture-nonce-002"));
});

test("pole review values support structured edits without forcing JSON for plain text", () => {
  assert.equal(displayPoleValue("wood"), "wood");
  assert.equal(displayPoleValue(null), "Not detected");
  assert.deepEqual(parseEditedPoleValue('["A", "B"]'), ["A", "B"]);
  assert.equal(parseEditedPoleValue("company framing T-3"), "company framing T-3");
});

test("review progress counts explicit decisions only", () => {
  assert.equal(reviewedFieldCount(["poleNumber", "phase"], {
    poleNumber: { action: "accept" },
  }), 1);
});

test("pole review UI retains narrow-screen and explicit human-authority controls", () => {
  const source = readFileSync(new URL("../pages/reports/pole-analysis-review.tsx", import.meta.url), "utf8");
  assert.match(source, /grid-cols-1/);
  assert.match(source, /min-w-0/);
  assert.match(source, /flex-wrap/);
  assert.match(source, /Accept/);
  assert.match(source, /Edit/);
  assert.match(source, /Reject/);
  assert.match(source, /Confirm Pole Analysis/);
  assert.match(source, /disabled=\{!allReviewed/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /Continue manually/);
  assert.match(source, /manual-fallback/);
  assert.match(source, /No AI values were applied/);
  assert.match(source, /h-12 w-full/);
  assert.match(source, /refetchInterval/);
});
