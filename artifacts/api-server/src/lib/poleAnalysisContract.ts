export const POLE_ANALYSIS_FIELDS = [
  "poleNumber",
  "location",
  "poleMaterial",
  "poleClass",
  "poleHeight",
  "poleConditionObservation",
  "structureConfiguration",
  "circuit",
  "voltage",
  "phase",
  "conductorArrangement",
  "neutralArrangement",
  "crossarms",
  "insulators",
  "transformers",
  "cutouts",
  "arresters",
  "switches",
  "grounds",
  "guys",
  "anchors",
  "communicationsAttachments",
  "otherVisibleComponents",
  "beforeAfterClassification",
  "visibleWorkActions",
  "quantities",
  "matchedCatalogItemIds",
  "matchedWorkActionIds",
  "matchedWorkPackageIds",
  "requiredDocumentation",
  "missingEvidence",
] as const;

export type PoleAnalysisFieldKey = (typeof POLE_ANALYSIS_FIELDS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface PoleAnalysisEvidence {
  photoId: number;
  kind: "visual" | "ocr" | "gps" | "timestamp" | "mapped_location" | "company_catalog";
  detail: string;
  companyId?: number;
}

export interface PoleAnalysisField {
  key: PoleAnalysisFieldKey;
  value: JsonValue;
  confidence: number;
  state: "ai_proposed";
  evidence: PoleAnalysisEvidence[];
  reviewRequirement: "foreman_review" | "manual_selection" | "additional_photo";
  additionalPhotoRequest?: string;
}

export interface PoleAnalysisProposal {
  analysisId: string;
  version: number;
  companyId: number;
  reportId: number;
  photoId: number;
  targetMatch: "confirmed" | "ambiguous" | "conflict";
  targetEvidence: PoleAnalysisEvidence[];
  status: "ai_proposed";
  model: {
    provider: string;
    model: string;
    modelVersion: string;
    promptVersion: string;
  };
  fields: PoleAnalysisField[];
}

export interface PoleAnalysisContext {
  companyId: number;
  reportId: number;
  photoId: number;
  reportStatus: string;
}

export interface ForemanFieldDecision {
  fieldKey: PoleAnalysisFieldKey;
  action: "accept" | "edit" | "reject";
  editedValue?: JsonValue;
  note?: string;
}

const FIELD_SET = new Set<string>(POLE_ANALYSIS_FIELDS);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isSafeJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => isSafeJson(item, depth + 1));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value);
  return entries.length <= 100 && entries.every(([key, item]) => key.length <= 100 && isSafeJson(item, depth + 1));
}

function validateEvidence(
  evidence: PoleAnalysisEvidence[],
  context: PoleAnalysisContext,
  label: string,
  errors: string[],
) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push(`${label} requires evidence`);
    return;
  }
  for (const item of evidence) {
    if (item.photoId !== context.photoId) errors.push(`${label} evidence must use the attached photo`);
    if (!validText(item.detail, 1_000)) errors.push(`${label} evidence detail is invalid`);
    if (item.companyId !== undefined && item.companyId !== context.companyId) {
      errors.push(`${label} evidence cannot cross companies`);
    }
  }
}

export function validatePoleAnalysisProposal(
  proposal: PoleAnalysisProposal,
  context: PoleAnalysisContext,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!SAFE_ID.test(proposal.analysisId)) errors.push("analysisId is invalid");
  if (!isPositiveId(proposal.version)) errors.push("version must be a positive integer");
  if (proposal.companyId !== context.companyId) errors.push("analysis company does not match the report company");
  if (proposal.reportId !== context.reportId) errors.push("analysis report does not match the active report");
  if (proposal.photoId !== context.photoId) errors.push("analysis photo does not match the attached photo");
  if (context.reportStatus !== "draft") errors.push("completed or locked reports cannot accept analysis proposals");
  if (proposal.targetMatch !== "confirmed") errors.push("ambiguous or conflicting jobs require manual selection before autofill");
  if (proposal.status !== "ai_proposed") errors.push("analysis must remain AI proposed");
  validateEvidence(proposal.targetEvidence, context, "target match", errors);

  for (const [key, value] of Object.entries(proposal.model ?? {})) {
    if (!validText(value, 200)) errors.push(`model.${key} is invalid`);
  }

  if (!Array.isArray(proposal.fields) || proposal.fields.length === 0) {
    errors.push("analysis requires at least one proposed field");
  }
  const seen = new Set<string>();
  for (const field of proposal.fields ?? []) {
    if (!FIELD_SET.has(field.key)) errors.push(`unsupported analysis field: ${String(field.key)}`);
    if (seen.has(field.key)) errors.push(`duplicate analysis field: ${field.key}`);
    seen.add(field.key);
    if (!isSafeJson(field.value)) errors.push(`${field.key} has an unsafe value`);
    if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) {
      errors.push(`${field.key} confidence must be between 0 and 1`);
    }
    if (field.state !== "ai_proposed") errors.push(`${field.key} must remain AI proposed`);
    validateEvidence(field.evidence, context, field.key, errors);
    if (field.confidence < 0.75 && field.reviewRequirement === "foreman_review") {
      errors.push(`${field.key} requires manual selection or an additional photo at low confidence`);
    }
    if (field.reviewRequirement === "additional_photo" && !validText(field.additionalPhotoRequest, 500)) {
      errors.push(`${field.key} must request a specific additional photo`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function confirmPoleAnalysis(args: {
  proposal: PoleAnalysisProposal;
  context: PoleAnalysisContext;
  decisions: ForemanFieldDecision[];
  actorId: number;
  expectedVersion: number;
  idempotencyKey: string;
  confirmedAt: string;
}) {
  const validation = validatePoleAnalysisProposal(args.proposal, args.context);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  if (!isPositiveId(args.actorId)) throw new Error("A valid foreman actor is required");
  if (args.expectedVersion !== args.proposal.version) throw new Error("Analysis version is stale");
  if (!SAFE_ID.test(args.idempotencyKey)) throw new Error("A valid idempotency key is required");
  if (!validText(args.confirmedAt, 100) || Number.isNaN(Date.parse(args.confirmedAt))) {
    throw new Error("A valid confirmation timestamp is required");
  }

  const decisionsByField = new Map<PoleAnalysisFieldKey, ForemanFieldDecision>();
  for (const decision of args.decisions) {
    if (decisionsByField.has(decision.fieldKey)) throw new Error(`Duplicate decision for ${decision.fieldKey}`);
    if (!FIELD_SET.has(decision.fieldKey)) throw new Error(`Unsupported decision field: ${decision.fieldKey}`);
    if (decision.action === "edit" && !isSafeJson(decision.editedValue)) {
      throw new Error(`Edited value required for ${decision.fieldKey}`);
    }
    decisionsByField.set(decision.fieldKey, decision);
  }

  const finalValues: Partial<Record<PoleAnalysisFieldKey, JsonValue>> = {};
  for (const field of args.proposal.fields) {
    const decision = decisionsByField.get(field.key);
    if (!decision) throw new Error(`Foreman decision required for ${field.key}`);
    if (decision.action === "accept") finalValues[field.key] = field.value;
    if (decision.action === "edit") finalValues[field.key] = decision.editedValue as JsonValue;
  }
  if (decisionsByField.size !== args.proposal.fields.length) throw new Error("Decision set does not match proposal fields");

  return deepFreeze({
    analysisId: args.proposal.analysisId,
    analysisVersion: args.proposal.version,
    companyId: args.context.companyId,
    reportId: args.context.reportId,
    photoId: args.context.photoId,
    status: "foreman_confirmed" as const,
    idempotencyKey: args.idempotencyKey,
    actorId: args.actorId,
    confirmedAt: args.confirmedAt,
    finalValues,
    audit: {
      originalProposal: structuredClone(args.proposal),
      decisions: structuredClone(args.decisions),
    },
  });
}

export function scorePoleAnalysisFixture(
  expected: Partial<Record<PoleAnalysisFieldKey, JsonValue>>,
  actual: PoleAnalysisProposal,
) {
  const actualValues = new Map(actual.fields.map(field => [field.key, field.value]));
  const expectedEntries = Object.entries(expected) as [PoleAnalysisFieldKey, JsonValue][];
  const fields = expectedEntries.map(([key, value]) => ({
    key,
    matched: JSON.stringify(actualValues.get(key)) === JSON.stringify(value),
  }));
  const matched = fields.filter(field => field.matched).length;
  return {
    expectedFields: fields.length,
    matchedFields: matched,
    fieldAccuracy: fields.length === 0 ? 1 : matched / fields.length,
    fields,
  };
}
