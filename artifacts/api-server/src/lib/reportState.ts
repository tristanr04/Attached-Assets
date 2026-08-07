export type ReportMutationRole = "admin" | "supervisor" | "foreman" | string;

export function canAccessReport(
  role: ReportMutationRole,
  membershipUserId: number | null,
  reportForemanId: number | null,
): boolean {
  if (role === "admin" || role === "supervisor") {
    return true;
  }

  return role === "foreman"
    && membershipUserId !== null
    && reportForemanId === membershipUserId;
}

export function canMutateReport(
  status: string,
  role: ReportMutationRole,
): boolean {
  return status !== "complete" || role !== "foreman";
}

export function completionUpdate(
  status: string,
  completedAt: Date | null,
  now: Date,
): { status: "complete"; completedAt: Date } | null {
  if (status === "complete") {
    return null;
  }

  return { status: "complete", completedAt: completedAt ?? now };
}
