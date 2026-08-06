import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db, dailyReportsTable, companyMembershipsTable, usersTable,
  projectsTable, crewsTable, timeEntriesTable, reportMaterialsTable,
  reportEquipmentTable, photosTable, signaturesTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  return m;
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
  return { id: p.id, reportId: p.reportId, url: p.url, caption: p.caption, createdAt: p.createdAt.toISOString() };
}

function formatSignature(s: typeof signaturesTable.$inferSelect) {
  return { id: s.id, reportId: s.reportId, dataUrl: s.dataUrl, createdAt: s.createdAt.toISOString() };
}

// ── List reports ──────────────────────────────────────────────────────────────
router.get("/reports", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId: cqId, crewId: crqId, projectId: prqId, status: sqId, limit: lqId } = req.query;

  const memberships = await db.select({ companyId: companyMembershipsTable.companyId, role: companyMembershipsTable.role, userId: companyMembershipsTable.userId })
    .from(companyMembershipsTable).where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));

  if (memberships.length === 0) { res.json([]); return; }

  let reports = await db.select().from(dailyReportsTable).orderBy(desc(dailyReportsTable.reportDate));

  const allowedCompanyIds = memberships.map(m => m.companyId);
  reports = reports.filter(r => allowedCompanyIds.includes(r.companyId));

  if (cqId) reports = reports.filter(r => r.companyId === parseInt(cqId as string, 10));
  if (crqId) reports = reports.filter(r => r.crewId === parseInt(crqId as string, 10));
  if (prqId) reports = reports.filter(r => r.projectId === parseInt(prqId as string, 10));
  if (sqId) reports = reports.filter(r => r.status === sqId);
  if (lqId) reports = reports.slice(0, parseInt(lqId as string, 10));

  const enriched = await Promise.all(reports.map(enrichReport));
  res.json(enriched);
});

// ── Create report ─────────────────────────────────────────────────────────────
router.post("/reports", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, reportDate, ...rest } = req.body;
  if (!companyId || !reportDate) { res.status(400).json({ error: "companyId and reportDate are required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [report] = await db.insert(dailyReportsTable).values({
    companyId, reportDate, foremanId: req.userId ?? null, ...rest,
  }).returning();
  res.status(201).json(await enrichReport(report));
});

// ── Get report detail ─────────────────────────────────────────────────────────
router.get("/reports/:reportId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId);
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
  const reportId = parseInt(req.params.reportId, 10);

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (report.status === "complete" && m.role === "foreman") { res.status(403).json({ error: "Cannot edit completed report" }); return; }

  const allowed = ["projectId","crewId","reportDate","workLocation","generalForeman","startTime","stopTime",
    "weatherConditions","workPerformed","structuresInstalled","safetyMeeting","safetyNotes",
    "delays","outages","customerIssues","injuries","injuryDetails","additionalNotes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db.update(dailyReportsTable).set(updates).where(eq(dailyReportsTable.id, reportId)).returning();
  res.json(await enrichReport(updated));
});

// ── Delete report ─────────────────────────────────────────────────────────────
router.delete("/reports/:reportId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (report.status !== "draft") { res.status(400).json({ error: "Only draft reports can be deleted" }); return; }

  await db.delete(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  res.sendStatus(204);
});

// ── Complete report ───────────────────────────────────────────────────────────
router.post("/reports/:reportId/complete", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(dailyReportsTable)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(dailyReportsTable.id, reportId)).returning();
  res.json(await enrichReport(updated));
});

// ── Time entries ──────────────────────────────────────────────────────────────
router.get("/reports/:reportId/time-entries", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const entries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, reportId));
  res.json(entries.map(formatTimeEntry));
});

router.post("/reports/:reportId/time-entries", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const { employeeName, trade, regularHours, overtimeHours, doubleTimeHours, crewMemberId } = req.body;
  if (!employeeName || !trade) { res.status(400).json({ error: "employeeName and trade are required" }); return; }

  const [entry] = await db.insert(timeEntriesTable).values({
    reportId, employeeName, trade,
    regularHours: String(regularHours ?? 0),
    overtimeHours: String(overtimeHours ?? 0),
    doubleTimeHours: String(doubleTimeHours ?? 0),
    crewMemberId: crewMemberId ?? null,
  }).returning();
  res.status(201).json(formatTimeEntry(entry));
});

router.patch("/reports/:reportId/time-entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const entryId = parseInt(req.params.entryId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const { employeeName, trade, regularHours, overtimeHours, doubleTimeHours } = req.body;
  const updates: Record<string, unknown> = {};
  if (employeeName !== undefined) updates.employeeName = employeeName;
  if (trade !== undefined) updates.trade = trade;
  if (regularHours !== undefined) updates.regularHours = String(regularHours);
  if (overtimeHours !== undefined) updates.overtimeHours = String(overtimeHours);
  if (doubleTimeHours !== undefined) updates.doubleTimeHours = String(doubleTimeHours);

  const [updated] = await db.update(timeEntriesTable).set(updates)
    .where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatTimeEntry(updated));
});

router.delete("/reports/:reportId/time-entries/:entryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const entryId = parseInt(req.params.entryId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(timeEntriesTable).where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Report Materials ──────────────────────────────────────────────────────────
router.get("/reports/:reportId/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const materials = await db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, reportId));
  res.json(materials.map(formatMaterial));
});

router.post("/reports/:reportId/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, quantity, unit, notes, catalogMaterialId } = req.body;
  if (!name || quantity == null || !unit) { res.status(400).json({ error: "name, quantity, unit required" }); return; }
  const [mat] = await db.insert(reportMaterialsTable).values({ reportId, name, quantity: String(quantity), unit, notes: notes ?? null, catalogMaterialId: catalogMaterialId ?? null }).returning();
  res.status(201).json(formatMaterial(mat));
});

router.patch("/reports/:reportId/materials/:materialId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const materialId = parseInt(req.params.materialId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, quantity, unit, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (quantity !== undefined) updates.quantity = String(quantity);
  if (unit !== undefined) updates.unit = unit;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(reportMaterialsTable).set(updates)
    .where(and(eq(reportMaterialsTable.id, materialId), eq(reportMaterialsTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMaterial(updated));
});

router.delete("/reports/:reportId/materials/:materialId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const materialId = parseInt(req.params.materialId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(reportMaterialsTable).where(and(eq(reportMaterialsTable.id, materialId), eq(reportMaterialsTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Report Equipment ──────────────────────────────────────────────────────────
router.get("/reports/:reportId/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const eq_ = await db.select().from(reportEquipmentTable).where(eq(reportEquipmentTable.reportId, reportId));
  res.json(eq_.map(formatEquipment));
});

router.post("/reports/:reportId/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, hoursUsed, notes, unitId, catalogEquipmentId } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [equip] = await db.insert(reportEquipmentTable).values({
    reportId, name, hoursUsed: String(hoursUsed ?? 0), notes: notes ?? null,
    unitId: unitId ?? null, catalogEquipmentId: catalogEquipmentId ?? null,
  }).returning();
  res.status(201).json(formatEquipment(equip));
});

router.patch("/reports/:reportId/equipment/:equipmentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const equipmentId = parseInt(req.params.equipmentId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, hoursUsed, notes, unitId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (hoursUsed !== undefined) updates.hoursUsed = String(hoursUsed);
  if (notes !== undefined) updates.notes = notes;
  if (unitId !== undefined) updates.unitId = unitId;
  const [updated] = await db.update(reportEquipmentTable).set(updates)
    .where(and(eq(reportEquipmentTable.id, equipmentId), eq(reportEquipmentTable.reportId, reportId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatEquipment(updated));
});

router.delete("/reports/:reportId/equipment/:equipmentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const equipmentId = parseInt(req.params.equipmentId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(reportEquipmentTable).where(and(eq(reportEquipmentTable.id, equipmentId), eq(reportEquipmentTable.reportId, reportId)));
  res.sendStatus(204);
});

// ── Photos ────────────────────────────────────────────────────────────────────
router.get("/reports/:reportId/photos", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const photos = await db.select().from(photosTable).where(eq(photosTable.reportId, reportId));
  res.json(photos.map(formatPhoto));
});

router.post("/reports/:reportId/photos", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { dataUrl, caption } = req.body;
  if (!dataUrl) { res.status(400).json({ error: "dataUrl is required" }); return; }
  // Store the dataUrl directly as the "url" (MVP approach - no object storage yet)
  const [photo] = await db.insert(photosTable).values({ reportId, url: dataUrl, caption: caption ?? null }).returning();
  res.status(201).json(formatPhoto(photo));
});

router.delete("/reports/:reportId/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const photoId = parseInt(req.params.photoId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [deleted] = await db.delete(photosTable).where(and(eq(photosTable.id, photoId), eq(photosTable.reportId, reportId))).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── Signature ─────────────────────────────────────────────────────────────────
router.post("/reports/:reportId/signature", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reportId = parseInt(req.params.reportId, 10);
  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, report.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const { dataUrl } = req.body;
  if (!dataUrl) { res.status(400).json({ error: "dataUrl is required" }); return; }

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
