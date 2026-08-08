import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  dailyReportsTable,
  db,
  photosTable,
  poleAnalysisFieldsTable,
  poleAnalysisJobsTable,
  poleAnalysisRunsTable,
  poleProfilesTable,
  poleTypeCatalogItemsTable,
} from "@workspace/db";

import type {
  LeasedPoleAnalysisJob,
  PoleAnalysisWorkerContext,
  PoleAnalysisWorkerStore,
} from "./poleAnalysisWorker";

type ClaimedRow = {
  id: number;
  company_id: number;
  report_id: number;
  photo_id: number;
  request_key: string;
  generation: number;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string;
};

function claimedJob(row: ClaimedRow): LeasedPoleAnalysisJob {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    reportId: Number(row.report_id),
    photoId: Number(row.photo_id),
    requestKey: row.request_key,
    generation: Number(row.generation),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    leaseToken: row.lease_owner,
  };
}

export const postgresPoleAnalysisWorkerStore: PoleAnalysisWorkerStore = {
  async leaseNext({ workerId, now, leaseMs }) {
    const leaseToken = `${workerId}:${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const result = await db.execute(sql`
      with candidate as (
        select id
        from pole_analysis_jobs
        where attempt_count < max_attempts
          and (
            (status in ('queued', 'retry_wait') and available_at <= ${now})
            or (status = 'processing' and lease_expires_at < ${now})
          )
        order by available_at asc, id asc
        for update skip locked
        limit 1
      )
      update pole_analysis_jobs as job
      set status = 'processing',
          attempt_count = job.attempt_count + 1,
          lease_owner = ${leaseToken},
          lease_expires_at = ${leaseExpiresAt},
          updated_at = ${now}
      from candidate
      where job.id = candidate.id
      returning job.id, job.company_id, job.report_id, job.photo_id,
                job.request_key, job.generation, job.attempt_count,
                job.max_attempts, job.lease_owner
    `);
    const row = result.rows[0] as ClaimedRow | undefined;
    return row ? claimedJob(row) : null;
  },

  async loadContext(job): Promise<PoleAnalysisWorkerContext | null> {
    const [report] = await db.select().from(dailyReportsTable).where(and(
      eq(dailyReportsTable.id, job.reportId),
      eq(dailyReportsTable.companyId, job.companyId),
    ));
    const [photo] = await db.select().from(photosTable).where(and(
      eq(photosTable.id, job.photoId),
      eq(photosTable.reportId, job.reportId),
    ));
    if (!report || !photo) return null;

    const [companyProfiles, companyTypeCatalog] = await Promise.all([
      db.select().from(poleProfilesTable).where(and(
        eq(poleProfilesTable.companyId, job.companyId),
        eq(poleProfilesTable.active, true),
      )),
      db.select().from(poleTypeCatalogItemsTable).where(and(
        eq(poleTypeCatalogItemsTable.companyId, job.companyId),
        eq(poleTypeCatalogItemsTable.active, true),
      )),
    ]);
    return {
      companyId: job.companyId,
      reportId: job.reportId,
      photoId: job.photoId,
      reportStatus: report.status,
      photoUrl: photo.url,
      companyProfiles,
      companyTypeCatalog,
    };
  },

  async commitProposal({ job, proposal, completedAt }) {
    return db.transaction(async tx => {
      await tx.execute(sql`select id from pole_analysis_jobs where id = ${job.id} for update`);
      const [current] = await tx.select().from(poleAnalysisJobsTable).where(and(
        eq(poleAnalysisJobsTable.id, job.id),
        eq(poleAnalysisJobsTable.companyId, job.companyId),
        eq(poleAnalysisJobsTable.reportId, job.reportId),
        eq(poleAnalysisJobsTable.photoId, job.photoId),
        eq(poleAnalysisJobsTable.status, "processing"),
        eq(poleAnalysisJobsTable.leaseOwner, job.leaseToken),
      ));
      if (!current || !current.leaseExpiresAt || current.leaseExpiresAt < completedAt) return "stale_lease" as const;

      await tx.execute(sql`select id from daily_reports where id = ${job.reportId} for update`);
      const [report] = await tx.select().from(dailyReportsTable).where(and(
        eq(dailyReportsTable.id, job.reportId),
        eq(dailyReportsTable.companyId, job.companyId),
        eq(dailyReportsTable.status, "draft"),
      ));
      if (!report) return "stale_lease" as const;

      const [existingVersion] = await tx.select({ version: poleAnalysisRunsTable.version })
        .from(poleAnalysisRunsTable)
        .where(eq(poleAnalysisRunsTable.photoId, job.photoId))
        .orderBy(desc(poleAnalysisRunsTable.version))
        .limit(1);
      if (existingVersion && existingVersion.version >= proposal.version) return "stale_lease" as const;

      const [run] = await tx.insert(poleAnalysisRunsTable).values({
        companyId: job.companyId,
        reportId: job.reportId,
        photoId: job.photoId,
        analysisKey: proposal.analysisId,
        version: proposal.version,
        status: "ai_proposed",
        targetMatch: proposal.targetMatch,
        modelProvider: proposal.model.provider,
        modelName: proposal.model.model,
        modelVersion: proposal.model.modelVersion,
        promptVersion: proposal.model.promptVersion,
        rawResult: proposal,
        targetEvidence: proposal.targetEvidence,
        limitations: [],
        idempotencyKey: job.requestKey,
      }).returning({ id: poleAnalysisRunsTable.id });
      await tx.insert(poleAnalysisFieldsTable).values(proposal.fields.map(field => ({
        analysisRunId: run.id,
        fieldKey: field.key,
        proposedValue: field.value,
        confidence: String(field.confidence),
        evidence: field.evidence,
        reviewRequirement: field.reviewRequirement,
        additionalPhotoRequest: field.additionalPhotoRequest ?? null,
      })));
      const [updated] = await tx.update(poleAnalysisJobsTable).set({
        status: "succeeded",
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt,
        updatedAt: completedAt,
      }).where(and(
        eq(poleAnalysisJobsTable.id, job.id),
        eq(poleAnalysisJobsTable.status, "processing"),
        eq(poleAnalysisJobsTable.leaseOwner, job.leaseToken),
      )).returning({ id: poleAnalysisJobsTable.id });
      return updated ? "committed" as const : "stale_lease" as const;
    });
  },

  async recordFailure({ job, status, errorCode, retryAt, failedAt }) {
    const [updated] = await db.update(poleAnalysisJobsTable).set({
      status,
      availableAt: retryAt ?? failedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: errorCode,
      lastErrorAt: failedAt,
      completedAt: status === "retry_wait" ? null : failedAt,
      updatedAt: failedAt,
    }).where(and(
      eq(poleAnalysisJobsTable.id, job.id),
      eq(poleAnalysisJobsTable.companyId, job.companyId),
      eq(poleAnalysisJobsTable.status, "processing"),
      eq(poleAnalysisJobsTable.leaseOwner, job.leaseToken),
    )).returning({ id: poleAnalysisJobsTable.id });
    return updated ? "recorded" : "stale_lease";
  },
};
