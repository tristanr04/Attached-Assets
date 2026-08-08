const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function parseIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value)
    ? value
    : null;
}

export function applicationLockKey(
  action: "report-template" | "work-package",
  userId: number,
  reportId: number,
  idempotencyKey: string,
): string {
  return `${action}:${userId}:${reportId}:${idempotencyKey}`;
}

export function photoUploadLockKey(
  companyId: number,
  idempotencyKey: string,
): string {
  return `pole-photo-upload:${companyId}:${idempotencyKey}`;
}
