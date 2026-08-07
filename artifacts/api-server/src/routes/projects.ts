import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, projectsTable, companyMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";
import { parseOptionalText, parseRequiredText } from "../lib/billableItemInput";

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
  const companyId = req.query.companyId === undefined ? null : parsePositiveId(req.query.companyId);
  if (req.query.companyId !== undefined && companyId === null) { res.status(400).json({ error: "Invalid companyId" }); return; }

  let projects;
  if (companyId) {
    const m = await checkAccess(req.clerkUserId, companyId);
    if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
    projects = await db.select().from(projectsTable).where(eq(projectsTable.companyId, companyId));
  } else {
    const memberships = await db.select({ companyId: companyMembershipsTable.companyId })
      .from(companyMembershipsTable).where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
    const ids = memberships.map(m => m.companyId);
    projects = ids.length
      ? await db.select().from(projectsTable).where(inArray(projectsTable.companyId, ids))
      : [];
  }

  res.json(projects.map(formatProject));
});

router.post("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = parsePositiveId(req.body?.companyId);
  const name = parseRequiredText(req.body?.name);
  if (companyId === null || name === null) { res.status(400).json({ error: "Valid companyId and name are required" }); return; }

  const m = await checkAccess(req.clerkUserId, companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const optional = {
    jobNumber: parseOptionalText(req.body.jobNumber, 100),
    customer: parseOptionalText(req.body.customer, 500),
    workLocation: parseOptionalText(req.body.workLocation, 1_000),
    description: parseOptionalText(req.body.description),
  };
  for (const [field, value] of Object.entries(optional)) {
    if (value === undefined && req.body[field] !== undefined) { res.status(400).json({ error: `Invalid ${field}` }); return; }
  }

  const [project] = await db.insert(projectsTable).values({
    companyId, name, jobNumber: optional.jobNumber ?? null, customer: optional.customer ?? null,
    workLocation: optional.workLocation ?? null, description: optional.description ?? null,
  }).returning();
  res.status(201).json(formatProject(project));
});

router.get("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const projectId = parsePositiveId(req.params.projectId);
  if (projectId === null) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, project.companyId);
  if (!m) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(formatProject(project));
});

router.patch("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const projectId = parsePositiveId(req.params.projectId);
  if (projectId === null) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const m = await checkAccess(req.clerkUserId, project.companyId);
  if (!m || !["admin", "supervisor"].includes(m.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const updates: Record<string, unknown> = {};
  const textFields = {
    jobNumber: 100,
    customer: 500,
    workLocation: 1_000,
    description: 4_000,
  } as const;
  if (req.body.name !== undefined) {
    const name = parseRequiredText(req.body.name);
    if (name === null) { res.status(400).json({ error: "Invalid name" }); return; }
    updates.name = name;
  }
  for (const [field, maxLength] of Object.entries(textFields)) {
    if (req.body[field] === undefined) continue;
    const parsed = parseOptionalText(req.body[field], maxLength);
    if (parsed === undefined) { res.status(400).json({ error: `Invalid ${field}` }); return; }
    updates[field] = parsed;
  }
  if (req.body.status !== undefined) {
    if (!["active", "inactive", "complete"].includes(req.body.status)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.status = req.body.status;
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid project fields supplied" }); return; }

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, projectId)).returning();
  res.json(formatProject(updated));
});

export default router;
