import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("photo retries reuse a stable upload key and send it to the API", async () => {
  const source = await readFile(
    new URL("../pages/reports/steps/step-photos.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /uploadKey: string/);
  assert.match(source, /uploadKey: createPhotoUploadKey\(\)/);
  assert.match(source, /"Idempotency-Key": pending\.uploadKey/);
  assert.equal(source.match(/createPhotoUploadKey\(\)/g)?.length, 2);
});

test("API mutations can add bounded request-specific headers", async () => {
  const source = await readFile(
    new URL("../hooks/use-api.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /headers\?: Record<string, string>/);
  assert.match(source, /'Content-Type': 'application\/json', \.\.\.headers/);
});
