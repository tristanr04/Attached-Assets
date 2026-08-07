export interface PoleCoordinate {
  latitude: number;
  longitude: number;
}

export interface ObservedPoleTag {
  value: string;
  confidence: number;
  source: "ocr" | "barcode" | "manual";
}

export interface PoleVisualObservation {
  attributes: string[];
  similarityByReferencePhotoId: Record<number, number>;
}

export interface PoleIdentityObservation {
  companyId: number;
  photoId: number;
  imageSha256: string;
  capturedAt: string;
  tags: ObservedPoleTag[];
  gps?: PoleCoordinate;
  activeProjectIds: number[];
  activeWorkOrderIds: number[];
  visual: PoleVisualObservation;
}

export interface VerifiedPoleReferencePhoto {
  photoId: number;
  imageSha256: string;
  verifiedAt: string;
}

export interface VerifiedPoleProfile {
  companyId: number;
  poleAssetId: number;
  poleNumber: string;
  locationLabel: string;
  coordinate?: PoleCoordinate;
  projectIds: number[];
  workOrderIds: number[];
  tags: string[];
  visualAttributes: string[];
  referencePhotos: VerifiedPoleReferencePhoto[];
}

export type PoleIdentitySignal = "tag" | "gps" | "visual" | "job_context";

export interface PoleIdentityEvidence {
  signal: PoleIdentitySignal;
  score: number;
  strong: boolean;
  detail: string;
}

export interface RankedPoleCandidate {
  poleAssetId: number;
  poleNumber: string;
  locationLabel: string;
  projectIds: number[];
  workOrderIds: number[];
  score: number;
  strongSignals: PoleIdentitySignal[];
  evidence: PoleIdentityEvidence[];
  duplicateReferencePhotoIds: number[];
}

export interface PoleIdentityResult {
  companyId: number;
  photoId: number;
  state: "ai_proposed";
  match: "exact_proposal" | "ambiguous" | "no_match";
  selected?: RankedPoleCandidate;
  candidates: RankedPoleCandidate[];
  additionalPhotoRequest?: string;
  confirmationRequired: true;
}

const EXACT_SCORE = 0.82;
const EXACT_MARGIN = 0.12;
const MAX_REFERENCE_AGE_DAYS = 365;
const HASH = /^[a-f0-9]{64}$/i;

function normalizeTag(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizedSet(values: string[]) {
  return new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean));
}

function validCoordinate(value: PoleCoordinate | undefined): value is PoleCoordinate {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180);
}

function haversineMeters(a: PoleCoordinate, b: PoleCoordinate) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const x = Math.sin(lat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function setSimilarity(left: string[], right: string[]) {
  const a = normalizedSet(left);
  const b = normalizedSet(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return overlap / union.size;
}

function daysBetween(older: string, newer: string) {
  const start = Date.parse(older);
  const end = Date.parse(newer);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return Number.POSITIVE_INFINITY;
  return (end - start) / 86_400_000;
}

function tagEvidence(observation: PoleIdentityObservation, profile: VerifiedPoleProfile): PoleIdentityEvidence {
  const profileTags = new Set([profile.poleNumber, ...profile.tags].map(normalizeTag));
  const exact = observation.tags
    .filter(tag => Number.isFinite(tag.confidence) && tag.confidence >= 0 && tag.confidence <= 1)
    .filter(tag => profileTags.has(normalizeTag(tag.value)))
    .sort((a, b) => b.confidence - a.confidence)[0];
  const score = exact?.confidence ?? 0;
  return {
    signal: "tag",
    score,
    strong: score >= 0.85,
    detail: exact ? `${exact.source} matched ${exact.value}` : "No verified pole tag matched",
  };
}

function gpsEvidence(observation: PoleIdentityObservation, profile: VerifiedPoleProfile): PoleIdentityEvidence {
  if (!validCoordinate(observation.gps) || !validCoordinate(profile.coordinate)) {
    return { signal: "gps", score: 0, strong: false, detail: "No reliable coordinate pair" };
  }
  const distance = haversineMeters(observation.gps, profile.coordinate);
  const score = distance <= 15 ? 1 : distance <= 30 ? 0.9 : distance <= 75 ? 0.65 : distance <= 200 ? 0.25 : 0;
  return {
    signal: "gps",
    score,
    strong: distance <= 30,
    detail: `Photo location is ${Math.round(distance)}m from verified pole coordinates`,
  };
}

function visualEvidence(observation: PoleIdentityObservation, profile: VerifiedPoleProfile): PoleIdentityEvidence {
  let best = 0;
  let bestPhotoId: number | undefined;
  let currentReference = false;
  let sawStaleReference = false;
  for (const reference of profile.referencePhotos) {
    const raw = observation.visual.similarityByReferencePhotoId[reference.photoId];
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) continue;
    const current = daysBetween(reference.verifiedAt, observation.capturedAt) <= MAX_REFERENCE_AGE_DAYS;
    if (!current) sawStaleReference = true;
    const adjusted = raw * (current ? 1 : 0.6);
    if (adjusted > best) {
      best = adjusted;
      bestPhotoId = reference.photoId;
      currentReference = current;
    }
  }
  const attributeScore = setSimilarity(observation.visual.attributes, profile.visualAttributes) * 0.7;
  const score = Math.max(best, attributeScore);
  return {
    signal: "visual",
    score,
    strong: score >= 0.82 && (bestPhotoId === undefined || currentReference),
    detail: best >= attributeScore
      ? `Best verified photo similarity ${best.toFixed(2)}${currentReference ? "" : " after stale-reference discount"}`
      : `Visible framing/equipment/landmark similarity ${attributeScore.toFixed(2)}${sawStaleReference ? "; stale-reference photo discounted" : ""}`,
  };
}

function contextEvidence(observation: PoleIdentityObservation, profile: VerifiedPoleProfile): PoleIdentityEvidence {
  const project = profile.projectIds.some(id => observation.activeProjectIds.includes(id));
  const workOrder = profile.workOrderIds.some(id => observation.activeWorkOrderIds.includes(id));
  const score = workOrder ? 1 : project ? 0.65 : 0;
  return {
    signal: "job_context",
    score,
    strong: false,
    detail: workOrder ? "Matched active work order" : project ? "Matched active project" : "Outside active job context",
  };
}

function rankCandidate(observation: PoleIdentityObservation, profile: VerifiedPoleProfile): RankedPoleCandidate {
  const evidence = [
    tagEvidence(observation, profile),
    gpsEvidence(observation, profile),
    visualEvidence(observation, profile),
    contextEvidence(observation, profile),
  ];
  const weights: Record<PoleIdentitySignal, number> = { tag: 0.42, gps: 0.24, visual: 0.26, job_context: 0.08 };
  const weightedScore = evidence.reduce((total, item) => total + item.score * weights[item.signal], 0);
  const strongEvidence = evidence.filter(item => item.strong);
  const corroboratedScore = strongEvidence.length >= 2
    ? strongEvidence.reduce((total, item) => total + item.score, 0) / strongEvidence.length * 0.9
    : 0;
  const score = Math.max(weightedScore, corroboratedScore);
  const duplicateReferencePhotoIds = profile.referencePhotos
    .filter(reference => reference.imageSha256.toLowerCase() === observation.imageSha256.toLowerCase())
    .map(reference => reference.photoId);
  return {
    poleAssetId: profile.poleAssetId,
    poleNumber: profile.poleNumber,
    locationLabel: profile.locationLabel,
    projectIds: [...profile.projectIds],
    workOrderIds: [...profile.workOrderIds],
    score: Math.round(score * 10_000) / 10_000,
    strongSignals: evidence.filter(item => item.strong).map(item => item.signal),
    evidence,
    duplicateReferencePhotoIds,
  };
}

function nextPhotoRequest(observation: PoleIdentityObservation, candidates: RankedPoleCandidate[]) {
  const hasStrongTag = candidates.some(candidate => candidate.strongSignals.includes("tag"));
  const hasStrongVisual = candidates.some(candidate => candidate.strongSignals.includes("visual"));
  if (!hasStrongTag) return "Capture a close-up of the pole number, tag, barcode, or readable sign.";
  if (!validCoordinate(observation.gps)) return "Capture a full-pole photo with location services enabled.";
  if (!hasStrongVisual) return "Capture a second full-pole angle showing framing, equipment, attachments, and nearby landmarks.";
  return "Select the correct pole from the ranked matches or capture a wider photo showing the pole and mapped surroundings.";
}

export function resolvePoleIdentity(
  observation: PoleIdentityObservation,
  profiles: VerifiedPoleProfile[],
): PoleIdentityResult {
  if (!Number.isSafeInteger(observation.companyId) || observation.companyId <= 0) throw new Error("Valid company required");
  if (!Number.isSafeInteger(observation.photoId) || observation.photoId <= 0) throw new Error("Valid photo required");
  if (!HASH.test(observation.imageSha256)) throw new Error("Valid photo fingerprint required");
  if (Number.isNaN(Date.parse(observation.capturedAt))) throw new Error("Valid capture timestamp required");

  const candidates = profiles
    .filter(profile => profile.companyId === observation.companyId)
    .map(profile => rankCandidate(observation, profile))
    .sort((a, b) => b.score - a.score || a.poleAssetId - b.poleAssetId)
    .slice(0, 3);
  const top = candidates[0];
  const runnerUp = candidates[1];
  const exact = Boolean(top
    && top.score >= EXACT_SCORE
    && top.strongSignals.length >= 2
    && (!runnerUp || top.score - runnerUp.score >= EXACT_MARGIN));

  if (exact && top) {
    return {
      companyId: observation.companyId,
      photoId: observation.photoId,
      state: "ai_proposed",
      match: "exact_proposal",
      selected: top,
      candidates,
      confirmationRequired: true,
    };
  }
  return {
    companyId: observation.companyId,
    photoId: observation.photoId,
    state: "ai_proposed",
    match: candidates.length ? "ambiguous" : "no_match",
    candidates,
    additionalPhotoRequest: nextPhotoRequest(observation, candidates),
    confirmationRequired: true,
  };
}
