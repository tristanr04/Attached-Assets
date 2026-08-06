import { Router, type IRouter } from "express";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  db,
  companyMembershipsTable,
  pkbPoleTypesTable,
  pkbStructureConfigsTable,
  pkbComponentsTable,
  pkbWorkActionsTable,
  pkbWorkPackagesTable,
  pkbBillingMappingsTable,
  pkbConditionalRulesTable,
  pkbVisualReferencesTable,
  pkbAuditLogTable,
  pkbImportJobsTable,
  pkbTrainingExamplesTable,
  reportBillingSuggestionsTable,
  reportBillingValidationsTable,
  dailyReportsTable,
  photosTable,
  timeEntriesTable,
  reportMaterialsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── Company isolation helper ────────────────────────────────────────────────
async function getMembership(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(
      eq(companyMembershipsTable.companyId, companyId),
      eq(companyMembershipsTable.clerkUserId, clerkUserId)
    ));
  return m ?? null;
}

function requireAdminOrSupervisor(role: string | undefined): boolean {
  return role === "admin" || role === "supervisor";
}

// ── Audit log helper ────────────────────────────────────────────────────────
async function writeAudit(
  companyId: number,
  userId: number | undefined,
  action: string,
  entityType: string,
  entityId: number | null,
  prev?: unknown,
  next?: unknown,
  reason?: string,
) {
  try {
    await db.insert(pkbAuditLogTable).values({
      companyId,
      userId: userId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      previousValue: prev ? JSON.parse(JSON.stringify(prev)) : null,
      newValue: next ? JSON.parse(JSON.stringify(next)) : null,
      reason: reason ?? null,
    });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}

// ── GET /api/pkb/summary ────────────────────────────────────────────────────
router.get("/pkb/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [ptCount] = await db.select({ c: count() }).from(pkbPoleTypesTable).where(and(eq(pkbPoleTypesTable.companyId, companyId), eq(pkbPoleTypesTable.isActive, true)));
  const [scCount] = await db.select({ c: count() }).from(pkbStructureConfigsTable).where(and(eq(pkbStructureConfigsTable.companyId, companyId), eq(pkbStructureConfigsTable.isActive, true)));
  const [compCount] = await db.select({ c: count() }).from(pkbComponentsTable).where(and(eq(pkbComponentsTable.companyId, companyId), eq(pkbComponentsTable.isActive, true)));
  const [waCount] = await db.select({ c: count() }).from(pkbWorkActionsTable).where(and(eq(pkbWorkActionsTable.companyId, companyId), eq(pkbWorkActionsTable.isActive, true)));
  const [wpCount] = await db.select({ c: count() }).from(pkbWorkPackagesTable).where(and(eq(pkbWorkPackagesTable.companyId, companyId), eq(pkbWorkPackagesTable.isActive, true)));
  const [bmCount] = await db.select({ c: count() }).from(pkbBillingMappingsTable).where(and(eq(pkbBillingMappingsTable.companyId, companyId), eq(pkbBillingMappingsTable.isActive, true)));
  const [vrCount] = await db.select({ c: count() }).from(pkbVisualReferencesTable).where(and(eq(pkbVisualReferencesTable.companyId, companyId), eq(pkbVisualReferencesTable.isActive, true)));

  res.json({
    poleTypes: Number(ptCount.c),
    structureConfigs: Number(scCount.c),
    components: Number(compCount.c),
    workActions: Number(waCount.c),
    workPackages: Number(wpCount.c),
    billingMappings: Number(bmCount.c),
    visualReferences: Number(vrCount.c),
  });
});

// ── GET /api/pkb/validate ───────────────────────────────────────────────────
router.get("/pkb/validate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const errors: { type: "error" | "warning"; code: string; message: string }[] = [];

  // Work packages with no pole type
  const wps = await db.select().from(pkbWorkPackagesTable).where(and(eq(pkbWorkPackagesTable.companyId, companyId), eq(pkbWorkPackagesTable.isActive, true)));
  for (const wp of wps) {
    if (!wp.poleTypeId && !wp.poleMaterial) errors.push({ type: "error", code: "WP_NO_POLE_TYPE", message: `Work package "${wp.name}" has no pole type set.` });
    const billing = wp.billing as { requiredCodes?: { code: string }[] } | null;
    if (!billing?.requiredCodes?.length) errors.push({ type: "warning", code: "WP_NO_BILLING_CODES", message: `Work package "${wp.name}" has no required billing codes.` });
  }

  // Billing mappings with no rate
  const bms = await db.select().from(pkbBillingMappingsTable).where(and(eq(pkbBillingMappingsTable.companyId, companyId), eq(pkbBillingMappingsTable.isActive, true)));
  for (const bm of bms) {
    if (!bm.unitRate) errors.push({ type: "warning", code: "BM_NO_RATE", message: `Billing mapping "${bm.billingCode}" has no unit rate.` });
    if (bm.expirationDate && new Date(bm.expirationDate) < new Date()) errors.push({ type: "warning", code: "BM_EXPIRED", message: `Billing mapping "${bm.billingCode}" has an expired rate (${bm.expirationDate}).` });
  }

  res.json({ errors, warnings: errors.filter(e => e.type === "warning").length, errorCount: errors.filter(e => e.type === "error").length });
});

// ── Generic CRUD factory ────────────────────────────────────────────────────
// Reused for entities that follow the same company-scoped CRUD pattern.

function makeCrud<TTable extends { companyId: any; isActive: any; versionStatus?: any }>(
  table: any,
  entityType: string,
  listWhere: (companyId: number, query: Record<string, string>) => any,
  prefix: string,
) {
  // LIST
  router.get(`/pkb/${prefix}`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.query.companyId as string, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db.select().from(table).where(listWhere(companyId, req.query as Record<string, string>)).orderBy(desc(table.createdAt));
    res.json(rows);
  });

  // GET single
  router.get(`/pkb/${prefix}/:id`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.query.companyId as string, 10);
    const id = parseInt(req.params.id, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
    const [row] = await db.select().from(table).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  });

  // CREATE
  router.post(`/pkb/${prefix}`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const body = { ...req.body, companyId, createdBy: req.userId };
    const [inserted] = await db.insert(table).values(body).returning();
    await writeAudit(companyId, req.userId, "created", entityType, inserted.id, null, inserted);
    res.status(201).json(inserted);
  });

  // UPDATE
  router.patch(`/pkb/${prefix}/:id`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.query.companyId as string ?? req.body.companyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [existing] = await db.select().from(table).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const updates = { ...req.body, updatedBy: req.userId };
    delete updates.id; delete updates.companyId; delete updates.createdAt;
    const [updated] = await db.update(table).set(updates).where(and(eq(table.id, id), eq(table.companyId, companyId))).returning();
    await writeAudit(companyId, req.userId, "updated", entityType, id, existing, updated);
    res.json(updated);
  });

  // DELETE (soft)
  router.delete(`/pkb/${prefix}/:id`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.query.companyId as string, 10);
    const id = parseInt(req.params.id, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [existing] = await db.select().from(table).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(table).set({ isActive: false }).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    await writeAudit(companyId, req.userId, "archived", entityType, id, existing, null);
    res.json({ success: true });
  });

  // ACTIVATE
  router.post(`/pkb/${prefix}/:id/activate`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [target] = await db.select().from(table).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!target) { res.status(404).json({ error: "Not found" }); return; }
    // Archive current active version in same group if applicable
    if (table.versionGroupId && target.versionGroupId) {
      await db.update(table)
        .set({ versionStatus: "archived" })
        .where(and(
          eq(table.companyId, companyId),
          eq(table.versionGroupId, target.versionGroupId),
          eq(table.versionStatus, "active")
        ));
    }
    const [activated] = await db.update(table).set({ versionStatus: "active", isActive: true }).where(and(eq(table.id, id), eq(table.companyId, companyId))).returning();
    await writeAudit(companyId, req.userId, "activated", entityType, id, target, activated, req.body.reason);
    res.json(activated);
  });

  // DUPLICATE
  router.post(`/pkb/${prefix}/:id/duplicate`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
    const m = await getMembership(req.clerkUserId, companyId);
    if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [source] = await db.select().from(table).where(and(eq(table.id, id), eq(table.companyId, companyId)));
    if (!source) { res.status(404).json({ error: "Not found" }); return; }
    const copy = { ...source };
    delete (copy as any).id;
    delete (copy as any).createdAt;
    delete (copy as any).updatedAt;
    if ((copy as any).name) (copy as any).name = (copy as any).name + " (Copy)";
    (copy as any).versionStatus = "draft";
    (copy as any).version = 1;
    (copy as any).versionGroupId = null;
    (copy as any).createdBy = req.userId;
    const [duped] = await db.insert(table).values(copy).returning();
    await writeAudit(companyId, req.userId, "duplicated", entityType, duped.id, null, duped);
    res.status(201).json(duped);
  });
}

// ── Register entities ───────────────────────────────────────────────────────
makeCrud(pkbPoleTypesTable, "pole_type", (cid, q) => {
  const conditions = [eq(pkbPoleTypesTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbPoleTypesTable.isActive, q.isActive !== "false"));
  if (q.versionStatus) conditions.push(eq(pkbPoleTypesTable.versionStatus, q.versionStatus as any));
  return and(...conditions);
}, "pole-types");

makeCrud(pkbStructureConfigsTable, "structure_config", (cid, q) => {
  const conditions = [eq(pkbStructureConfigsTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbStructureConfigsTable.isActive, q.isActive !== "false"));
  return and(...conditions);
}, "structure-configs");

makeCrud(pkbComponentsTable, "component", (cid, q) => {
  const conditions = [eq(pkbComponentsTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbComponentsTable.isActive, q.isActive !== "false"));
  if (q.category) conditions.push(eq(pkbComponentsTable.category, q.category));
  return and(...conditions);
}, "components");

makeCrud(pkbWorkActionsTable, "work_action", (cid, q) => {
  const conditions = [eq(pkbWorkActionsTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbWorkActionsTable.isActive, q.isActive !== "false"));
  return and(...conditions);
}, "work-actions");

makeCrud(pkbWorkPackagesTable, "work_package", (cid, q) => {
  const conditions = [eq(pkbWorkPackagesTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbWorkPackagesTable.isActive, q.isActive !== "false"));
  if (q.customerId) conditions.push(eq(pkbWorkPackagesTable.customerId, q.customerId));
  return and(...conditions);
}, "work-packages");

makeCrud(pkbBillingMappingsTable, "billing_mapping", (cid, q) => {
  const conditions = [eq(pkbBillingMappingsTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbBillingMappingsTable.isActive, q.isActive !== "false"));
  if (q.customerId) conditions.push(eq(pkbBillingMappingsTable.customerId, q.customerId));
  return and(...conditions);
}, "billing-mappings");

makeCrud(pkbConditionalRulesTable, "conditional_rule", (cid, q) => {
  const conditions = [eq(pkbConditionalRulesTable.companyId, cid)];
  if (q.isActive !== undefined) conditions.push(eq(pkbConditionalRulesTable.isActive, q.isActive !== "false"));
  return and(...conditions);
}, "conditional-rules");

// ── Visual references (special: image data) ─────────────────────────────────
router.get("/pkb/visual-references", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  // Return metadata only (no imageData) for list
  const rows = await db.select({
    id: pkbVisualReferencesTable.id,
    companyId: pkbVisualReferencesTable.companyId,
    label: pkbVisualReferencesTable.label,
    customerId: pkbVisualReferencesTable.customerId,
    poleTypeId: pkbVisualReferencesTable.poleTypeId,
    structureConfigId: pkbVisualReferencesTable.structureConfigId,
    cameraAngle: pkbVisualReferencesTable.cameraAngle,
    imageQualityRating: pkbVisualReferencesTable.imageQualityRating,
    approvedForEvaluation: pkbVisualReferencesTable.approvedForEvaluation,
    approvedForTraining: pkbVisualReferencesTable.approvedForTraining,
    isActive: pkbVisualReferencesTable.isActive,
    createdAt: pkbVisualReferencesTable.createdAt,
  }).from(pkbVisualReferencesTable)
    .where(and(eq(pkbVisualReferencesTable.companyId, companyId), eq(pkbVisualReferencesTable.isActive, true)))
    .orderBy(desc(pkbVisualReferencesTable.createdAt));
  res.json(rows);
});

router.get("/pkb/visual-references/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  const id = parseInt(req.params.id, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db.select().from(pkbVisualReferencesTable).where(and(eq(pkbVisualReferencesTable.id, id), eq(pkbVisualReferencesTable.companyId, companyId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Omit imageData from direct GET, serve via /image endpoint
  const { imageData: _, ...meta } = row;
  res.json(meta);
});

router.get("/pkb/visual-references/:id/image", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  const id = parseInt(req.params.id, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db.select({ imageData: pkbVisualReferencesTable.imageData, companyId: pkbVisualReferencesTable.companyId }).from(pkbVisualReferencesTable).where(eq(pkbVisualReferencesTable.id, id));
  if (!row || row.companyId !== companyId) { res.status(404).json({ error: "Not found" }); return; }
  if (!row.imageData) { res.status(404).json({ error: "No image" }); return; }
  // Return as data URL JSON
  res.json({ imageData: row.imageData });
});

router.post("/pkb/visual-references", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = { ...req.body, companyId, uploadedBy: req.userId, approvedForTraining: false, approvedForEvaluation: false };
  const [inserted] = await db.insert(pkbVisualReferencesTable).values(body).returning();
  const { imageData: _, ...meta } = inserted;
  await writeAudit(companyId, req.userId, "created", "visual_reference", inserted.id, null, meta);
  res.status(201).json(meta);
});

router.patch("/pkb/visual-references/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string ?? req.body.companyId, 10);
  const id = parseInt(req.params.id, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [existing] = await db.select().from(pkbVisualReferencesTable).where(and(eq(pkbVisualReferencesTable.id, id), eq(pkbVisualReferencesTable.companyId, companyId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // Training approval requires explicit action
  if (req.body.approvedForTraining === true && !existing.approvedForTraining) {
    await writeAudit(companyId, req.userId, "training_approval_changed", "visual_reference", id, { approvedForTraining: false }, { approvedForTraining: true }, req.body.reason);
  }
  const updates = { ...req.body };
  delete updates.id; delete updates.companyId; delete updates.createdAt;
  const [updated] = await db.update(pkbVisualReferencesTable).set(updates).where(and(eq(pkbVisualReferencesTable.id, id), eq(pkbVisualReferencesTable.companyId, companyId))).returning();
  const { imageData: _, ...meta } = updated;
  res.json(meta);
});

router.delete("/pkb/visual-references/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  const id = parseInt(req.params.id, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(pkbVisualReferencesTable).set({ isActive: false }).where(and(eq(pkbVisualReferencesTable.id, id), eq(pkbVisualReferencesTable.companyId, companyId)));
  await writeAudit(companyId, req.userId, "archived", "visual_reference", id);
  res.json({ success: true });
});

// Visual reference coverage
router.get("/pkb/visual-references/coverage", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const configs = await db.select({ id: pkbStructureConfigsTable.id, name: pkbStructureConfigsTable.name })
    .from(pkbStructureConfigsTable)
    .where(and(eq(pkbStructureConfigsTable.companyId, companyId), eq(pkbStructureConfigsTable.isActive, true)));
  const refs = await db.select({ structureConfigId: pkbVisualReferencesTable.structureConfigId, cameraAngle: pkbVisualReferencesTable.cameraAngle })
    .from(pkbVisualReferencesTable)
    .where(and(eq(pkbVisualReferencesTable.companyId, companyId), eq(pkbVisualReferencesTable.isActive, true)));

  const coverage = configs.map(c => {
    const configRefs = refs.filter(r => r.structureConfigId === c.id);
    const angles = new Set(configRefs.map(r => r.cameraAngle).filter(Boolean));
    const hasBeforeAfter = angles.has("before_work") && angles.has("after_work");
    const hasNegative = angles.has("negative_example");
    let status: "none" | "insufficient" | "basic" | "good" | "strong" = "none";
    if (configRefs.length === 0) status = "none";
    else if (configRefs.length <= 2) status = "insufficient";
    else if (angles.size >= 3 && !hasBeforeAfter) status = "basic";
    else if (angles.size >= 3 && hasBeforeAfter) status = "good";
    if (configRefs.length >= 5 && angles.size >= 4 && hasBeforeAfter && hasNegative) status = "strong";
    return { ...c, imageCount: configRefs.length, angleCount: angles.size, coverageStatus: status };
  });

  res.json(coverage);
});

// ── Audit log ───────────────────────────────────────────────────────────────
router.get("/pkb/audit-log", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 500);
  const rows = await db.select().from(pkbAuditLogTable)
    .where(eq(pkbAuditLogTable.companyId, companyId))
    .orderBy(desc(pkbAuditLogTable.createdAt))
    .limit(limit);
  res.json(rows);
});

// ── Training examples ───────────────────────────────────────────────────────
router.get("/pkb/training-examples", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const conditions = [eq(pkbTrainingExamplesTable.companyId, companyId)];
  if (req.query.status) conditions.push(eq(pkbTrainingExamplesTable.status, req.query.status as any));
  const rows = await db.select().from(pkbTrainingExamplesTable).where(and(...conditions)).orderBy(desc(pkbTrainingExamplesTable.createdAt)).limit(100);
  res.json(rows);
});

router.patch("/pkb/training-examples/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string ?? req.body.companyId, 10);
  const id = parseInt(req.params.id, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const [existing] = await db.select().from(pkbTrainingExamplesTable).where(and(eq(pkbTrainingExamplesTable.id, id), eq(pkbTrainingExamplesTable.companyId, companyId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const updates = { ...req.body };
  delete updates.id; delete updates.companyId; delete updates.createdAt;
  const [updated] = await db.update(pkbTrainingExamplesTable).set(updates).where(and(eq(pkbTrainingExamplesTable.id, id), eq(pkbTrainingExamplesTable.companyId, companyId))).returning();
  await writeAudit(companyId, req.userId, "updated", "training_example", id, existing, updated);
  res.json(updated);
});

// ── Billing suggestions ─────────────────────────────────────────────────────
router.get("/api/reports/:reportId/billing-suggestions", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [row] = await db.select().from(reportBillingSuggestionsTable).where(eq(reportBillingSuggestionsTable.reportId, reportId)).orderBy(desc(reportBillingSuggestionsTable.createdAt)).limit(1);
  res.json(row ?? null);
});

router.patch("/api/reports/:reportId/billing-suggestions", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [existing] = await db.select().from(reportBillingSuggestionsTable).where(eq(reportBillingSuggestionsTable.reportId, reportId)).orderBy(desc(reportBillingSuggestionsTable.createdAt)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const updates = { ...req.body, approvedBy: req.userId };
  delete updates.id; delete updates.companyId; delete updates.reportId; delete updates.createdAt;
  if (updates.status === "approved") updates.approvedAt = new Date();
  const [updated] = await db.update(reportBillingSuggestionsTable).set(updates).where(eq(reportBillingSuggestionsTable.id, existing.id)).returning();
  res.json(updated);
});

// ── Billing validation ──────────────────────────────────────────────────────
router.get("/api/reports/:reportId/billing-validation", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [row] = await db.select().from(reportBillingValidationsTable)
    .where(and(eq(reportBillingValidationsTable.reportId, reportId), eq(reportBillingValidationsTable.isActive, true)))
    .orderBy(desc(reportBillingValidationsTable.createdAt)).limit(1);
  res.json(row ?? null);
});

router.post("/api/reports/:reportId/billing-validation/acknowledge", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const companyId = parseInt(req.body.companyId ?? req.query.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { findingCode, note } = req.body;
  const [latest] = await db.select().from(reportBillingValidationsTable)
    .where(and(eq(reportBillingValidationsTable.reportId, reportId), eq(reportBillingValidationsTable.isActive, true)))
    .orderBy(desc(reportBillingValidationsTable.createdAt)).limit(1);
  if (!latest) { res.status(404).json({ error: "No validation found" }); return; }
  const acks = ((latest.acknowledgements as any[]) ?? []).concat([{
    findingCode, acknowledgedBy: req.userId, acknowledgedAt: new Date().toISOString(), note
  }]);
  await db.update(reportBillingValidationsTable).set({ acknowledgements: acks }).where(eq(reportBillingValidationsTable.id, latest.id));
  res.json({ success: true });
});

// ── Import jobs ─────────────────────────────────────────────────────────────
router.get("/pkb/import-jobs", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.query.companyId as string, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(pkbImportJobsTable).where(eq(pkbImportJobsTable.companyId, companyId)).orderBy(desc(pkbImportJobsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/pkb/import-jobs", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.body.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m || !requireAdminOrSupervisor(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { entityType, csvData } = req.body;
  if (!entityType || !csvData) { res.status(400).json({ error: "entityType and csvData required" }); return; }

  // Parse CSV
  const lines = (csvData as string).split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const headers = lines[0].split(",").map((h: string) => h.trim().replace(/^"|"$/g, "").trim());
  const dataRows = lines.slice(1);

  // Create job record
  const [job] = await db.insert(pkbImportJobsTable).values({
    companyId,
    fileName: `import-${entityType}-${Date.now()}.csv`,
    entityType,
    status: "processing",
    errorCount: 0,
    results: [],
  }).returning();

  // Process synchronously (could be made async for large files)
  let processed = 0;
  const errors: any[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i];
    if (!raw.trim()) continue;
    const cols = raw.split(",").map((c: string) => c.trim().replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h: string, idx: number) => { row[h] = cols[idx] ?? ""; });

    try {
      if (entityType === "pole-types") {
        await db.insert(pkbPoleTypesTable).values({
          companyId,
          name: row.name,
          material: (row.material as any) || "wood",
          heightFt: row.heightFt ? parseInt(row.heightFt) : null,
          operationalClass: (row.operationalClass as any) || null,
          accessType: (row.accessType as any) || "ground",
          customerCode: row.customerCode || null,
          versionStatus: "active",
        }).onConflictDoNothing();
      } else if (entityType === "structure-configs") {
        await db.insert(pkbStructureConfigsTable).values({
          companyId,
          name: row.name,
          code: row.code,
          phases: row.phases ? parseInt(row.phases) : 3,
          conductorArrangement: (row.conductorArrangement as any) || "vertical",
          crossarmType: row.crossarmType || null,
          versionStatus: "active",
        }).onConflictDoNothing();
      } else if (entityType === "components") {
        await db.insert(pkbComponentsTable).values({
          companyId,
          name: row.name,
          code: row.code || row.name.toLowerCase().replace(/\s+/g, "_"),
          category: (row.category as any) || "hardware",
          unit: row.unit || "EA",
          visualDescription: row.visualDescription || null,
          versionStatus: "active",
        }).onConflictDoNothing();
      } else if (entityType === "work-actions") {
        await db.insert(pkbWorkActionsTable).values({
          companyId,
          name: row.name,
          code: row.code || row.name.toUpperCase().replace(/\s+/g, "_"),
          actionType: (row.actionType as any) || "install",
          defaultUnit: row.defaultUnit || "EA",
          defaultRate: row.defaultRate ? parseFloat(row.defaultRate) : null,
          versionStatus: "active",
        }).onConflictDoNothing();
      } else if (entityType === "billing-mappings") {
        await db.insert(pkbBillingMappingsTable).values({
          companyId,
          workActionCode: row.workActionCode,
          billingCode: row.billingCode,
          description: row.description || null,
          unitType: row.unitType || "EA",
          unitRate: row.unitRate ? parseFloat(row.unitRate) : null,
          versionStatus: "active",
        }).onConflictDoNothing();
      } else {
        errors.push({ row: i + 2, message: `Unknown entity type: ${entityType}` });
        continue;
      }
      processed++;
    } catch (err: any) {
      errors.push({ row: i + 2, message: err?.message ?? "Insert failed" });
    }
  }

  const [updated] = await db.update(pkbImportJobsTable).set({
    status: errors.length > 0 && processed === 0 ? "failed" : "completed",
    insertedCount: processed,
    errorCount: errors.length,
    results: errors,
  }).where(eq(pkbImportJobsTable.id, job.id)).returning();

  await writeAudit(companyId, req.userId, "imported", entityType, job.id,
    null, { totalRows: dataRows.length, processedRows: processed, errorCount: errors.length });

  res.json({ job: updated, processed, errorCount: errors.length });
});

// ── PKB Vision Analysis (Task #25) ──────────────────────────────────────────
router.post("/pkb/analyze", requireAuth, async (req: AuthenticatedRequest, res) => {
  const companyId = parseInt(req.body.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const { imageDataUrl, photoId, reportId, workPackageId, structureConfigCode } = req.body;

  // Resolve the image
  let imageData: string | null = imageDataUrl ?? null;
  if (!imageData && photoId && reportId) {
    const [photo] = await db.select().from(photosTable)
      .where(and(eq(photosTable.id, parseInt(photoId, 10)), eq(photosTable.reportId, parseInt(reportId, 10))));
    imageData = photo?.url ?? null;
  }
  if (!imageData) { res.status(400).json({ error: "imageDataUrl or photoId+reportId required" }); return; }

  // Fetch PKB context
  let wpContext = "";
  let billingCodes: string[] = [];
  if (workPackageId) {
    const [wp] = await db.select().from(pkbWorkPackagesTable)
      .where(and(eq(pkbWorkPackagesTable.id, parseInt(workPackageId, 10)), eq(pkbWorkPackagesTable.companyId, companyId)));
    if (wp) {
      const billing = wp.billing as any;
      const codes = billing?.primaryCodes ?? [];
      billingCodes = codes;
      wpContext = `Work Package: ${wp.name} (${wp.code}). Expected billing codes: ${codes.join(", ")}. `;
    }
  }
  if (structureConfigCode) {
    const [sc] = await db.select().from(pkbStructureConfigsTable)
      .where(and(eq(pkbStructureConfigsTable.code, structureConfigCode), eq(pkbStructureConfigsTable.companyId, companyId)));
    if (sc) wpContext += `Structure Config: ${sc.name} (${sc.code}). `;
  }

  // Known components for this company
  const components = await db.select({ id: pkbComponentsTable.id, name: pkbComponentsTable.name, category: pkbComponentsTable.category })
    .from(pkbComponentsTable)
    .where(and(eq(pkbComponentsTable.companyId, companyId), eq(pkbComponentsTable.isActive, true)));
  const componentList = components.map(c => `${c.name} (${c.category})`).join(", ");

  // Known work actions
  const actions = await db.select({ id: pkbWorkActionsTable.id, name: pkbWorkActionsTable.name, code: pkbWorkActionsTable.code })
    .from(pkbWorkActionsTable)
    .where(and(eq(pkbWorkActionsTable.companyId, companyId), eq(pkbWorkActionsTable.isActive, true)));
  const actionList = actions.map(a => `${a.name} (${a.code})`).join(", ");

  const systemPrompt = `You are a utility construction expert analyzing pole inspection photos for billing verification.
Your job is to identify visible components, work performed, and suggest billing codes.
Return valid JSON only — no markdown, no explanation.

${wpContext}
Known components in this company's catalog: ${componentList || "none configured"}.
Known work actions: ${actionList || "none configured"}.`;

  const userPrompt = `Analyze this utility pole photo and return a JSON object with:
{
  "poleType": "wood|steel|concrete|unknown",
  "estimatedClass": "1|2|3|4|5|unknown",
  "structureDescription": "brief description of what you see",
  "confidence": 0.0-1.0,
  "identifiedComponents": [{"name": "component name", "visible": true, "condition": "good|fair|damaged|unknown", "notes": "optional"}],
  "suggestedWorkActions": [{"code": "action code or best guess", "name": "action name", "confidence": 0.0-1.0}],
  "suggestedBillingItems": [{"billingCode": "code", "description": "description", "quantity": 1, "unit": "EA|HR|LF|CY", "confidence": 0.0-1.0}],
  "issues": ["any visible safety or billing issues"],
  "photoQuality": "good|poor|unreadable",
  "notes": "any other observations"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageData, detail: "high" } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let analysis: any = {};
    try {
      analysis = JSON.parse(raw);
    } catch {
      // Try to extract JSON from markdown fences
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) { try { analysis = JSON.parse(match[1]); } catch { /* ignore */ } }
    }

    // Save as training example
    try {
      await db.insert(pkbTrainingExamplesTable).values({
        companyId,
        imageData: imageData.substring(0, 500), // store reference, not full image
        structureConfigCode: structureConfigCode ?? null,
        aiAnalysis: analysis,
        status: "pending_review",
      });
    } catch { /* non-fatal */ }

    res.json({ status: "success", analysis, tokensUsed: response.usage?.total_tokens ?? 0 });
  } catch (err: any) {
    console.error("[pkb/analyze] OpenAI error:", err?.message ?? err);
    res.status(503).json({ error: "Vision analysis failed", detail: err?.message ?? "Unknown error" });
  }
});

// ── Billing suggestion generation (Task #27) ─────────────────────────────────
router.post("/api/reports/:reportId/billing-suggestions/generate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const companyId = parseInt(req.body.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [report] = await db.select().from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.companyId, companyId)));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  // Gather report data
  const photos = await db.select().from(photosTable).where(eq(photosTable.reportId, reportId));
  const hours = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, reportId));
  const materials = await db.select().from(reportMaterialsTable).where(eq(reportMaterialsTable.reportId, reportId));

  // Get work package if set
  let wpContext = "";
  let workPackageId: number | null = (report as any).workPackageId ?? null;
  if (workPackageId) {
    const [wp] = await db.select().from(pkbWorkPackagesTable)
      .where(and(eq(pkbWorkPackagesTable.id, workPackageId), eq(pkbWorkPackagesTable.companyId, companyId)));
    if (wp) {
      const billing = wp.billing as any;
      wpContext = `Work Package: ${wp.name}. Expected billing codes: ${(billing?.primaryCodes ?? []).join(", ")}.`;
    }
  }

  // Get company billing mappings
  const mappings = await db.select().from(pkbBillingMappingsTable)
    .where(and(eq(pkbBillingMappingsTable.companyId, companyId), eq(pkbBillingMappingsTable.isActive, true)));

  const mappingContext = mappings.map(m =>
    `${m.workActionCode} → ${m.billingCode}: ${m.description ?? ""} @ $${m.unitRate ?? 0}/${m.unitType}`
  ).join("\n");

  // Build report summary for the AI
  const totalHours = hours.reduce((s, e) => s + Number(e.regularHours ?? 0) + Number(e.overtimeHours ?? 0), 0);
  const photoCategories = photos.map(p => p.category).join(", ");

  const prompt = `You are a billing expert for utility construction. Generate billing line items for this daily report.

Report Date: ${report.reportDate}
Work Performed: ${report.workPerformed ?? "Not specified"}
Structures Installed: ${report.structuresInstalled ?? "Not specified"}
Work Location: ${report.workLocation ?? "Not specified"}
Total Labor Hours: ${totalHours}
Photo Evidence Categories: ${photoCategories || "none"}
Materials Used: ${materials.map(m => `${m.name} x${m.quantity}`).join(", ") || "none"}
${wpContext}

Company Billing Mappings:
${mappingContext || "No billing mappings configured"}

Return a JSON array of billing items:
[{
  "billingCode": "string",
  "description": "string",
  "quantity": number,
  "unit": "EA|HR|LF|CY|LS",
  "unitRate": number or null,
  "subtotal": number or null,
  "source": "ai_analysis|work_package|rule_match",
  "confidence": 0.0-1.0,
  "notes": "optional reasoning"
}]

Only return the JSON array, no other text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    let items: any[] = [];
    try {
      items = JSON.parse(raw);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) { try { items = JSON.parse(match[1]); } catch { /* ignore */ } }
    }
    if (!Array.isArray(items)) items = [];

    // Upsert suggestion record
    const existing = await db.select().from(reportBillingSuggestionsTable)
      .where(eq(reportBillingSuggestionsTable.reportId, reportId))
      .orderBy(desc(reportBillingSuggestionsTable.createdAt)).limit(1);

    let suggestion;
    if (existing[0] && existing[0].status === "pending_review") {
      [suggestion] = await db.update(reportBillingSuggestionsTable)
        .set({ suggestedItems: items, workPackageId: workPackageId ?? undefined, updatedAt: new Date() })
        .where(eq(reportBillingSuggestionsTable.id, existing[0].id))
        .returning();
    } else {
      [suggestion] = await db.insert(reportBillingSuggestionsTable)
        .values({ companyId, reportId, workPackageId: workPackageId ?? undefined, suggestedItems: items, status: "pending_review" })
        .returning();
    }
    res.json({ suggestion, itemCount: items.length });
  } catch (err: any) {
    console.error("[billing-suggestions/generate] error:", err?.message);
    res.status(503).json({ error: "Generation failed", detail: err?.message ?? "Unknown error" });
  }
});

// ── Billing validation run (Task #28) ────────────────────────────────────────
router.post("/api/reports/:reportId/billing-validation/run", requireAuth, async (req: AuthenticatedRequest, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const companyId = parseInt(req.body.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await getMembership(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const [report] = await db.select().from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.companyId, companyId)));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const photos = await db.select().from(photosTable).where(eq(photosTable.reportId, reportId));
  const hours = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.reportId, reportId));
  const [suggestion] = await db.select().from(reportBillingSuggestionsTable)
    .where(eq(reportBillingSuggestionsTable.reportId, reportId))
    .orderBy(desc(reportBillingSuggestionsTable.createdAt)).limit(1);

  const findings: any[] = [];

  // Check: no labor hours
  const totalHours = hours.reduce((s, e) => s + Number(e.regularHours ?? 0), 0);
  if (totalHours === 0) {
    findings.push({ severity: "warning", code: "NO_LABOR_HOURS", message: "No labor hours recorded on this report.", suggestedAction: "Add time entries before billing." });
  }

  // Check: no photos
  if (photos.length === 0) {
    findings.push({ severity: "error", code: "NO_PHOTOS", message: "No photos attached to this report.", suggestedAction: "Photo evidence is required for billing validation." });
  }

  // Check: missing pole_tag photo (hard requirement)
  const hasPoleTag = photos.some(p => p.category === "pole_tag");
  if (!hasPoleTag) {
    findings.push({ severity: "warning", code: "MISSING_POLE_TAG_PHOTO", message: "No pole tag photo found.", suggestedAction: "Pole tag photo is required to verify structure identification." });
  }

  // Check: no work performed description
  if (!report.workPerformed || report.workPerformed.trim().length < 10) {
    findings.push({ severity: "warning", code: "MISSING_WORK_DESCRIPTION", message: "Work performed description is too short or missing.", suggestedAction: "Describe the work completed in detail." });
  }

  // Check: billing suggestions exist
  if (!suggestion) {
    findings.push({ severity: "info", code: "NO_BILLING_SUGGESTIONS", message: "No billing suggestions have been generated yet.", suggestedAction: "Run billing suggestion generation before validation." });
  } else {
    const items = (suggestion.suggestedItems as any[]) ?? [];
    if (items.length === 0) {
      findings.push({ severity: "error", code: "EMPTY_BILLING_SUGGESTIONS", message: "Billing suggestions are empty.", suggestedAction: "Re-run billing generation or add line items manually." });
    }
    // Check for low-confidence items
    const lowConf = items.filter(i => (i.confidence ?? 1) < 0.5);
    if (lowConf.length > 0) {
      findings.push({ severity: "warning", code: "LOW_CONFIDENCE_ITEMS", message: `${lowConf.length} billing item(s) have low AI confidence (<50%).`, suggestedAction: "Review and confirm low-confidence items before approving.", relatedBillingCodes: lowConf.map(i => i.billingCode) });
    }
  }

  // Check conditional rules
  const rules = await db.select().from(pkbConditionalRulesTable)
    .where(and(eq(pkbConditionalRulesTable.companyId, companyId), eq(pkbConditionalRulesTable.isActive, true)));

  for (const rule of rules) {
    const conditions = rule.conditions as any;
    const suggestions = rule.suggestions as any;
    // Simple rule evaluation: if rule has a minPhotos condition, check it
    if (conditions?.minPhotos && photos.length < conditions.minPhotos) {
      findings.push({
        severity: "warning",
        code: `RULE_${rule.id}_PHOTO_COUNT`,
        message: `Rule "${rule.name}": requires at least ${conditions.minPhotos} photos, found ${photos.length}.`,
        suggestedAction: suggestions?.action ?? "Add more photos.",
        ruleId: rule.id,
      });
    }
  }

  const overallStatus = findings.some(f => f.severity === "error") ? "errors"
    : findings.some(f => f.severity === "warning") ? "warnings"
    : "clean";

  // Deactivate old validation records
  await db.update(reportBillingValidationsTable)
    .set({ isActive: false })
    .where(and(eq(reportBillingValidationsTable.reportId, reportId), eq(reportBillingValidationsTable.isActive, true)));

  const [validation] = await db.insert(reportBillingValidationsTable).values({
    companyId,
    reportId,
    runBy: req.userId ?? null,
    status: overallStatus,
    findings,
    acknowledgements: [],
    isActive: true,
  }).returning();

  res.json({ validation, findingCount: findings.length, status: overallStatus });
});

export default router;
