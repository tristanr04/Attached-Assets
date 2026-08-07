const DEFAULT_MAX_PHOTO_BYTES = 7 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  "image/jpeg": (bytes) =>
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff,
  "image/png": (bytes) =>
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
  "image/webp": (bytes) =>
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP",
};

export type PhotoDataUrlValidation =
  | { valid: true; mimeType: string; size: number }
  | { valid: false; error: string };

function sizeLimitLabel(maxBytes: number): string {
  const megabytes = maxBytes / (1024 * 1024);
  return Number.isInteger(megabytes)
    ? `${megabytes} MB`
    : `${maxBytes} bytes`;
}

export function validatePhotoDataUrl(
  value: unknown,
  maxBytes = DEFAULT_MAX_PHOTO_BYTES,
): PhotoDataUrlValidation {
  if (typeof value !== "string") {
    return { valid: false, error: "Photo must be a base64 image data URL" };
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) {
    return { valid: false, error: "Photo must be a JPEG, PNG, or WebP data URL" };
  }

  const [, mimeType, payload] = match;
  if (payload.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    return { valid: false, error: `Image exceeds the ${sizeLimitLabel(maxBytes)} limit` };
  }

  const bytes = Buffer.from(payload, "base64");
  const canonicalPayload = bytes.toString("base64").replace(/=+$/, "");
  if (canonicalPayload !== payload.replace(/=+$/, "")) {
    return { valid: false, error: "Photo contains invalid base64 data" };
  }
  if (bytes.length === 0 || bytes.length > maxBytes) {
    return { valid: false, error: `Image exceeds the ${sizeLimitLabel(maxBytes)} limit` };
  }
  if (!SIGNATURES[mimeType](bytes)) {
    return { valid: false, error: "Photo content does not match its declared type" };
  }

  return { valid: true, mimeType, size: bytes.length };
}

export function validateSignatureDataUrl(
  value: unknown,
): PhotoDataUrlValidation {
  return validatePhotoDataUrl(value, MAX_SIGNATURE_BYTES);
}
