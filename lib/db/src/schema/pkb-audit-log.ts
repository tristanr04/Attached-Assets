import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const pkbAuditLogTable = pgTable("pkb_audit_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  action: text("action").notNull(), // created, updated, activated, archived, import_performed, training_approval_changed, etc.
  entityType: text("entity_type").notNull(), // pole_type, structure_config, component, work_action, work_package, billing_mapping, visual_reference, import_job, training_example
  entityId: integer("entity_id"),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  metadata: jsonb("metadata"), // extra context (import file name, etc.)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PkbAuditLog = typeof pkbAuditLogTable.$inferSelect;
