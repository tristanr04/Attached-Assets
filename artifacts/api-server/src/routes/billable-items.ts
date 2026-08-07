import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, billableItemsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";
import {
  normalizeBillableNumbers,
  parseBillableCategory,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
} from "../lib/billableItemInput";

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
  const companyId = parsePositiveId(req.query.companyId);
  if (companyId === null) { res.status(400).json({ error: "Valid companyId required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  let items = await db.select().from(billableItemsTable).where(eq(billableItemsTable.companyId, companyId));
  if (req.query.category) items = items.filter(i => i.category === req.query.category);
  if (req.query.active === "true") items = items.filter(i => i.active);
  res.json(items.map(fmt));
});

router.post("/billable-items", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const category = parseBillableCategory(req.body?.category);
  const name = parseRequiredText(req.body?.name);
  if (companyId === null || category === null || name === null) { res.status(400).json({ error: "Valid companyId, category, and name required" }); return; }
  const m = await checkAccess(req.clerkUserId, companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const numeric = normalizeBillableNumbers(req.body);
  if (!numeric.ok) { res.status(400).json({ error: `Invalid ${numeric.field}` }); return; }
  const optionalTexts = {
    description: parseOptionalText(req.body.description),
    billingCode: parseOptionalText(req.body.billingCode, 200),
    internalCode: parseOptionalText(req.body.internalCode, 200),
    customer: parseOptionalText(req.body.customer, 500),
    unitType: parseOptionalText(req.body.unitType, 100),
    notes: parseOptionalText(req.body.notes),
  };
  for (const [field, value] of Object.entries(optionalTexts)) {
    if (value === undefined && req.body[field] !== undefined) { res.status(400).json({ error: `Invalid ${field}` }); return; }
  }
  const effectiveDate = parseOptionalDate(req.body.effectiveDate);
  const expirationDate = parseOptionalDate(req.body.expirationDate);
  if (effectiveDate === undefined && req.body.effectiveDate !== undefined) { res.status(400).json({ error: "Invalid effectiveDate" }); return; }
  if (expirationDate === undefined && req.body.expirationDate !== undefined) { res.status(400).json({ error: "Invalid expirationDate" }); return; }
  if (effectiveDate && expirationDate && effectiveDate > expirationDate) { res.status(400).json({ error: "expirationDate must not precede effectiveDate" }); return; }
  if (req.body.taxable !== undefined && typeof req.body.taxable !== "boolean") { res.status(400).json({ error: "Invalid taxable" }); return; }
  if (req.body.active !== undefined && typeof req.body.active !== "boolean") { res.status(400).json({ error: "Invalid active" }); return; }
  const [item] = await db.insert(billableItemsTable).values({
    companyId, category, name,
    description: optionalTexts.description ?? null,
    billingCode: optionalTexts.billingCode ?? null,
    internalCode: optionalTexts.internalCode ?? null,
    customer: optionalTexts.customer ?? null,
    unitType: optionalTexts.unitType ?? null,
    ...numeric.values,
    taxable: req.body.taxable ?? false, active: req.body.active ?? true,
    effectiveDate: effectiveDate ?? null, expirationDate: expirationDate ?? null,
    notes: optionalTexts.notes ?? null, createdById: req.userId ?? null,
  }).returning();
  res.status(201).json(fmt(item));
});

router.patch("/billable-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid billable item ID" }); return; }
  const [existing] = await db.select().from(billableItemsTable).where(eq(billableItemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  const updates: Record<string, unknown> = {};
  const strFields = ["name","description","billingCode","internalCode","customer","unitType","notes","effectiveDate","expirationDate"];
  const boolFields = ["taxable","active"];
  for (const f of strFields) {
    if (req.body[f] === undefined) continue;
    const parsed = f === "name"
      ? parseRequiredText(req.body[f])
      : f === "effectiveDate" || f === "expirationDate"
        ? parseOptionalDate(req.body[f])
        : parseOptionalText(req.body[f], ["billingCode", "internalCode"].includes(f) ? 200 : 4_000);
    if (parsed === undefined || (f === "name" && parsed === null)) { res.status(400).json({ error: `Invalid ${f}` }); return; }
    updates[f] = parsed;
  }
  for (const f of boolFields) {
    if (req.body[f] === undefined) continue;
    if (typeof req.body[f] !== "boolean") { res.status(400).json({ error: `Invalid ${f}` }); return; }
    updates[f] = req.body[f];
  }
  const numeric = normalizeBillableNumbers(req.body);
  if (!numeric.ok) { res.status(400).json({ error: `Invalid ${numeric.field}` }); return; }
  Object.assign(updates, numeric.values);
  const nextEffectiveDate = updates.effectiveDate === undefined ? existing.effectiveDate : updates.effectiveDate;
  const nextExpirationDate = updates.expirationDate === undefined ? existing.expirationDate : updates.expirationDate;
  if (typeof nextEffectiveDate === "string" && typeof nextExpirationDate === "string" && nextEffectiveDate > nextExpirationDate) {
    res.status(400).json({ error: "expirationDate must not precede effectiveDate" }); return;
  }
  const [updated] = await db.update(billableItemsTable).set(updates).where(eq(billableItemsTable.id, id)).returning();
  res.json(fmt(updated));
});

router.delete("/billable-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid billable item ID" }); return; }
  const [existing] = await db.select().from(billableItemsTable).where(eq(billableItemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const m = await checkAccess(req.clerkUserId, existing.companyId, true);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(billableItemsTable).where(eq(billableItemsTable.id, id));
  res.sendStatus(204);
});

export default router;
