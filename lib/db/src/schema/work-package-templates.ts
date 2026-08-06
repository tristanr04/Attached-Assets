import { pgTable, serial, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const workPackageTemplatesTable = pgTable("work_package_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  billingCode: text("billing_code"),
  // JSON arrays following the same shape as template items
  laborItems: jsonb("labor_items").default([]),    // [{ trade, classification, laborClassificationId, hours }]
  equipmentItems: jsonb("equipment_items").default([]), // [{ name, catalogEquipmentId, hours, quantity }]
  materialItems: jsonb("material_items").default([]),   // [{ name, quantity, unit, catalogMaterialId }]
  safetyChecklist: jsonb("safety_checklist").default([]), // string[]
  requiredDocumentation: jsonb("required_documentation").default([]), // string[]
  defaultNotes: text("default_notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkPackageTemplateSchema = createInsertSchema(workPackageTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkPackageTemplate = z.infer<typeof insertWorkPackageTemplateSchema>;
export type WorkPackageTemplate = typeof workPackageTemplatesTable.$inferSelect;
