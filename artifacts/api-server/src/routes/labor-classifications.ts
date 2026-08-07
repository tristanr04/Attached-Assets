import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, laborClassificationsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";
import { parseOptionalText, parseRequiredText } from "../lib/billableItemInput";
import { normalizeLaborClassificationNumbers } from "../lib/laborClassificationInput";

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
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "Valid companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const items = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.companyId, companyId));
  res.json(items.map(fmt));
});

router.post("/labor-classifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const name = parseRequiredText(req.body?.name);
  if (companyId === null || name === null) { res.status(400).json({ error: "Valid companyId and name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const numeric = normalizeLaborClassificationNumbers(req.body);
  if (!numeric.ok) { res.status(400).json({ error: `Invalid ${numeric.field}` }); return; }
  const billingCode = parseOptionalText(req.body.billingCode, 200);
  const notes = parseOptionalText(req.body.notes);
  if (billingCode === undefined && req.body.billingCode !== undefined) { res.status(400).json({ error: "Invalid billingCode" }); return; }
  if (notes === undefined && req.body.notes !== undefined) { res.status(400).json({ error: "Invalid notes" }); return; }
  if (req.body.active !== undefined && typeof req.body.active !== "boolean") { res.status(400).json({ error: "Invalid active" }); return; }
  const [item] = await db.insert(laborClassificationsTable).values({
    companyId, name,
    billingCode: billingCode ?? null,
    ...numeric.values,
    notes: notes ?? null, active: req.body.active ?? true,
  }).returning();
  res.status(201).json(fmt(item));
});

router.patch("/labor-classifications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid labor classification ID" }); return; }
  const [existing] = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) {
    const name = parseRequiredText(req.body.name);
    if (name === null) { res.status(400).json({ error: "Invalid name" }); return; }
    updates.name = name;
  }
  for (const [field, maxLength] of [["billingCode", 200], ["notes", 4_000]] as const) {
    if (req.body[field] === undefined) continue;
    const parsed = parseOptionalText(req.body[field], maxLength);
    if (parsed === undefined) { res.status(400).json({ error: `Invalid ${field}` }); return; }
    updates[field] = parsed;
  }
  if (req.body.active !== undefined) {
    if (typeof req.body.active !== "boolean") { res.status(400).json({ error: "Invalid active" }); return; }
    updates.active = req.body.active;
  }
  const numeric = normalizeLaborClassificationNumbers(req.body);
  if (!numeric.ok) { res.status(400).json({ error: `Invalid ${numeric.field}` }); return; }
  Object.assign(updates, numeric.values);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid labor classification fields supplied" }); return; }
  const [updated] = await db.update(laborClassificationsTable).set(updates).where(eq(laborClassificationsTable.id, id)).returning();
  res.json(fmt(updated));
});

router.delete("/labor-classifications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid labor classification ID" }); return; }
  const [existing] = await db.select().from(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(laborClassificationsTable).where(eq(laborClassificationsTable.id, id));
  res.sendStatus(204);
});

export default router;
