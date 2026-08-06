import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  db, companyMembershipsTable, dailyReportsTable, crewsTable, projectsTable,
  usersTable, timeEntriesTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichReport(r: typeof dailyReportsTable.$inferSelect) {
  let projectName: string | null = null;
  let crewName: string | null = null;
  let foremanName: string | null = null;
  if (r.projectId) {
    const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, r.projectId));
    projectName = p?.name ?? null;
  }
  if (r.crewId) {
    const [c] = await db.select({ name: crewsTable.name }).from(crewsTable).where(eq(crewsTable.id, r.crewId));
    crewName = c?.name ?? null;
  }
  if (r.foremanId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, r.foremanId));
    foremanName = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || null : null;
  }
  return {
    id: r.id, companyId: r.companyId, projectId: r.projectId, crewId: r.crewId, foremanId: r.foremanId,
    reportDate: r.reportDate, status: r.status, projectName, crewName, foremanName,
    workLocation: r.workLocation, generalForeman: r.generalForeman, startTime: r.startTime, stopTime: r.stopTime,
    weatherConditions: r.weatherConditions, workPerformed: r.workPerformed, structuresInstalled: r.structuresInstalled,
    safetyMeeting: r.safetyMeeting, safetyNotes: r.safetyNotes, delays: r.delays, outages: r.outages,
    customerIssues: r.customerIssues, injuries: r.injuries, injuryDetails: r.injuryDetails,
    additionalNotes: r.additionalNotes,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

// ── Foreman Dashboard ─────────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : null;

  const memberships = await db.select().from(companyMembershipsTable)
    .where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
  if (memberships.length === 0) {
    res.json({ todayReportStatus: null, todayReportId: null, draftCount: 0, recentReports: [], currentCrew: null, currentProject: null });
    return;
  }

  const targetCompanyId = companyId ?? memberships[0].companyId;
  const today = new Date().toISOString().split("T")[0];

  const allReports = await db.select().from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.companyId, targetCompanyId), req.userId ? eq(dailyReportsTable.foremanId, req.userId) : sql`1=1`))
    .orderBy(desc(dailyReportsTable.reportDate));

  const todayReport = allReports.find(r => r.reportDate === today);
  const draftReports = allReports.filter(r => r.status === "draft");
  const recentReports = allReports.slice(0, 10);

  // Current crew: most recently used
  let currentCrew = null;
  const latestWithCrew = allReports.find(r => r.crewId);
  if (latestWithCrew?.crewId) {
    const [crew] = await db.select().from(crewsTable).where(eq(crewsTable.id, latestWithCrew.crewId));
    if (crew) currentCrew = { id: crew.id, companyId: crew.companyId, name: crew.name, description: crew.description, foremanId: crew.foremanId, foremanName: null, memberCount: 0, createdAt: crew.createdAt.toISOString(), updatedAt: crew.updatedAt.toISOString() };
  }

  // Current project: most recently used
  let currentProject = null;
  const latestWithProject = allReports.find(r => r.projectId);
  if (latestWithProject?.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, latestWithProject.projectId));
    if (project) currentProject = { id: project.id, companyId: project.companyId, name: project.name, jobNumber: project.jobNumber, customer: project.customer, workLocation: project.workLocation, description: project.description, status: project.status, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() };
  }

  const enriched = await Promise.all(recentReports.map(enrichReport));
  res.json({
    todayReportStatus: todayReport?.status ?? null,
    todayReportId: todayReport?.id ?? null,
    draftCount: draftReports.length,
    recentReports: enriched,
    currentCrew,
    currentProject,
  });
});

// ── Supervisor Dashboard ──────────────────────────────────────────────────────
router.get("/dashboard/supervisor", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : null;

  const memberships = await db.select().from(companyMembershipsTable)
    .where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
  if (memberships.length === 0) {
    res.json({ pendingReviewCount: 0, missingReportsCount: 0, recentReports: [], recentIncidents: [], reportsByCrewCount: [] });
    return;
  }

  const targetCompanyId = companyId ?? memberships[0].companyId;
  const allReports = await db.select().from(dailyReportsTable)
    .where(eq(dailyReportsTable.companyId, targetCompanyId))
    .orderBy(desc(dailyReportsTable.reportDate));

  const draftReports = allReports.filter(r => r.status === "draft");
  const incidentReports = allReports.filter(r => r.injuries === true || r.delays != null);
  const recentReports = allReports.slice(0, 15);

  // Reports by crew
  const crews = await db.select().from(crewsTable).where(eq(crewsTable.companyId, targetCompanyId));
  const reportsByCrewCount = crews.map(crew => ({
    crewId: crew.id,
    crewName: crew.name,
    reportCount: allReports.filter(r => r.crewId === crew.id).length,
  }));

  const enriched = await Promise.all(recentReports.map(enrichReport));
  const incidents = await Promise.all(incidentReports.slice(0, 5).map(enrichReport));

  res.json({
    pendingReviewCount: draftReports.length,
    missingReportsCount: 0, // Would need more logic to calculate
    recentReports: enriched,
    recentIncidents: incidents,
    reportsByCrewCount,
  });
});

// ── Admin Dashboard ───────────────────────────────────────────────────────────
router.get("/dashboard/admin", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : null;

  const memberships = await db.select().from(companyMembershipsTable)
    .where(eq(companyMembershipsTable.clerkUserId, req.clerkUserId));
  if (memberships.length === 0) {
    res.json({ totalUsers: 0, totalReports: 0, completedReports: 0, draftReports: 0, totalProjects: 0, totalCrews: 0, recentReports: [], reportsByProject: [] });
    return;
  }

  const targetCompanyId = companyId ?? memberships[0].companyId;

  const [allMembers, allReports, allProjects, allCrews] = await Promise.all([
    db.select().from(companyMembershipsTable).where(eq(companyMembershipsTable.companyId, targetCompanyId)),
    db.select().from(dailyReportsTable).where(eq(dailyReportsTable.companyId, targetCompanyId)).orderBy(desc(dailyReportsTable.reportDate)),
    db.select().from(projectsTable).where(eq(projectsTable.companyId, targetCompanyId)),
    db.select().from(crewsTable).where(eq(crewsTable.companyId, targetCompanyId)),
  ]);

  const completedReports = allReports.filter(r => r.status === "complete");
  const draftReports = allReports.filter(r => r.status === "draft");
  const recentReports = allReports.slice(0, 10);

  const reportsByProject = allProjects.map(p => ({
    projectId: p.id,
    projectName: p.name,
    reportCount: allReports.filter(r => r.projectId === p.id).length,
  }));

  const enriched = await Promise.all(recentReports.map(enrichReport));

  res.json({
    totalUsers: allMembers.length,
    totalReports: allReports.length,
    completedReports: completedReports.length,
    draftReports: draftReports.length,
    totalProjects: allProjects.length,
    totalCrews: allCrews.length,
    recentReports: enriched,
    reportsByProject,
  });
});

export default router;
