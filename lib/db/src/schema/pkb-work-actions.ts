import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { pkbVersionStatusEnum } from "./pkb-pole-types";

export const pkbWorkActionsTable = pgTable("pkb_work_actions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  componentCode: text("component_code"), // links to pkb_components.code
  actionType: text("action_type").notNull(), // install, replace, remove, transfer, etc.
  description: text("description"),
  visibleEvidence: text("visible_evidence"),
  nonVisibleEvidence: text("non_visible_evidence"),
  defaultQuantityRule: text("default_quantity_rule"), // e.g. "1 per pole", "count visible"
  requiresHumanConfirmation: boolean("requires_human_confirmation").notNull().default(true),
  relatedBillingCodes: jsonb("related_billing_codes"), // [{code, description}]
  requiredDocumentation: jsonb("required_documentation"), // [{name, type}]
  requiredEquipment: jsonb("required_equipment"),
  requiredMaterials: jsonb("required_materials"),
  requiredQualifications: text("required_qualifications"),
  customerScope: text("customer_scope"),
  contractScope: text("contract_scope"),
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  notes: text("notes"),
  // Versioning
  version: integer("version").notNull().default(1),
  versionStatus: pkbVersionStatusEnum("version_status").notNull().default("draft"),
  versionGroupId: integer("version_group_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbWorkActionSchema = createInsertSchema(pkbWorkActionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbWorkAction = z.infer<typeof insertPkbWorkActionSchema>;
export type PkbWorkAction = typeof pkbWorkActionsTable.$inferSelect;
