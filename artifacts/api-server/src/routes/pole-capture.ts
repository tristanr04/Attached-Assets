/**
 * Pole Capture — Photo-to-Job AI pipeline
 *
 * POST /pole-capture/analyze   — receive photo + GPS, run OCR + job match + AI prefill
 * GET  /pole-capture/recent    — list recent analyses for this company
 * GET  /pole-capture/:id       — get single analysis
 * POST /pole-capture/:id/confirm — foreman confirms fields, creates/pre-fills report
 * POST /pole-capture/:id/retry   — retry a failed analysis
 *
 * All routes enforce company isolation. Nothing is billed/submitted before confirmation.
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, gte, ilike, or } from "drizzle-orm";
import {
  db,
  poleAnalysesTable,
  companyMembershipsTable,
  usersTable,
  projectsTable,
  dailyReportsTable,
  reportMaterialsTable,
  photosTable,
  pkbWorkPackagesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  appendAuditLog,
  scoreProjects,
  validateConfirmation,
  validateRetry,
  buildConfirmedFields,
  type ScoredProject,
} from "../lib/pole-capture-logic";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getMembership(clerkUserId: string, companyId: number) {
  const [m] = await db
    .select()
    .from(companyMembershipsTable)
    .where(
      and(
        eq(companyMembershipsTable.clerkUserId, clerkUserId),
        eq(companyMembershipsTable.companyId, companyId),
      ),
    );
  return m;
}

async function getDbUser(clerkUserId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
  return u;
}

function formatAnalysis(a: typeof poleAnalysesTable.$inferSelect) {
  return {
    id: a.id,
    companyId: a.companyId,
    status: a.status,
    photoData: a.photoData,
    photoMimeType: a.photoMimeType,
    gpsLat: a.gpsLat != null ? Number(a.gpsLat) : null,
    gpsLng: a.gpsLng != null ? Number(a.gpsLng) : null,
    gpsAccuracyM: a.gpsAccuracyM != null ? Number(a.gpsAccuracyM) : null,
    ocrPoleTag: a.ocrPoleTag,
    ocrConfidence: a.ocrConfidence != null ? Number(a.ocrConfidence) : null,
    ocrRawText: a.ocrRawText,
    matchedProjectId: a.matchedProjectId,
    matchedWorkPackageId: a.matchedWorkPackageId,
    matchConfidence: a.matchConfidence != null ? Number(a.matchConfidence) : null,
    matchMethod: a.matchMethod,
    matchCandidates: a.matchCandidates,
    proposedFields: a.proposedFields,
    confirmedFields: a.confirmedFields,
    linkedReportId: a.linkedReportId,
    duplicateOfId: a.duplicateOfId,
    errorMessage: a.errorMessage,
    auditLog: a.auditLog,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Analysis prompt
// ─────────────────────────────────────────────────────────────────────────────
const VISION_PROMPT = `You are analyzing a utility pole photo for a line construction crew's daily field report.

Carefully examine the photo and return ONLY a valid JSON object with this exact structure:

{
  "ocrPoleTag": "exact pole tag number visible (null if not clearly readable)",
  "ocrConfidence": 0.0,
  "ocrRawText": "all text visible on the pole: numbers, tags, stamps, stickers",
  "poleMaterial": {"value": "wood|steel|concrete|composite|fiberglass|unknown", "confidence": 0.0},
  "poleHeight": {"value": "estimated height as string like '40ft' or '45ft' (null if unknown)", "confidence": 0.0},
  "poleClass": {"value": "class number or label like '1','2','3','H1','H2' (null if not visible)", "confidence": 0.0},
  "topFramingType": {"value": "single_crossarm|double_crossarm|h_frame|deadend|tangent|corner|transmission|unknown", "confidence": 0.0},
  "visibleEquipment": {"value": ["list all equipment: transformers (size if visible), switches, cutouts, capacitors, reclosers, meters, secondary racks, insulators, guys, anchors"], "confidence": 0.0},
  "completedWork": {"value": "describe recently completed or in-progress work clearly visible: new hardware, fresh cuts, new conductor, removed items (null if none obvious)", "confidence": 0.0},
  "materialsInstalled": {"value": [{"name": "exact material name", "qty": 1, "unit": "ea|ft|set|lbs"}], "confidence": 0.0},
  "requiredDocs": {"value": ["photo documentation categories needed: Full Pole, Pole Tag, Top Framing, Transformer, Before Work, After Work, Base, Damage, etc."], "confidence": 0.0},
  "poleCondition": {"value": "good|fair|poor|critical", "confidence": 0.0},
  "hazardsObserved": {"value": ["list safety hazards: leaning pole, missing guy, wildlife hazard, low clearance, etc. Empty array if none visible."], "confidence": 0.0}
}

Confidence scale: 0.9+ = clearly visible, 0.7-0.9 = probably correct, 0.5-0.7 = uncertain, <0.5 = guessing.
Return null for values that truly cannot be determined. Always return valid JSON only.`;

// ─────────────────────────────────────────────────────────────────────────────
// Job matching
// ─────────────────────────────────────────────────────────────────────────────
interface JobCandidate {
  projectId: number;
  projectName: string;
  confidence: number;
  method: string;
}

async function matchJobs(
  companyId: number,
  poleTag: string | null,
  today: string,
): Promise<{ candidates: JobCandidate[]; topId: number | null; confidence: number; method: string }> {
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId));

  if (projects.length === 0) {
    return { candidates: [], topId: null, confidence: 0, method: "none" };
  }

  // Get today's reports (projects with active draft work today)
  const todayReports = await db
    .select({ projectId: dailyReportsTable.projectId })
    .from(dailyReportsTable)
    .where(
      and(
        eq(dailyReportsTable.companyId, companyId),
        eq(dailyReportsTable.reportDate, today),
      ),
    );
  const todayProjectIds = new Set(todayReports.map(r => r.projectId).filter(Boolean));

  // Search recent reports for the pole tag
  const poleTagMatches = new Set<number>();
  if (poleTag) {
    const tagLike = `%${poleTag}%`;
    const matches = await db
      .select({ projectId: dailyReportsTable.projectId })
      .from(dailyReportsTable)
      .where(
        and(
          eq(dailyReportsTable.companyId, companyId),
          or(
            ilike(dailyReportsTable.structuresInstalled, tagLike),
            ilike(dailyReportsTable.workLocation, tagLike),
            ilike(dailyReportsTable.workPerformed, tagLike),
          ),
        ),
      )
      .limit(20);
    matches.forEach(m => { if (m.projectId) poleTagMatches.add(m.projectId); });
  }

  // Score using shared logic module (same algorithm tested in unit tests)
  const scoredProjects: ScoredProject[] = projects.map(p => ({
    projectId: p.id,
    projectName: p.name,
    isActive: p.status === "active",
    hasTodayReport: todayProjectIds.has(p.id),
    hasPoleTagHit: poleTag !== null && poleTagMatches.has(p.id),
  }));
  const candidates = scoreProjects(scoredProjects).slice(0, 5);
  const top = candidates[0] ?? null;

  return {
    candidates,
    topId: top?.projectId ?? null,
    confidence: top?.confidence ?? 0,
    method: top?.method ?? "none",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Work package matching
// ─────────────────────────────────────────────────────────────────────────────
async function matchWorkPackage(companyId: number, poleMaterial: string | null): Promise<number | null> {
  const wps = await db
    .select({ id: pkbWorkPackagesTable.id, poleMaterial: pkbWorkPackagesTable.poleMaterial })
    .from(pkbWorkPackagesTable)
    .where(
      and(
        eq(pkbWorkPackagesTable.companyId, companyId),
        eq(pkbWorkPackagesTable.isActive, true),
      ),
    )
    .limit(50);

  if (!wps.length) return null;

  // Simple material match
  if (poleMaterial) {
    const mat = poleMaterial.toLowerCase();
    const match = wps.find(wp => wp.poleMaterial?.toLowerCase() === mat);
    if (match) return match.id;
  }

  // Fall back to first active
  return wps[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ─────────────────────────────────────────────────────────────────────────────
async function checkDuplicate(
  companyId: number,
  poleTag: string | null,
  excludeId: number,
): Promise<number | null> {
  if (!poleTag) return null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [dup] = await db
    .select({ id: poleAnalysesTable.id })
    .from(poleAnalysesTable)
    .where(
      and(
        eq(poleAnalysesTable.companyId, companyId),
        eq(poleAnalysesTable.ocrPoleTag, poleTag),
        gte(poleAnalysesTable.createdAt, todayStart),
      ),
    )
    .limit(5);

  if (!dup || dup.id === excludeId) return null;
  return dup.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core analysis runner (used by analyze + retry)
// ─────────────────────────────────────────────────────────────────────────────
async function runAnalysis(analysisId: number, companyId: number, photoData: string, photoMimeType: string) {
  try {
    // Mark as analyzing
    await db
      .update(poleAnalysesTable)
      .set({ status: "analyzing" })
      .where(eq(poleAnalysesTable.id, analysisId));

    // ── OpenAI Vision ──────────────────────────────────────────────────────
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${photoMimeType};base64,${photoData}`, detail: "high" },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let ai: any = {};
    try { ai = JSON.parse(raw); } catch { ai = {}; }

    const poleTag = ai.ocrPoleTag ?? null;
    const ocrConf = ai.ocrConfidence ?? null;
    const ocrRaw = ai.ocrRawText ?? null;
    const poleMat = ai.poleMaterial?.value ?? null;

    // ── Today's date ────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    // ── Job matching ────────────────────────────────────────────────────────
    const { candidates, topId, confidence: matchConf, method: matchMethod } =
      await matchJobs(companyId, poleTag, today);

    // ── Work package matching ───────────────────────────────────────────────
    const wpId = await matchWorkPackage(companyId, poleMat);

    // ── Build proposed fields ───────────────────────────────────────────────
    const proposedFields = {
      poleTag:          { value: poleTag,                       confidence: ocrConf ?? 0, source: "ocr" },
      poleMaterial:     { value: poleMat,                       confidence: ai.poleMaterial?.confidence ?? 0, source: "ai_vision" },
      poleHeight:       { value: ai.poleHeight?.value ?? null,  confidence: ai.poleHeight?.confidence ?? 0, source: "ai_vision" },
      poleClass:        { value: ai.poleClass?.value ?? null,   confidence: ai.poleClass?.confidence ?? 0, source: "ai_vision" },
      topFramingType:   { value: ai.topFramingType?.value ?? null, confidence: ai.topFramingType?.confidence ?? 0, source: "ai_vision" },
      visibleEquipment: { value: ai.visibleEquipment?.value ?? [], confidence: ai.visibleEquipment?.confidence ?? 0, source: "ai_vision" },
      completedWork:    { value: ai.completedWork?.value ?? null, confidence: ai.completedWork?.confidence ?? 0, source: "ai_vision" },
      materialsInstalled: { value: ai.materialsInstalled?.value ?? [], confidence: ai.materialsInstalled?.confidence ?? 0, source: "ai_vision" },
      requiredDocs:     { value: ai.requiredDocs?.value ?? ["Full Pole", "Pole Tag"], confidence: ai.requiredDocs?.confidence ?? 0.8, source: "ai_vision" },
      poleCondition:    { value: ai.poleCondition?.value ?? null, confidence: ai.poleCondition?.confidence ?? 0, source: "ai_vision" },
      hazardsObserved:  { value: ai.hazardsObserved?.value ?? [], confidence: ai.hazardsObserved?.confidence ?? 0, source: "ai_vision" },
    };

    // ── Duplicate check ─────────────────────────────────────────────────────
    const dupId = await checkDuplicate(companyId, poleTag, analysisId);

    // ── Persist ─────────────────────────────────────────────────────────────
    const [updated] = await db
      .update(poleAnalysesTable)
      .set({
        status: "pending",
        ocrPoleTag: poleTag,
        ocrConfidence: ocrConf != null ? String(ocrConf) : null,
        ocrRawText: ocrRaw,
        matchedProjectId: topId,
        matchedWorkPackageId: wpId,
        matchConfidence: matchConf != null ? String(matchConf) : null,
        matchMethod,
        matchCandidates: candidates,
        proposedFields,
        duplicateOfId: dupId,
        auditLog: appendAuditLog(null, { action: "analyzed", detail: `OCR: ${poleTag ?? "none"}, match: ${matchMethod} (${Math.round(matchConf * 100)}%)` }),
      })
      .where(eq(poleAnalysesTable.id, analysisId))
      .returning();

    return updated;
  } catch (err: any) {
    await db
      .update(poleAnalysesTable)
      .set({
        status: "error",
        errorMessage: err.message ?? String(err),
        auditLog: appendAuditLog(null, { action: "error", detail: err.message }),
      })
      .where(eq(poleAnalysesTable.id, analysisId));
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /pole-capture/analyze
// ─────────────────────────────────────────────────────────────────────────────
router.post("/pole-capture/analyze", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { companyId, photoData, photoMimeType = "image/jpeg", gpsLat, gpsLng, gpsAccuracyM } = req.body;
  if (!companyId || !photoData) {
    res.status(400).json({ error: "companyId and photoData are required" });
    return;
  }

  const membership = await getMembership(req.clerkUserId, Number(companyId));
  if (!membership) { res.status(403).json({ error: "Not a member of this company" }); return; }

  const dbUser = await getDbUser(req.clerkUserId);

  // Create the analysis record immediately (photo stored immutably)
  const [analysis] = await db
    .insert(poleAnalysesTable)
    .values({
      companyId: Number(companyId),
      createdByUserId: dbUser?.id ?? null,
      photoData,
      photoMimeType,
      gpsLat: gpsLat != null ? String(gpsLat) : null,
      gpsLng: gpsLng != null ? String(gpsLng) : null,
      gpsAccuracyM: gpsAccuracyM != null ? String(gpsAccuracyM) : null,
      status: "analyzing",
      auditLog: [{ action: "created", at: new Date().toISOString() }],
    })
    .returning();

  // Run analysis in background so we can return the ID immediately
  runAnalysis(analysis.id, Number(companyId), photoData, photoMimeType).catch(() => {/* handled inside */});

  res.status(202).json({ id: analysis.id, status: "analyzing" });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pole-capture/recent
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pole-capture/recent", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const companyId = Number(req.query.companyId);
  if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

  const membership = await getMembership(req.clerkUserId, companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await db
    .select({
      id: poleAnalysesTable.id,
      status: poleAnalysesTable.status,
      ocrPoleTag: poleAnalysesTable.ocrPoleTag,
      matchedProjectId: poleAnalysesTable.matchedProjectId,
      linkedReportId: poleAnalysesTable.linkedReportId,
      duplicateOfId: poleAnalysesTable.duplicateOfId,
      createdAt: poleAnalysesTable.createdAt,
    })
    .from(poleAnalysesTable)
    .where(
      and(
        eq(poleAnalysesTable.companyId, companyId),
        gte(poleAnalysesTable.createdAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(poleAnalysesTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pole-capture/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pole-capture/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const [analysis] = await db
    .select()
    .from(poleAnalysesTable)
    .where(eq(poleAnalysesTable.id, id));

  if (!analysis) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await getMembership(req.clerkUserId, analysis.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json(formatAnalysis(analysis));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /pole-capture/:id/confirm
// ─────────────────────────────────────────────────────────────────────────────
router.post("/pole-capture/:id/confirm", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const { projectId, fieldStatuses, editValues } = req.body;

  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }

  const [analysis] = await db.select().from(poleAnalysesTable).where(eq(poleAnalysesTable.id, id));
  if (!analysis) { res.status(404).json({ error: "Not found" }); return; }

  // ── Authorization: must be same company ────────────────────────────────────
  const membership = await getMembership(req.clerkUserId, analysis.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  // Cross-company guard: project must belong to same company
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, Number(projectId)), eq(projectsTable.companyId, analysis.companyId)));
  if (!project) { res.status(403).json({ error: "Project does not belong to this company" }); return; }

  // ── Status gate ────────────────────────────────────────────────────────────
  if (analysis.status === "confirmed") {
    // Already confirmed → return the linked report
    res.json({ reportId: analysis.linkedReportId, created: false, alreadyConfirmed: true });
    return;
  }
  if (analysis.status !== "pending") {
    res.status(409).json({ error: `Analysis is in '${analysis.status}' status and cannot be confirmed` });
    return;
  }

  // ── Duplicate gate ─────────────────────────────────────────────────────────
  // Check if another *confirmed* analysis with this pole tag + project exists today
  const poleTag = analysis.ocrPoleTag;
  if (poleTag) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [existingConfirmed] = await db
      .select({ id: poleAnalysesTable.id, linkedReportId: poleAnalysesTable.linkedReportId })
      .from(poleAnalysesTable)
      .where(
        and(
          eq(poleAnalysesTable.companyId, analysis.companyId),
          eq(poleAnalysesTable.ocrPoleTag, poleTag),
          eq(poleAnalysesTable.status, "confirmed"),
          gte(poleAnalysesTable.createdAt, todayStart),
        ),
      )
      .limit(1);

    if (existingConfirmed && existingConfirmed.id !== id) {
      res.status(409).json({
        error: "This pole was already confirmed today",
        duplicateAnalysisId: existingConfirmed.id,
        duplicateReportId: existingConfirmed.linkedReportId,
      });
      return;
    }
  }

  // ── Build confirmed fields from accepted/edited values ─────────────────────
  const proposed = (analysis.proposedFields ?? {}) as Record<string, any>;
  const confirmedFields: Record<string, any> = {};
  const statuses = (fieldStatuses ?? {}) as Record<string, string>;
  const edits = (editValues ?? {}) as Record<string, string>;

  for (const [key, field] of Object.entries(proposed)) {
    const status = statuses[key] ?? "pending";
    if (status === "rejected") {
      confirmedFields[key] = { ...field, value: null, status: "rejected" };
    } else if (status === "edited" && edits[key] !== undefined) {
      confirmedFields[key] = { ...field, value: edits[key], status: "edited" };
    } else {
      confirmedFields[key] = { ...field, status: "accepted" };
    }
  }

  const dbUser = await getDbUser(req.clerkUserId);
  const today = new Date().toISOString().slice(0, 10);

  // ── Find or create today's draft report ────────────────────────────────────
  const existingReports = await db
    .select()
    .from(dailyReportsTable)
    .where(
      and(
        eq(dailyReportsTable.companyId, analysis.companyId),
        eq(dailyReportsTable.projectId, Number(projectId)),
        eq(dailyReportsTable.reportDate, today),
      ),
    );

  const existingDraft = existingReports.find(r => r.status === "draft");
  const existingComplete = existingReports.find(r => r.status === "complete");

  if (existingComplete) {
    res.status(409).json({ error: "A completed report for this project already exists today. Cannot add to a completed report." });
    return;
  }

  // Extract confirmed values
  const confirmedPoleTag = statuses.poleTag !== "rejected"
    ? (edits.poleTag ?? confirmedFields.poleTag?.value ?? null)
    : null;
  const confirmedWork = statuses.completedWork !== "rejected"
    ? (edits.completedWork ?? confirmedFields.completedWork?.value ?? null)
    : null;
  const confirmedMaterials = statuses.materialsInstalled !== "rejected"
    ? (confirmedFields.materialsInstalled?.value ?? [])
    : [];
  const confirmedWpId = analysis.matchedWorkPackageId ?? null;

  let reportId: number;
  let reportCreated: boolean;

  if (existingDraft) {
    // Augment existing draft
    const existing = existingDraft;
    const newWorkPerformed = [
      existing.workPerformed,
      confirmedWork ? `[Pole ${confirmedPoleTag ?? "?"}] ${confirmedWork}` : null,
    ].filter(Boolean).join("\n\n") || null;

    const newStructures = [
      existing.structuresInstalled,
      confirmedPoleTag ?? null,
    ].filter(Boolean).join(", ") || null;

    await db
      .update(dailyReportsTable)
      .set({
        workPerformed: newWorkPerformed,
        structuresInstalled: newStructures,
        workPackageId: confirmedWpId ?? existing.workPackageId,
      })
      .where(eq(dailyReportsTable.id, existing.id));

    reportId = existing.id;
    reportCreated = false;
  } else {
    // Create new draft
    const [newReport] = await db
      .insert(dailyReportsTable)
      .values({
        companyId: analysis.companyId,
        projectId: Number(projectId),
        foremanId: dbUser?.id ?? null,
        reportDate: today,
        status: "draft",
        structuresInstalled: confirmedPoleTag ?? null,
        workPerformed: confirmedWork ? `[Pole ${confirmedPoleTag ?? "?"}] ${confirmedWork}` : null,
        workPackageId: confirmedWpId ?? null,
      })
      .returning();
    reportId = newReport.id;
    reportCreated = true;
  }

  // ── Insert confirmed materials into report_materials ───────────────────────
  if (Array.isArray(confirmedMaterials) && confirmedMaterials.length > 0) {
    const matRows = confirmedMaterials
      .filter((m: any) => m && m.name)
      .map((m: any) => ({
        reportId,
        name: String(m.name),
        quantity: String(Number(m.qty) || 1),
        unit: String(m.unit || "ea"),
        notes: "AI Proposed — confirmed by foreman",
      }));
    if (matRows.length > 0) {
      await db.insert(reportMaterialsTable).values(matRows);
    }
  }

  // ── Attach the original pole photo to the report ───────────────────────────
  await db.insert(photosTable).values({
    reportId,
    url: `data:${analysis.photoMimeType};base64,${analysis.photoData}`,
    caption: confirmedPoleTag ? `Pole ${confirmedPoleTag}` : "Captured pole photo",
    category: "full_pole",
  });

  // ── Mark analysis as confirmed ─────────────────────────────────────────────
  await db
    .update(poleAnalysesTable)
    .set({
      status: "confirmed",
      confirmedFields,
      confirmedByUserId: dbUser?.id ?? null,
      confirmedAt: new Date(),
      linkedReportId: reportId,
      auditLog: appendAuditLog(analysis.auditLog as any[], {
        action: "confirmed",
        by: dbUser?.id,
        detail: `Report ${reportId} (${reportCreated ? "created" : "updated"}) for project ${projectId}`,
      }),
    })
    .where(eq(poleAnalysesTable.id, id));

  res.json({ reportId, created: reportCreated });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /pole-capture/:id/retry
// ─────────────────────────────────────────────────────────────────────────────
router.post("/pole-capture/:id/retry", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const [analysis] = await db.select().from(poleAnalysesTable).where(eq(poleAnalysesTable.id, id));
  if (!analysis) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await getMembership(req.clerkUserId, analysis.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  if (analysis.status === "confirmed") {
    res.status(409).json({ error: "Analysis already confirmed" }); return;
  }

  // Clear previous error + re-run
  await db
    .update(poleAnalysesTable)
    .set({ status: "analyzing", errorMessage: null })
    .where(eq(poleAnalysesTable.id, id));

  runAnalysis(id, analysis.companyId, analysis.photoData, analysis.photoMimeType).catch(() => {});

  res.json({ id, status: "analyzing" });
});

export default router;
