export const POLE_CLASSIFICATION_AXES = [
  "asset_purpose",
  "phase_configuration",
  "construction_role",
  "equipment_role",
  "framing_configuration",
] as const;

export type PoleClassificationAxis = (typeof POLE_CLASSIFICATION_AXES)[number];

export const GENERIC_POLE_CLASSIFICATIONS = {
  asset_purpose: ["streetlight_only", "distribution", "transmission", "communications", "joint_use"],
  phase_configuration: ["no_primary", "single_phase", "two_phase", "three_phase"],
  construction_role: [
    "tangent", "angle", "corner", "dead_end", "terminal", "junction", "tap", "branch",
    "crossing", "service", "underground_riser",
  ],
  equipment_role: [
    "light", "transformer", "transformer_bank", "switch", "cutout", "recloser", "sectionalizer",
    "capacitor_bank", "regulator", "fused_tap",
  ],
  framing_configuration: ["crossarm", "armless", "vertical", "alley_arm", "single_arm", "double_arm"],
} as const;

export interface PoleClassificationEvidence {
  photoId: number;
  kind:
    | "full_pole"
    | "pole_top"
    | "conductor_geometry"
    | "insulator"
    | "dead_end_hardware"
    | "guy_anchor"
    | "branch_direction"
    | "equipment"
    | "framing"
    | "ocr"
    | "company_standard";
  detail: string;
}

export interface RawPoleClassification {
  axis: PoleClassificationAxis;
  genericValue: string;
  confidence: number;
  evidence: PoleClassificationEvidence[];
}

export interface CompanyPoleTypeCatalogItem {
  id: number;
  companyId: number;
  axis: PoleClassificationAxis;
  name: string;
  genericValues: string[];
  active: boolean;
}

export interface PoleClassificationContext {
  companyId: number;
  photoId: number;
  reportStatus: string;
}

export interface PoleClassificationProposal {
  companyId: number;
  photoId: number;
  state: "ai_proposed";
  axis: PoleClassificationAxis;
  genericValue: string;
  confidence: number;
  evidence: PoleClassificationEvidence[];
  companyCatalogMatch?: { id: number; name: string };
  reviewRequirement: "foreman_review" | "manual_selection" | "additional_photo";
  additionalPhotoRequest?: string;
}

const AXIS_VALUES: Record<PoleClassificationAxis, ReadonlySet<string>> = {
  asset_purpose: new Set<string>(GENERIC_POLE_CLASSIFICATIONS.asset_purpose),
  phase_configuration: new Set<string>(GENERIC_POLE_CLASSIFICATIONS.phase_configuration),
  construction_role: new Set<string>(GENERIC_POLE_CLASSIFICATIONS.construction_role),
  equipment_role: new Set<string>(GENERIC_POLE_CLASSIFICATIONS.equipment_role),
  framing_configuration: new Set<string>(GENERIC_POLE_CLASSIFICATIONS.framing_configuration),
};

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function evidenceKinds(field: RawPoleClassification) {
  return new Set(field.evidence.map(item => item.kind));
}

function requiredEvidence(axis: PoleClassificationAxis, value: string) {
  if (axis === "phase_configuration") return ["conductor_geometry", "insulator"] as const;
  if (axis === "framing_configuration") return ["framing", "pole_top"] as const;
  if (axis === "equipment_role") return ["equipment"] as const;
  if (axis === "construction_role" && ["dead_end", "terminal"].includes(value)) {
    return ["dead_end_hardware", "guy_anchor", "conductor_geometry"] as const;
  }
  if (axis === "construction_role" && ["junction", "tap", "branch"].includes(value)) {
    return ["branch_direction", "conductor_geometry"] as const;
  }
  if (axis === "construction_role") return ["conductor_geometry", "pole_top"] as const;
  return ["full_pole"] as const;
}

function photoRequest(axis: PoleClassificationAxis, value: string) {
  if (axis === "phase_configuration") return "Capture the complete pole top with every primary conductor and insulator visible.";
  if (axis === "framing_configuration") return "Capture a straight-on pole-top photo showing every arm, insulator, and attachment point.";
  if (axis === "equipment_role") return "Capture a closer equipment photo showing labels, connections, and the full mounted device.";
  if (["dead_end", "terminal"].includes(value)) return "Capture both conductor ends, dead-end hardware, and all guys and anchors.";
  if (["junction", "tap", "branch"].includes(value)) return "Capture a wider pole-top view showing every conductor direction entering and leaving the pole.";
  if (axis === "construction_role") return "Capture a wider pole-top view showing conductor direction before and after the pole.";
  return "Capture the full pole from base to top, including primary conductors, communications, and any streetlight.";
}

function validateRaw(field: RawPoleClassification, context: PoleClassificationContext) {
  if (!AXIS_VALUES[field.axis]?.has(field.genericValue)) throw new Error(`Unsupported ${field.axis} classification`);
  if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) {
    throw new Error(`Invalid confidence for ${field.axis}`);
  }
  if (!Array.isArray(field.evidence) || field.evidence.length === 0) throw new Error(`Evidence required for ${field.axis}`);
  for (const item of field.evidence) {
    if (item.photoId !== context.photoId) throw new Error(`${field.axis} evidence must use the attached photo`);
    if (!item.detail.trim() || item.detail.length > 1_000) throw new Error(`Invalid ${field.axis} evidence detail`);
  }
}

function catalogMatch(
  field: RawPoleClassification,
  context: PoleClassificationContext,
  catalog: CompanyPoleTypeCatalogItem[],
) {
  const matches = catalog.filter(item => item.companyId === context.companyId
    && item.active
    && item.axis === field.axis
    && item.genericValues.some(value => normalized(value) === normalized(field.genericValue)));
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name } : undefined;
}

export function buildPoleClassificationProposals(args: {
  context: PoleClassificationContext;
  classifications: RawPoleClassification[];
  catalog: CompanyPoleTypeCatalogItem[];
}): PoleClassificationProposal[] {
  if (!isPositiveId(args.context.companyId) || !isPositiveId(args.context.photoId)) throw new Error("Valid company and photo required");
  if (args.context.reportStatus !== "draft") throw new Error("Completed or locked reports cannot receive classifications");

  const seen = new Set<string>();
  for (const field of args.classifications) {
    validateRaw(field, args.context);
    const unique = `${field.axis}:${field.genericValue}`;
    if (seen.has(unique)) throw new Error(`Duplicate classification ${unique}`);
    seen.add(unique);
  }

  const phase = args.classifications.find(field => field.axis === "phase_configuration")?.genericValue;
  const purpose = args.classifications.find(field => field.axis === "asset_purpose")?.genericValue;
  if (purpose === "streetlight_only" && phase && phase !== "no_primary") {
    throw new Error("A streetlight-only pole cannot be classified with primary phases");
  }

  return args.classifications.map(field => {
    const kinds = evidenceKinds(field);
    const hasRequiredEvidence = requiredEvidence(field.axis, field.genericValue).some(kind => kinds.has(kind));
    const match = catalogMatch(field, args.context, args.catalog);
    const ordinaryReview = field.confidence >= 0.75 && hasRequiredEvidence && Boolean(match);
    return {
      companyId: args.context.companyId,
      photoId: args.context.photoId,
      state: "ai_proposed" as const,
      axis: field.axis,
      genericValue: field.genericValue,
      confidence: field.confidence,
      evidence: structuredClone(field.evidence),
      companyCatalogMatch: match,
      reviewRequirement: ordinaryReview ? "foreman_review" as const
        : match ? "additional_photo" as const : "manual_selection" as const,
      ...(!ordinaryReview && match ? { additionalPhotoRequest: photoRequest(field.axis, field.genericValue) } : {}),
    };
  });
}
