import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  parsePositiveId,
  selectCompanyMembership,
} from "../lib/requestValues";
import { pickMutableReportFields } from "../lib/reportInput";

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
