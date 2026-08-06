import { pgTable, serial, integer, text, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { pkbVersionStatusEnum } from "./pkb-pole-types";

export const pkbWorkPackagesTable = pgTable("pkb_work_packages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  // Identification
  name: text("name").notNull(),
  code: text("code").notNull(),
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  projectType: text("project_type"),
  territory: text("territory"),
  effectiveDate: date("effective_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }),
  // Pole requirements
  poleTypeId: integer("pole_type_id"),       // FK to pkb_pole_types (soft ref - allows null)
  structureConfigId: integer("structure_config_id"), // FK to pkb_structure_configs (soft ref)
  poleMaterial: text("pole_material"),
  poleHeight: text("pole_height"),
  poleClass: text("pole_class"),
  accessType: text("access_type"),
  // Complex JSONB fields
  expectedWork: jsonb("expected_work"),      // [{workActionCode, required|optional|conditional, conditions?, defaultQty, minQty, maxQty}]
  resources: jsonb("resources"),             // {laborClassifications, equipment, materials, mobilization, demobilization}
  documentation: jsonb("documentation"),    // {requiredPhotos:[{category,label}], requiredForms, gpsRequired, signatureRequired, customerSignoffRequired}
  billing: jsonb("billing"),                 // {requiredCodes:[{code,description,minCharge}], suggestedCodes, optionalCodes, rateRules}
  // Versioning
  version: integer("version").notNull().default(1),
  versionStatus: pkbVersionStatusEnum("version_status").notNull().default("draft"),
  versionGroupId: integer("version_group_id"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbWorkPackageSchema = createInsertSchema(pkbWorkPackagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbWorkPackage = z.infer<typeof insertPkbWorkPackageSchema>;
export type PkbWorkPackage = typeof pkbWorkPackagesTable.$inferSelect;
