/**
 * Parse a database identifier from an untrusted Express route or query value.
 *
 * Arrays are rejected rather than silently selecting one value, and partial
 * numeric strings such as "12abc" are rejected rather than truncated.
 */
export function parsePositiveId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

export function selectCompanyMembership<
  T extends { companyId: number; role: string },
>(
  memberships: readonly T[],
  requestedCompanyId: number | null,
  allowedRoles?: readonly string[],
): T | null {
  const membership = requestedCompanyId === null
    ? allowedRoles
      ? memberships.find((item) => allowedRoles.includes(item.role))
      : memberships[0]
    : memberships.find((item) => item.companyId === requestedCompanyId);

  if (!membership) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    return null;
  }

  return membership;
}
