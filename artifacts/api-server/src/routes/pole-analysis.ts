import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  companyMembershipsTable,
  dailyReportsTable,
  db,
  photosTable,
  poleAnalysisDecisionsTable,
  poleAnalysisFieldsTable,
  poleAnalysisRunsTable,
} from "@workspace/db";

import {
  confirmPoleAnalysis,
  parsePoleAnalysisConfirmationRequest,
  type PoleAnalysisProposal,
} from "../lib/poleAnalysisContract";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { parsePositiveId } from "../lib/requestValues";

const router: IRouter = Router();

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
