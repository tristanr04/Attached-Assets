import { pgEnum, pgTable, serial, integer, text, boolean, date, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const pkbVersionStatusEnum = pgEnum("pkb_version_status", ["draft", "active", "archived"]);
export const pkbPoleMaterialEnum = pgEnum("pkb_pole_material", ["wood", "steel", "concrete", "composite", "other"]);
export const pkbOperationalClassEnum = pgEnum("pkb_operational_class", [
  "distribution", "transmission", "subtransmission", "streetlight",
  "service", "communication", "joint_use", "temporary", "storm_restoration", "other"
]);
export const pkbAccessTypeEnum = pgEnum("pkb_access_type", [
  "roadside", "backyard", "alley", "off_road", "urban", "rural",
  "restricted_access", "easement", "wetland", "mountainous", "custom"
]);

export const pkbPoleTypesTable = pgTable("pkb_pole_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  // Identification
  name: text("name").notNull(),
  code: text("code").notNull(),
  utilityPoleTypeId: text("utility_pole_type_id"),
  customerStandardId: text("customer_standard_id"),
  constructionStandardNumber: text("construction_standard_number"),
  templateName: text("template_name"),
  description: text("description"),
  aliases: text("aliases").array(),
  searchKeywords: text("search_keywords"),
  // Physical
  material: pkbPoleMaterialEnum("material"),
  nominalHeight: integer("nominal_height"),
  heightRange: text("height_range"),
  poleClass: text("pole_class"),
  species: text("species"),
  manufacturer: text("manufacturer"),
  shape: text("shape"),
  color: text("color"),
  treatment: text("treatment"),
  embedmentStandard: text("embedment_standard"),
  topDiameter: real("top_diameter"),
  groundlineCircumference: real("groundline_circumference"),
  customSpecifications: text("custom_specifications"),
  // Operational
  operationalClass: pkbOperationalClassEnum("operational_class"),
  // Location
  accessType: pkbAccessTypeEnum("access_type"),
  // Metadata
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  territory: text("territory"),
  effectiveDate: date("effective_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }),
  // Versioning
  version: integer("version").notNull().default(1),
  versionStatus: pkbVersionStatusEnum("version_status").notNull().default("draft"),
  versionGroupId: integer("version_group_id"), // links all versions of same logical record
  isActive: boolean("is_active").notNull().default(true),
  // Custom fields
  customAttributes: jsonb("custom_attributes"),
  notes: text("notes"),
  // Audit
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbPoleTypeSchema = createInsertSchema(pkbPoleTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbPoleType = z.infer<typeof insertPkbPoleTypeSchema>;
export type PkbPoleType = typeof pkbPoleTypesTable.$inferSelect;
