const MUTABLE_REPORT_FIELDS = [
  "projectId",
  "crewId",
  "reportDate",
  "workLocation",
  "generalForeman",
  "startTime",
  "stopTime",
  "weatherConditions",
  "workPerformed",
  "structuresInstalled",
  "safetyMeeting",
  "safetyNotes",
  "delays",
  "outages",
  "customerIssues",
  "injuries",
  "injuryDetails",
  "additionalNotes",
] as const;

export function pickMutableReportFields(
  body: unknown,
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const input = body as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const key of MUTABLE_REPORT_FIELDS) {
    if (input[key] !== undefined) {
      fields[key] = input[key];
    }
  }
  return fields;
}
