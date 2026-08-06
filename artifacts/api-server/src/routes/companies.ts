import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, companiesTable, companyMembershipsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function formatMember(m: typeof companyMembershipsTable.$inferSelect) {
  return {
    id: m.id,
    companyId: m.companyId,
    userId: m.userId,
    clerkUserId: m.clerkUserId,
    email: m.email,
    firstName: m.firstName,
    lastName: m.lastName,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  };
}

function formatCompany(c: typeof companiesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    email: c.email,
    logoUrl: c.logoUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ── List companies the current user belongs to ────────────────────────────────
router.get("/companies", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const memberships = await db
    .select({ companyId: companyMembershipsTable.companyId })
    .from(companyMembershipsTable)
    .where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));

  if (memberships.length === 0) { res.json([]); return; }

  const companyIds = memberships.map((m) => m.companyId);
  const companies = await db.select().from(companiesTable);
  const userCompanies = companies.filter((c) => companyIds.includes(c.id));
  res.json(userCompanies.map(formatCompany));
});

// ── Create company ────────────────────────────────────────────────────────────
router.post("/companies", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, address, phone, email } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [company] = await db.insert(companiesTable).values({ name, address, phone, email }).returning();

  // auto-add creator as admin
  const user = req.userId ? await db.select().from(usersTable).where(eq(usersTable.id, req.userId)).then(r => r[0]) : null;
  await db.insert(companyMembershipsTable).values({
    companyId: company.id,
    userId: req.userId ?? null,
    clerkUserId: req.clerkUserId,
    email: user?.email ?? "",
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    role: "admin",
  });

  res.status(201).json(formatCompany(company));
});

// ── Get company ────────────────────────────────────────────────────────────────
router.get("/companies/:companyId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "Invalid" }); return; }

  // Check membership
  const [membership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatCompany(company));
});

// ── Update company ─────────────────────────────────────────────────────────────
router.patch("/companies/:companyId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "Invalid" }); return; }

  const [membership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!membership || membership.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, address, phone, email, logoUrl } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;

  const [updated] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, companyId)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatCompany(updated));
});

// ── List members ────────────────────────────────────────────────────────────────
router.get("/companies/:companyId/members", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "Invalid" }); return; }

  const [selfMembership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!selfMembership) { res.status(403).json({ error: "Forbidden" }); return; }

  const members = await db.select().from(companyMembershipsTable).where(eq(companyMembershipsTable.companyId, companyId));
  res.json(members.map(formatMember));
});

// ── Add member ─────────────────────────────────────────────────────────────────
router.post("/companies/:companyId/members", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  if (!req.clerkUserId || isNaN(companyId)) { res.status(400).json({ error: "Invalid" }); return; }

  const [selfMembership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!selfMembership || selfMembership.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { email, role, firstName, lastName } = req.body;
  if (!email || !role) { res.status(400).json({ error: "email and role are required" }); return; }

  // Link to existing user if found
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  const [member] = await db.insert(companyMembershipsTable).values({
    companyId,
    userId: existingUser?.id ?? null,
    clerkUserId: existingUser?.clerkUserId ?? null,
    email,
    firstName: firstName ?? existingUser?.firstName ?? null,
    lastName: lastName ?? existingUser?.lastName ?? null,
    role,
  }).returning();

  res.status(201).json(formatMember(member));
});

// ── Update member ──────────────────────────────────────────────────────────────
router.patch("/companies/:companyId/members/:memberId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (!req.clerkUserId || isNaN(companyId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid" }); return; }

  const [selfMembership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!selfMembership || selfMembership.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { role } = req.body;
  const [updated] = await db.update(companyMembershipsTable)
    .set({ role })
    .where(and(eq(companyMembershipsTable.id, memberId), eq(companyMembershipsTable.companyId, companyId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(updated));
});

// ── Remove member ──────────────────────────────────────────────────────────────
router.delete("/companies/:companyId/members/:memberId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const companyId = parseInt(req.params.companyId, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (!req.clerkUserId || isNaN(companyId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid" }); return; }

  const [selfMembership] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, req.clerkUserId)));
  if (!selfMembership || selfMembership.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const [deleted] = await db.delete(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.id, memberId), eq(companyMembershipsTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
