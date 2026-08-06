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
