import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db, reportTemplatesTable, workPackageTemplatesTable, companyMembershipsTable,
  dailyReportsTable, timeEntriesTable, reportMaterialsTable, reportEquipmentTable,
  crewMembersTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  return m;
}

function fmtTemplate(t: typeof reportTemplatesTable.$inferSelect) {
  return {
    id: t.id, companyId: t.companyId, createdById: t.createdById,
    name: t.name, description: t.description,
    defaultCrewId: t.defaultCrewId, defaultProjectId: t.defaultProjectId,
    defaultCustomer: t.defaultCustomer, defaultWorkLocation: t.defaultWorkLocation,
    defaultWorkPerformed: t.defaultWorkPerformed, defaultSafetyNotes: t.defaultSafetyNotes,
    defaultNotes: t.defaultNotes,
    laborItems: t.laborItems, equipmentItems: t.equipmentItems, materialItems: t.materialItems,
    active: t.active,
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

// ── Report Templates ──────────────────────────────────────────────────────────
router.get("/report-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parseInt(req.query.companyId as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const templates = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.companyId, companyId));
  res.json(templates.map(fmtTemplate));
});

router.post("/report-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, name, ...rest } = req.body;
  if (!companyId || !name) { res.status(400).json({ error: "companyId and name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [template] = await db.insert(reportTemplatesTable).values({
    companyId, name, description: rest.description ?? null,
    createdById: req.userId ?? null,
    defaultCrewId: rest.defaultCrewId ?? null, defaultProjectId: rest.defaultProjectId ?? null,
    defaultCustomer: rest.defaultCustomer ?? null, defaultWorkLocation: rest.defaultWorkLocation ?? null,
    defaultWorkPerformed: rest.defaultWorkPerformed ?? null,
    defaultSafetyNotes: rest.defaultSafetyNotes ?? null, defaultNotes: rest.defaultNotes ?? null,
    laborItems: rest.laborItems ?? [], equipmentItems: rest.equipmentItems ?? [],
    materialItems: rest.materialItems ?? [], active: rest.active ?? true,
  }).returning();
  res.status(201).json(fmtTemplate(template));
});

router.patch("/report-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const updates: Record<string, unknown> = {};
  const fields = ["name","description","defaultCrewId","defaultProjectId","defaultCustomer","defaultWorkLocation",
    "defaultWorkPerformed","defaultSafetyNotes","defaultNotes","laborItems","equipmentItems","materialItems","active"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  const [updated] = await db.update(reportTemplatesTable).set(updates).where(eq(reportTemplatesTable.id, id)).returning();
  res.json(fmtTemplate(updated));
});

router.delete("/report-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(reportTemplatesTable).where(eq(reportTemplatesTable.id, id));
  res.sendStatus(204);
});

// ── Apply template to a report ────────────────────────────────────────────────
router.post("/report-templates/:id/apply", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const templateId = parsePositiveId(req.params.id);
  const reportId = parsePositiveId(req.body.reportId);
  if (templateId === null || reportId === null) { res.status(400).json({ error: "templateId and reportId required" }); return; }

  const [template] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (report.companyId !== template.companyId) {
    res.status(403).json({ error: "Template and report must belong to the same company" });
    return;
  }

  const m = await checkAccess(req.clerkUserId, template.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  // Apply template fields to report (only if not already set)
  const reportUpdates: Record<string, unknown> = {};
  if (!report.crewId && template.defaultCrewId) reportUpdates.crewId = template.defaultCrewId;
  if (!report.projectId && template.defaultProjectId) reportUpdates.projectId = template.defaultProjectId;
  if (!report.workLocation && template.defaultWorkLocation) reportUpdates.workLocation = template.defaultWorkLocation;
  if (!report.workPerformed && template.defaultWorkPerformed) reportUpdates.workPerformed = template.defaultWorkPerformed;
  if (!report.safetyNotes && template.defaultSafetyNotes) reportUpdates.safetyNotes = template.defaultSafetyNotes;
  if (!report.additionalNotes && template.defaultNotes) reportUpdates.additionalNotes = template.defaultNotes;

  if (Object.keys(reportUpdates).length > 0) {
    await db.update(dailyReportsTable).set(reportUpdates).where(eq(dailyReportsTable.id, reportId));
  }

  // Add labor items from template
  const laborItems = Array.isArray(template.laborItems) ? template.laborItems as Array<Record<string, unknown>> : [];
  for (const item of laborItems) {
    await db.insert(timeEntriesTable).values({
      reportId,
      employeeName: String(item.name ?? ""),
      trade: String(item.trade ?? ""),
      regularHours: "0", overtimeHours: "0", doubleTimeHours: "0",
      stormHours: "0", travelHours: "0", perDiemDays: "0",
      laborClassificationId: item.laborClassificationId ? Number(item.laborClassificationId) : null,
    });
  }

  // Add equipment items from template
  const equipmentItems = Array.isArray(template.equipmentItems) ? template.equipmentItems as Array<Record<string, unknown>> : [];
  for (const item of equipmentItems) {
    await db.insert(reportEquipmentTable).values({
      reportId,
      name: String(item.name ?? ""),
      catalogEquipmentId: item.catalogEquipmentId ? Number(item.catalogEquipmentId) : null,
      hoursUsed: String(item.hours ?? "0"),
      quantity: String(item.quantity ?? "1"),
    });
  }

  // Add material items from template
  const materialItems = Array.isArray(template.materialItems) ? template.materialItems as Array<Record<string, unknown>> : [];
  for (const item of materialItems) {
    await db.insert(reportMaterialsTable).values({
      reportId,
      name: String(item.name ?? ""),
      quantity: String(item.quantity ?? "0"),
      unit: String(item.unit ?? "each"),
      catalogMaterialId: item.catalogMaterialId ? Number(item.catalogMaterialId) : null,
    });
  }

  res.json({ success: true, appliedFields: Object.keys(reportUpdates), addedLabor: laborItems.length, addedEquipment: equipmentItems.length, addedMaterials: materialItems.length });
});

// ── Copy report ───────────────────────────────────────────────────────────────
router.post("/reports/:reportId/copy", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const sourceId = parseInt(req.params.reportId, 10);
  const targetDate = req.body.reportDate ?? new Date().toISOString().split("T")[0];

  const [source] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, sourceId));
  if (!source) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, source.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  // Create new independent draft (do NOT copy status, completedAt, id)
  const [newReport] = await db.insert(dailyReportsTable).values({
    companyId: source.companyId, projectId: source.projectId, crewId: source.crewId,
    foremanId: req.userId ?? source.foremanId, reportDate: targetDate,
    status: "draft", workLocation: source.workLocation, generalForeman: source.generalForeman,
    startTime: source.startTime, weatherConditions: source.weatherConditions,
    workPerformed: source.workPerformed, safetyNotes: source.safetyNotes,
    additionalNotes: source.additionalNotes,
  }).returning();

  // Copy time entries (reset hours to 0 — foreman fills in today's hours)
  const sourceEntries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, sourceId));
  for (const e of sourceEntries) {
    await db.insert(timeEntriesTable).values({
      reportId: newReport.id, employeeName: e.employeeName, trade: e.trade,
      crewMemberId: e.crewMemberId, laborClassificationId: e.laborClassificationId,
      billingCode: e.billingCode,
      regularHours: "0", overtimeHours: "0", doubleTimeHours: "0",
      stormHours: "0", travelHours: "0", perDiemDays: "0",
    });
  }

  // Copy equipment (reset hours to 0)
  const sourceEquip = await db.select().from(reportEquipmentTable).where(eq(reportEquipmentTable.reportId, sourceId));
  for (const e of sourceEquip) {
    await db.insert(reportEquipmentTable).values({
      reportId: newReport.id, name: e.name, catalogEquipmentId: e.catalogEquipmentId,
      unitId: e.unitId, billingCode: e.billingCode, quantity: e.quantity,
      hoursUsed: "0", daysUsed: "0", standbyHours: "0",
    });
  }

  // Copy materials (keep quantities as starting point)
  const sourceMats = await db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, sourceId));
  for (const mat of sourceMats) {
    await db.insert(reportMaterialsTable).values({
      reportId: newReport.id, name: mat.name, quantity: "0",
      unit: mat.unit, catalogMaterialId: mat.catalogMaterialId,
    });
  }

  res.status(201).json({ id: newReport.id, reportDate: newReport.reportDate, status: newReport.status });
});

// ── Work Package Templates ─────────────────────────────────────────────────────
function fmtWP(w: typeof workPackageTemplatesTable.$inferSelect) {
  return {
    id: w.id, companyId: w.companyId, createdById: w.createdById,
    name: w.name, description: w.description, billingCode: w.billingCode,
    laborItems: w.laborItems, equipmentItems: w.equipmentItems, materialItems: w.materialItems,
    safetyChecklist: w.safetyChecklist, requiredDocumentation: w.requiredDocumentation,
    defaultNotes: w.defaultNotes, active: w.active,
    createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(),
  };
}

router.get("/work-package-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parseInt(req.query.companyId as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const templates = await db.select().from(workPackageTemplatesTable).where(eq(workPackageTemplatesTable.companyId, companyId));
  res.json(templates.map(fmtWP));
});

router.post("/work-package-templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, name, ...rest } = req.body;
  if (!companyId || !name) { res.status(400).json({ error: "companyId and name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [wp] = await db.insert(workPackageTemplatesTable).values({
    companyId, name, description: rest.description ?? null,
    createdById: req.userId ?? null, billingCode: rest.billingCode ?? null,
    laborItems: rest.laborItems ?? [], equipmentItems: rest.equipmentItems ?? [],
    materialItems: rest.materialItems ?? [], safetyChecklist: rest.safetyChecklist ?? [],
    requiredDocumentation: rest.requiredDocumentation ?? [],
    defaultNotes: rest.defaultNotes ?? null, active: rest.active ?? true,
  }).returning();
  res.status(201).json(fmtWP(wp));
});

router.patch("/work-package-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(workPackageTemplatesTable).where(eq(workPackageTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const updates: Record<string, unknown> = {};
  const fields = ["name","description","billingCode","laborItems","equipmentItems","materialItems",
    "safetyChecklist","requiredDocumentation","defaultNotes","active"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  const [updated] = await db.update(workPackageTemplatesTable).set(updates).where(eq(workPackageTemplatesTable.id, id)).returning();
  res.json(fmtWP(updated));
});

router.delete("/work-package-templates/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(workPackageTemplatesTable).where(eq(workPackageTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(workPackageTemplatesTable).where(eq(workPackageTemplatesTable.id, id));
  res.sendStatus(204);
});

// ── Apply work package to report ──────────────────────────────────────────────
router.post("/work-package-templates/:id/apply", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const wpId = parsePositiveId(req.params.id);
  const reportId = parsePositiveId(req.body.reportId);
  if (wpId === null || reportId === null) { res.status(400).json({ error: "id and reportId required" }); return; }

  const [wp] = await db.select().from(workPackageTemplatesTable).where(eq(workPackageTemplatesTable.id, wpId));
  if (!wp) { res.status(404).json({ error: "Not found" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (report.companyId !== wp.companyId) {
    res.status(403).json({ error: "Work package and report must belong to the same company" });
    return;
  }

  const m = await checkAccess(req.clerkUserId, wp.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const laborItems = Array.isArray(wp.laborItems) ? wp.laborItems as Array<Record<string, unknown>> : [];
  const equipmentItems = Array.isArray(wp.equipmentItems) ? wp.equipmentItems as Array<Record<string, unknown>> : [];
  const materialItems = Array.isArray(wp.materialItems) ? wp.materialItems as Array<Record<string, unknown>> : [];

  for (const item of laborItems) {
    await db.insert(timeEntriesTable).values({
      reportId, employeeName: String(item.name ?? "TBD"), trade: String(item.trade ?? ""),
      regularHours: String(item.hours ?? "0"), overtimeHours: "0", doubleTimeHours: "0",
      stormHours: "0", travelHours: "0", perDiemDays: "0",
      laborClassificationId: item.laborClassificationId ? Number(item.laborClassificationId) : null,
    });
  }

  for (const item of equipmentItems) {
    await db.insert(reportEquipmentTable).values({
      reportId, name: String(item.name ?? ""),
      catalogEquipmentId: item.catalogEquipmentId ? Number(item.catalogEquipmentId) : null,
      hoursUsed: String(item.hours ?? "0"), quantity: String(item.quantity ?? "1"),
    });
  }

  for (const item of materialItems) {
    await db.insert(reportMaterialsTable).values({
      reportId, name: String(item.name ?? ""),
      quantity: String(item.quantity ?? "0"), unit: String(item.unit ?? "each"),
      catalogMaterialId: item.catalogMaterialId ? Number(item.catalogMaterialId) : null,
    });
  }

  if (wp.defaultNotes && !report.additionalNotes) {
    await db.update(dailyReportsTable).set({ additionalNotes: wp.defaultNotes }).where(eq(dailyReportsTable.id, reportId));
  }

  res.json({ success: true, addedLabor: laborItems.length, addedEquipment: equipmentItems.length, addedMaterials: materialItems.length });
});

export default router;
