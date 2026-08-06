import { pgEnum, pgTable, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { dailyReportsTable } from "./daily-reports";

export const pkbTrainingStatusEnum = pgEnum("pkb_training_status", [
  "unreviewed",
  "foreman_reviewed",
  "expert_verified",
  "rejected",
  "evaluation_approved",
  "training_approved"
]);

export const pkbTrainingExamplesTable = pgTable("pkb_training_examples", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  reportId: integer("report_id").references(() => dailyReportsTable.id, { onDelete: "set null" }),
  // Photos submitted for analysis (list of photo IDs or base64 refs)
  photoIds: jsonb("photo_ids"),
  // AI output — stored verbatim
  modelSuggestion: jsonb("model_suggestion"),
  modelVersion: integer("model_version"),
  // Human corrections
  foremanCorrections: jsonb("foreman_corrections"),
  foremanReviewedAt: timestamp("foreman_reviewed_at", { withTimezone: true }),
  supervisorCorrections: jsonb("supervisor_corrections"),
  expertVerification: jsonb("expert_verification"),
  expertReviewedAt: timestamp("expert_reviewed_at", { withTimezone: true }),
  expertReviewedBy: integer("expert_reviewed_by"),
  // Status lifecycle
  status: pkbTrainingStatusEnum("status").notNull().default("unreviewed"),
  rejectionReason: integer("rejection_reason"),
  // Approvals
  approvedForEvaluation: boolean("approved_for_evaluation").notNull().default(false),
  approvedForEvaluationAt: timestamp("approved_for_evaluation_at", { withTimezone: true }),
  approvedForTraining: boolean("approved_for_training").notNull().default(false),
  approvedForTrainingAt: timestamp("approved_for_training_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PkbTrainingExample = typeof pkbTrainingExamplesTable.$inferSelect;
