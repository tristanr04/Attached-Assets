import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db, reportTemplatesTable, workPackageTemplatesTable, companyMembershipsTable,
  dailyReportsTable, timeEntriesTable, reportMaterialsTable, reportEquipmentTable,
  crewMembersTable, crewsTable, projectsTable, laborClassificationsTable,
  catalogMaterialsTable, catalogEquipmentTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parseDateOnly, parsePositiveId } from "../lib/requestValues";
import { canAccessReport, canMutateReport, dailyReportLockKey } from "../lib/reportState";
import { normalizeTemplateItems } from "../lib/templateItems";

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

type CompanyReferenceKind =
  | "crew"
  | "project"
  | "laborClassification"
  | "catalogMaterial"
  | "catalogEquipment";

async function companyReferenceBelongs(
  kind: CompanyReferenceKind,
  value: unknown,
  companyId: number,
): Promise<boolean> {
  if (value === undefined || value === null) {
    return true;
  }

  const id = parsePositiveId(value);
  if (id === null) {
    return false;
  }

  if (kind === "crew") {
    const [row] = await db.select({ id: crewsTable.id }).from(crewsTable)
      .where(and(eq(crewsTable.id, id), eq(crewsTable.companyId, companyId)));
    return Boolean(row);
  }
  if (kind === "project") {
    const [row] = await db.select({ id: projectsTable.id }).from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.companyId, companyId)));
    return Boolean(row);
  }
  if (kind === "laborClassification") {
    const [row] = await db.select({ id: laborClassificationsTable.id }).from(laborClassificationsTable)
      .where(and(eq(laborClassificationsTable.id, id), eq(laborClassificationsTable.companyId, companyId)));
    return Boolean(row);
  }
  if (kind === "catalogMaterial") {
    const [row] = await db.select({ id: catalogMaterialsTable.id }).from(catalogMaterialsTable)
      .where(and(eq(catalogMaterialsTable.id, id), eq(catalogMaterialsTable.companyId, companyId)));
    return Boolean(row);
  }

  const [row] = await db.select({ id: catalogEquipmentTable.id }).from(catalogEquipmentTable)
    .where(and(eq(catalogEquipmentTable.id, id), eq(catalogEquipmentTable.companyId, companyId)));
  return Boolean(row);
}

async function validateApplicationReferences(
  companyId: number,
  values: {
    defaultCrewId?: unknown;
    defaultProjectId?: unknown;
    laborItems: Array<Record<string, unknown>>;
    equipmentItems: Array<Record<string, unknown>>;
    materialItems: Array<Record<string, unknown>>;
  },
): Promise<string | null> {
  if (!await companyReferenceBelongs("crew", values.defaultCrewId, companyId)) {
    return "defaultCrewId must belong to the report company";
  }
  if (!await companyReferenceBelongs("project", values.defaultProjectId, companyId)) {
    return "defaultProjectId must belong to the report company";
  }
  for (const item of values.laborItems) {
    if (!await companyReferenceBelongs("laborClassification", item.laborClassificationId, companyId)) {
      return "laborClassificationId must belong to the report company";
    }
  }
  for (const item of values.equipmentItems) {
    if (!await companyReferenceBelongs("catalogEquipment", item.catalogEquipmentId, companyId)) {
      return "catalogEquipmentId must belong to the report company";
    }
  }
  for (const item of values.materialItems) {
    if (!await companyReferenceBelongs("catalogMaterial", item.catalogMaterialId, companyId)) {
      return "catalogMaterialId must belong to the report company";
    }
  }
  return null;
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
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "companyId required" }); return; }
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
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
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
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
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

  const m = await checkAccess(req.clerkUserId, template.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!canMutateReport(report.status, m.role)) {
    res.status(403).json({ error: "Cannot apply a template to a completed report" });
    return;
  }

  // Apply template fields to report (only if not already set)
  const reportUpdates: Record<string, unknown> = {};
  if (!report.crewId && template.defaultCrewId) reportUpdates.crewId = template.defaultCrewId;
  if (!report.projectId && template.defaultProjectId) reportUpdates.projectId = template.defaultProjectId;
  if (!report.workLocation && template.defaultWorkLocation) reportUpdates.workLocation = template.defaultWorkLocation;
  if (!report.workPerformed && template.defaultWorkPerformed) reportUpdates.workPerformed = template.defaultWorkPerformed;
  if (!report.safetyNotes && template.defaultSafetyNotes) reportUpdates.safetyNotes = template.defaultSafetyNotes;
  if (!report.additionalNotes && template.defaultNotes) reportUpdates.additionalNotes = template.defaultNotes;

  const normalizedItems = normalizeTemplateItems(
    Array.isArray(template.laborItems) ? template.laborItems as Array<Record<string, unknown>> : [],
    Array.isArray(template.equipmentItems) ? template.equipmentItems as Array<Record<string, unknown>> : [],
    Array.isArray(template.materialItems) ? template.materialItems as Array<Record<string, unknown>> : [],
    false,
  );
  if (!normalizedItems.valid) { res.status(400).json({ error: normalizedItems.error }); return; }
  const { laborItems, equipmentItems, materialItems } = normalizedItems;
  const referenceError = await validateApplicationReferences(template.companyId, {
    defaultCrewId: reportUpdates.crewId,
    defaultProjectId: reportUpdates.projectId,
    laborItems,
    equipmentItems,
    materialItems,
  });
  if (referenceError) { res.status(400).json({ error: referenceError }); return; }

  await db.transaction(async (tx) => {
    if (Object.keys(reportUpdates).length > 0) {
      await tx.update(dailyReportsTable).set(reportUpdates).where(eq(dailyReportsTable.id, reportId));
    }

    for (const item of laborItems) {
      await tx.insert(timeEntriesTable).values({
        reportId,
        employeeName: String(item.name ?? ""),
        trade: String(item.trade ?? ""),
        regularHours: "0", overtimeHours: "0", doubleTimeHours: "0",
        stormHours: "0", travelHours: "0", perDiemDays: "0",
        laborClassificationId: item.laborClassificationId ? Number(item.laborClassificationId) : null,
      });
    }

    for (const item of equipmentItems) {
      await tx.insert(reportEquipmentTable).values({
        reportId,
        name: String(item.name ?? ""),
        catalogEquipmentId: item.catalogEquipmentId ? Number(item.catalogEquipmentId) : null,
        hoursUsed: String(item.hours ?? "0"),
        quantity: String(item.quantity ?? "1"),
      });
    }

    for (const item of materialItems) {
      await tx.insert(reportMaterialsTable).values({
        reportId,
        name: String(item.name ?? ""),
        quantity: String(item.quantity ?? "0"),
        unit: String(item.unit ?? "each"),
        catalogMaterialId: item.catalogMaterialId ? Number(item.catalogMaterialId) : null,
      });
    }
  });

  res.json({ success: true, appliedFields: Object.keys(reportUpdates), addedLabor: laborItems.length, addedEquipment: equipmentItems.length, addedMaterials: materialItems.length });
});

// ── Copy report ───────────────────────────────────────────────────────────────
router.post("/reports/:reportId/copy", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const sourceId = parsePositiveId(req.params.reportId);
  const targetDate = parseDateOnly(req.body.reportDate ?? new Date().toISOString().split("T")[0]);
  if (sourceId === null || targetDate === null) {
    res.status(400).json({ error: "Valid reportId and reportDate are required" });
    return;
  }

  const [source] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, sourceId));
  if (!source) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, source.companyId, source.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const foremanId = req.userId ?? m.userId;
  if (!foremanId) { res.status(403).json({ error: "A linked user profile is required" }); return; }

  const [sourceEntries, sourceEquip, sourceMats] = await Promise.all([
    db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, sourceId)),
    db.select().from(reportEquipmentTable).where(eq(reportEquipmentTable.reportId, sourceId)),
    db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, sourceId)),
  ]);

  const result = await db.transaction(async (tx) => {
    const lockKey = dailyReportLockKey(source.companyId, foremanId, targetDate);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [existing] = await tx.select().from(dailyReportsTable)
      .where(and(
        eq(dailyReportsTable.companyId, source.companyId),
        eq(dailyReportsTable.foremanId, foremanId),
        eq(dailyReportsTable.reportDate, targetDate),
      ))
      .orderBy(desc(dailyReportsTable.id))
      .limit(1);
    if (existing) {
      return { report: existing, created: false };
    }

    const [created] = await tx.insert(dailyReportsTable).values({
      companyId: source.companyId, projectId: source.projectId, crewId: source.crewId,
      foremanId, reportDate: targetDate,
      status: "draft", workLocation: source.workLocation, generalForeman: source.generalForeman,
      startTime: source.startTime, weatherConditions: source.weatherConditions,
      workPerformed: source.workPerformed, safetyNotes: source.safetyNotes,
      additionalNotes: source.additionalNotes,
    }).returning();

    for (const e of sourceEntries) {
      await tx.insert(timeEntriesTable).values({
        reportId: created.id, employeeName: e.employeeName, trade: e.trade,
        crewMemberId: e.crewMemberId, laborClassificationId: e.laborClassificationId,
        billingCode: e.billingCode,
        regularHours: "0", overtimeHours: "0", doubleTimeHours: "0",
        stormHours: "0", travelHours: "0", perDiemDays: "0",
      });
    }

    for (const e of sourceEquip) {
      await tx.insert(reportEquipmentTable).values({
        reportId: created.id, name: e.name, catalogEquipmentId: e.catalogEquipmentId,
        unitId: e.unitId, billingCode: e.billingCode, quantity: e.quantity,
        hoursUsed: "0", daysUsed: "0", standbyHours: "0",
      });
    }

    for (const mat of sourceMats) {
      await tx.insert(reportMaterialsTable).values({
        reportId: created.id, name: mat.name, quantity: "0",
        unit: mat.unit, catalogMaterialId: mat.catalogMaterialId,
      });
    }

    return { report: created, created: true };
  });

  if (!result.created) {
    res.setHeader("Idempotent-Replay", "true");
  }
  res.status(result.created ? 201 : 200).json({
    id: result.report.id,
    reportDate: result.report.reportDate,
    status: result.report.status,
  });
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
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "companyId required" }); return; }
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
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
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
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
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

  const m = await checkAccess(req.clerkUserId, wp.companyId, report.foremanId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!canMutateReport(report.status, m.role)) {
    res.status(403).json({ error: "Cannot apply a work package to a completed report" });
    return;
  }

  const normalizedItems = normalizeTemplateItems(
    Array.isArray(wp.laborItems) ? wp.laborItems as Array<Record<string, unknown>> : [],
    Array.isArray(wp.equipmentItems) ? wp.equipmentItems as Array<Record<string, unknown>> : [],
    Array.isArray(wp.materialItems) ? wp.materialItems as Array<Record<string, unknown>> : [],
    true,
  );
  if (!normalizedItems.valid) { res.status(400).json({ error: normalizedItems.error }); return; }
  const { laborItems, equipmentItems, materialItems } = normalizedItems;
  const referenceError = await validateApplicationReferences(wp.companyId, {
    laborItems,
    equipmentItems,
    materialItems,
  });
  if (referenceError) { res.status(400).json({ error: referenceError }); return; }

  await db.transaction(async (tx) => {
    for (const item of laborItems) {
      await tx.insert(timeEntriesTable).values({
        reportId, employeeName: String(item.name ?? "TBD"), trade: String(item.trade ?? ""),
        regularHours: String(item.hours ?? "0"), overtimeHours: "0", doubleTimeHours: "0",
        stormHours: "0", travelHours: "0", perDiemDays: "0",
        laborClassificationId: item.laborClassificationId ? Number(item.laborClassificationId) : null,
      });
    }

    for (const item of equipmentItems) {
      await tx.insert(reportEquipmentTable).values({
        reportId, name: String(item.name ?? ""),
        catalogEquipmentId: item.catalogEquipmentId ? Number(item.catalogEquipmentId) : null,
        hoursUsed: String(item.hours ?? "0"), quantity: String(item.quantity ?? "1"),
      });
    }

    for (const item of materialItems) {
      await tx.insert(reportMaterialsTable).values({
        reportId, name: String(item.name ?? ""),
        quantity: String(item.quantity ?? "0"), unit: String(item.unit ?? "each"),
        catalogMaterialId: item.catalogMaterialId ? Number(item.catalogMaterialId) : null,
      });
    }

    if (wp.defaultNotes && !report.additionalNotes) {
      await tx.update(dailyReportsTable).set({ additionalNotes: wp.defaultNotes }).where(eq(dailyReportsTable.id, reportId));
    }
  });

  res.json({ success: true, addedLabor: laborItems.length, addedEquipment: equipmentItems.length, addedMaterials: materialItems.length });
});

export default router;
