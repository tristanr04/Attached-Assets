import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  parsePositiveId,
  parseDateOnly,
  selectCompanyMembership,
} from "../lib/requestValues";
import { pickMutableReportFields } from "../lib/reportInput";
import {
  validatePhotoDataUrl,
  validateSignatureDataUrl,
} from "../lib/photoDataUrl";
import {
  canAccessReport,
  canMutateReport,
  completionUpdate,
  dailyReportLockKey,
} from "../lib/reportState";
import { parseDecimalInput, parseLaborHours } from "../lib/numericInput";
import { normalizeTemplateItems } from "../lib/templateItems";
import { applicationLockKey, parseIdempotencyKey } from "../lib/idempotency";

test("parsePositiveId accepts only canonical positive integer strings", () => {
  assert.equal(parsePositiveId("1"), 1);
  assert.equal(parsePositiveId("482"), 482);
  assert.equal(parsePositiveId(482), 482);
  assert.equal(parsePositiveId(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test("parsePositiveId rejects ambiguous, malformed, and unsafe values", () => {
  for (const value of [
    undefined,
    null,
    "",
    "0",
    "-1",
    "+1",
    "01",
    "1.5",
    "12abc",
    " 12",
    "12 ",
    ["12"],
    ["12", "13"],
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    String(Number.MAX_SAFE_INTEGER + 1),
  ]) {
    assert.equal(parsePositiveId(value), null, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test("parseDateOnly accepts real calendar dates and rejects rollover dates", () => {
  assert.equal(parseDateOnly("2026-08-07"), "2026-08-07");
  assert.equal(parseDateOnly("2024-02-29"), "2024-02-29");
  for (const value of ["2026-02-29", "2026-13-01", "2026-00-10", "08/07/2026", ["2026-08-07"], null]) {
    assert.equal(parseDateOnly(value), null);
  }
});

test("templates and work packages cannot be applied across companies", async () => {
  const source = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );
  const companyBoundaryGuards = source.match(
    /report\.companyId !== (?:template|wp)\.companyId/g,
  );

  assert.equal(companyBoundaryGuards?.length, 2);
});

test("report input cannot overwrite ownership, workflow, or audit fields", () => {
  const picked = pickMutableReportFields({
    projectId: 3,
    crewId: 4,
    workPerformed: "Replaced crossarm",
    companyId: 999,
    foremanId: 999,
    status: "complete",
    completedAt: "2026-08-06T00:00:00Z",
    id: 999,
    createdAt: "2026-08-06T00:00:00Z",
  });

  assert.deepEqual(picked, {
    projectId: 3,
    crewId: 4,
    workPerformed: "Replaced crossarm",
  });
});

test("report routes bind project and crew references to the report company", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\["projectId", projectsTable\]/);
  assert.match(source, /\["crewId", crewsTable\]/);
  assert.match(
    source,
    /\.where\(and\(eq\(table\.id, id\), eq\(table\.companyId, companyId\)\)\)/,
  );
  assert.doesNotMatch(source, /foremanId:\s*req\.userId\s*\?\?\s*null,\s*\.\.\.rest/);
});

test("photo validation accepts fictional JPEG, PNG, and WebP byte fixtures", () => {
  const fixtures = [
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/webp", Buffer.from("RIFF0000WEBP", "ascii")],
  ] as const;

  for (const [mimeType, bytes] of fixtures) {
    const result = validatePhotoDataUrl(
      `data:${mimeType};base64,${bytes.toString("base64")}`,
    );
    assert.deepEqual(result, {
      valid: true,
      mimeType,
      size: bytes.length,
    });
  }
});

test("photo validation rejects spoofed, unsafe, malformed, and oversized data", () => {
  const fakeJpeg = Buffer.from("not a jpeg").toString("base64");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString("base64");

  for (const value of [
    null,
    ["data:image/jpeg;base64," + jpeg],
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:text/html;base64,PGgxPm5vdCBhIHBob3RvPC9oMT4=",
    "data:image/jpeg;base64,%%%",
    "data:image/jpeg;base64," + fakeJpeg,
  ]) {
    assert.equal(validatePhotoDataUrl(value).valid, false);
  }

  assert.equal(
    validatePhotoDataUrl("data:image/jpeg;base64," + jpeg, 4).valid,
    false,
  );
});

test("signature validation accepts images and enforces its smaller size cap", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  assert.equal(
    validateSignatureDataUrl(
      `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    ).valid,
    true,
  );

  const oversized = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(2 * 1024 * 1024),
  ]);
  const result = validateSignatureDataUrl(
    `data:image/jpeg;base64,${oversized.toString("base64")}`,
  );
  assert.deepEqual(result, {
    valid: false,
    error: "Image exceeds the 2 MB limit",
  });
});

test("signature route validates bytes before persistence", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /const signatureValidation = validateSignatureDataUrl\(dataUrl\)/);
  assert.match(source, /if \(!signatureValidation\.valid\)/);
});

test("company selection never accepts a company outside the user's memberships", () => {
  const memberships = [
    { companyId: 10, role: "foreman" },
    { companyId: 20, role: "admin" },
  ];

  assert.deepEqual(selectCompanyMembership(memberships, null), memberships[0]);
  assert.deepEqual(selectCompanyMembership(memberships, 20), memberships[1]);
  assert.equal(selectCompanyMembership(memberships, 30), null);
});

test("company selection enforces dashboard roles for the selected company", () => {
  const memberships = [
    { companyId: 10, role: "foreman" },
    { companyId: 20, role: "admin" },
  ];

  assert.equal(
    selectCompanyMembership(memberships, 10, ["admin", "supervisor"]),
    null,
  );
  assert.deepEqual(
    selectCompanyMembership(memberships, 20, ["admin"]),
    memberships[1],
  );
  assert.deepEqual(
    selectCompanyMembership(memberships, null, ["admin", "supervisor"]),
    memberships[1],
  );
});

test("company role authorization is scoped to the authenticated Clerk user", async () => {
  const source = await readFile(
    new URL("../middlewares/requireAuth.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /and\(\s*eq\(companyMembershipsTable\.companyId, companyId\),\s*eq\(companyMembershipsTable\.clerkUserId, req\.clerkUserId\),?\s*\)/s,
  );
  assert.doesNotMatch(
    source,
    /\.where\(eq\(companyMembershipsTable\.companyId, companyId\)\)/,
  );
});

test("completed reports are locked for foremen but remain amendable by reviewers", () => {
  assert.equal(canMutateReport("draft", "foreman"), true);
  assert.equal(canMutateReport("complete", "foreman"), false);
  assert.equal(canMutateReport("complete", "supervisor"), true);
  assert.equal(canMutateReport("complete", "admin"), true);
});

test("foremen can access only their own reports while reviewers retain company access", () => {
  assert.equal(canAccessReport("foreman", 10, 10), true);
  assert.equal(canAccessReport("foreman", 10, 11), false);
  assert.equal(canAccessReport("foreman", 10, null), false);
  assert.equal(canAccessReport("foreman", null, 10), false);
  assert.equal(canAccessReport("supervisor", 10, 11), true);
  assert.equal(canAccessReport("admin", 10, 11), true);
  assert.equal(canAccessReport("unknown", 10, 10), false);
});

test("report and template routes enforce foreman ownership", async () => {
  const reportRoutes = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );
  const templateRoutes = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    reportRoutes.match(/checkAccess\(req\.clerkUserId, report\.companyId, report\.foremanId\)/g)?.length,
    21,
  );
  assert.match(reportRoutes, /canAccessReport\(membership\.role, membership\.userId, report\.foremanId\)/);
  assert.match(templateRoutes, /checkAccess\(req\.clerkUserId, template\.companyId, report\.foremanId\)/);
  assert.match(templateRoutes, /checkAccess\(req\.clerkUserId, source\.companyId, source\.foremanId\)/);
  assert.match(templateRoutes, /checkAccess\(req\.clerkUserId, wp\.companyId, report\.foremanId\)/);
});

test("report routes reject partial IDs, invalid dates, and malformed filters", async () => {
  const reportRoutes = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );
  const templateRoutes = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(reportRoutes, /parseInt\(req\.params/);
  assert.doesNotMatch(templateRoutes, /parseInt\(req\.params/);
  assert.match(reportRoutes, /const reportDate = parseDateOnly\(req\.body\?\.reportDate\)/);
  assert.match(reportRoutes, /const companyFilter = cqId === undefined \? null : parsePositiveId\(cqId\)/);
  assert.match(reportRoutes, /const reportDateFilter = rdqId === undefined \? null : parseDateOnly\(rdqId\)/);
  assert.match(reportRoutes, /reports = reports\.filter\(r => r\.reportDate === reportDateFilter\)/);
  assert.match(reportRoutes, /Math\.min\(limit, 100\)/);
  assert.match(templateRoutes, /const companyId = parsePositiveId\(req\.query\.companyId\)/);
});

test("daily report creation uses a stable company, foreman, and date lock key", () => {
  assert.equal(
    dailyReportLockKey(4, 12, "2026-08-07"),
    "daily-report:4:12:2026-08-07",
  );
  assert.notEqual(
    dailyReportLockKey(4, 12, "2026-08-07"),
    dailyReportLockKey(4, 13, "2026-08-07"),
  );
});

test("daily report creation serializes and replays duplicate submissions", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$\{lockKey\}\)\)/);
  assert.match(source, /eq\(dailyReportsTable\.companyId, companyId\)/);
  assert.match(source, /eq\(dailyReportsTable\.foremanId, foremanId\)/);
  assert.match(source, /eq\(dailyReportsTable\.reportDate, reportDate\)/);
  assert.match(source, /res\.setHeader\("Idempotent-Replay", "true"\)/);
  assert.match(source, /res\.status\(result\.created \? 201 : 200\)/);
});

test("idempotency keys are bounded and safe for durable operation receipts", () => {
  assert.equal(parseIdempotencyKey("apply-report_2026-08-07.001"), "apply-report_2026-08-07.001");
  assert.equal(parseIdempotencyKey("12345678"), "12345678");
  for (const value of [undefined, null, "short", " leading-key", "key with spaces", ["abcdefgh"], "a".repeat(129)]) {
    assert.equal(parseIdempotencyKey(value), null);
  }

  assert.equal(
    applicationLockKey("report-template", 4, 12, "abcdefgh"),
    "report-template:4:12:abcdefgh",
  );
  assert.notEqual(
    applicationLockKey("report-template", 4, 12, "abcdefgh"),
    applicationLockKey("work-package", 4, 12, "abcdefgh"),
  );
});

test("report completion is idempotent and preserves the first completion time", () => {
  const now = new Date("2026-08-07T00:00:00.000Z");
  const original = new Date("2026-08-06T23:00:00.000Z");

  assert.deepEqual(completionUpdate("draft", null, now), {
    status: "complete",
    completedAt: now,
  });
  assert.equal(completionUpdate("complete", original, now), null);
});

test("all report child mutation routes enforce the completion lock", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );
  const guards = source.match(/rejectLockedReport\(report, m\.role, res\)/g);

  // Report patch plus labor, material, equipment, photo, and signature writes.
  assert.equal(guards?.length, 14);
  assert.match(source, /const update = completionUpdate\(/);
  assert.match(
    source,
    /eq\(dailyReportsTable\.status, report\.status\)/,
  );
});

test("report line-item references are scoped to the report company", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /eq\(crewsTable\.companyId, companyId\)/);
  assert.match(source, /eq\(catalogMaterialsTable\.companyId, companyId\)/);
  assert.match(source, /eq\(catalogEquipmentTable\.companyId, companyId\)/);
  assert.match(source, /crewMemberId: normalizedCrewMemberId/);
  assert.match(source, /catalogMaterialId: normalizedCatalogMaterialId/);
  assert.match(source, /catalogEquipmentId: normalizedCatalogEquipmentId/);
});

test("decimal input rejects malformed, negative, excessive, and over-precision values", () => {
  const options = { min: 0, max: 24, scale: 2 };
  assert.equal(parseDecimalInput("12.25", options), "12.25");
  assert.equal(parseDecimalInput(0, options), "0");

  for (const value of ["-1", " 1", "1 ", "1.234", "1e2", 25, NaN, Infinity, null]) {
    assert.equal(parseDecimalInput(value, options), null);
  }
});

test("labor hour buckets cannot exceed one day in total", () => {
  assert.deepEqual(parseLaborHours({
    regularHours: 8,
    overtimeHours: 4,
    doubleTimeHours: 2,
  }), {
    regularHours: "8",
    overtimeHours: "4",
    doubleTimeHours: "2",
  });

  assert.equal(parseLaborHours({
    regularHours: 16,
    overtimeHours: 8,
    doubleTimeHours: 1,
  }), null);
});

test("template and work-package application are atomic and honor report locks", async () => {
  const source = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  assert.equal(source.match(/await db\.transaction\(async \(tx\)/g)?.length, 3);
  assert.equal(source.match(/canMutateReport\(report\.status, m\.role\)/g)?.length, 2);
  assert.equal(
    source.match(/await tx\.insert\((?:timeEntriesTable|reportEquipmentTable|reportMaterialsTable)\)/g)?.length,
    9,
  );
});

test("template and work-package retries use durable idempotency receipts", async () => {
  const source = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  assert.equal(source.match(/parseIdempotencyKey\(req\.get\("Idempotency-Key"\)\)/g)?.length, 2);
  assert.equal(source.match(/pg_advisory_xact_lock\(hashtext\(\$\{lockKey\}\)\)/g)?.length, 3);
  assert.equal(source.match(/await tx\.insert\(activityLogsTable\)/g)?.length, 2);
  assert.match(source, /eq\(activityLogsTable\.action, "report_template_applied"\)/);
  assert.match(source, /eq\(activityLogsTable\.action, "work_package_applied"\)/);
  assert.equal(source.match(/Idempotent-Replay/g)?.length, 3);
  assert.equal(source.match(/res\.status\(409\)/g)?.length, 2);
});

test("template application cannot bypass company-scoped reference checks", async () => {
  const source = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  for (const table of [
    "crewsTable",
    "projectsTable",
    "laborClassificationsTable",
    "catalogMaterialsTable",
    "catalogEquipmentTable",
  ]) {
    assert.match(source, new RegExp(`eq\\(${table}\\.companyId, companyId\\)`));
  }
  assert.equal(source.match(/validateApplicationReferences\(/g)?.length, 3);
});

test("template items reject invalid billable quantities before any writes", () => {
  const valid = normalizeTemplateItems(
    [{ name: "Lineman", hours: "12.5" }],
    [{ name: "Bucket", hours: 8, quantity: 1 }],
    [{ name: "Crossarm", quantity: "2.500" }],
    true,
  );
  assert.equal(valid.valid, true);

  for (const invalid of [
    normalizeTemplateItems([{ hours: 25 }], [], [], true),
    normalizeTemplateItems([], [{ hours: -1, quantity: 1 }], [], true),
    normalizeTemplateItems([], [{ hours: 1, quantity: 0 }], [], true),
    normalizeTemplateItems([], [], [{ quantity: "1.2345" }], true),
  ]) {
    assert.equal(invalid.valid, false);
  }
});

test("copy-yesterday validates inputs and atomically replays duplicates", async () => {
  const source = await readFile(
    new URL("../routes/report-templates.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /const sourceId = parsePositiveId\(req\.params\.reportId\)/);
  assert.match(source, /const targetDate = parseDateOnly\(/);
  assert.match(source, /const result = await db\.transaction\(async \(tx\)/);
  assert.match(source, /dailyReportLockKey\(source\.companyId, foremanId, targetDate\)/);
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$\{lockKey\}\)\)/);
  assert.match(source, /eq\(dailyReportsTable\.reportDate, targetDate\)/);
  assert.match(source, /await tx\.insert\(dailyReportsTable\)/);
  assert.match(source, /res\.status\(result\.created \? 201 : 200\)/);
});
