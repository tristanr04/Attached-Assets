/**
 * Pole Assets — company-scoped pole registry
 *
 * GET  /pole-assets               — list company poles (with ref photo counts)
 * POST /pole-assets               — register a new pole manually
 * GET  /pole-assets/:id           — single pole with reference photos
 * PUT  /pole-assets/:id           — update attributes
 * GET  /pole-assets/:id/reference-photos — list reference photos (no photoData)
 *
 * All routes enforce company isolation.
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  poleAssetsTable,
  poleReferencePhotosTable,
  companyMembershipsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

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
  return m ?? null;
}

function formatAsset(a: typeof poleAssetsTable.$inferSelect) {
  return {
    id: a.id,
    companyId: a.companyId,
    poleNumber: a.poleNumber,
    utilityTag: a.utilityTag,
    lat: a.lat != null ? Number(a.lat) : null,
    lng: a.lng != null ? Number(a.lng) : null,
    projectId: a.projectId,
    workOrderId: a.workOrderId,
    poleMaterial: a.poleMaterial,
    poleHeight: a.poleHeight,
    poleClass: a.poleClass,
    topFramingType: a.topFramingType,
    attributes: a.attributes,
    isVerified: a.isVerified,
    referencePhotoCount: a.referencePhotoCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /pole-assets
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pole-assets", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const companyId = Number(req.query.companyId);
  if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

  const membership = await getMembership(req.clerkUserId, companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select()
    .from(poleAssetsTable)
    .where(eq(poleAssetsTable.companyId, companyId))
    .orderBy(desc(poleAssetsTable.updatedAt))
    .limit(200);

  res.json(rows.map(formatAsset));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /pole-assets
// ─────────────────────────────────────────────────────────────────────────────
router.post("/pole-assets", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    companyId, poleNumber, utilityTag,
    lat, lng, projectId, workOrderId,
    poleMaterial, poleHeight, poleClass, topFramingType, attributes,
  } = req.body;

  if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

  const membership = await getMembership(req.clerkUserId, Number(companyId));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const [asset] = await db
    .insert(poleAssetsTable)
    .values({
      companyId: Number(companyId),
      poleNumber: poleNumber ?? null,
      utilityTag: utilityTag ?? null,
      lat: lat != null ? String(lat) : null,
      lng: lng != null ? String(lng) : null,
      projectId: projectId ? Number(projectId) : null,
      workOrderId: workOrderId ?? null,
      poleMaterial: poleMaterial ?? null,
      poleHeight: poleHeight ?? null,
      poleClass: poleClass ?? null,
      topFramingType: topFramingType ?? null,
      attributes: attributes ?? null,
    })
    .returning();

  res.status(201).json(formatAsset(asset));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pole-assets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pole-assets/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const [asset] = await db.select().from(poleAssetsTable).where(eq(poleAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await getMembership(req.clerkUserId, asset.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  // Fetch reference photos (metadata only — no photoData to keep response small)
  const refs = await db
    .select({
      id: poleReferencePhotosTable.id,
      capturedAt: poleReferencePhotosTable.capturedAt,
      gpsLat: poleReferencePhotosTable.gpsLat,
      gpsLng: poleReferencePhotosTable.gpsLng,
      visualDescription: poleReferencePhotosTable.visualDescription,
      poleAnalysisId: poleReferencePhotosTable.poleAnalysisId,
      isActive: poleReferencePhotosTable.isActive,
      createdAt: poleReferencePhotosTable.createdAt,
    })
    .from(poleReferencePhotosTable)
    .where(
      and(
        eq(poleReferencePhotosTable.poleAssetId, id),
        eq(poleReferencePhotosTable.isActive, true),
      ),
    )
    .orderBy(desc(poleReferencePhotosTable.createdAt))
    .limit(20);

  res.json({
    ...formatAsset(asset),
    referencePhotos: refs.map(r => ({
      ...r,
      gpsLat: r.gpsLat != null ? Number(r.gpsLat) : null,
      gpsLng: r.gpsLng != null ? Number(r.gpsLng) : null,
      capturedAt: r.capturedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /pole-assets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put("/pole-assets/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const [asset] = await db.select().from(poleAssetsTable).where(eq(poleAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await getMembership(req.clerkUserId, asset.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const {
    poleNumber, utilityTag, lat, lng, projectId, workOrderId,
    poleMaterial, poleHeight, poleClass, topFramingType, attributes, isVerified,
  } = req.body;

  const updates: Partial<typeof poleAssetsTable.$inferInsert> = {};
  if (poleNumber   !== undefined) updates.poleNumber   = poleNumber;
  if (utilityTag   !== undefined) updates.utilityTag   = utilityTag;
  if (lat          !== undefined) updates.lat          = lat != null ? String(lat) : null;
  if (lng          !== undefined) updates.lng          = lng != null ? String(lng) : null;
  if (projectId    !== undefined) updates.projectId    = projectId ? Number(projectId) : null;
  if (workOrderId  !== undefined) updates.workOrderId  = workOrderId;
  if (poleMaterial !== undefined) updates.poleMaterial = poleMaterial;
  if (poleHeight   !== undefined) updates.poleHeight   = poleHeight;
  if (poleClass    !== undefined) updates.poleClass    = poleClass;
  if (topFramingType !== undefined) updates.topFramingType = topFramingType;
  if (attributes   !== undefined) updates.attributes   = attributes;
  if (isVerified   !== undefined) updates.isVerified   = Boolean(isVerified);

  const [updated] = await db
    .update(poleAssetsTable)
    .set(updates)
    .where(eq(poleAssetsTable.id, id))
    .returning();

  res.json(formatAsset(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pole-assets/:id/reference-photos
// Returns metadata only (no base64 photoData to keep payload small).
// Client can fetch /pole-assets/:id/reference-photos/:refId/photo for the image.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pole-assets/:id/reference-photos", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const [asset] = await db.select({ id: poleAssetsTable.id, companyId: poleAssetsTable.companyId })
    .from(poleAssetsTable).where(eq(poleAssetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Not found" }); return; }

  const membership = await getMembership(req.clerkUserId, asset.companyId);
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const refs = await db
    .select({
      id: poleReferencePhotosTable.id,
      capturedAt: poleReferencePhotosTable.capturedAt,
      gpsLat: poleReferencePhotosTable.gpsLat,
      gpsLng: poleReferencePhotosTable.gpsLng,
      visualDescription: poleReferencePhotosTable.visualDescription,
      poleAnalysisId: poleReferencePhotosTable.poleAnalysisId,
      isActive: poleReferencePhotosTable.isActive,
      createdAt: poleReferencePhotosTable.createdAt,
    })
    .from(poleReferencePhotosTable)
    .where(eq(poleReferencePhotosTable.poleAssetId, id))
    .orderBy(desc(poleReferencePhotosTable.createdAt))
    .limit(50);

  res.json(refs.map(r => ({
    ...r,
    gpsLat: r.gpsLat != null ? Number(r.gpsLat) : null,
    gpsLng: r.gpsLng != null ? Number(r.gpsLng) : null,
    capturedAt: r.capturedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
