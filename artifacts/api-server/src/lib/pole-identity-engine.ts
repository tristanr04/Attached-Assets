/**
 * Pole Identity Engine — pure functions, no DB, fully testable.
 *
 * Combines four independent signals to identify which company-scoped pole
 * asset matches a captured photo:
 *
 *   1. OCR signal    — exact / partial match of pole tag vs. asset's poleNumber/utilityTag
 *   2. GPS signal    — haversine distance between capture GPS and asset's coordinates
 *   3. Visual signal — Jaccard similarity between synthesized keyword descriptions
 *   4. Ref-photo     — small confidence boost for poles with more verified references
 *
 * Decision:
 *   "identified"  → top score ≥ THRESHOLD_IDENTIFIED and margin over 2nd ≥ MARGIN_CLEAR
 *   "uncertain"   → top score ≥ THRESHOLD_UNCERTAIN (show top 3, ask foreman to choose)
 *   "needs_photo" → top score < THRESHOLD_UNCERTAIN (not enough signal, request new photo)
 *   "no_assets"   → company has no registered poles yet
 */

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLD_IDENTIFIED = 0.75;  // auto-select only above this
const MARGIN_CLEAR         = 0.20;  // gap to 2nd must be at least this
const THRESHOLD_UNCERTAIN  = 0.30;  // show candidates above this
const THRESHOLD_CANDIDATE  = 0.05;  // filter out noise

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PoleAssetForMatching {
  id: number;
  poleNumber: string | null;
  utilityTag: string | null;
  lat: number | null;
  lng: number | null;
  /** Pre-fetched visual keyword strings from active reference photos. */
  referenceDescriptions: string[];
  referencePhotoCount: number;
}

export interface IdentityInput {
  ocrPoleTag: string | null;       // raw OCR output
  ocrConfidence: number;           // 0–1 from AI
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracyM: number | null;
  /** Synthesized keyword string from AI vision output (buildVisualDescription). */
  visualDescription: string | null;
  candidates: PoleAssetForMatching[];
}

export interface SignalBreakdown {
  ocr: number;       // 0–0.55
  gpsM: number | null; // raw distance in metres (null = no GPS)
  gps: number;       // 0–0.90
  visual: number;    // 0–0.40
  refBoost: number;  // 0–0.05
  total: number;     // capped at 0.99
}

export interface IdentityCandidate {
  poleAssetId: number;
  poleNumber: string | null;
  utilityTag: string | null;
  confidence: number;
  signals: SignalBreakdown;
  evidence: string[];  // human-readable evidence lines shown in UI
}

export type IdentityStatus = "identified" | "uncertain" | "needs_photo" | "no_assets";
export type RequestedCapture = "pole_tag_closeup" | "full_pole_view" | "second_angle" | null;

export interface IdentityResult {
  status: IdentityStatus;
  /** Populated only when status === "identified". */
  poleAssetId: number | null;
  /** Top 3 candidates (all statuses except no_assets). */
  candidates: IdentityCandidate[];
  /** Photo type the engine recommends when uncertain or needs_photo. */
  requestedCapture: RequestedCapture;
}

// ─────────────────────────────────────────────────────────────────────────────
// GPS helpers
// ─────────────────────────────────────────────────────────────────────────────

const R = 6_371_000; // Earth radius in metres

/** Haversine distance between two lat/lng points, in metres. */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert distance in metres to a GPS confidence score (0–0.90). */
export function gpsScore(distanceM: number): number {
  if (distanceM <   5) return 0.90;
  if (distanceM <  20) return 0.70;
  if (distanceM <  50) return 0.45;
  if (distanceM < 100) return 0.20;
  if (distanceM < 200) return 0.08;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a tag string for comparison (upper, strip non-alnum). */
function normTag(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * OCR signal score (0–0.55):
 *   0.55 — exact match (normalised) with poleNumber or utilityTag
 *   0.28 — one contains the other (substring, ≥3 chars each)
 *   0.00 — no match
 */
export function ocrScore(
  ocrTag: string | null,
  poleNumber: string | null,
  utilityTag: string | null,
): number {
  if (!ocrTag) return 0;
  const ocr = normTag(ocrTag);
  if (ocr.length < 2) return 0;

  for (const tag of [poleNumber, utilityTag]) {
    if (!tag) continue;
    const t = normTag(tag);
    if (t.length < 2) continue;
    if (ocr === t) return 0.55;
    if (ocr.length >= 3 && t.length >= 3 && (ocr.includes(t) || t.includes(ocr))) {
      return 0.28;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual fingerprint helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Tokenise a visual description string to a normalised set of keywords. */
function tokenise(desc: string): Set<string> {
  return new Set(
    desc
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 2),
  );
}

/** Jaccard similarity between two token sets (0–1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

/**
 * Visual fingerprint score (0–0.40).
 * Compares the current photo's description against all reference descriptions,
 * takes the best Jaccard match and scales to the 0–0.40 range.
 */
export function visualScore(
  currentDesc: string | null,
  referenceDescs: string[],
): number {
  if (!currentDesc || referenceDescs.length === 0) return 0;
  const curr = tokenise(currentDesc);
  if (curr.size === 0) return 0;

  let best = 0;
  for (const ref of referenceDescs) {
    const score = jaccard(curr, tokenise(ref));
    if (score > best) best = score;
  }
  return Math.min(best * 0.40, 0.40);
}

/**
 * Build a normalised visual description string from AI vision output.
 * Stored in pole_reference_photos.visual_description and used for future matches.
 */
export function buildVisualDescription(proposed: Record<string, any> | null): string {
  if (!proposed) return "";
  const parts: string[] = [];

  const add = (val: unknown) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string" && v.length > 1) parts.push(v.toLowerCase().replace(/\s+/g, "_"));
        else if (v && typeof v === "object" && "name" in v) parts.push(String((v as any).name).toLowerCase().replace(/\s+/g, "_"));
      }
    } else {
      parts.push(String(val).toLowerCase().replace(/\s+/g, "_"));
    }
  };

  add(proposed.poleMaterial?.value);
  add(proposed.poleHeight?.value);
  add(proposed.poleClass?.value ? `class${proposed.poleClass.value}` : null);
  add(proposed.topFramingType?.value);
  if (Array.isArray(proposed.visibleEquipment?.value)) {
    for (const eq of proposed.visibleEquipment.value) {
      if (typeof eq === "string") add(eq);
    }
  }
  add(proposed.poleCondition?.value);

  return [...new Set(parts)].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-candidate scorer
// ─────────────────────────────────────────────────────────────────────────────

function scoreCandidate(
  input: IdentityInput,
  asset: PoleAssetForMatching,
): SignalBreakdown {
  // 1. OCR signal
  const ocr = ocrScore(input.ocrPoleTag, asset.poleNumber, asset.utilityTag);

  // 2. GPS signal
  let gpsM: number | null = null;
  let gps = 0;
  if (
    input.gpsLat != null && input.gpsLng != null &&
    asset.lat != null && asset.lng != null
  ) {
    // Widen threshold if GPS accuracy is poor (>50m)
    gpsM = haversineMeters(input.gpsLat, input.gpsLng, asset.lat, asset.lng);
    const effectiveM = input.gpsAccuracyM != null && input.gpsAccuracyM > 10
      ? Math.max(0, gpsM - input.gpsAccuracyM * 0.5)
      : gpsM;
    gps = gpsScore(effectiveM);
  }

  // 3. Visual signal
  const visual = visualScore(input.visualDescription, asset.referenceDescriptions);

  // 4. Reference photo boost (more verified refs → slightly higher base trust)
  const refBoost = Math.min(asset.referencePhotoCount * 0.01, 0.05);

  const total = Math.min(ocr + gps + visual + refBoost, 0.99);

  return { ocr, gpsM, gps, visual, refBoost, total };
}

function buildEvidence(signals: SignalBreakdown, asset: PoleAssetForMatching): string[] {
  const ev: string[] = [];
  if (signals.ocr >= 0.55)        ev.push(`OCR exact match — ${asset.poleNumber ?? asset.utilityTag}`);
  else if (signals.ocr >= 0.28)   ev.push(`OCR partial match — ${asset.poleNumber ?? asset.utilityTag}`);
  if (signals.gpsM != null) {
    if (signals.gps >= 0.70)      ev.push(`GPS ${Math.round(signals.gpsM)}m away — very close`);
    else if (signals.gps >= 0.45) ev.push(`GPS ${Math.round(signals.gpsM)}m away — nearby`);
    else if (signals.gps >= 0.20) ev.push(`GPS ${Math.round(signals.gpsM)}m away — in range`);
    else if (signals.gps >= 0.08) ev.push(`GPS ${Math.round(signals.gpsM)}m away — weak`);
    else                           ev.push(`GPS ${Math.round(signals.gpsM)}m away — out of range`);
  } else {
    ev.push("No GPS data");
  }
  if (signals.visual >= 0.28)     ev.push(`Visual fingerprint match (${Math.round(signals.visual / 0.40 * 100)}%)`);
  else if (signals.visual >= 0.12) ev.push(`Partial visual similarity`);
  if (asset.referencePhotoCount > 0) ev.push(`${asset.referencePhotoCount} verified reference photo${asset.referencePhotoCount > 1 ? "s" : ""}`);
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
// What photo would help most?
// ─────────────────────────────────────────────────────────────────────────────

export function whatPhotoIsNeeded(input: IdentityInput): RequestedCapture {
  const noOcr = !input.ocrPoleTag || input.ocrConfidence < 0.50;
  const poorGps = input.gpsLat == null || (input.gpsAccuracyM != null && input.gpsAccuracyM > 50);

  if (noOcr)    return "pole_tag_closeup";
  if (poorGps)  return "full_pole_view";
  return "second_angle";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine entry-point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full Pole Identity Engine.
 *
 * Returns at most 3 candidates.  Status is one of:
 *   "no_assets"   — company has no pole assets yet
 *   "identified"  — single high-confidence match (auto-select safe)
 *   "uncertain"   — 2–3 plausible candidates, foreman must choose
 *   "needs_photo" — not enough signal; engine recommends a photo type
 */
export function identifyPole(input: IdentityInput): IdentityResult {
  if (input.candidates.length === 0) {
    return {
      status: "no_assets",
      poleAssetId: null,
      candidates: [],
      requestedCapture: null,
    };
  }

  // Score every candidate
  const scored: IdentityCandidate[] = input.candidates.map(asset => {
    const signals = scoreCandidate(input, asset);
    return {
      poleAssetId: asset.id,
      poleNumber: asset.poleNumber,
      utilityTag: asset.utilityTag,
      confidence: signals.total,
      signals,
      evidence: buildEvidence(signals, asset),
    };
  });

  // Sort descending, filter noise
  const filtered = scored
    .filter(c => c.confidence > THRESHOLD_CANDIDATE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  if (filtered.length === 0) {
    return {
      status: "needs_photo",
      poleAssetId: null,
      candidates: [],
      requestedCapture: whatPhotoIsNeeded(input),
    };
  }

  const top = filtered[0];
  const second = filtered[1] ?? null;

  // Auto-identify only when unambiguously confident
  if (
    top.confidence >= THRESHOLD_IDENTIFIED &&
    (second == null || top.confidence - second.confidence >= MARGIN_CLEAR)
  ) {
    return {
      status: "identified",
      poleAssetId: top.poleAssetId,
      candidates: filtered,
      requestedCapture: null,
    };
  }

  // Show candidates
  if (top.confidence >= THRESHOLD_UNCERTAIN) {
    return {
      status: "uncertain",
      poleAssetId: null,
      candidates: filtered,
      requestedCapture: whatPhotoIsNeeded(input),
    };
  }

  // Not enough signal
  return {
    status: "needs_photo",
    poleAssetId: null,
    candidates: filtered,
    requestedCapture: whatPhotoIsNeeded(input),
  };
}
