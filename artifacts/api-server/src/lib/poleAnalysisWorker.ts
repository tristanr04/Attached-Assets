import {
  validatePoleAnalysisProposal,
  type PoleAnalysisContext,
  type PoleAnalysisProposal,
} from "./poleAnalysisContract";

export interface LeasedPoleAnalysisJob {
  id: number;
  companyId: number;
  reportId: number;
  photoId: number;
  requestKey: string;
  generation: number;
  attemptCount: number;
  maxAttempts: number;
  leaseToken: string;
}

export interface PoleAnalysisWorkerContext extends PoleAnalysisContext {
  photoUrl: string;
  companyProfiles: unknown[];
  companyTypeCatalog: unknown[];
}

export interface PoleAnalysisProvider {
  analyze(context: Readonly<PoleAnalysisWorkerContext>, signal: AbortSignal): Promise<PoleAnalysisProposal>;
}

export interface PoleAnalysisWorkerStore {
  /** Must atomically claim at most one available row using a non-expired lease. */
  leaseNext(input: { workerId: string; now: Date; leaseMs: number }): Promise<LeasedPoleAnalysisJob | null>;
  /** Must return only data scoped to every identifier on the leased job. */
  loadContext(job: LeasedPoleAnalysisJob): Promise<PoleAnalysisWorkerContext | null>;
  /** Must compare the lease token and commit the proposal plus terminal job update atomically. */
  commitProposal(input: {
    job: LeasedPoleAnalysisJob;
    proposal: PoleAnalysisProposal;
    completedAt: Date;
  }): Promise<"committed" | "stale_lease">;
  /** Must compare the lease token; errorCode is deliberately non-sensitive. */
  recordFailure(input: {
    job: LeasedPoleAnalysisJob;
    status: "retry_wait" | "failed" | "cancelled";
    errorCode: PoleAnalysisWorkerErrorCode;
    retryAt?: Date;
    failedAt: Date;
  }): Promise<"recorded" | "stale_lease">;
}

export type PoleAnalysisWorkerErrorCode =
  | "scope_mismatch"
  | "locked_report"
  | "provider_timeout"
  | "provider_unavailable"
  | "invalid_provider_output"
  | "provider_failure";

export class PoleAnalysisProviderError extends Error {
  constructor(
    public readonly code: "provider_unavailable" | "provider_failure",
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

export type PoleAnalysisWorkerResult =
  | { status: "disabled" | "idle" }
  | { status: "succeeded" | "stale_lease"; jobId: number }
  | { status: "retry_scheduled" | "failed" | "cancelled"; jobId: number; errorCode: PoleAnalysisWorkerErrorCode };

const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function retryDelayMs(attemptCount: number): number {
  return Math.min(15 * 60_000, 30_000 * (2 ** Math.max(0, attemptCount - 1)));
}

async function analyzeWithTimeout(
  provider: PoleAnalysisProvider,
  context: PoleAnalysisWorkerContext,
  timeoutMs: number,
): Promise<PoleAnalysisProposal> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.analyze(Object.freeze(context), controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("provider_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function contextMatches(job: LeasedPoleAnalysisJob, context: PoleAnalysisWorkerContext): boolean {
  return context.companyId === job.companyId
    && context.reportId === job.reportId
    && context.photoId === job.photoId;
}

export async function runPoleAnalysisWorkerOnce(input: {
  enabled: boolean;
  workerId: string;
  store: PoleAnalysisWorkerStore;
  provider: PoleAnalysisProvider;
  now?: Date;
  leaseMs?: number;
  timeoutMs?: number;
}): Promise<PoleAnalysisWorkerResult> {
  if (!input.enabled) return { status: "disabled" };
  if (!WORKER_ID.test(input.workerId)) throw new Error("A bounded worker identity is required");

  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? 60_000;
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) throw new Error("Invalid worker lease duration");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > leaseMs) throw new Error("Invalid provider timeout");

  const job = await input.store.leaseNext({ workerId: input.workerId, now, leaseMs });
  if (!job) return { status: "idle" };

  const fail = async (
    status: "retry_wait" | "failed" | "cancelled",
    errorCode: PoleAnalysisWorkerErrorCode,
    retryAt?: Date,
  ): Promise<PoleAnalysisWorkerResult> => {
    const recorded = await input.store.recordFailure({ job, status, errorCode, retryAt, failedAt: now });
    if (recorded === "stale_lease") return { status: "stale_lease", jobId: job.id };
    return {
      status: status === "retry_wait" ? "retry_scheduled" : status,
      jobId: job.id,
      errorCode,
    };
  };

  const context = await input.store.loadContext(job);
  if (!context || !contextMatches(job, context)) return fail("failed", "scope_mismatch");
  if (context.reportStatus !== "draft") return fail("cancelled", "locked_report");

  try {
    const proposal = await analyzeWithTimeout(input.provider, context, timeoutMs);
    const validation = validatePoleAnalysisProposal(proposal, context);
    if (!validation.ok || proposal.version !== job.generation) return fail("failed", "invalid_provider_output");
    const committed = await input.store.commitProposal({ job, proposal, completedAt: now });
    return { status: committed === "committed" ? "succeeded" : "stale_lease", jobId: job.id };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "provider_timeout";
    const providerError = error instanceof PoleAnalysisProviderError ? error : null;
    const errorCode: PoleAnalysisWorkerErrorCode = timedOut
      ? "provider_timeout"
      : providerError?.code ?? "provider_failure";
    const retryable = timedOut || providerError?.retryable === true;
    if (retryable && job.attemptCount < job.maxAttempts) {
      return fail("retry_wait", errorCode, new Date(now.getTime() + retryDelayMs(job.attemptCount)));
    }
    return fail("failed", errorCode);
  }
}
