import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, laborClassificationsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number, adminOnly = false) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  if (!m) return null;
  if (adminOnly && !["admin", "supervisor"].includes(m.role)) return null;
  return m;
}

function fmt(c: typeof laborClassificationsTable.$inferSelect) {
  return {
    id: c.id, companyId: c.companyId, name: c.name, billingCode: c.billingCode,
    baseRate: c.baseRate ? Number(c.baseRate) : null,
    overtimeRate: c.overtimeRate ? Number(c.overtimeRate) : null,
    doubleTimeRate: c.doubleTimeRate ? Number(c.doubleTimeRate) : null,
    stormRate: c.stormRate ? Number(c.stormRate) : null,
    emergencyRate: c.emergencyRate ? Number(c.emergencyRate) : null,
    perDiemRate: c.perDiemRate ? Number(c.perDiemRate) : null,
    travelRate: c.travelRate ? Number(c.travelRate) : null,
    minimumBillableHours: c.minimumBillableHours ? Number(c.minimumBillableHours) : null,
    notes: c.notes, active: c.active,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/labor-classifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parseInt(req.query.companyId as string, 10);
  if (isNaN(companyId)) { res.status(400).json({ error: "companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const items = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.companyId, companyId));
  res.json(items.map(fmt));
});

router.post("/labor-classifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, name, ...rest } = req.body;
  if (!companyId || !name) { res.status(400).json({ error: "companyId and name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const toNum = (v: unknown) => v != null ? String(v) : null;
  const [item] = await db.insert(laborClassificationsTable).values({
    companyId, name,
    billingCode: rest.billingCode ?? null,
    baseRate: toNum(rest.baseRate), overtimeRate: toNum(rest.overtimeRate),
    doubleTimeRate: toNum(rest.doubleTimeRate), stormRate: toNum(rest.stormRate),
    emergencyRate: toNum(rest.emergencyRate), perDiemRate: toNum(rest.perDiemRate),
    travelRate: toNum(rest.travelRate), minimumBillableHours: toNum(rest.minimumBillableHours),
    notes: rest.notes ?? null, active: rest.active ?? true,
  }).returning();
  res.status(201).json(fmt(item));
});

router.patch("/labor-classifications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const toNum = (v: unknown) => v != null ? String(v) : undefined;
  const updates: Record<string, unknown> = {};
  const fields = ["name","billingCode","notes","active"];
  const rateFields = ["baseRate","overtimeRate","doubleTimeRate","stormRate","emergencyRate","perDiemRate","travelRate","minimumBillableHours"];
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  for (const f of rateFields) if (req.body[f] !== undefined) updates[f] = toNum(req.body[f]);
  const [updated] = await db.update(laborClassificationsTable).set(updates).where(eq(laborClassificationsTable.id, id)).returning();
  res.json(fmt(updated));
});

router.delete("/labor-classifications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  res.sendStatus(204);
});

export default router;
