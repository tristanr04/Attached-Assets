import { z } from 'zod';

export const reportStep1Schema = z.object({
  reportDate: z.string().min(1, 'Date is required'),
  projectId: z.coerce.number().optional().nullable(),
  crewId: z.coerce.number().optional().nullable(),
  workLocation: z.string().optional().nullable(),
  generalForeman: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  stopTime: z.string().optional().nullable(),
});

export const reportStep5Schema = z.object({
  workPerformed: z.string().optional().nullable(),
  structuresInstalled: z.string().optional().nullable(),
  weatherConditions: z.string().optional().nullable(),
  delays: z.string().optional().nullable(),
  outages: z.string().optional().nullable(),
  customerIssues: z.string().optional().nullable(),
  safetyMeeting: z.boolean().default(false),
  safetyNotes: z.string().optional().nullable(),
  injuries: z.boolean().default(false),
  injuryDetails: z.string().optional().nullable(),
  additionalNotes: z.string().optional().nullable(),
});
