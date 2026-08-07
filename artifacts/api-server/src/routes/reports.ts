import { Router, type IRouter, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db, dailyReportsTable, companyMembershipsTable, usersTable,
  projectsTable, crewsTable, crewMembersTable, timeEntriesTable,
  catalogMaterialsTable, reportMaterialsTable, catalogEquipmentTable,
  reportEquipmentTable, photosTable, signaturesTable, poleAnalysisRunsTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { pickMutableReportFields } from "../lib/reportInput";
import {
  validatePhotoDataUrl,
  validateSignatureDataUrl,
} from "../lib/photoDataUrl";
import { parseDateOnly, parsePositiveId } from "../lib/requestValues";
import {
  canAccessReport,
  canMutateReport,
  completionUpdate,
  dailyReportLockKey,
} from "../lib/reportState";
import { parseDecimalInput, parseLaborHours } from "../lib/numericInput";

const router: IRouter = Router();

async function checkAccess(
  clerkUserId: string,
  companyId: number,
  reportForemanId?: number | null,
) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  if (m && reportForemanId !== undefined && !canAccessReport(m.role, m.userId, reportForemanId)) {
    return undefined;
  }
  return m;
}

function rejectLockedReport(
  report: typeof dailyReportsTable.$inferSelect,
  role: string,
  res: Response,
): boolean {
  if (canMutateReport(report.status, role)) {
    return false;
  }

  res.status(403).json({ error: "Cannot modify a completed report" });
  return true;
}

async function normalizeReportReferences(
  companyId: number,
  values: Record<string, unknown>,
): Promise<string | null> {
  for (const [field, table] of [
    ["projectId", projectsTable],
    ["crewId", crewsTable],
  ] as const) {
    const rawValue = values[field];
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const id = parsePositiveId(rawValue);
    if (id === null) {
      return `Invalid ${field}`;
    }

    const [record] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!record) {
      return `${field} must belong to the report company`;
    }

    values[field] = id;
  }

  return null;
}

async function normalizeLineItemReference(
  companyId: number,
  value: unknown,
  kind: "crewMember" | "catalogMaterial" | "catalogEquipment",
): Promise<number | null | undefined> {
  if (value === undefined || value === null) {
    return null;
  }

  const id = parsePositiveId(value);
  if (id === null) {
    return undefined;
  }

  if (kind === "crewMember") {
    const [record] = await db.select({ id: crewMembersTable.id })
      .from(crewMembersTable)
      .innerJoin(crewsTable, eq(crewMembersTable.crewId, crewsTable.id))
      .where(and(
        eq(crewMembersTable.id, id),
        eq(crewsTable.companyId, companyId),
      ));
    return record ? id : undefined;
  }

  if (kind === "catalogMaterial") {
    const [record] = await db.select({ id: catalogMaterialsTable.id })
      .from(catalogMaterialsTable)
      .where(and(
        eq(catalogMaterialsTable.id, id),
        eq(catalogMaterialsTable.companyId, companyId),
      ));
    return record ? id : undefined;
  }

  const [record] = await db.select({ id: catalogEquipmentTable.id })
    .from(catalogEquipmentTable)
    .where(and(
      eq(catalogEquipmentTable.id, id),
      eq(catalogEquipmentTable.companyId, companyId),
    ));
  return record ? id : undefined;
}

async function enrichReport(r: typeof dailyReportsTable.$inferSelect) {
  let projectName: string | null = null;
  let crewName: string | null = null;
  let foremanName: string | null = null;

  if (r.projectId) {
    const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, r.projectId));
    projectName = p?.name ?? null;
  }
  if (r.crewId) {
    const [c] = await db.select({ name: crewsTable.name }).from(crewsTable).where(eq(crewsTable.id, r.crewId));
    crewName = c?.name ?? null;
  }
  if (r.foremanId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, r.foremanId));
    foremanName = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || null : null;
  }

  return {
    id: r.id, companyId: r.companyId, projectId: r.projectId, crewId: r.crewId, foremanId: r.foremanId,
    reportDate: r.reportDate, status: r.status, projectName, crewName, foremanName,
    workLocation: r.workLocation, generalForeman: r.generalForeman, startTime: r.startTime, stopTime: r.stopTime,
    weatherConditions: r.weatherConditions, workPerformed: r.workPerformed, structuresInstalled: r.structuresInstalled,
    safetyMeeting: r.safetyMeeting, safetyNotes: r.safetyNotes, delays: r.delays, outages: r.outages,
    customerIssues: r.customerIssues, injuries: r.injuries, injuryDetails: r.injuryDetails,
    additionalNotes: r.additionalNotes,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function formatTimeEntry(e: typeof timeEntriesTable.$inferSelect) {
  return {
    id: e.id, reportId: e.reportId, crewMemberId: e.crewMemberId,
    employeeName: e.employeeName, trade: e.trade,
    regularHours: Number(e.regularHours), overtimeHours: Number(e.overtimeHours), doubleTimeHours: Number(e.doubleTimeHours),
    createdAt: e.createdAt.toISOString(),
  };
}

function formatMaterial(m: typeof reportMaterialsTable.$inferSelect) {
  return {
    id: m.id, reportId: m.reportId, catalogMaterialId: m.catalogMaterialId,
    name: m.name, quantity: Number(m.quantity), unit: m.unit, notes: m.notes,
    createdAt: m.createdAt.toISOString(),
  };
}

function formatEquipment(e: typeof reportEquipmentTable.$inferSelect) {
  return {
    id: e.id, reportId: e.reportId, catalogEquipmentId: e.catalogEquipmentId,
    name: e.name, unitId: e.unitId, hoursUsed: Number(e.hoursUsed), notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

function formatPhoto(p: typeof photosTable.$inferSelect) {
  return {
    id: p.id,
    reportId: p.reportId,
    url: p.url,
    caption: p.caption,
    category: p.category ?? "other",
    createdAt: p.createdAt.toISOString(),
  };
}

function formatSignature(s: typeof signaturesTable.$inferSelect) {
  return { id: s.id, reportId: s.reportId, dataUrl: s.dataUrl, createdAt: s.createdAt.toISOString() };
}

// ── List reports ──────────────────────────────────────────────────────────────
router.get("/reports", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const {
    companyId: cqId,
    crewId: crqId,
    projectId: prqId,
    reportDate: rdqId,
    status: sqId,
    limit: lqId,
  } = req.query;

  const companyFilter = cqId === undefined ? null : parsePositiveId(cqId);
  const crewFilter = crqId === undefined ? null : parsePositiveId(crqId);
  const projectFilter = prqId === undefined ? null : parsePositiveId(prqId);
  const reportDateFilter = rdqId === undefined ? null : parseDateOnly(rdqId);
  const limit = lqId === undefined ? null : parsePositiveId(lqId);
  if (
    (cqId !== undefined && companyFilter === null)
    || (crqId !== undefined && crewFilter === null)
    || (prqId !== undefined && projectFilter === null)
    || (rdqId !== undefined && reportDateFilter === null)
    || (lqId !== undefined && limit === null)
    || (sqId !== undefined && sqId !== "draft" && sqId !== "complete")
  ) {
    res.status(400).json({ error: "Invalid report filters" });
    return;
  }

  const memberships = await db.select({ companyId: companyMembershipsTable.companyId, role: companyMembershipsTable.role, userId: companyMembershipsTable.userId })
    .from(companyMembershipsTable).where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));

  if (memberships.length === 0) { res.json([]); return; }

  let reports = await db.select().from(dailyReportsTable).orderBy(desc(dailyReportsTable.reportDate));

  reports = reports.filter((report) => {
    const membership = memberships.find((candidate) => candidate.companyId === report.companyId);
    return Boolean(membership && canAccessReport(membership.role, membership.userId, report.foremanId));
  });

  if (companyFilter !== null) reports = reports.filter(r => r.companyId === companyFilter);
  if (crewFilter !== null) reports = reports.filter(r => r.crewId === crewFilter);
  if (projectFilter !== null) reports = reports.filter(r => r.projectId === projectFilter);
  if (reportDateFilter !== null) reports = reports.filter(r => r.reportDate === reportDateFilter);
  if (sqId !== undefined) reports = reports.filter(r => r.status === sqId);
  if (limit !== null) reports = reports.slice(0, Math.min(limit, 100));

  const enriched = await Promise.all(reports.map(enrichReport));
  res.json(enriched);
});

// ── Create report ─────────────────────────────────────────────────────────────
router.post("/reports", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const reportDate = parseDateOnly(req.body?.reportDate);
  if (companyId === null || !reportDate) { res.status(400).json({ error: "companyId and reportDate are required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const foremanId = req.userId ?? m.userId;
  if (!foremanId) { res.status(403).json({ error: "A linked user profile is required" }); return; }

  const values = pickMutableReportFields(req.body);
  delete values.reportDate;
  const referenceError = await normalizeReportReferences(companyId, values);
  if (referenceError) { res.status(400).json({ error: referenceError }); return; }

  const result = await db.transaction(async (tx) => {
    const lockKey = dailyReportLockKey(companyId, foremanId, reportDate);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [existing] = await tx.select().from(dailyReportsTable)
      .where(and(
        eq(dailyReportsTable.companyId, companyId),
        eq(dailyReportsTable.foremanId, foremanId),
        eq(dailyReportsTable.reportDate, reportDate),
      ))
      .orderBy(desc(dailyReportsTable.id))
      .limit(1);
    if (existing) {
      return { report: existing, created: false };
    }

    const [created] = await tx.insert(dailyReportsTable).values({
      companyId,
      reportDate,
      foremanId,
      ...values,
    }).returning();
    return { report: created, created: true };
  });

  if (!result.created) {
    res.setHeader("Idempotent-Replay", "true");
  }
  res.status(result.created ? 201 : 200).json(await enrichReport(result.report));
});

// ── Get report detail ─────────────────────────────────────────────────────────
router.get("/reports/:reportId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [timeEntries, materials, equipment, photos, sigs] = await Promise.all([
    db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, reportId)),
    db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, reportId)),
    db.select().from(reportEquipmentTable).where(eq(reportEquipmentTable.reportId, reportId)),
    db.select().from(photosTable).where(eq(photosTable.reportId, reportId)),
    db.select().from(signaturesTable).where(eq(signaturesTable.reportId, reportId)),
  ]);

  const base = await enrichReport(report);
  res.json({
    ...base,
    timeEntries: timeEntries.map(formatTimeEntry),
    materials: materials.map(formatMaterial),
    equipment: equipment.map(formatEquipment),
    photos: photos.map(formatPhoto),
    signature: sigs[0] ? formatSignature(sigs[0]) : null,
  });
});

// ── Update report ─────────────────────────────────────────────────────────────
router.patch("/reports/:reportId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }

  const updates = pickMutableReportFields(req.body);
  const referenceError = await normalizeReportReferences(report.companyId, updates);
  if (referenceError) { res.status(400).json({ error: referenceError }); return; }

  const [updated] = await db.update(dailyReportsTable).set(updates).where(eq(dailyReportsTable.id, reportId)).returning();
  res.json(await enrichReport(updated));
});

// ── Delete report ─────────────────────────────────────────────────────────────
router.delete("/reports/:reportId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (report.status !== "draft") { res.status(400).json({ error: "Only draft reports can be deleted" }); return; }

  await db.delete(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  res.sendStatus(204);
});

// ── Complete report ───────────────────────────────────────────────────────────
router.post("/reports/:reportId/complete", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const outcome = await db.transaction(async tx => {
    await tx.execute(sql`select id from daily_reports where id = ${reportId} for update`);
    const [current] = await tx.select().from(dailyReportsTable)
      .where(eq(dailyReportsTable.id, reportId));
    if (!current) return { code: 404 as const, error: "Not found" };

    const update = completionUpdate(current.status, current.completedAt, new Date());
    if (!update) return { code: 200 as const, report: current };

    const [pendingAnalysis] = await tx.select({ id: poleAnalysisRunsTable.id })
      .from(poleAnalysisRunsTable)
      .where(and(
        eq(poleAnalysisRunsTable.companyId, current.companyId),
        eq(poleAnalysisRunsTable.reportId, reportId),
        eq(poleAnalysisRunsTable.status, "ai_proposed"),
      ))
      .limit(1);
    if (pendingAnalysis) {
      return {
        code: 409 as const,
        error: "Review and confirm or reject the pending pole analysis before submitting this report",
      };
    }

    const [updated] = await tx.update(dailyReportsTable)
      .set(update)
      .where(and(
        eq(dailyReportsTable.id, reportId),
        eq(dailyReportsTable.status, current.status),
      )).returning();
    if (!updated) throw new Error("Report changed during completion");
    return { code: 200 as const, report: updated };
  });

  if ("error" in outcome) { res.status(outcome.code).json({ error: outcome.error }); return; }
  res.status(outcome.code).json(await enrichReport(outcome.report));
});

// ── Time entries ──────────────────────────────────────────────────────────────
router.get("/reports/:reportId/time-entries", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const entries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, reportId));
  res.json(entries.map(formatTimeEntry));
});

router.post("/reports/:reportId/time-entries", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }

  const { employeeName, trade, regularHours, overtimeHours, doubleTimeHours, crewMemberId } = req.body;
  if (!employeeName || !trade) { res.status(400).json({ error: "employeeName and trade are required" }); return; }
  const hours = parseLaborHours({
    regularHours: regularHours ?? 0,
    overtimeHours: overtimeHours ?? 0,
    doubleTimeHours: doubleTimeHours ?? 0,
  });
  if (!hours) {
    res.status(400).json({ error: "Labor hours must be non-negative, use at most 2 decimals, and total no more than 24" });
    return;
  }
  const normalizedCrewMemberId = await normalizeLineItemReference(
    report.companyId,
    crewMemberId,
    "crewMember",
  );
  if (normalizedCrewMemberId === undefined) {
    res.status(400).json({ error: "crewMemberId must belong to the report company" });
    return;
  }

  const [entry] = await db.insert(timeEntriesTable).values({
    reportId, employeeName, trade,
    ...hours,
    crewMemberId: normalizedCrewMemberId,
  }).returning();
  res.status(201).json(formatTimeEntry(entry));
});

router.patch("/reports/:reportId/time-entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const entryId = parsePositiveId(req.params.entryId);
  if (entryId === null) { res.status(400).json({ error: "Invalid entryId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }

  const { employeeName, trade, regularHours, overtimeHours, doubleTimeHours } = req.body;
  const [existingEntry] = await db.select().from(timeEntriesTable)
    .where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.reportId, reportId)));
  if (!existingEntry) { res.status(404).json({ error: "Not found" }); return; }
  const hours = parseLaborHours({
    regularHours: regularHours ?? existingEntry.regularHours,
    overtimeHours: overtimeHours ?? existingEntry.overtimeHours,
    doubleTimeHours: doubleTimeHours ?? existingEntry.doubleTimeHours,
  });
  if (!hours) {
    res.status(400).json({ error: "Labor hours must be non-negative, use at most 2 decimals, and total no more than 24" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (employeeName !== undefined) updates.employeeName = employeeName;
  if (trade !== undefined) updates.trade = trade;
  if (regularHours !== undefined) updates.regularHours = hours.regularHours;
  if (overtimeHours !== undefined) updates.overtimeHours = hours.overtimeHours;
  if (doubleTimeHours !== undefined) updates.doubleTimeHours = hours.doubleTimeHours;

  const [updated] = await db.update(timeEntriesTable).set(updates)
    .where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatTimeEntry(updated));
});

router.delete("/reports/:reportId/time-entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const entryId = parsePositiveId(req.params.entryId);
  if (entryId === null) { res.status(400).json({ error: "Invalid entryId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  await db.delete(timeEntriesTable).where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Report Materials ──────────────────────────────────────────────────────────
router.get("/reports/:reportId/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const materials = await db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, reportId));
  res.json(materials.map(formatMaterial));
});

router.post("/reports/:reportId/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { name, quantity, unit, notes, catalogMaterialId } = req.body;
  if (!name || quantity == null || !unit) { res.status(400).json({ error: "name, quantity, unit required" }); return; }
  const normalizedQuantity = parseDecimalInput(quantity, {
    min: 0,
    max: 9_999_999.999,
    scale: 3,
    allowZero: false,
  });
  if (normalizedQuantity === null) {
    res.status(400).json({ error: "quantity must be positive and use at most 3 decimals" });
    return;
  }
  const normalizedCatalogMaterialId = await normalizeLineItemReference(
    report.companyId,
    catalogMaterialId,
    "catalogMaterial",
  );
  if (normalizedCatalogMaterialId === undefined) {
    res.status(400).json({ error: "catalogMaterialId must belong to the report company" });
    return;
  }
  const [mat] = await db.insert(reportMaterialsTable).values({ reportId, name, quantity: normalizedQuantity, unit, notes: notes ?? null, catalogMaterialId: normalizedCatalogMaterialId }).returning();
  res.status(201).json(formatMaterial(mat));
});

router.patch("/reports/:reportId/materials/:materialId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const materialId = parsePositiveId(req.params.materialId);
  if (materialId === null) { res.status(400).json({ error: "Invalid materialId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { name, quantity, unit, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (quantity !== undefined) {
    const normalizedQuantity = parseDecimalInput(quantity, {
      min: 0,
      max: 9_999_999.999,
      scale: 3,
      allowZero: false,
    });
    if (normalizedQuantity === null) {
      res.status(400).json({ error: "quantity must be positive and use at most 3 decimals" });
      return;
    }
    updates.quantity = normalizedQuantity;
  }
  if (unit !== undefined) updates.unit = unit;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(reportMaterialsTable).set(updates)
    .where(and(eq(reportMaterialsTable.id, materialId), eq(reportMaterialsTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMaterial(updated));
});

router.delete("/reports/:reportId/materials/:materialId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const materialId = parsePositiveId(req.params.materialId);
  if (materialId === null) { res.status(400).json({ error: "Invalid materialId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  await db.delete(reportMaterialsTable).where(and(eq(reportMaterialsTable.id, materialId), eq(reportMaterialsTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Report Equipment ──────────────────────────────────────────────────────────
router.get("/reports/:reportId/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const eq_ = await db.select().from(reportEquipmentTable).where(eq(reportEquipmentTable.reportId, reportId));
  res.json(eq_.map(formatEquipment));
});

router.post("/reports/:reportId/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { name, hoursUsed, notes, unitId, catalogEquipmentId } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const normalizedHoursUsed = parseDecimalInput(hoursUsed ?? 0, {
    min: 0,
    max: 24,
    scale: 2,
  });
  if (normalizedHoursUsed === null) {
    res.status(400).json({ error: "hoursUsed must be between 0 and 24 with at most 2 decimals" });
    return;
  }
  const normalizedCatalogEquipmentId = await normalizeLineItemReference(
    report.companyId,
    catalogEquipmentId,
    "catalogEquipment",
  );
  if (normalizedCatalogEquipmentId === undefined) {
    res.status(400).json({ error: "catalogEquipmentId must belong to the report company" });
    return;
  }
  const [equip] = await db.insert(reportEquipmentTable).values({
    reportId, name, hoursUsed: normalizedHoursUsed, notes: notes ?? null,
    unitId: unitId ?? null, catalogEquipmentId: normalizedCatalogEquipmentId,
  }).returning();
  res.status(201).json(formatEquipment(equip));
});

router.patch("/reports/:reportId/equipment/:equipmentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const equipmentId = parsePositiveId(req.params.equipmentId);
  if (equipmentId === null) { res.status(400).json({ error: "Invalid equipmentId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { name, hoursUsed, notes, unitId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (hoursUsed !== undefined) {
    const normalizedHoursUsed = parseDecimalInput(hoursUsed, {
      min: 0,
      max: 24,
      scale: 2,
    });
    if (normalizedHoursUsed === null) {
      res.status(400).json({ error: "hoursUsed must be between 0 and 24 with at most 2 decimals" });
      return;
    }
    updates.hoursUsed = normalizedHoursUsed;
  }
  if (notes !== undefined) updates.notes = notes;
  if (unitId !== undefined) updates.unitId = unitId;
  const [updated] = await db.update(reportEquipmentTable).set(updates)
    .where(and(eq(reportEquipmentTable.id, equipmentId), eq(reportEquipmentTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatEquipment(updated));
});

router.delete("/reports/:reportId/equipment/:equipmentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const equipmentId = parsePositiveId(req.params.equipmentId);
  if (equipmentId === null) { res.status(400).json({ error: "Invalid equipmentId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  await db.delete(reportEquipmentTable).where(and(eq(reportEquipmentTable.id, equipmentId), eq(reportEquipmentTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Photos ────────────────────────────────────────────────────────────────────
router.get("/reports/:reportId/photos", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const photos = await db.select().from(photosTable).where(eq(photosTable.reportId, reportId));
  res.json(photos.map(formatPhoto));
});

router.post("/reports/:reportId/photos", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { dataUrl, caption, category } = req.body;
  if (!dataUrl) { res.status(400).json({ error: "dataUrl is required" }); return; }
  const photoValidation = validatePhotoDataUrl(dataUrl);
  if (!photoValidation.valid) {
    res.status(400).json({ error: photoValidation.error });
    return;
  }
  const [photo] = await db.insert(photosTable).values({
    reportId,
    url: dataUrl,
    caption: caption ?? null,
    category: category ?? "other",
  }).returning();
  res.status(201).json(formatPhoto(photo));
});

router.patch("/reports/:reportId/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const photoId = parsePositiveId(req.params.photoId);
  if (photoId === null) { res.status(400).json({ error: "Invalid photoId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { caption, category } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (caption !== undefined) updates.caption = caption;
  if (category !== undefined) updates.category = category;
  const [updated] = await db.update(photosTable).set(updates)
    .where(and(eq(photosTable.id, photoId), eq(photosTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatPhoto(updated));
});

router.delete("/reports/:reportId/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const photoId = parsePositiveId(req.params.photoId);
  if (photoId === null) { res.status(400).json({ error: "Invalid photoId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const [deleted] = await db.delete(photosTable).where(and(eq(photosTable.id, photoId), eq(photosTable.reportId, reportId))).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── Signature ─────────────────────────────────────────────────────────────────
router.post("/reports/:reportId/signature", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parsePositiveId(req.params.reportId);
  if (reportId === null) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (rejectLockedReport(report, m.role, res)) { return; }
  const { dataUrl } = req.body;
  if (!dataUrl) { res.status(400).json({ error: "dataUrl is required" }); return; }
  const signatureValidation = validateSignatureDataUrl(dataUrl);
  if (!signatureValidation.valid) {
    res.status(400).json({ error: signatureValidation.error });
    return;
  }

  // Upsert signature
  const existing = await db.select().from(signaturesTable).where(eq(signaturesTable.reportId, reportId));
  let sig;
  if (existing.length > 0) {
    [sig] = await db.update(signaturesTable).set({ dataUrl }).where(eq(signaturesTable.reportId, reportId)).returning();
  } else {
    [sig] = await db.insert(signaturesTable).values({ reportId, dataUrl }).returning();
  }
  res.json(formatSignature(sig));
});

export default router;
