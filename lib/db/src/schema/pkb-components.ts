import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { pkbVersionStatusEnum } from "./pkb-pole-types";

export const pkbComponentsTable = pgTable("pkb_components", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  aliases: text("aliases").array(),
  category: text("category").notNull(), // e.g. "pole_and_framing", "transformer_equipment", "guying_anchors", etc.
  subcategory: text("subcategory"),
  visualDescription: text("visual_description"),
  commonVariations: text("common_variations"),
  allowedQuantity: text("allowed_quantity"), // e.g. "1", "1-3", "any"
  customerStandard: text("customer_standard"),
  relatedWorkActions: jsonb("related_work_actions"),  // [{code, name}]
  relatedMaterials: jsonb("related_materials"),
  recognitionExamples: jsonb("recognition_examples"), // [{description, notes}]
  negativeExamples: jsonb("negative_examples"),
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

export const insertPkbComponentSchema = createInsertSchema(pkbComponentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbComponent = z.infer<typeof insertPkbComponentSchema>;
export type PkbComponent = typeof pkbComponentsTable.$inferSelect;
