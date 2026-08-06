import { pgTable, serial, integer, text, boolean, date, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { pkbVersionStatusEnum } from "./pkb-pole-types";

export const pkbBillingMappingsTable = pgTable("pkb_billing_mappings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  projectScope: text("project_scope"),
  // Links (soft refs by code to allow flexibility)
  workActionCode: text("work_action_code"),
  componentCode: text("component_code"),
  poleTypeCode: text("pole_type_code"),
  structureConfigCode: text("structure_config_code"),
  // Billing
  billingCode: text("billing_code").notNull(),
  description: text("description"),
  unitType: text("unit_type"),   // each, hour, day, lump_sum, per_foot, etc.
  defaultQuantity: real("default_quantity"),
  minQuantity: real("min_quantity"),
  maxQuantity: real("max_quantity"),
  unitRate: real("unit_rate"),
  rateSource: text("rate_source"),
  effectiveDate: date("effective_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }),
  // Modifiers
  stormModifier: real("storm_modifier"),
  emergencyModifier: real("emergency_modifier"),
  mobilizationRequired: boolean("mobilization_required").default(false),
  documentationRequired: text("documentation_required"),
  approvalRequired: boolean("approval_required").default(false),
  // Versioning
  version: integer("version").notNull().default(1),
  versionStatus: pkbVersionStatusEnum("version_status").notNull().default("active"),
  versionGroupId: integer("version_group_id"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbBillingMappingSchema = createInsertSchema(pkbBillingMappingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbBillingMapping = z.infer<typeof insertPkbBillingMappingSchema>;
export type PkbBillingMapping = typeof pkbBillingMappingsTable.$inferSelect;
