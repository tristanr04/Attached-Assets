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
import { applicationLockKey, parseIdempotencyKey, photoUploadLockKey } from "../lib/idempotency";
import { canManageCrew } from "../lib/crewAccess";
import {
  canManageTemplateConfiguration,
  normalizeConfiguredTemplateItems,
  normalizeTemplateChecklist,
} from "../lib/templateConfiguration";
import {
  normalizeBillableNumbers,
  parseBillableCategory,
  parseOptionalDate,
} from "../lib/billableItemInput";

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

test("billable rates and quantities enforce database precision and non-negative values", () => {
  assert.deepEqual(normalizeBillableNumbers({
    baseRate: "125.5000",
    overtimeRate: 188.25,
    defaultQuantity: "3.125",
  }), {
    ok: true,
    values: {
      baseRate: "125.5000",
      overtimeRate: "188.25",
      defaultQuantity: "3.125",
    },
  });

  for (const [field, value] of [
    ["baseRate", -1],
    ["baseRate", "1.00001"],
    ["stormRate", Number.POSITIVE_INFINITY],
    ["doubleTimeRate", "100000000"],
    ["defaultQuantity", "1.0001"],
    ["defaultQuantity", "10000000"],
  ] as const) {
    assert.deepEqual(normalizeBillableNumbers({ [field]: value }), { ok: false, field });
  }
});

test("billable categories and effective dates reject malformed values", () => {
  assert.equal(parseBillableCategory("labor"), "labor");
  assert.equal(parseBillableCategory("unknown"), null);
  assert.equal(parseBillableCategory(["labor"]), null);
  assert.equal(parseOptionalDate("2026-08-07"), "2026-08-07");
  assert.equal(parseOptionalDate("2026-02-29"), undefined);
  assert.equal(parseOptionalDate(null), null);
});

test("billable item routes fail closed on IDs and protected billing inputs", async () => {
  const source = await readFile(
    new URL("../routes/billable-items.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /parseInt\(/);
  assert.equal(source.match(/normalizeBillableNumbers\(req\.body\)/g)?.length, 2);
  assert.match(source, /parsePositiveId\(req\.query\.companyId\)/);
  assert.equal(source.match(/parsePositiveId\(req\.params\.id\)/g)?.length, 2);
  assert.match(source, /typeof req\.body\.taxable !== "boolean"/);
  assert.match(source, /typeof req\.body\[f\] !== "boolean"/);
  assert.equal(source.match(/expirationDate must not precede effectiveDate/g)?.length, 2);
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

test("foremen can manage only their assigned crew while reviewers retain company access", () => {
  assert.equal(canManageCrew("foreman", 10, 10), true);
  assert.equal(canManageCrew("foreman", 10, 11), false);
  assert.equal(canManageCrew("foreman", null, 10), false);
  assert.equal(canManageCrew("supervisor", 10, 11), true);
  assert.equal(canManageCrew("admin", 10, 11), true);
  assert.equal(canManageCrew("unknown", 10, 10), false);
});

test("crew routes reject ambiguous IDs and company-scope user references", async () => {
  const source = await readFile(
    new URL("../routes/crews.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /parseInt\(/);
  assert.match(source, /inArray\(crewsTable\.companyId, ids\)/);
  assert.match(source, /eq\(companyMembershipsTable\.companyId, companyId\)/);
  assert.match(source, /eq\(companyMembershipsTable\.userId, userId\)/);
  assert.equal(source.match(/canManageCrew\(membership\.role, membership\.userId, crew\.foremanId\)/g)?.length, 3);
  assert.match(source, /foremanId must belong to the crew company/);
  assert.match(source, /userId must belong to the crew company/);
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
  assert.equal(
    photoUploadLockKey(2, "photo-upload-123"),
    "pole-photo-upload:2:photo-upload-123",
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

test("report completion serializes with pole confirmation and blocks pending AI proposals", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );
  const completionRoute = source.slice(
    source.indexOf('router.post("/reports/:reportId/complete"'),
    source.indexOf("// ── Time entries"),
  );

  assert.match(completionRoute, /db\.transaction/);
  assert.match(completionRoute, /select id from daily_reports where id = \$\{reportId\} for update/);
  assert.match(completionRoute, /eq\(poleAnalysisRunsTable\.companyId, current\.companyId\)/);
  assert.match(completionRoute, /eq\(poleAnalysisRunsTable\.reportId, reportId\)/);
  assert.match(completionRoute, /eq\(poleAnalysisRunsTable\.status, "ai_proposed"\)/);
  assert.match(completionRoute, /eq\(poleAnalysisJobsTable\.companyId, current\.companyId\)/);
  assert.match(completionRoute, /eq\(poleAnalysisJobsTable\.reportId, reportId\)/);
  assert.match(completionRoute, /\["queued", "processing", "retry_wait"\]/);
  assert.match(completionRoute, /Review and confirm or reject the pending pole analysis/);
});

test("photo upload is retry-safe and enqueues analysis atomically", async () => {
  const source = await readFile(
    new URL("../routes/reports.ts", import.meta.url),
    "utf8",
  );
  const route = source.slice(
    source.indexOf('router.post("/reports/:reportId/photos"'),
    source.indexOf('router.patch("/reports/:reportId/photos/:photoId"'),
  );

  assert.match(route, /parseIdempotencyKey\(req\.get\("Idempotency-Key"\)\)/);
  assert.match(route, /photoUploadLockKey\(report\.companyId, idempotencyKey\)/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /select id from daily_reports where id = \$\{reportId\} for update/);
  assert.match(route, /current\.status === "complete"/);
  assert.match(route, /eq\(poleAnalysisJobsTable\.companyId, report\.companyId\)/);
  assert.match(route, /eq\(poleAnalysisJobsTable\.requestKey, idempotencyKey\)/);
  assert.match(route, /tx\.insert\(photosTable\)/);
  assert.match(route, /tx\.insert\(poleAnalysisJobsTable\)/);
  assert.match(route, /Idempotent-Replay/);
  assert.match(route, /result\.kind === "created" \? 201 : 200/);
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
    /eq\(dailyReportsTable\.status, current\.status\)/,
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
  assert.equal(source.match(/validateApplicationReferences\(/g)?.length, 7);
});

test("only managers can configure report templates and work packages", async () => {
  assert.equal(canManageTemplateConfiguration("admin"), true);
  assert.equal(canManageTemplateConfiguration("supervisor"), true);
  assert.equal(canManageTemplateConfiguration("foreman"), false);

  const source = await readFile(new URL("../routes/report-templates.ts", import.meta.url), "utf8");
  assert.equal(source.match(/!canManageTemplateConfiguration\(m\.role\)/g)?.length, 6);
  assert.equal(source.match(/const companyId = parsePositiveId\(req\.body\?\.companyId\)/g)?.length, 2);
});

test("stored template items are bounded, normalized, and reject hidden fields", () => {
  const valid = normalizeConfiguredTemplateItems(
    [{ name: " Lineman ", trade: "Line", laborClassificationId: "12", hours: "8.25" }],
    [{ name: "Bucket", catalogEquipmentId: 3, hours: "4.5", quantity: 1 }],
    [{ name: "Crossarm", catalogMaterialId: 9, quantity: "2.500", unit: "each" }],
    true,
  );
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.laborItems[0]?.name, "Lineman");
    assert.equal(valid.laborItems[0]?.laborClassificationId, 12);
    assert.equal(valid.laborItems[0]?.hours, "8.25");
  }

  assert.equal(normalizeConfiguredTemplateItems([{ name: "Lineman", rate: 999 }], [], [], true).valid, false);
  assert.equal(normalizeConfiguredTemplateItems([{ name: "x".repeat(501) }], [], [], true).valid, false);
  assert.equal(normalizeConfiguredTemplateItems(new Array(101).fill({ name: "Lineman" }), [], [], true).valid, false);
  assert.equal(normalizeConfiguredTemplateItems([], [{ name: "Bucket", quantity: 0 }], [], true).valid, false);
});

test("work-package checklist values are bounded and normalized", () => {
  assert.deepEqual(normalizeTemplateChecklist(["  Tailboard  ", "Pole photo"], "safetyChecklist"), {
    valid: true,
    items: ["Tailboard", "Pole photo"],
  });
  assert.equal(normalizeTemplateChecklist([""], "safetyChecklist").valid, false);
  assert.equal(normalizeTemplateChecklist(new Array(101).fill("item"), "requiredDocumentation").valid, false);
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
