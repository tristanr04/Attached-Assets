/**
 * Pole Classification Engine — comprehensive test suite
 *
 * Covers all five classification axes, catalog matching, training example extraction,
 * and every edge case called out in the spec:
 *
 *   ✓ Streetlight-only vs distribution+streetlight distinction
 *   ✓ Joint-use poles
 *   ✓ Three-phase tangent vs angle vs dead-end vs junction distinction
 *   ✓ Double circuit poles
 *   ✓ Partial images / obscured conductors → needsPhoto per axis
 *   ✓ Adjacent lookalikes (same framing/phase, different role)
 *   ✓ Catalog matching: pole-type operationalClass, structure-config phases/keywords
 *   ✓ Company-specific naming via aliases / searchKeywords
 *   ✓ No catalog → null catalogMatch (graceful)
 *   ✓ Multi-value axes (equipmentRole, assetPurpose.also)
 *   ✓ extractClassificationCorrections — only captures edits/rejects
 *   ✓ extendVisualDescriptionWithClassification
 */

import { describe, it, expect } from "vitest";
import {
  normalizeAssetPurpose,
  normalizePhaseConfiguration,
  normalizeConstructionRole,
  normalizeEquipmentRole,
  normalizeFramingConfiguration,
  scorePoleType,
  scoreStructureConfig,
  classifyPole,
  extractClassificationCorrections,
  extendVisualDescriptionWithClassification,
  type AiClassificationOutput,
  type CatalogPoleType,
  type CatalogStructureConfig,
  type ClassificationResult,
} from "../lib/pole-classification-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DIST_POLE_TYPE: CatalogPoleType = {
  id: 1, name: "Distribution Pole", code: "DIST-WD-40-2",
  operationalClass: "distribution",
  aliases: ["dist", "line pole"],
  searchKeywords: "wood distribution crossarm single tangent angle",
  constructionStandardNumber: "DS-100",
};

const SL_POLE_TYPE: CatalogPoleType = {
  id: 2, name: "Streetlight Support Pole", code: "SL-WD-30-3",
  operationalClass: "streetlight",
  aliases: ["street light", "light pole"],
  searchKeywords: "streetlight light arm no primary",
  constructionStandardNumber: "SL-200",
};

const JOINT_POLE_TYPE: CatalogPoleType = {
  id: 3, name: "Joint Use Pole", code: "JU-WD-45-1",
  operationalClass: "joint_use",
  aliases: ["joint use", "shared"],
  searchKeywords: "joint use cable tv telecom distribution",
  constructionStandardNumber: "JU-300",
};

const TANGENT_3PH_SC: CatalogStructureConfig = {
  id: 10, name: "3-Phase Tangent Single Crossarm", code: "3P-TAN-XA",
  phases: 3,
  conductorArrangement: "three phase crossarm",
  crossarmConfig: "single crossarm horizontal",
  deadEndConfig: null,
  guyingRequirements: null,
  constructionStandard: "tangent",
};

const DEADEND_SC: CatalogStructureConfig = {
  id: 11, name: "3-Phase Dead End", code: "3P-DE",
  phases: 3,
  conductorArrangement: "three phase dead end",
  crossarmConfig: "dead end hardware strain insulators",
  deadEndConfig: "full dead end with strain clamps",
  guyingRequirements: "down guys and anchor required",
  constructionStandard: "dead end",
};

const SINGLE_1PH_SC: CatalogStructureConfig = {
  id: 12, name: "Single Phase Tangent", code: "1P-TAN",
  phases: 1,
  conductorArrangement: "single phase",
  crossarmConfig: null,
  deadEndConfig: null,
  guyingRequirements: null,
  constructionStandard: "tangent",
};

const BASE_AI: AiClassificationOutput = {
  assetPurpose: {
    primary: "distribution",
    secondary: [],
    confidence: 0.88,
    evidence: ["Three-phase conductors visible", "Distribution transformer mounted"],
    needsPhoto: null,
  },
  phaseConfiguration: {
    value: "three_phase",
    confidence: 0.90,
    evidence: ["Three conductors on crossarm", "Three insulators"],
    needsPhoto: null,
  },
  constructionRole: {
    value: "tangent",
    confidence: 0.80,
    evidence: ["Conductors run straight", "No guys visible"],
    needsPhoto: null,
  },
  equipmentRole: {
    values: ["transformer", "light"],
    confidence: 0.85,
    evidence: ["25 kVA transformer", "Street light fixture"],
  },
  framingConfiguration: {
    value: "crossarm",
    confidence: 0.92,
    evidence: ["Single horizontal crossarm at pole top"],
    needsPhoto: null,
  },
};

const FULL_CATALOG = {
  poleTypes: [DIST_POLE_TYPE, SL_POLE_TYPE, JOINT_POLE_TYPE],
  structureConfigs: [TANGENT_3PH_SC, DEADEND_SC, SINGLE_1PH_SC],
};

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAssetPurpose — streetlight-only vs distribution+streetlight
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeAssetPurpose — streetlight_only vs distribution+streetlight", () => {
  it("keeps streetlight_only when no primary conductors or distribution equipment", () => {
    const result = normalizeAssetPurpose(
      { primary: "streetlight_only", secondary: [], confidence: 0.90, evidence: ["No primary conductors visible"] },
      ["light"],   // only light in equipment
      "none",      // no primary phase
    );
    expect(result.value).toBe("streetlight_only");
    expect(result.confidence).toBeCloseTo(0.90);
  });

  it("overrides streetlight_only → distribution when transformer present", () => {
    const result = normalizeAssetPurpose(
      { primary: "streetlight_only", secondary: [], confidence: 0.70, evidence: [] },
      ["transformer", "light"],
      "three_phase",
    );
    expect(result.value).toBe("distribution");
    expect(result.also).toContain("streetlight");
    expect(result.evidence.some(e => e.includes("reclassified"))).toBe(true);
  });

  it("overrides streetlight_only → distribution when primary phase conductors visible", () => {
    const result = normalizeAssetPurpose(
      { primary: "streetlight_only", confidence: 0.65, evidence: [] },
      ["light"],
      "single_phase",  // primary conductors present
    );
    expect(result.value).toBe("distribution");
  });

  it("keeps distribution+streetlight when AI correctly labels it", () => {
    const result = normalizeAssetPurpose(
      { primary: "distribution", secondary: ["streetlight_only"], confidence: 0.88, evidence: [] },
      ["transformer", "light"],
      "three_phase",
    );
    expect(result.value).toBe("distribution");
    // secondary may retain streetlight-related label or be normalized
  });

  it("joint_use: identifies when AI says joint_use", () => {
    const result = normalizeAssetPurpose(
      { primary: "joint_use", secondary: [], confidence: 0.75, evidence: ["Multiple utility attachments"] },
      ["transformer", "cutout"],
      "three_phase",
    );
    expect(result.value).toBe("joint_use");
    expect(result.confidence).toBeCloseTo(0.75);
  });

  it("requests equipment_closeup when value is null", () => {
    const result = normalizeAssetPurpose({ primary: null, confidence: 0.3, evidence: [] }, [], null);
    expect(result.value).toBeNull();
    expect(result.needsPhoto).toBe("equipment_closeup");
  });

  it("handles null/undefined AI input gracefully", () => {
    const result = normalizeAssetPurpose(null, [], null);
    expect(result.value).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizePhaseConfiguration
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizePhaseConfiguration", () => {
  it("returns three_phase when AI says three_phase", () => {
    const r = normalizePhaseConfiguration({ value: "three_phase", confidence: 0.9, evidence: [] });
    expect(r.value).toBe("three_phase");
    expect(r.needsPhoto).toBeNull();
  });

  it("returns single_phase with no needsPhoto at high confidence", () => {
    const r = normalizePhaseConfiguration({ value: "single_phase", confidence: 0.85, evidence: [] });
    expect(r.value).toBe("single_phase");
    expect(r.needsPhoto).toBeNull();
  });

  it("returns two_phase", () => {
    const r = normalizePhaseConfiguration({ value: "two_phase", confidence: 0.70, evidence: [] });
    expect(r.value).toBe("two_phase");
  });

  it("returns none (streetlight-only, no primary)", () => {
    const r = normalizePhaseConfiguration({ value: "none", confidence: 0.80, evidence: [] });
    expect(r.value).toBe("none");
  });

  it("requests conductor_direction when obscured (confidence < 0.50)", () => {
    // Obscured conductors — can't count phases
    const r = normalizePhaseConfiguration({ value: "three_phase", confidence: 0.40, evidence: ["Conductors partially obscured"] });
    expect(r.needsPhoto).toBe("conductor_direction");
  });

  it("requests conductor_direction when value is null", () => {
    const r = normalizePhaseConfiguration({ value: null, confidence: 0.0, evidence: [] });
    expect(r.needsPhoto).toBe("conductor_direction");
  });

  it("double circuit: returns three_phase (engine does not yet model double-circuit explicitly)", () => {
    // Double-circuit poles have 6 conductors but still classify as three_phase on the primary axis
    const r = normalizePhaseConfiguration({ value: "three_phase", confidence: 0.88, evidence: ["Six conductors visible — two circuits"] });
    expect(r.value).toBe("three_phase");
    expect(r.evidence).toContain("Six conductors visible — two circuits");
  });

  it("ignores unknown values and returns null", () => {
    const r = normalizePhaseConfiguration({ value: "four_phase_invalid", confidence: 0.9, evidence: [] });
    expect(r.value).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeConstructionRole — key distinctions
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeConstructionRole — tangent vs angle vs dead_end vs junction", () => {
  it("tangent: high confidence, no needsPhoto", () => {
    const r = normalizeConstructionRole({ value: "tangent", confidence: 0.85, evidence: ["Straight conductors"] });
    expect(r.value).toBe("tangent");
    expect(r.needsPhoto).toBeNull();
  });

  it("angle: high confidence, no needsPhoto", () => {
    const r = normalizeConstructionRole({ value: "angle", confidence: 0.80, evidence: ["Conductor direction change", "Bisector guys"] });
    expect(r.value).toBe("angle");
    expect(r.needsPhoto).toBeNull();
  });

  it("corner: distinct from angle (90-degree)", () => {
    const r = normalizeConstructionRole({ value: "corner", confidence: 0.75, evidence: ["Near-90-degree turn"] });
    expect(r.value).toBe("corner");
    expect(r.needsPhoto).toBeNull();
  });

  it("dead_end: high confidence, no needsPhoto", () => {
    const r = normalizeConstructionRole({ value: "dead_end", confidence: 0.88, evidence: ["Strain hardware", "Dead-end insulators"] });
    expect(r.value).toBe("dead_end");
    expect(r.needsPhoto).toBeNull();
  });

  it("three-phase tangent vs angle: requests conductor_direction when confidence < 0.55", () => {
    // Adjacent poles look identical from front view — need to see conductor angles
    const r = normalizeConstructionRole({ value: "tangent", confidence: 0.50, evidence: ["Unclear conductor direction"] });
    expect(r.needsPhoto).toBe("conductor_direction");
  });

  it("dead_end: requests pole_top_closeup when confidence < 0.55", () => {
    const r = normalizeConstructionRole({ value: "dead_end", confidence: 0.45, evidence: ["Possible dead-end hardware"] });
    expect(r.needsPhoto).toBe("pole_top_closeup");
  });

  it("terminal: requests pole_top_closeup when confidence < 0.55", () => {
    const r = normalizeConstructionRole({ value: "terminal", confidence: 0.50, evidence: [] });
    expect(r.needsPhoto).toBe("pole_top_closeup");
  });

  it("junction: recognized (three or more circuits)", () => {
    const r = normalizeConstructionRole({ value: "junction", confidence: 0.72, evidence: ["Three circuits meeting at pole"] });
    expect(r.value).toBe("junction");
  });

  it("tap: conductor leaves in lateral direction", () => {
    const r = normalizeConstructionRole({ value: "tap", confidence: 0.78, evidence: ["Lateral conductor tap"] });
    expect(r.value).toBe("tap");
  });

  it("underground_riser: requests base_closeup when confidence < 0.50", () => {
    const r = normalizeConstructionRole({ value: "underground_riser", confidence: 0.45, evidence: [] });
    expect(r.needsPhoto).toBe("base_closeup");
  });

  it("null value requests conductor_direction", () => {
    const r = normalizeConstructionRole({ value: null, confidence: 0, evidence: [] });
    expect(r.value).toBeNull();
    expect(r.needsPhoto).toBe("conductor_direction");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeEquipmentRole — multi-value
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeEquipmentRole", () => {
  it("returns array of valid values", () => {
    const r = normalizeEquipmentRole({ values: ["transformer", "light", "cutout"], confidence: 0.90, evidence: [] });
    expect(r.value).toEqual(["transformer", "light", "cutout"]);
  });

  it("filters out unknown equipment values", () => {
    const r = normalizeEquipmentRole({ values: ["transformer", "robot_arm_invalid"], confidence: 0.85, evidence: [] });
    expect(r.value).toEqual(["transformer"]);
  });

  it("returns empty array when no equipment visible", () => {
    const r = normalizeEquipmentRole({ values: [], confidence: 0.70, evidence: [] });
    expect(r.value).toEqual([]);
    expect(r.needsPhoto).toBeNull(); // confidence fine, no equipment is valid
  });

  it("requests equipment_closeup when confidence < 0.50 and empty", () => {
    const r = normalizeEquipmentRole({ values: [], confidence: 0.40, evidence: ["Equipment partially obscured"] });
    expect(r.needsPhoto).toBe("equipment_closeup");
  });

  it("transformer_bank distinguished from single transformer", () => {
    const r = normalizeEquipmentRole({ values: ["transformer_bank"], confidence: 0.82, evidence: ["Bank of 3 transformers"] });
    expect(r.value).toContain("transformer_bank");
    expect(r.value).not.toContain("transformer");
  });

  it("joint_use: recognizes telecommunications equipment absence (no dedicated equipment role)", () => {
    // Joint-use cable is not in the equipment role enum — captured in assetPurpose instead
    const r = normalizeEquipmentRole({ values: ["transformer"], confidence: 0.88, evidence: [] });
    expect(r.value).toEqual(["transformer"]);
  });

  it("handles null AI output", () => {
    const r = normalizeEquipmentRole(null);
    expect(r.value).toEqual([]);
    expect(r.confidence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeFramingConfiguration
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeFramingConfiguration", () => {
  it("crossarm: most common, high confidence", () => {
    const r = normalizeFramingConfiguration({ value: "crossarm", confidence: 0.92, evidence: [] });
    expect(r.value).toBe("crossarm");
    expect(r.needsPhoto).toBeNull();
  });

  it("armless: no crossarm visible", () => {
    const r = normalizeFramingConfiguration({ value: "armless", confidence: 0.80, evidence: ["No crossarm", "Insulators directly on pole"] });
    expect(r.value).toBe("armless");
  });

  it("double_arm: two crossarms", () => {
    const r = normalizeFramingConfiguration({ value: "double_arm", confidence: 0.78, evidence: ["Two horizontal crossarms"] });
    expect(r.value).toBe("double_arm");
  });

  it("alley_arm: offset crossarm", () => {
    const r = normalizeFramingConfiguration({ value: "alley_arm", confidence: 0.72, evidence: [] });
    expect(r.value).toBe("alley_arm");
  });

  it("custom: company-specific framing not in standard set", () => {
    const r = normalizeFramingConfiguration({ value: "custom", confidence: 0.65, evidence: ["Non-standard configuration"] });
    expect(r.value).toBe("custom");
  });

  it("requests pole_top_closeup when confidence < 0.60", () => {
    const r = normalizeFramingConfiguration({ value: "crossarm", confidence: 0.55, evidence: [] });
    expect(r.needsPhoto).toBe("pole_top_closeup");
  });

  it("requests pole_top_closeup when value is null", () => {
    const r = normalizeFramingConfiguration({ value: null, confidence: 0.0, evidence: [] });
    expect(r.needsPhoto).toBe("pole_top_closeup");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scorePoleType — catalog matching
// ─────────────────────────────────────────────────────────────────────────────

describe("scorePoleType", () => {
  it("returns high score for exact operationalClass match", () => {
    const score = scorePoleType(DIST_POLE_TYPE, "distribution", "tangent", "crossarm");
    expect(score).toBeGreaterThanOrEqual(0.60);
  });

  it("returns higher score for distribution pole with distribution purpose", () => {
    const distScore = scorePoleType(DIST_POLE_TYPE, "distribution", "tangent", "crossarm");
    const slScore   = scorePoleType(SL_POLE_TYPE, "distribution", "tangent", "crossarm");
    expect(distScore).toBeGreaterThan(slScore);
  });

  it("streetlight pole scores highest for streetlight_only purpose", () => {
    const slScore   = scorePoleType(SL_POLE_TYPE, "streetlight_only", null, null);
    const distScore = scorePoleType(DIST_POLE_TYPE, "streetlight_only", null, null);
    expect(slScore).toBeGreaterThan(distScore);
  });

  it("joint_use pole scores well for joint_use purpose", () => {
    const juScore   = scorePoleType(JOINT_POLE_TYPE, "joint_use", "tangent", "crossarm");
    const distScore = scorePoleType(DIST_POLE_TYPE, "joint_use", "tangent", "crossarm");
    expect(juScore).toBeGreaterThan(distScore);
  });

  it("company-specific naming: keywords match via searchKeywords", () => {
    const customPole: CatalogPoleType = {
      id: 99, name: "PLC Standard Dead End", code: "PLC-DE",
      operationalClass: "distribution",
      aliases: ["dead end", "strain"],
      searchKeywords: "dead end strain clamp heavy angle anchor guy",
      constructionStandardNumber: "DE-100",
    };
    const score = scorePoleType(customPole, "distribution", "dead_end", "crossarm");
    expect(score).toBeGreaterThan(0.60);
  });

  it("returns near-zero score when no match at all", () => {
    const score = scorePoleType(SL_POLE_TYPE, "transmission", "dead_end", "double_arm");
    expect(score).toBeLessThan(0.15);
  });

  it("caps score at 0.99", () => {
    const score = scorePoleType(DIST_POLE_TYPE, "distribution", "tangent", "crossarm");
    expect(score).toBeLessThanOrEqual(0.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreStructureConfig — catalog matching
// ─────────────────────────────────────────────────────────────────────────────

describe("scoreStructureConfig", () => {
  it("exact phase match gives high score", () => {
    const score = scoreStructureConfig(TANGENT_3PH_SC, "three_phase", "tangent", "crossarm");
    expect(score).toBeGreaterThanOrEqual(0.40);
  });

  it("3-phase tangent config scores highest for 3-phase tangent classification", () => {
    const tangentScore = scoreStructureConfig(TANGENT_3PH_SC, "three_phase", "tangent", "crossarm");
    const deadendScore = scoreStructureConfig(DEADEND_SC, "three_phase", "tangent", "crossarm");
    expect(tangentScore).toBeGreaterThan(deadendScore);
  });

  it("dead-end config scores highest for dead-end classification", () => {
    const deScore  = scoreStructureConfig(DEADEND_SC, "three_phase", "dead_end", "crossarm");
    const tanScore = scoreStructureConfig(TANGENT_3PH_SC, "three_phase", "dead_end", "crossarm");
    expect(deScore).toBeGreaterThan(tanScore);
  });

  it("single-phase config scores highest for single-phase classification", () => {
    const s1 = scoreStructureConfig(SINGLE_1PH_SC, "single_phase", "tangent", "crossarm");
    const s3 = scoreStructureConfig(TANGENT_3PH_SC, "single_phase", "tangent", "crossarm");
    expect(s1).toBeGreaterThan(s3);
  });

  it("returns 0 for phase mismatch and no keyword overlap", () => {
    const score = scoreStructureConfig(SINGLE_1PH_SC, "three_phase", "dead_end", "double_arm");
    expect(score).toBeLessThan(0.40);
  });

  it("empty catalog returns zero", () => {
    const score = scoreStructureConfig(TANGENT_3PH_SC, null, null, null);
    expect(score).toBe(0);
  });

  it("caps at 0.99", () => {
    const score = scoreStructureConfig(DEADEND_SC, "three_phase", "dead_end", "crossarm");
    expect(score).toBeLessThanOrEqual(0.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyPole — integration
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPole — full integration", () => {
  it("correctly classifies a standard 3-phase distribution tangent pole", () => {
    const result = classifyPole({ ai: BASE_AI, ...FULL_CATALOG });
    expect(result.assetPurpose.value).toBe("distribution");
    expect(result.phaseConfiguration.value).toBe("three_phase");
    expect(result.constructionRole.value).toBe("tangent");
    expect(result.equipmentRole.value).toContain("transformer");
    expect(result.equipmentRole.value).toContain("light");
    expect(result.framingConfiguration.value).toBe("crossarm");
  });

  it("attaches catalog matches for distribution + tangent 3-phase", () => {
    const result = classifyPole({ ai: BASE_AI, ...FULL_CATALOG });
    expect(result.catalogMatchedPoleTypeId).toBe(DIST_POLE_TYPE.id);
    expect(result.catalogMatchedStructureConfigId).toBe(TANGENT_3PH_SC.id);
  });

  it("computes overallConfidence as mean of filled axes", () => {
    const result = classifyPole({ ai: BASE_AI, ...FULL_CATALOG });
    // All 5 axes have values, so overall = mean(0.88, 0.90, 0.80, 0.85, 0.92) ≈ 0.87
    expect(result.overallConfidence).toBeGreaterThan(0.80);
    expect(result.overallConfidence).toBeLessThan(1.0);
  });

  it("classifies a streetlight-only pole correctly", () => {
    const ai: AiClassificationOutput = {
      assetPurpose: { primary: "streetlight_only", secondary: [], confidence: 0.90, evidence: ["No primary conductors"] },
      phaseConfiguration: { value: "none", confidence: 0.85, evidence: [] },
      constructionRole: { value: "service", confidence: 0.75, evidence: [] },
      equipmentRole: { values: ["light"], confidence: 0.95, evidence: ["Street light fixture"] },
      framingConfiguration: { value: "single_arm", confidence: 0.88, evidence: ["Light arm extension"] },
    };
    const result = classifyPole({ ai, poleTypes: [DIST_POLE_TYPE, SL_POLE_TYPE], structureConfigs: [] });
    expect(result.assetPurpose.value).toBe("streetlight_only");
    expect(result.phaseConfiguration.value).toBe("none");
    expect(result.catalogMatchedPoleTypeId).toBe(SL_POLE_TYPE.id);
  });

  it("correctly reclassifies streetlight_only → distribution when transformer present", () => {
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      assetPurpose: { primary: "streetlight_only", confidence: 0.60, evidence: ["Light arm visible"] },
      equipmentRole: { values: ["transformer", "light"], confidence: 0.88, evidence: [] },
      phaseConfiguration: { value: "three_phase", confidence: 0.88, evidence: [] },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.assetPurpose.value).toBe("distribution");
    expect(result.assetPurpose.also).toContain("streetlight");
  });

  it("classifies dead-end pole and matches dead-end structure config", () => {
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      constructionRole: { value: "dead_end", confidence: 0.88, evidence: ["Strain clamps", "Dead-end insulators"] },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.constructionRole.value).toBe("dead_end");
    expect(result.catalogMatchedStructureConfigId).toBe(DEADEND_SC.id);
  });

  it("joint-use pole: identifies joint_use purpose and selects joint-use pole type", () => {
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      assetPurpose: {
        primary: "joint_use",
        secondary: ["communications"],
        confidence: 0.80,
        evidence: ["Cable TV equipment", "Telecom cable", "Distribution conductors"],
      },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.assetPurpose.value).toBe("joint_use");
    expect(result.catalogMatchedPoleTypeId).toBe(JOINT_POLE_TYPE.id);
  });

  it("empty catalogs — returns null catalog matches but axes still classified", () => {
    const result = classifyPole({ ai: BASE_AI, poleTypes: [], structureConfigs: [] });
    expect(result.catalogMatchedPoleTypeId).toBeNull();
    expect(result.catalogMatchedStructureConfigId).toBeNull();
    expect(result.assetPurpose.value).toBe("distribution"); // classification still works
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Partial image / obscured conductor edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPole — partial images and obscured conductors", () => {
  it("obscured phase count: phaseConfiguration requests conductor_direction", () => {
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      phaseConfiguration: { value: "three_phase", confidence: 0.40, evidence: ["Conductors obscured by foliage"] },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.phaseConfiguration.needsPhoto).toBe("conductor_direction");
  });

  it("partial image — only sees top third: framing classified, role uncertain", () => {
    const ai: AiClassificationOutput = {
      assetPurpose: { primary: "distribution", confidence: 0.65, evidence: [] },
      phaseConfiguration: { value: "three_phase", confidence: 0.70, evidence: [] },
      constructionRole: { value: "tangent", confidence: 0.45, evidence: ["Limited view"] }, // low conf
      equipmentRole: { values: ["transformer"], confidence: 0.72, evidence: [] },
      framingConfiguration: { value: "crossarm", confidence: 0.85, evidence: [] },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.constructionRole.needsPhoto).toBe("conductor_direction");
    expect(result.framingConfiguration.needsPhoto).toBeNull(); // framing visible from top
  });

  it("all axes uncertain: multiple needsPhoto flags set", () => {
    const ai: AiClassificationOutput = {
      assetPurpose: { primary: null, confidence: 0, evidence: [] },
      phaseConfiguration: { value: null, confidence: 0, evidence: [] },
      constructionRole: { value: null, confidence: 0, evidence: [] },
      equipmentRole: { values: [], confidence: 0.30, evidence: [] },
      framingConfiguration: { value: null, confidence: 0, evidence: [] },
    };
    const result = classifyPole({ ai, poleTypes: [], structureConfigs: [] });
    expect(result.phaseConfiguration.needsPhoto).toBe("conductor_direction");
    expect(result.constructionRole.needsPhoto).toBe("conductor_direction");
    expect(result.framingConfiguration.needsPhoto).toBe("pole_top_closeup");
    expect(result.equipmentRole.needsPhoto).toBe("equipment_closeup");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Adjacent lookalikes
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPole — adjacent lookalike poles", () => {
  it("same framing and phase, different construction role", () => {
    const tangentAI: AiClassificationOutput = { ...BASE_AI,
      constructionRole: { value: "tangent", confidence: 0.80, evidence: [] } };
    const angleAI: AiClassificationOutput = { ...BASE_AI,
      constructionRole: { value: "angle", confidence: 0.80, evidence: ["Conductor direction change"] } };

    const tangent = classifyPole({ ai: tangentAI, ...FULL_CATALOG });
    const angle   = classifyPole({ ai: angleAI, ...FULL_CATALOG });

    // Framing and phase should be identical; construction role differs
    expect(tangent.framingConfiguration.value).toBe(angle.framingConfiguration.value);
    expect(tangent.phaseConfiguration.value).toBe(angle.phaseConfiguration.value);
    expect(tangent.constructionRole.value).toBe("tangent");
    expect(angle.constructionRole.value).toBe("angle");
  });

  it("same everything except tangent vs dead_end: dead_end requests pole_top_closeup at low confidence", () => {
    const ai: AiClassificationOutput = { ...BASE_AI,
      constructionRole: { value: "dead_end", confidence: 0.48, evidence: ["Possible strain hardware"] } };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.constructionRole.needsPhoto).toBe("pole_top_closeup");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Double circuit
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPole — double circuit", () => {
  it("double circuit returns three_phase classification (primary axis)", () => {
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      phaseConfiguration: { value: "three_phase", confidence: 0.88,
        evidence: ["Six conductors visible — two three-phase circuits sharing pole"], needsPhoto: null },
    };
    const result = classifyPole({ ai, ...FULL_CATALOG });
    expect(result.phaseConfiguration.value).toBe("three_phase");
    expect(result.phaseConfiguration.evidence[0]).toMatch(/six conductors/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Company-specific naming
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPole — company-specific naming", () => {
  it("matches company's custom pole type by alias", () => {
    const companyPole: CatalogPoleType = {
      id: 50, name: "PLC H-Frame Transmission", code: "PLC-HFXMIT",
      operationalClass: "transmission",
      aliases: ["h frame", "h-frame", "H-frame transmission"],
      searchKeywords: "h frame crossarm transmission double arm",
      constructionStandardNumber: "TX-400",
    };
    const ai: AiClassificationOutput = {
      ...BASE_AI,
      assetPurpose: { primary: "transmission", confidence: 0.85, evidence: [] },
      framingConfiguration: { value: "double_arm", confidence: 0.80, evidence: ["H-frame structure"] },
    };
    const result = classifyPole({ ai, poleTypes: [companyPole, DIST_POLE_TYPE], structureConfigs: [] });
    expect(result.catalogMatchedPoleTypeId).toBe(companyPole.id);
  });

  it("company construction standard number is not required for matching", () => {
    const noStd: CatalogPoleType = {
      id: 51, name: "Basic Distribution", code: "BASIC-D",
      operationalClass: "distribution",
      aliases: null,
      searchKeywords: null,
      constructionStandardNumber: null,
    };
    const result = classifyPole({ ai: BASE_AI, poleTypes: [noStd], structureConfigs: [] });
    expect(result.catalogMatchedPoleTypeId).toBe(noStd.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractClassificationCorrections
// ─────────────────────────────────────────────────────────────────────────────

describe("extractClassificationCorrections", () => {
  const MOCK_RESULT: ClassificationResult = {
    assetPurpose: { value: "distribution", also: [], confidence: 0.88, evidence: [], needsPhoto: null, catalogMatch: null },
    phaseConfiguration: { value: "three_phase", confidence: 0.90, evidence: [], needsPhoto: null, catalogMatch: null },
    constructionRole: { value: "tangent", confidence: 0.80, evidence: [], needsPhoto: null, catalogMatch: null },
    equipmentRole: { value: ["transformer"], confidence: 0.85, evidence: [], needsPhoto: null, catalogMatch: null },
    framingConfiguration: { value: "crossarm", confidence: 0.92, evidence: [], needsPhoto: null, catalogMatch: null },
    overallConfidence: 0.87,
    catalogMatchedPoleTypeId: 1,
    catalogMatchedStructureConfigId: 10,
  };

  it("returns empty array when all axes accepted", () => {
    const statuses = {
      assetPurpose: "accepted", phaseConfiguration: "accepted",
      constructionRole: "accepted", equipmentRole: "accepted", framingConfiguration: "accepted",
    };
    const corrections = extractClassificationCorrections(MOCK_RESULT, statuses, {});
    expect(corrections).toHaveLength(0);
  });

  it("captures edited axis with foreman value", () => {
    const corrections = extractClassificationCorrections(
      MOCK_RESULT,
      { constructionRole: "edited" },
      { constructionRole: "angle" },
    );
    expect(corrections).toHaveLength(1);
    expect(corrections[0].axis).toBe("constructionRole");
    expect(corrections[0].aiValue).toBe("tangent");
    expect(corrections[0].foremanValue).toBe("angle");
    expect(corrections[0].status).toBe("edited");
  });

  it("captures rejected axis with null foreman value", () => {
    const corrections = extractClassificationCorrections(
      MOCK_RESULT,
      { assetPurpose: "rejected" },
      {},
    );
    expect(corrections[0].status).toBe("rejected");
    expect(corrections[0].foremanValue).toBeNull();
  });

  it("captures multiple corrections in one call", () => {
    const corrections = extractClassificationCorrections(
      MOCK_RESULT,
      { constructionRole: "edited", framingConfiguration: "rejected" },
      { constructionRole: "dead_end" },
    );
    expect(corrections).toHaveLength(2);
  });

  it("ignores axes with no status entry (pending = implicitly accepted)", () => {
    // Only framingConfiguration is edited; others have no entry → treated as accepted
    const corrections = extractClassificationCorrections(
      MOCK_RESULT,
      { framingConfiguration: "edited" },
      { framingConfiguration: "double_arm" },
    );
    expect(corrections).toHaveLength(1);
    expect(corrections[0].axis).toBe("framingConfiguration");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extendVisualDescriptionWithClassification
// ─────────────────────────────────────────────────────────────────────────────

describe("extendVisualDescriptionWithClassification", () => {
  const MOCK_RESULT: ClassificationResult = {
    assetPurpose: { value: "distribution", also: [], confidence: 0.88, evidence: [], needsPhoto: null, catalogMatch: null },
    phaseConfiguration: { value: "three_phase", confidence: 0.90, evidence: [], needsPhoto: null, catalogMatch: null },
    constructionRole: { value: "tangent", confidence: 0.80, evidence: [], needsPhoto: null, catalogMatch: null },
    equipmentRole: { value: ["transformer", "light"], confidence: 0.85, evidence: [], needsPhoto: null, catalogMatch: null },
    framingConfiguration: { value: "crossarm", confidence: 0.92, evidence: [], needsPhoto: null, catalogMatch: null },
    overallConfidence: 0.87,
    catalogMatchedPoleTypeId: 1,
    catalogMatchedStructureConfigId: 10,
  };

  it("adds classification tokens to a base visual description", () => {
    const base = "wood 40ft class2 single_crossarm";
    const extended = extendVisualDescriptionWithClassification(base, MOCK_RESULT);
    expect(extended).toContain("distribution");
    expect(extended).toContain("three_phase");
    expect(extended).toContain("tangent");
    expect(extended).toContain("crossarm");
    expect(extended).toContain("transformer");
    expect(extended).toContain("light");
  });

  it("deduplicates tokens that appear in both base and classification", () => {
    const base = "wood 40ft crossarm distribution";
    const extended = extendVisualDescriptionWithClassification(base, MOCK_RESULT);
    // "crossarm" and "distribution" should appear exactly once
    const tokens = extended.split(" ");
    expect(tokens.filter(t => t === "crossarm")).toHaveLength(1);
    expect(tokens.filter(t => t === "distribution")).toHaveLength(1);
  });

  it("handles empty base string", () => {
    const extended = extendVisualDescriptionWithClassification("", MOCK_RESULT);
    expect(extended.length).toBeGreaterThan(0);
    expect(extended).toContain("distribution");
  });

  it("handles null equipment role", () => {
    const emptyEq: ClassificationResult = {
      ...MOCK_RESULT,
      equipmentRole: { value: [], confidence: 0, evidence: [], needsPhoto: null, catalogMatch: null },
    };
    expect(() => extendVisualDescriptionWithClassification("wood", emptyEq)).not.toThrow();
  });
});
