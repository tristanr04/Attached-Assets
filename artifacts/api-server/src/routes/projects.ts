import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function checkAccess(clerkUserId: string, companyId: number) {
  const [m] = await db.select().from(companyMembershipsTable)
    .where(and(eq(companyMembershipsTable.companyId, companyId), eq(companyMembershipsTable.clerkUserId, clerkUserId)));
  return m;
}

function formatProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    companyId: p.companyId,
    name: p.name,
    jobNumber: p.jobNumber,
    customer: p.customer,
    workLocation: p.workLocation,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : null;

  let projects;
  if (companyId) {
    const m = await checkAccess(req.clerkUserId, companyId);
    if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
    projects = await db.select().from(projectsTable).where(eq(projectsTable.companyId, companyId));
  } else {
    const memberships = await db.select({ companyId: companyMembershipsTable.companyId })
      .from(companyMembershipsTable).where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
    const ids = memberships.map(m => m.companyId);
    projects = ids.length ? (await db.select().from(projectsTable)).filter(p => ids.includes(p.companyId)) : [];
  }

  res.json(projects.map(formatProject));
});

router.post("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { companyId, name, jobNumber, customer, workLocation, description } = req.body;
  if (!companyId || !name) { res.status(400).json({ error: "companyId and name are required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [project] = await db.insert(projectsTable).values({
    companyId, name, jobNumber: jobNumber ?? null, customer: customer ?? null,
    workLocation: workLocation ?? null, description: description ?? null,
  }).returning();
  res.status(201).json(formatProject(project));
});

router.get("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const projectId = parseInt(req.params.projectId, 10);

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, project.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(formatProject(project));
});

router.patch("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const projectId = parseInt(req.params.projectId, 10);

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, project.companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, jobNumber, customer, workLocation, description, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (jobNumber !== undefined) updates.jobNumber = jobNumber;
  if (customer !== undefined) updates.customer = customer;
  if (workLocation !== undefined) updates.workLocation = workLocation;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, projectId)).returning();
  res.json(formatProject(updated));
});

export default router;
