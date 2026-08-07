import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  companyMembershipsTable,
  dailyReportsTable,
  db,
  photosTable,
  poleAnalysisDecisionsTable,
  poleAnalysisCandidatesTable,
  poleAnalysisFieldsTable,
  poleAnalysisJobsTable,
  poleAnalysisRunsTable,
  reportPoleFactsTable,
} from "@workspace/db";

import {
  confirmPoleAnalysis,
  parsePoleAnalysisConfirmationRequest,
  type PoleAnalysisProposal,
} from "../lib/poleAnalysisContract";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";
import { parseIdempotencyKey } from "../lib/idempotency";
import { canAccessReport } from "../lib/reportState";

const router: IRouter = Router();

async function reviewResponseFor(run: typeof poleAnalysisRunsTable.$inferSelect) {
  const [fields, candidates, decisions] = await Promise.all([
    db.select().from(poleAnalysisFieldsTable).where(eq(poleAnalysisFieldsTable.analysisRunId, run.id)),
    db.select().from(poleAnalysisCandidatesTable).where(eq(poleAnalysisCandidatesTable.analysisRunId, run.id)),
    db.select().from(poleAnalysisDecisionsTable).where(eq(poleAnalysisDecisionsTable.analysisRunId, run.id)),
  ]);
  return {
    analysisRunId: run.id,
    analysisId: run.analysisKey,
    version: run.version,
    status: run.status,
    targetMatch: run.targetMatch,
    selectedPoleProfileId: run.selectedPoleProfileId,
    targetEvidence: run.targetEvidence,
    limitations: run.limitations,
    model: {
      provider: run.modelProvider,
      model: run.modelName,
      modelVersion: run.modelVersion,
      promptVersion: run.promptVersion,
    },
    fields: fields.map(field => ({
      key: field.fieldKey,
      proposedValue: field.proposedValue,
      confidence: Number(field.confidence),
      evidence: field.evidence,
      reviewRequirement: field.reviewRequirement,
      additionalPhotoRequest: field.additionalPhotoRequest,
    })),
    candidates: candidates.map(candidate => ({
      poleProfileId: candidate.poleProfileId,
      rank: candidate.rank,
      score: Number(candidate.score),
      signalEvidence: candidate.signalEvidence,
    })),
    decisions: decisions.map(decision => ({
      fieldKey: decision.fieldKey,
      action: decision.action,
      finalValue: decision.finalValue,
      note: decision.note,
      actorUserId: decision.actorUserId,
      decidedAt: decision.decidedAt,
    })),
    confirmedFactCount: decisions.filter(decision => decision.action !== "reject").length,
    createdAt: run.createdAt,
    confirmedAt: run.confirmedAt,
  };
}

router.get(
  "/reports/:reportId/photos/:photoId/pole-analysis",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const reportId = parsePositiveId(req.params.reportId);
    const photoId = parsePositiveId(req.params.photoId);
    if (reportId === null || photoId === null) {
      res.status(400).json({ error: "Invalid report or photo identifier" });
      return;
    }

    const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
    if (!report) { res.status(404).json({ error: "Not found" }); return; }
    const [membership] = await db.select().from(companyMembershipsTable).where(and(
      eq(companyMembershipsTable.companyId, report.companyId),
      eq(companyMembershipsTable.clerkUserId, req.clerkUserId),
    ));
    if (!membership || !canAccessReport(membership.role, membership.userId, report.foremanId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [photo] = await db.select({ id: photosTable.id }).from(photosTable).where(and(
      eq(photosTable.id, photoId),
      eq(photosTable.reportId, reportId),
    ));
    if (!photo) { res.status(404).json({ error: "Photo not found on this report" }); return; }
    const [run] = await db.select().from(poleAnalysisRunsTable).where(and(
      eq(poleAnalysisRunsTable.companyId, report.companyId),
      eq(poleAnalysisRunsTable.reportId, reportId),
      eq(poleAnalysisRunsTable.photoId, photoId),
    )).orderBy(desc(poleAnalysisRunsTable.version)).limit(1);
    const [job] = await db.select({
      id: poleAnalysisJobsTable.id,
      generation: poleAnalysisJobsTable.generation,
      status: poleAnalysisJobsTable.status,
      attemptCount: poleAnalysisJobsTable.attemptCount,
      maxAttempts: poleAnalysisJobsTable.maxAttempts,
      availableAt: poleAnalysisJobsTable.availableAt,
      lastErrorCode: poleAnalysisJobsTable.lastErrorCode,
      createdAt: poleAnalysisJobsTable.createdAt,
      updatedAt: poleAnalysisJobsTable.updatedAt,
    }).from(poleAnalysisJobsTable).where(and(
      eq(poleAnalysisJobsTable.companyId, report.companyId),
      eq(poleAnalysisJobsTable.reportId, reportId),
      eq(poleAnalysisJobsTable.photoId, photoId),
    )).orderBy(desc(poleAnalysisJobsTable.generation)).limit(1);
    res.json({
      analysis: run ? {
        ...await reviewResponseFor(run),
        canConfirm: Boolean(membership.userId && membership.userId === report.foremanId),
      } : null,
      job: job ? {
        ...job,
        canManualFallback: !run
          && report.status === "draft"
          && Boolean(membership.userId && membership.userId === report.foremanId)
          && ["queued", "processing", "retry_wait", "failed"].includes(job.status),
      } : null,
    });
  },
);

router.post(
  "/reports/:reportId/photos/:photoId/pole-analysis/manual-fallback",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const reportId = parsePositiveId(req.params.reportId);
    const photoId = parsePositiveId(req.params.photoId);
    const idempotencyKey = parseIdempotencyKey(req.get("Idempotency-Key"));
    if (reportId === null || photoId === null) {
      res.status(400).json({ error: "Invalid report or photo identifier" });
      return;
    }
    if (!idempotencyKey) {
      res.status(400).json({ error: "A valid Idempotency-Key is required" });
      return;
    }

    try {
      const outcome = await db.transaction(async tx => {
        await tx.execute(sql`select id from daily_reports where id = ${reportId} for update`);
        const [report] = await tx.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
        if (!report) return { code: 404 as const, error: "Not found" };

        const [membership] = await tx.select().from(companyMembershipsTable).where(and(
          eq(companyMembershipsTable.companyId, report.companyId),
          eq(companyMembershipsTable.clerkUserId, req.clerkUserId!),
        ));
        if (!membership?.userId || membership.userId !== report.foremanId) {
          return { code: 403 as const, error: "Only the assigned foreman can continue manually" };
        }
        if (report.status !== "draft") return { code: 403 as const, error: "Cannot change analysis on a completed report" };

        const [photo] = await tx.select({ id: photosTable.id }).from(photosTable).where(and(
          eq(photosTable.id, photoId),
          eq(photosTable.reportId, reportId),
        ));
        if (!photo) return { code: 404 as const, error: "Photo not found on this report" };

        const [existingRun] = await tx.select({ id: poleAnalysisRunsTable.id }).from(poleAnalysisRunsTable).where(and(
          eq(poleAnalysisRunsTable.companyId, report.companyId),
          eq(poleAnalysisRunsTable.reportId, reportId),
          eq(poleAnalysisRunsTable.photoId, photoId),
        )).limit(1);
        if (existingRun) return { code: 409 as const, error: "Review the existing AI proposal instead of continuing manually" };

        const [jobIdentity] = await tx.select({ id: poleAnalysisJobsTable.id }).from(poleAnalysisJobsTable).where(and(
          eq(poleAnalysisJobsTable.companyId, report.companyId),
          eq(poleAnalysisJobsTable.reportId, reportId),
          eq(poleAnalysisJobsTable.photoId, photoId),
        )).orderBy(desc(poleAnalysisJobsTable.generation)).limit(1);
        if (!jobIdentity) return { code: 404 as const, error: "Pole analysis job not found" };

        await tx.execute(sql`select id from pole_analysis_jobs where id = ${jobIdentity.id} for update`);
        const [job] = await tx.select().from(poleAnalysisJobsTable).where(and(
          eq(poleAnalysisJobsTable.id, jobIdentity.id),
          eq(poleAnalysisJobsTable.companyId, report.companyId),
          eq(poleAnalysisJobsTable.reportId, reportId),
          eq(poleAnalysisJobsTable.photoId, photoId),
        ));
        if (!job) return { code: 404 as const, error: "Pole analysis job not found" };
        if (job.status === "cancelled") {
          if (job.manualFallbackIdempotencyKey !== idempotencyKey) {
            return { code: 409 as const, error: "Pole analysis was already cancelled by another request" };
          }
          return { code: 200 as const, value: { jobId: job.id, status: job.status, replayed: true } };
        }
        if (!["queued", "processing", "retry_wait", "failed"].includes(job.status)) {
          return { code: 409 as const, error: "Pole analysis can no longer be continued manually" };
        }

        const now = new Date();
        const [cancelled] = await tx.update(poleAnalysisJobsTable).set({
          status: "cancelled",
          manualFallbackIdempotencyKey: idempotencyKey,
          cancelledByUserId: membership.userId,
          cancelledAt: now,
          cancellationReason: "manual_fallback",
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
          updatedAt: now,
        }).where(and(
          eq(poleAnalysisJobsTable.id, job.id),
          eq(poleAnalysisJobsTable.status, job.status),
        )).returning();
        if (!cancelled) throw new Error("Pole analysis job changed during manual fallback");
        return { code: 200 as const, value: { jobId: cancelled.id, status: cancelled.status, replayed: false } };
      });

      if ("error" in outcome) { res.status(outcome.code).json({ error: outcome.error }); return; }
      res.status(outcome.code).json(outcome.value);
    } catch (error) {
      console.error("Pole analysis manual fallback failed", error);
      res.status(409).json({ error: "Could not continue manually; retry with the same request" });
    }
  },
);

router.get(
  "/reports/:reportId/pole-facts",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const reportId = parsePositiveId(req.params.reportId);
    if (reportId === null) { res.status(400).json({ error: "Invalid report identifier" }); return; }

    const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
    if (!report) { res.status(404).json({ error: "Not found" }); return; }
    const [membership] = await db.select().from(companyMembershipsTable).where(and(
      eq(companyMembershipsTable.companyId, report.companyId),
      eq(companyMembershipsTable.clerkUserId, req.clerkUserId),
    ));
    if (!membership || !canAccessReport(membership.role, membership.userId, report.foremanId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const facts = await db.select({
      photoId: reportPoleFactsTable.photoId,
      analysisRunId: reportPoleFactsTable.analysisRunId,
      analysisVersion: reportPoleFactsTable.analysisVersion,
      fieldKey: reportPoleFactsTable.fieldKey,
      value: reportPoleFactsTable.value,
      decisionAction: reportPoleFactsTable.decisionAction,
      confirmedByUserId: reportPoleFactsTable.confirmedByUserId,
      confirmedAt: reportPoleFactsTable.confirmedAt,
    }).from(reportPoleFactsTable).where(and(
      eq(reportPoleFactsTable.companyId, report.companyId),
      eq(reportPoleFactsTable.reportId, reportId),
    )).orderBy(desc(reportPoleFactsTable.confirmedAt), desc(reportPoleFactsTable.analysisRunId));
    res.json({ facts });
  },
);

router.get(
  "/reports/:reportId/photos/:photoId/pole-analysis/:analysisRunId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const reportId = parsePositiveId(req.params.reportId);
    const photoId = parsePositiveId(req.params.photoId);
    const analysisRunId = parsePositiveId(req.params.analysisRunId);
    if (reportId === null || photoId === null || analysisRunId === null) {
      res.status(400).json({ error: "Invalid report, photo, or analysis identifier" });
      return;
    }

    const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
    if (!report) { res.status(404).json({ error: "Not found" }); return; }
    const [membership] = await db.select().from(companyMembershipsTable).where(and(
      eq(companyMembershipsTable.companyId, report.companyId),
      eq(companyMembershipsTable.clerkUserId, req.clerkUserId),
    ));
    if (!membership || !canAccessReport(membership.role, membership.userId, report.foremanId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [photo] = await db.select({ id: photosTable.id }).from(photosTable).where(and(
      eq(photosTable.id, photoId),
      eq(photosTable.reportId, reportId),
    ));
    if (!photo) { res.status(404).json({ error: "Photo not found on this report" }); return; }
    const [run] = await db.select().from(poleAnalysisRunsTable).where(and(
      eq(poleAnalysisRunsTable.id, analysisRunId),
      eq(poleAnalysisRunsTable.companyId, report.companyId),
      eq(poleAnalysisRunsTable.reportId, reportId),
      eq(poleAnalysisRunsTable.photoId, photoId),
    ));
    if (!run) { res.status(404).json({ error: "Pole analysis not found" }); return; }

    res.json({
      ...await reviewResponseFor(run),
      canConfirm: Boolean(membership.userId && membership.userId === report.foremanId),
    });
  },
);

function responseFor(
  run: typeof poleAnalysisRunsTable.$inferSelect,
  decisions: Array<typeof poleAnalysisDecisionsTable.$inferSelect>,
  replayed: boolean,
) {
  return {
    analysisRunId: run.id,
    analysisId: run.analysisKey,
    version: run.version,
    status: run.status,
    confirmedAt: run.confirmedAt,
    replayed,
    decisions: decisions.map(decision => ({
      fieldKey: decision.fieldKey,
      action: decision.action,
      originalValue: decision.originalValue,
      finalValue: decision.finalValue,
      note: decision.note,
      actorUserId: decision.actorUserId,
      decidedAt: decision.decidedAt,
    })),
  };
}

router.post(
  "/reports/:reportId/photos/:photoId/pole-analysis/:analysisRunId/confirm",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const reportId = parsePositiveId(req.params.reportId);
    const photoId = parsePositiveId(req.params.photoId);
    const analysisRunId = parsePositiveId(req.params.analysisRunId);
    if (reportId === null || photoId === null || analysisRunId === null) {
      res.status(400).json({ error: "Invalid report, photo, or analysis identifier" });
      return;
    }

    let input;
    try {
      input = parsePoleAnalysisConfirmationRequest(req.body, req.get("Idempotency-Key"));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid confirmation request" });
      return;
    }

    try {
      const outcome = await db.transaction(async tx => {
        await tx.execute(sql`select id from daily_reports where id = ${reportId} for update`);
        const [report] = await tx.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId));
        if (!report) return { code: 404 as const, error: "Not found" };

        const [membership] = await tx.select().from(companyMembershipsTable).where(and(
          eq(companyMembershipsTable.companyId, report.companyId),
          eq(companyMembershipsTable.clerkUserId, req.clerkUserId!),
        ));
        if (!membership?.userId || membership.userId !== report.foremanId) {
          return { code: 403 as const, error: "Only the assigned foreman can confirm pole analysis" };
        }
        if (report.status !== "draft") return { code: 403 as const, error: "Cannot confirm analysis on a completed report" };

        const [photo] = await tx.select({ id: photosTable.id }).from(photosTable).where(and(
          eq(photosTable.id, photoId),
          eq(photosTable.reportId, reportId),
        ));
        if (!photo) return { code: 404 as const, error: "Photo not found on this report" };

        await tx.execute(sql`select id from pole_analysis_runs where id = ${analysisRunId} for update`);
        const [run] = await tx.select().from(poleAnalysisRunsTable).where(and(
          eq(poleAnalysisRunsTable.id, analysisRunId),
          eq(poleAnalysisRunsTable.companyId, report.companyId),
          eq(poleAnalysisRunsTable.reportId, reportId),
          eq(poleAnalysisRunsTable.photoId, photoId),
        ));
        if (!run) return { code: 404 as const, error: "Pole analysis not found" };

        const existingDecisions = await tx.select().from(poleAnalysisDecisionsTable)
          .where(eq(poleAnalysisDecisionsTable.analysisRunId, analysisRunId));
        if (run.status === "foreman_confirmed") {
          if (run.confirmationIdempotencyKey !== input.idempotencyKey) {
            return { code: 409 as const, error: "Pole analysis was already confirmed by another request" };
          }
          return { code: 200 as const, value: responseFor(run, existingDecisions, true) };
        }
        if (run.status !== "ai_proposed") return { code: 409 as const, error: "Pole analysis is no longer confirmable" };
        if (existingDecisions.length > 0) return { code: 409 as const, error: "Pole analysis has partial decision data" };

        const fields = await tx.select().from(poleAnalysisFieldsTable)
          .where(eq(poleAnalysisFieldsTable.analysisRunId, analysisRunId));
        const proposal: PoleAnalysisProposal = {
          analysisId: run.analysisKey,
          version: run.version,
          companyId: run.companyId,
          reportId: run.reportId,
          photoId: run.photoId,
          targetMatch: run.targetMatch as PoleAnalysisProposal["targetMatch"],
          targetEvidence: run.targetEvidence as PoleAnalysisProposal["targetEvidence"],
          status: "ai_proposed",
          model: {
            provider: run.modelProvider,
            model: run.modelName,
            modelVersion: run.modelVersion,
            promptVersion: run.promptVersion,
          },
          fields: fields.map(field => ({
            key: field.fieldKey as PoleAnalysisProposal["fields"][number]["key"],
            value: field.proposedValue as PoleAnalysisProposal["fields"][number]["value"],
            confidence: Number(field.confidence),
            state: "ai_proposed",
            evidence: field.evidence as PoleAnalysisProposal["fields"][number]["evidence"],
            reviewRequirement: field.reviewRequirement as PoleAnalysisProposal["fields"][number]["reviewRequirement"],
            ...(field.additionalPhotoRequest ? { additionalPhotoRequest: field.additionalPhotoRequest } : {}),
          })),
        };
        const confirmedAt = new Date();
        let confirmation;
        try {
          confirmation = confirmPoleAnalysis({
            proposal,
            context: { companyId: report.companyId, reportId, photoId, reportStatus: report.status },
            decisions: input.decisions,
            actorId: membership.userId,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            confirmedAt: confirmedAt.toISOString(),
          });
        } catch (error) {
          return { code: 409 as const, error: error instanceof Error ? error.message : "Confirmation conflict" };
        }

        const insertedDecisions = await tx.insert(poleAnalysisDecisionsTable).values(
          proposal.fields.map(field => {
            const decision = input.decisions.find(item => item.fieldKey === field.key)!;
            return {
              analysisRunId,
              fieldKey: field.key,
              action: decision.action,
              originalValue: field.value,
              finalValue: decision.action === "accept" ? field.value : decision.action === "edit" ? decision.editedValue! : null,
              note: decision.note ?? null,
              actorUserId: membership.userId!,
              decidedAt: confirmedAt,
            };
          }),
        ).returning();

        const confirmedFacts = insertedDecisions.filter(decision => decision.action !== "reject");
        if (confirmedFacts.length > 0) {
          await tx.insert(reportPoleFactsTable).values(confirmedFacts.map(decision => ({
            companyId: report.companyId,
            reportId,
            photoId,
            analysisRunId,
            analysisVersion: run.version,
            fieldKey: decision.fieldKey,
            value: decision.finalValue!,
            decisionAction: decision.action,
            confirmedByUserId: membership.userId!,
            confirmedAt,
          })));
        }

        const [updated] = await tx.update(poleAnalysisRunsTable).set({
          status: confirmation.status,
          confirmationIdempotencyKey: input.idempotencyKey,
          confirmedByUserId: membership.userId,
          confirmedAt,
        }).where(and(
          eq(poleAnalysisRunsTable.id, analysisRunId),
          eq(poleAnalysisRunsTable.status, "ai_proposed"),
          eq(poleAnalysisRunsTable.version, input.expectedVersion),
        )).returning();
        if (!updated) throw new Error("Pole analysis changed during confirmation");
        return { code: 200 as const, value: responseFor(updated, insertedDecisions, false) };
      });

      if ("error" in outcome) { res.status(outcome.code).json({ error: outcome.error }); return; }
      res.status(outcome.code).json(outcome.value);
    } catch (error) {
      console.error("Pole analysis confirmation failed", error);
      res.status(409).json({ error: "Pole analysis confirmation could not be committed" });
    }
  },
);

export default router;
