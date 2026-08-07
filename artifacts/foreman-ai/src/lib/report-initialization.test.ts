import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildInitializationKey,
  requestJson,
} from "./report-initialization";

test("template initialization keys are bounded and accepted by the API contract", () => {
  const key = buildInitializationKey(
    "template",
    "2026-08-07",
    42,
    "123e4567-e89b-12d3-a456-426614174000",
  );

  assert.equal(key, "template:2026-08-07:42:123e4567-e89b-12d3-a456-426614174000");
  assert.match(key, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
  assert.ok(key.length <= 128);
});

test("initialization keys reject an unusable nonce", () => {
  assert.throws(
    () => buildInitializationKey("blank", "2026-08-07", null, "bad key"),
    /safe retry key/,
  );
});

test("requestJson returns structured success data", async () => {
  const result = await requestJson<{ id: number }>(
    async () => new Response(JSON.stringify({ id: 7 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "/api/reports/7",
  );

  assert.deepEqual(result, { id: 7 });
});

test("requestJson preserves API error messages for retry guidance", async () => {
  await assert.rejects(
    requestJson(
      async () => new Response(JSON.stringify({ error: "No report exists for yesterday" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
      "/api/reports",
    ),
    /No report exists for yesterday/,
  );
});

test("the foreman start flow calls real copy and template APIs", async () => {
  const source = await readFile(
    new URL("../pages/reports/new.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /reportDate=\$\{yesterday\}&limit=1/);
  assert.match(source, /\/api\/reports\/\$\{source\.id\}\/copy/);
  assert.match(source, /\/api\/report-templates\/\$\{templateId\}\/apply/);
  assert.match(source, /"Idempotency-Key": idempotencyKey/);
  assert.match(source, /setLocation\(\`\/reports\/\$\{reportId\}\/edit\`\)/);
  assert.doesNotMatch(source, /mock the transition/i);
});

test("report initialization controls include narrow-screen safeguards", async () => {
  const source = await readFile(
    new URL("../pages/reports/new.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /type="button"/);
  assert.match(source, /w-full/);
  assert.match(source, /min-w-0/);
  assert.match(source, /p-4 sm:p-6/);
  assert.match(source, /disabled=\{busy\}/);
});
