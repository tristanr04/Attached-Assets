import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, crewsTable, crewMembersTable, companyMembershipsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function checkCompanyAccess(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  return m;
}

async function formatCrew(c: typeof crewsTable.$inferSelect) {
  const memberCount = await db.select({ count: sql<number>`count(*)` }).from(crewMembersTable).where(eq(crewMembersTable.crewId, c.id));
  let foremanName: string | null = null;
  if (c.foremanId) {
    const [f] = await db.select().from(usersTable).where(eq(usersTable.id, c.foremanId));
    if (f) foremanName = [f.firstName, f.lastName].filter(Boolean).join(" ") || null;
  }
  return {
    id: c.id,
    companyId: c.companyId,
    name: c.name,
    description: c.description,
    foremanId: c.foremanId,
    foremanName,
    memberCount: Number(memberCount[0]?.count ?? 0),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/crews", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : null;

  let crews;
  if (companyId) {
    const membership = await checkCompanyAccess(req.clerkUserId, companyId);
    if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }
    crews = await db.select().from(crewsTable).where(eq(crewsTable.companyId, companyId));
  } else {
    const memberships = await db.select({ companyId: companyMembershipsTable.companyId })
      .from(companyMembershipsTable).where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
    const ids = memberships.map(m => m.companyId);
    crews = ids.length ? await db.select().from(crewsTable) : [];
    crews = crews.filter(c => ids.includes(c.companyId));
  }

  const results = await Promise.all(crews.map(formatCrew));
  res.json(results);
});

router.post("/crews", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, name, description, foremanId } = req.body;
  if (!companyId || !name) { res.status(400).json({ error: "companyId and name are required" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, companyId);
  if (!membership || !["admin", "supervisor"].includes(membership.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [crew] = await db.insert(crewsTable).values({ companyId, name, description: description ?? null, foremanId: foremanId ?? null }).returning();
  res.status(201).json(await formatCrew(crew));
});

router.get("/crews/:crewId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await formatCrew(crew));
});

router.patch("/crews/:crewId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership || !["admin", "supervisor"].includes(membership.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, description, foremanId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (foremanId !== undefined) updates.foremanId = foremanId;

  const [updated] = await db.update(crewsTable).set(updates).where(eq(crewsTable.id, crewId)).returning();
  res.json(await formatCrew(updated));
});

router.delete("/crews/:crewId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership || membership.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(crewsTable).where(eq(crewsTable.id, crewId));
  res.sendStatus(204);
});

// ── Crew members ──────────────────────────────────────────────────────────────
function formatMember(m: typeof crewMembersTable.$inferSelect) {
  return {
    id: m.id,
    crewId: m.crewId,
    userId: m.userId,
    name: m.name,
    trade: m.trade,
    classification: m.classification,
    createdAt: m.createdAt.toISOString(),
  };
}

router.get("/crews/:crewId/members", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const members = await db.select().from(crewMembersTable).where(eq(crewMembersTable.crewId, crewId));
  res.json(members.map(formatMember));
});

router.post("/crews/:crewId/members", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership || !["admin", "supervisor", "foreman"].includes(membership.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, trade, classification, userId } = req.body;
  if (!name || !trade) { res.status(400).json({ error: "name and trade are required" }); return; }

  const [member] = await db.insert(crewMembersTable).values({ crewId, name, trade, classification: classification ?? null, userId: userId ?? null }).returning();
  res.status(201).json(formatMember(member));
});

router.patch("/crews/:crewId/members/:memberId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);
  const memberId = parseInt(req.params.memberId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, trade, classification } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (trade !== undefined) updates.trade = trade;
  if (classification !== undefined) updates.classification = classification;

  const [updated] = await db.update(crewMembersTable).set(updates)
    .where(and(eq(crewMembersTable.id, memberId), eq(crewMembersTable.crewId, crewId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(updated));
});

router.delete("/crews/:crewId/members/:memberId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const crewId = parseInt(req.params.crewId, 10);
  const memberId = parseInt(req.params.memberId, 10);

  const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, crewId));
  if (!crew) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await checkCompanyAccess(req.clerkUserId, crew.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const [deleted] = await db.delete(crewMembersTable)
    .where(and(eq(crewMembersTable.id, memberId), eq(crewMembersTable.crewId, crewId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
