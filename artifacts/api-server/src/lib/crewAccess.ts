export function canManageCrew(
  role: string,
  userId: number | null,
  crewForemanId: number | null,
): boolean {
  return role === "admin"
    || role === "supervisor"
    || (role === "foreman" && userId !== null && userId === crewForemanId);
}
