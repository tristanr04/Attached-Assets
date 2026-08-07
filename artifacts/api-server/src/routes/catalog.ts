import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, catalogMaterialsTable, catalogEquipmentTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";
import { parseOptionalText, parseRequiredText } from "../lib/billableItemInput";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  return m;
}

router.get("/catalog/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "Valid companyId required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const materials = await db.select().from(catalogMaterialsTable).where(eq(catalogMaterialsTable.companyId, companyId));
  res.json(materials.map(mat => ({ id: mat.id, companyId: mat.companyId, name: mat.name, unit: mat.unit, createdAt: mat.createdAt.toISOString() })));
});

router.post("/catalog/materials", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const name = parseRequiredText(req.body?.name);
  const unit = parseRequiredText(req.body?.unit, 100);
  if (companyId === null || name === null || unit === null) { res.status(400).json({ error: "Valid companyId, name, and unit required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [mat] = await db.insert(catalogMaterialsTable).values({ companyId, name, unit }).returning();
  res.status(201).json({ id: mat.id, companyId: mat.companyId, name: mat.name, unit: mat.unit, createdAt: mat.createdAt.toISOString() });
});

router.get("/catalog/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "Valid companyId required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }

  const equipment = await db.select().from(catalogEquipmentTable).where(eq(catalogEquipmentTable.companyId, companyId));
  res.json(equipment.map(e => ({ id: e.id, companyId: e.companyId, name: e.name, type: e.type, createdAt: e.createdAt.toISOString() })));
});

router.post("/catalog/equipment", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const name = parseRequiredText(req.body?.name);
  const type = parseOptionalText(req.body?.type, 200);
  if (companyId === null || name === null || (type === undefined && req.body?.type !== undefined)) { res.status(400).json({ error: "Valid companyId, name, and type required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [equip] = await db.insert(catalogEquipmentTable).values({ companyId, name, type: type ?? null }).returning();
  res.status(201).json({ id: equip.id, companyId: equip.companyId, name: equip.name, type: equip.type, createdAt: equip.createdAt.toISOString() });
});

export default router;
