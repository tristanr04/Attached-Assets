/**
 * Pole Classification Engine — pure functions, no DB, fully testable.
 *
 * Returns five independent classification axes for a captured pole photo.
 * Each axis is multi-label capable, carries per-field confidence and visual
 * evidence, and maps to the company's own PKB catalog entries where possible.
 *
 * Axes
 * ────
 * 1. assetPurpose       — what the pole is FOR (may carry multiple roles)
 * 2. phaseConfiguration — primary conductor phase count
 * 3. constructionRole   — structural / topological function in the circuit
 * 4. equipmentRole      — mounted equipment types (multi-value)
 * 5. framingConfiguration — pole-top conductor arrangement / hardware type
 *
 * Nothing in this file touches the database. The caller fetches catalog
 * entries and AI output before calling these functions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical label sets
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_PURPOSE_VALUES = [
  "streetlight_only", "distribution", "transmission", "communications", "joint_use",
] as const;
export type AssetPurpose = typeof ASSET_PURPOSE_VALUES[number];

export const PHASE_CONFIG_VALUES = ["none", "single_phase", "two_phase", "three_phase"] as const;
export type PhaseConfig = typeof PHASE_CONFIG_VALUES[number];

export const CONSTRUCTION_ROLE_VALUES = [
  "tangent", "angle", "corner", "dead_end", "terminal", "junction",
  "tap", "branch", "crossing", "service", "underground_riser",
] as const;
export type ConstructionRole = typeof CONSTRUCTION_ROLE_VALUES[number];

export const EQUIPMENT_ROLE_VALUES = [
  "light", "transformer", "transformer_bank", "switch", "cutout",
  "recloser", "sectionalizer", "capacitor_bank", "regulator", "fused_tap",
] as const;
export type EquipmentRole = typeof EQUIPMENT_ROLE_VALUES[number];

export const FRAMING_CONFIG_VALUES = [
  "crossarm", "armless", "vertical", "alley_arm", "single_arm", "double_arm", "custom",
] as const;
export type FramingConfig = typeof FRAMING_CONFIG_VALUES[number];

export const NEEDS_PHOTO_VALUES = [
  "pole_top_closeup",    // framing, phase count, dead-end hardware ambiguity
  "conductor_direction", // tangent vs angle: need to see conductor angles leaving the pole
  "equipment_closeup",   // transformer size, switch type, asset purpose ambiguity
  "full_pole_view",      // overall context needed
  "base_closeup",        // underground riser / ground rod confirmation
] as const;
export type NeedsPhoto = typeof NEEDS_PHOTO_VALUES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogMatch {
  id: number;
  name: string;
  code: string;
  matchScore: number;  // 0–1
}

export interface ClassificationAxis<T> {
  value: T | null;
  /** Secondary roles (assetPurpose, equipmentRole only). */
  also?: string[];
  confidence: number;  // 0–1
  evidence: string[];
  /** Specific photo needed to improve confidence; null = sufficient image. */
  needsPhoto: NeedsPhoto | null;
  /** Best matching entry from the company's PKB catalog (null if no catalog or no match). */
  catalogMatch: CatalogMatch | null;
}

export interface ClassificationResult {
  assetPurpose: ClassificationAxis<AssetPurpose>;
  phaseConfiguration: ClassificationAxis<PhaseConfig>;
  constructionRole: ClassificationAxis<ConstructionRole>;
  equipmentRole: ClassificationAxis<EquipmentRole[]>;
  framingConfiguration: ClassificationAxis<FramingConfig>;
  /** Mean confidence across axes that returned a value. */
  overallConfidence: number;
  /** Best matching PKB pole-type entry for the whole pole. */
  catalogMatchedPoleTypeId: number | null;
  /** Best matching PKB structure-config entry. */
  catalogMatchedStructureConfigId: number | null;
}

// AI output shapes (what the vision call returns before we validate/normalize)
export interface AiClassificationOutput {
  assetPurpose?: {
    primary?: string | null;
    secondary?: string[] | null;
    confidence?: number | null;
    evidence?: string[] | null;
    needsPhoto?: string | null;
  } | null;
  phaseConfiguration?: {
    value?: string | null;
    confidence?: number | null;
    evidence?: string[] | null;
    needsPhoto?: string | null;
  } | null;
  constructionRole?: {
    value?: string | null;
    confidence?: number | null;
    evidence?: string[] | null;
    needsPhoto?: string | null;
  } | null;
  equipmentRole?: {
    values?: string[] | null;
    confidence?: number | null;
    evidence?: string[] | null;
  } | null;
  framingConfiguration?: {
    value?: string | null;
    confidence?: number | null;
    evidence?: string[] | null;
    needsPhoto?: string | null;
  } | null;
}

export interface CatalogPoleType {
  id: number;
  name: string;
  code: string;
  operationalClass: string | null;
  aliases: string[] | null;
  searchKeywords: string | null;
  constructionStandardNumber: string | null;
}

export interface CatalogStructureConfig {
  id: number;
  name: string;
  code: string;
  phases: number | null;
  conductorArrangement: string | null;
  crossarmConfig: string | null;
  deadEndConfig: string | null;
  guyingRequirements: string | null;
  constructionStandard: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation / normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

function validValue<T extends string>(val: string | null | undefined, allowed: readonly T[]): T | null {
  if (!val) return null;
  const norm = val.toLowerCase().replace(/[-\s]/g, "_") as T;
  return (allowed as readonly string[]).includes(norm) ? norm : null;
}

function safeEvidence(ev: string[] | null | undefined): string[] {
  return Array.isArray(ev) ? ev.filter(e => typeof e === "string" && e.length > 0) : [];
}

function safeNeedsPhoto(np: string | null | undefined): NeedsPhoto | null {
  if (!np) return null;
  return (NEEDS_PHOTO_VALUES as readonly string[]).includes(np) ? np as NeedsPhoto : null;
}

function clamp01(n: number | null | undefined): number {
  if (n == null || isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Purpose — streetlight_only vs distribution+streetlight distinction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A pole is "streetlight_only" only when it carries NO primary conductors and
 * NO distribution/transmission equipment other than the light itself.
 * Any sign of primary voltage equipment (transformers, cutouts, switches,
 * primary insulators, phase conductors) makes it "distribution" (or higher)
 * even if it also has a streetlight.
 */
export function normalizeAssetPurpose(
  ai: AiClassificationOutput["assetPurpose"],
  equipmentValues: string[],
  phaseValue: PhaseConfig | null,
): ClassificationAxis<AssetPurpose> {
  const rawPrimary = validValue(ai?.primary, ASSET_PURPOSE_VALUES);
  const rawSecondary = (ai?.secondary ?? []).map(s => validValue(s, ASSET_PURPOSE_VALUES)).filter(Boolean) as AssetPurpose[];
  const confidence = clamp01(ai?.confidence);
  const evidence = safeEvidence(ai?.evidence);
  const needsPhoto = safeNeedsPhoto(ai?.needsPhoto);

  // Key distinction: has primary voltage conductors?
  const hasPrimary = phaseValue !== null && phaseValue !== "none";
  const hasDistribEquipment = equipmentValues.some(eq =>
    ["transformer", "transformer_bank", "switch", "cutout", "recloser",
     "sectionalizer", "capacitor_bank", "regulator", "fused_tap"].includes(eq.toLowerCase())
  );
  const hasLight = equipmentValues.some(eq =>
    ["light", "streetlight", "street_light"].includes(eq.toLowerCase())
  );

  let primary = rawPrimary;
  const also = [...rawSecondary];

  // Override: if primary conductors or distribution equipment are present,
  // this cannot be streetlight_only even if the AI said so.
  if (primary === "streetlight_only" && (hasPrimary || hasDistribEquipment)) {
    primary = "distribution";
    if (hasLight && !also.includes("streetlight_only" as AssetPurpose)) {
      // Use a generic string to mark the light role without using streetlight_only as primary
      (also as string[]).push("streetlight");
    }
    evidence.push("Distribution equipment or primary conductors present — reclassified from streetlight_only to distribution");
  }

  // If primary is distribution but has equipment from multiple utilities → joint_use
  const effectiveNeedsPhoto = needsPhoto ?? (
    primary === null ? "equipment_closeup" :
    confidence < 0.5 && primary === "joint_use" ? "equipment_closeup" :
    null
  );

  return { value: primary, also, confidence, evidence, needsPhoto: effectiveNeedsPhoto, catalogMatch: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Configuration
// ─────────────────────────────────────────────────────────────────────────────

export function normalizePhaseConfiguration(
  ai: AiClassificationOutput["phaseConfiguration"],
): ClassificationAxis<PhaseConfig> {
  const value = validValue(ai?.value, PHASE_CONFIG_VALUES);
  const confidence = clamp01(ai?.confidence);
  const evidence = safeEvidence(ai?.evidence);
  const needsPhoto = safeNeedsPhoto(ai?.needsPhoto) ?? (
    value === null || confidence < 0.50 ? "conductor_direction" : null
  );
  return { value, confidence, evidence, needsPhoto, catalogMatch: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction Role — tangent vs angle vs dead-end distinction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Key distinctions:
 *  - tangent:  conductors run straight through; no horizontal load; no guys (or only down guys)
 *  - angle:    conductors change direction; bisector guys on the outside of the angle
 *  - corner:   90-degree or near-90-degree angle change (special case of angle)
 *  - dead_end: all conductors terminate on the pole; heavy dead-end insulators; strain hardware
 *  - terminal: one end of a line (similar to dead_end but for service / lateral ends)
 *  - junction: three or more circuits meeting at one pole (multi-circuit tap point)
 *  - tap:      conductors leave in a lateral direction from a main line
 *
 * Confidence < 0.55 on tangent/angle ambiguity → request conductor_direction photo.
 * Confidence < 0.55 on dead_end → request pole_top_closeup to see strain hardware.
 */
export function normalizeConstructionRole(
  ai: AiClassificationOutput["constructionRole"],
): ClassificationAxis<ConstructionRole> {
  const value = validValue(ai?.value, CONSTRUCTION_ROLE_VALUES);
  const confidence = clamp01(ai?.confidence);
  const evidence = safeEvidence(ai?.evidence);

  let needsPhoto = safeNeedsPhoto(ai?.needsPhoto);
  if (needsPhoto === null) {
    if (value === null) {
      needsPhoto = "conductor_direction";
    } else if (confidence < 0.55 && (value === "tangent" || value === "angle" || value === "corner")) {
      needsPhoto = "conductor_direction";
    } else if (confidence < 0.55 && (value === "dead_end" || value === "terminal")) {
      needsPhoto = "pole_top_closeup";
    } else if (confidence < 0.50 && value === "underground_riser") {
      needsPhoto = "base_closeup";
    }
  }

  return { value, confidence, evidence, needsPhoto, catalogMatch: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment Role — multi-value
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeEquipmentRole(
  ai: AiClassificationOutput["equipmentRole"],
): ClassificationAxis<EquipmentRole[]> {
  const rawValues = ai?.values ?? [];
  const values = rawValues
    .map(v => validValue(v, EQUIPMENT_ROLE_VALUES))
    .filter(Boolean) as EquipmentRole[];
  const confidence = clamp01(ai?.confidence);
  const evidence = safeEvidence(ai?.evidence);
  const needsPhoto = confidence < 0.50 && values.length === 0 ? "equipment_closeup" : null;
  return { value: values, confidence, evidence, needsPhoto, catalogMatch: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Framing Configuration
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeFramingConfiguration(
  ai: AiClassificationOutput["framingConfiguration"],
): ClassificationAxis<FramingConfig> {
  const value = validValue(ai?.value, FRAMING_CONFIG_VALUES);
  const confidence = clamp01(ai?.confidence);
  const evidence = safeEvidence(ai?.evidence);
  const needsPhoto = safeNeedsPhoto(ai?.needsPhoto) ?? (
    value === null || confidence < 0.60 ? "pole_top_closeup" : null
  );
  return { value, confidence, evidence, needsPhoto, catalogMatch: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog matching
// ─────────────────────────────────────────────────────────────────────────────

function tokenSet(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s.toLowerCase()
      .replace(/_/g, " ")           // "dead_end" → "dead end" (split before stripping)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 2),
  );
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let i = 0;
  for (const t of a) if (b.has(t)) i++;
  return i / (a.size + b.size - i);
}

// Operational class → assetPurpose map (PKB catalog → engine values)
const OP_CLASS_MAP: Record<string, AssetPurpose> = {
  distribution: "distribution",
  transmission: "transmission",
  subtransmission: "transmission",
  streetlight: "streetlight_only",
  service: "distribution",
  communication: "communications",
  joint_use: "joint_use",
  temporary: "distribution",
  storm_restoration: "distribution",
  other: "distribution",
};

/**
 * Score a PKB pole type against the current classification axes.
 *
 * Scoring:
 *   - operationalClass → assetPurpose exact match:  +0.60
 *   - keyword overlap (aliases + searchKeywords) with combined axis labels: 0–0.40
 */
export function scorePoleType(
  pt: CatalogPoleType,
  assetPurpose: AssetPurpose | null,
  constructionRole: ConstructionRole | null,
  framingConfig: FramingConfig | null,
): number {
  let score = 0;

  // Operational class match
  if (pt.operationalClass && assetPurpose) {
    const mapped = OP_CLASS_MAP[pt.operationalClass];
    if (mapped === assetPurpose) score += 0.60;
    // Partial credit: joint_use poles often have distribution operational class
    else if (assetPurpose === "joint_use" && mapped === "distribution") score += 0.30;
  }

  // Keyword overlap
  const catalog = tokenSet([pt.name, ...(pt.aliases ?? []), pt.searchKeywords].join(" "));
  const query = tokenSet([constructionRole, framingConfig, assetPurpose].join(" "));
  score += jaccardSets(catalog, query) * 0.40;

  return Math.min(score, 0.99);
}

/**
 * Score a PKB structure config against current classification axes.
 *
 * Scoring:
 *   - phases exact match:        +0.40
 *   - crossarmConfig keywords:   0–0.35
 *   - deadEnd/guying keywords:   0–0.25
 */
export function scoreStructureConfig(
  sc: CatalogStructureConfig,
  phaseConfig: PhaseConfig | null,
  constructionRole: ConstructionRole | null,
  framingConfig: FramingConfig | null,
): number {
  let score = 0;

  // Phase match — strongest signal (0.45)
  const phaseMap: Record<PhaseConfig, number | null> = {
    none: 0, single_phase: 1, two_phase: 2, three_phase: 3,
  };
  if (phaseConfig && sc.phases != null) {
    const expected = phaseMap[phaseConfig];
    if (expected === sc.phases) score += 0.45;
  }

  // Construction role keyword match (dead-end config, guying, standard name) — 0.40
  // Weighted higher than framing because role is more structurally decisive.
  const roleCatalog = tokenSet(
    [sc.deadEndConfig, sc.guyingRequirements, sc.constructionStandard, sc.name].join(" "),
  );
  const roleQuery = tokenSet(constructionRole ?? "");
  score += jaccardSets(roleCatalog, roleQuery) * 0.40;

  // Framing config keyword match — 0.15
  const framingCatalog = tokenSet([sc.crossarmConfig, sc.conductorArrangement].join(" "));
  const framingQuery = tokenSet(framingConfig ?? "");
  score += jaccardSets(framingCatalog, framingQuery) * 0.15;

  return Math.min(score, 0.99);
}

function bestCatalogMatch(scores: { id: number; name: string; code: string; score: number }[]): CatalogMatch | null {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (!top || top.score < 0.10) return null;
  return { id: top.id, name: top.name, code: top.code, matchScore: top.score };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassificationInput {
  ai: AiClassificationOutput;
  poleTypes: CatalogPoleType[];
  structureConfigs: CatalogStructureConfig[];
}

/**
 * Run the full classification engine.
 * Returns a ClassificationResult with per-axis confidence, evidence, needs-photo
 * flags, and catalog matches for both the pole type and structure config.
 */
export function classifyPole(input: ClassificationInput): ClassificationResult {
  const { ai, poleTypes, structureConfigs } = input;

  // Step 1: normalize each axis independently
  const equipmentAxis = normalizeEquipmentRole(ai.equipmentRole);
  const equipValues = (equipmentAxis.value ?? []).map(String);
  const phaseAxis = normalizePhaseConfiguration(ai.phaseConfiguration);
  const assetAxis = normalizeAssetPurpose(ai.assetPurpose, equipValues, phaseAxis.value);
  const roleAxis  = normalizeConstructionRole(ai.constructionRole);
  const framingAxis = normalizeFramingConfiguration(ai.framingConfiguration);

  // Step 2: catalog matching
  const poleTypeScores = poleTypes.map(pt => ({
    id: pt.id, name: pt.name, code: pt.code,
    score: scorePoleType(pt, assetAxis.value, roleAxis.value, framingAxis.value),
  }));
  const poleTypeMatch = bestCatalogMatch(poleTypeScores);

  const structConfigScores = structureConfigs.map(sc => ({
    id: sc.id, name: sc.name, code: sc.code,
    score: scoreStructureConfig(sc, phaseAxis.value, roleAxis.value, framingAxis.value),
  }));
  const structConfigMatch = bestCatalogMatch(structConfigScores);

  // Step 3: attach catalog matches to relevant axes
  if (poleTypeMatch) assetAxis.catalogMatch = poleTypeMatch;
  if (structConfigMatch) framingAxis.catalogMatch = structConfigMatch;

  // Step 4: overall confidence (mean of axes that have a non-null value)
  const axes = [assetAxis, phaseAxis, roleAxis, equipmentAxis, framingAxis];
  const filled = axes.filter(a => a.value !== null && (Array.isArray(a.value) ? (a.value as unknown[]).length > 0 : true));
  const overallConfidence = filled.length > 0
    ? filled.reduce((sum, a) => sum + a.confidence, 0) / filled.length
    : 0;

  return {
    assetPurpose: assetAxis,
    phaseConfiguration: phaseAxis,
    constructionRole: roleAxis,
    equipmentRole: equipmentAxis,
    framingConfiguration: framingAxis,
    overallConfidence,
    catalogMatchedPoleTypeId: poleTypeMatch?.id ?? null,
    catalogMatchedStructureConfigId: structConfigMatch?.id ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Training example builder
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassificationCorrection {
  axis: string;
  aiValue: unknown;
  foremanValue: unknown;
  status: "accepted" | "edited" | "rejected";
}

/**
 * Extract corrections from the foreman's field-status decisions.
 * Returns non-empty only when the foreman edited or rejected an AI classification.
 */
export function extractClassificationCorrections(
  classificationResult: ClassificationResult,
  fieldStatuses: Record<string, string>,
  editValues: Record<string, string>,
): ClassificationCorrection[] {
  const corrections: ClassificationCorrection[] = [];

  const axes: Array<{ key: string; value: unknown }> = [
    { key: "assetPurpose", value: classificationResult.assetPurpose.value },
    { key: "phaseConfiguration", value: classificationResult.phaseConfiguration.value },
    { key: "constructionRole", value: classificationResult.constructionRole.value },
    { key: "equipmentRole", value: classificationResult.equipmentRole.value },
    { key: "framingConfiguration", value: classificationResult.framingConfiguration.value },
  ];

  for (const { key, value } of axes) {
    const status = fieldStatuses[key];
    if (!status || status === "accepted") continue;
    corrections.push({
      axis: key,
      aiValue: value,
      foremanValue: status === "edited" ? (editValues[key] ?? null) : null,
      status: status as "edited" | "rejected",
    });
  }

  return corrections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual description extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append classification tokens to a visual description string.
 * Used to enrich the fingerprint stored in pole_reference_photos.
 */
export function extendVisualDescriptionWithClassification(
  base: string,
  result: ClassificationResult,
): string {
  const tokens: string[] = base.length > 0 ? [base] : [];

  if (result.assetPurpose.value) tokens.push(result.assetPurpose.value);
  if (result.phaseConfiguration.value) tokens.push(result.phaseConfiguration.value);
  if (result.constructionRole.value) tokens.push(result.constructionRole.value);
  if (result.framingConfiguration.value) tokens.push(result.framingConfiguration.value);
  for (const eq of result.equipmentRole.value ?? []) tokens.push(eq);

  return [...new Set(tokens.join(" ").toLowerCase().split(/\s+/).filter(t => t.length > 1))].join(" ");
}
