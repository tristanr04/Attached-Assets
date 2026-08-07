export type ReportInitializationMode = "blank" | "copy-yesterday" | "template";

export interface ReportSummary {
  id: number;
  reportDate: string;
  status: string;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function buildInitializationKey(
  mode: ReportInitializationMode,
  reportDate: string,
  sourceId: number | null,
  nonce: string,
): string {
  const safeNonce = nonce.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  if (safeNonce.length < 8) {
    throw new Error("Unable to create a safe retry key");
  }
  return `${mode}:${reportDate}:${sourceId ?? "new"}:${safeNonce}`.slice(0, 128);
}

export async function requestJson<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : typeof body === "string" && body.trim()
        ? body
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}
