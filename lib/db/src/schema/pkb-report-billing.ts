import { pgEnum, pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { dailyReportsTable } from "./daily-reports";

export const reportBillingStatusEnum = pgEnum("report_billing_status", [
  "pending_review", "approved", "rejected", "returned_to_foreman"
]);

export const reportBillingSuggestionsTable = pgTable("report_billing_suggestions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  workPackageId: integer("work_package_id"),
  // Suggested items from the engine
  suggestedItems: jsonb("suggested_items"),  // [{billingCode, description, quantity, unitRate, subtotal, source, ruleId?, confidence?}]
  // Reviewer edits
  reviewerEdits: jsonb("reviewer_edits"),    // same shape as suggestedItems — final approved list
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  returnedTo: integer("returned_to"),
  returnNote: text("return_note"),
  status: reportBillingStatusEnum("status").notNull().default("pending_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const reportBillingValidationsTable = pgTable("report_billing_validations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  runBy: integer("run_by"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(), // "clean", "warnings", "errors"
  findings: jsonb("findings"),       // [{severity, code, message, suggestedAction, relatedBillingCode?, relatedWorkAction?, ruleId?}]
  acknowledgements: jsonb("acknowledgements"), // [{findingCode, acknowledgedBy, acknowledgedAt, note}]
  isActive: boolean("is_active").notNull().default(true), // latest run
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportBillingSuggestion = typeof reportBillingSuggestionsTable.$inferSelect;
export type ReportBillingValidation = typeof reportBillingValidationsTable.$inferSelect;
