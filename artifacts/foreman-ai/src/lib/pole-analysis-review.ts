export type PoleDecisionAction = "accept" | "edit" | "reject";

export function buildPoleConfirmationKey(
  analysisRunId: number,
  version: number,
  nonce: string,
): string {
  const safeNonce = nonce.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  if (!Number.isSafeInteger(analysisRunId) || analysisRunId <= 0) throw new Error("Invalid analysis run");
  if (!Number.isSafeInteger(version) || version <= 0) throw new Error("Invalid analysis version");
  if (safeNonce.length < 8) throw new Error("Unable to create a safe confirmation key");
  return `confirm:${analysisRunId}:${version}:${safeNonce}`.slice(0, 128);
}

export function displayPoleValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "Not detected";
  return JSON.stringify(value, null, 2);
}

export function parseEditedPoleValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function reviewedFieldCount(
  fieldKeys: string[],
  decisions: Record<string, { action: PoleDecisionAction } | undefined>,
): number {
  return fieldKeys.filter(key => Boolean(decisions[key])).length;
}
