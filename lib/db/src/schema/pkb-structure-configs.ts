import { pgTable, serial, integer, text, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { pkbVersionStatusEnum } from "./pkb-pole-types";

export const pkbStructureConfigsTable = pgTable("pkb_structure_configs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  constructionStandard: text("construction_standard"),
  phases: integer("phases"),
  conductorArrangement: text("conductor_arrangement"),
  neutralArrangement: text("neutral_arrangement"),
  crossarmConfig: text("crossarm_config"),
  insulatorConfig: text("insulator_config"),
  bracing: text("bracing"),
  deadEndConfig: text("dead_end_config"),
  jumperConfig: text("jumper_config"),
  guyingRequirements: text("guying_requirements"),
  groundingRequirements: text("grounding_requirements"),
  // JSONB arrays of linked items (codes/names)
  attachedEquipment: jsonb("attached_equipment"),
  standardMaterials: jsonb("standard_materials"),
  standardWorkActions: jsonb("standard_work_actions"),
  requiredEquipment: jsonb("required_equipment"),
  requiredPhotos: jsonb("required_photos"),   // [{ category, label, required: bool }]
  requiredForms: jsonb("required_forms"),
  visualReferenceIds: jsonb("visual_reference_ids"),
  diagramUrl: text("diagram_url"),
  // Metadata
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  territory: text("territory"),
  effectiveDate: date("effective_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }),
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

export const insertPkbStructureConfigSchema = createInsertSchema(pkbStructureConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbStructureConfig = z.infer<typeof insertPkbStructureConfigSchema>;
export type PkbStructureConfig = typeof pkbStructureConfigsTable.$inferSelect;
