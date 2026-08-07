import assert from "node:assert/strict";
import test from "node:test";

import { partitionPoleFactHistory, type ConfirmedPoleFact } from "../lib/poleFactHistory";

function fact(id: number, photoId: number, fieldKey: string, analysisVersion: number): ConfirmedPoleFact<string> {
  return {
    id,
    photoId,
    analysisRunId: 100 + analysisVersion,
    analysisVersion,
    fieldKey,
    value: `value-${id}`,
    decisionAction: "accept",
    confirmedByUserId: 7,
    confirmedAt: new Date(`2026-08-0${analysisVersion}T12:00:00Z`),
  };
}

test("re-analysis keeps one current fact per photo and field while preserving history", () => {
  const result = partitionPoleFactHistory([
    fact(13, 5, "phaseConfiguration", 3),
    fact(12, 5, "phaseConfiguration", 2),
    fact(11, 5, "phaseConfiguration", 1),
    fact(20, 6, "phaseConfiguration", 1),
    fact(30, 5, "constructionRole", 1),
  ]);

  assert.deepEqual(result.currentFacts.map(item => item.id), [13, 20, 30]);
  assert.deepEqual(result.history.map(item => [item.id, item.supersededByFactId]), [[12, 13], [11, 12]]);
  assert.equal(result.currentFactCount, 3);
  assert.equal(result.historyFactCount, 2);
});

test("same field names on different pole photos never supersede each other", () => {
  const result = partitionPoleFactHistory([
    fact(2, 10, "poleNumber", 2),
    fact(1, 11, "poleNumber", 1),
  ]);
  assert.deepEqual(result.currentFacts.map(item => item.id), [2, 1]);
  assert.deepEqual(result.history, []);
});
