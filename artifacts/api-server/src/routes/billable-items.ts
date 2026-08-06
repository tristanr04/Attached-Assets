import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, billableItemsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number, adminOnly = false) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  if (!m) return null;
  if (adminOnly && !["admin", "supervisor"].includes(m.role)) return null;
  return m;
}

function fmt(b: typeof billableItemsTable.$inferSelect) {
  const toNum = (v: string | null) => v != null ? Number(v) : null;
  return {
    id: b.id, companyId: b.companyId, category: b.category, name: b.name,
    description: b.description, billingCode: b.billingCode, internalCode: b.internalCode,
    customer: b.customer, unitType: b.unitType,
    baseRate: toNum(b.baseRate), overtimeRate: toNum(b.overtimeRate),
    doubleTimeRate: toNum(b.doubleTimeRate), emergencyRate: toNum(b.emergencyRate),
    stormRate: toNum(b.stormRate), defaultQuantity: toNum(b.defaultQuantity),
    taxable: b.taxable, active: b.active,
    effectiveDate: b.effectiveDate, expirationDate: b.expirationDate,
    notes: b.notes, createdById: b.createdById,
    createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
  };
}

router.get("/billable-items", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parseInt(req.query.companyId as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  let items = await db.select().from(billableItemsTable).where(eq(billableItemsTable.companyId, companyId));
  if (req.query.category) items = items.filter(i => i.category === req.query.category);
  if (req.query.active === "true") items = items.filter(i => i.active);
  res.json(items.map(fmt));
});

router.post("/billable-items", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, category, name, ...rest } = req.body;
  if (!companyId || !category || !name) { res.status(400).json({ error: "companyId, category, name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const toNum = (v: unknown) => v != null ? String(v) : null;
  const [item] = await db.insert(billableItemsTable).values({
    companyId, category, name,
    description: rest.description ?? null, billingCode: rest.billingCode ?? null,
    internalCode: rest.internalCode ?? null, customer: rest.customer ?? null,
    unitType: rest.unitType ?? null,
    baseRate: toNum(rest.baseRate), overtimeRate: toNum(rest.overtimeRate),
    doubleTimeRate: toNum(rest.doubleTimeRate), emergencyRate: toNum(rest.emergencyRate),
    stormRate: toNum(rest.stormRate), defaultQuantity: toNum(rest.defaultQuantity),
    taxable: rest.taxable ?? false, active: rest.active ?? true,
    effectiveDate: rest.effectiveDate ?? null, expirationDate: rest.expirationDate ?? null,
    notes: rest.notes ?? null, createdById: req.userId ?? null,
  }).returning();
  res.status(201).json(fmt(item));
});

router.patch("/billable-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(billableItemsTable).where(eq(billableItemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const updates: Record<string, unknown> = {};
  const strFields = ["name","description","billingCode","internalCode","customer","unitType","notes","effectiveDate","expirationDate"];
  const boolFields = ["taxable","active"];
  const numFields = ["baseRate","overtimeRate","doubleTimeRate","emergencyRate","stormRate","defaultQuantity"];
  for (const f of strFields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  for (const f of boolFields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  for (const f of numFields) if (req.body[f] !== undefined) updates[f] = String(req.body[f]);
  const [updated] = await db.update(billableItemsTable).set(updates).where(eq(billableItemsTable.id, id)).returning();
  res.json(fmt(updated));
});

router.delete("/billable-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(billableItemsTable).where(eq(billableItemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(billableItemsTable).where(eq(billableItemsTable.id, id));
  res.sendStatus(204);
});

export default router;
