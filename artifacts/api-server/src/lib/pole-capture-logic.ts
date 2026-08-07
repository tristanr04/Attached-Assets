/**
 * Pure business logic for the Photo-to-Job Pole Filler.
 * Extracted here so every function is independently testable without DB or HTTP.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  at: string;
  action: string;
  by?: number | null;
  detail?: string;
}

export function appendAuditLog(
  existing: AuditEntry[] | null | undefined,
  entry: Omit<AuditEntry, "at">,
): AuditEntry[] {
  const log: AuditEntry[] = Array.isArray(existing) ? [...existing] : [];
  log.push({ ...entry, at: new Date().toISOString() });
  return log;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job matching — scoring only (no DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoredProject {
  projectId: number;
  projectName: string;
  isActive: boolean;
  hasTodayReport: boolean;
  hasPoleTagHit: boolean;
}

export interface JobCandidate {
  projectId: number;
  projectName: string;
  confidence: number;
  method: string;
}

/**
 * Score projects using three independent signals:
 *   - Pole tag found in recent reports for this project   → +0.55
 *   - Draft report for this project exists today          → +0.35
 *   - Project status is "active"                          → +0.10
 *
 * Returns candidates sorted descending, capped at 0.99, minimum threshold 0.05.
 */
export function scoreProjects(projects: ScoredProject[]): JobCandidate[] {
  const scored = projects.map(p => {
    let score = 0;
    let method = "none";

    if (p.hasPoleTagHit) {
      score += 0.55;
      method = "pole_tag";
    }
    if (p.hasTodayReport) {
      score += 0.35;
      if (method === "none") method = "schedule";
    }
    if (p.isActive) {
      score += 0.10;
    }

    return {
      projectId: p.projectId,
      projectName: p.projectName,
      confidence: Math.min(score, 0.99),
      method,
    };
  });

  return scored
    .filter(c => c.confidence > 0.05)
    .sort((a, b) => b.confidence - a.confidence);
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation validation
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisRecord {
  id: number;
  companyId: number;
  status: string;
  linkedReportId?: number | null;
}

export interface ProjectRecord {
  id: number;
  companyId: number;
}

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; code: number; error: string; extra?: Record<string, unknown> };

/** Validate whether a confirmation can proceed without touching the DB. */
export function validateConfirmation(
  analysis: AnalysisRecord,
  project: ProjectRecord | null,
  existingConfirmedDuplicate: { id: number; linkedReportId: number | null } | null,
  existingCompleteReport: boolean,
): ConfirmationCheck {
  // Already confirmed → idempotent success, return linked report
  if (analysis.status === "confirmed") {
    return { ok: false, code: 200, error: "already_confirmed", extra: { linkedReportId: analysis.linkedReportId } };
  }

  // Cannot confirm if not in pending status
  if (analysis.status !== "pending") {
    return {
      ok: false,
      code: 409,
      error: `Analysis is in '${analysis.status}' status and cannot be confirmed`,
    };
  }

  // Cross-company guard: project must belong to the same company
  if (!project || project.companyId !== analysis.companyId) {
    return { ok: false, code: 403, error: "Project does not belong to this company" };
  }

  // Duplicate gate: another confirmed analysis for this pole tag today
  if (existingConfirmedDuplicate && existingConfirmedDuplicate.id !== analysis.id) {
    return {
      ok: false,
      code: 409,
      error: "This pole was already confirmed today",
      extra: {
        duplicateAnalysisId: existingConfirmedDuplicate.id,
        duplicateReportId: existingConfirmedDuplicate.linkedReportId,
      },
    };
  }

  // Cannot add to a completed report
  if (existingCompleteReport) {
    return {
      ok: false,
      code: 409,
      error: "A completed report for this project already exists today. Cannot add to a completed report.",
    };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry validation
// ─────────────────────────────────────────────────────────────────────────────

export type RetryCheck =
  | { ok: true }
  | { ok: false; code: number; error: string };

export function validateRetry(analysis: AnalysisRecord): RetryCheck {
  if (analysis.status === "confirmed") {
    return { ok: false, code: 409, error: "Analysis already confirmed" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmed-fields builder
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldStatuses { [key: string]: "pending" | "accepted" | "edited" | "rejected" }
export interface EditValues { [key: string]: string }

export function buildConfirmedFields(
  proposed: Record<string, any>,
  fieldStatuses: FieldStatuses,
  editValues: EditValues,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, field] of Object.entries(proposed)) {
    const status = fieldStatuses[key] ?? "pending";
    if (status === "rejected") {
      result[key] = { ...field, value: null, status: "rejected" };
    } else if (status === "edited" && editValues[key] !== undefined) {
      result[key] = { ...field, value: editValues[key], status: "edited" };
    } else {
      result[key] = { ...field, status: "accepted" };
    }
  }
  return result;
}
