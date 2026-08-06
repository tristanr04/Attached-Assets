import { pgTable, serial, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { crewsTable } from "./crews";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const reportTemplatesTable = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultCrewId: integer("default_crew_id").references(() => crewsTable.id, { onDelete: "set null" }),
  defaultProjectId: integer("default_project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  defaultCustomer: text("default_customer"),
  defaultWorkLocation: text("default_work_location"),
  defaultWorkPerformed: text("default_work_performed"),
  defaultSafetyNotes: text("default_safety_notes"),
  defaultNotes: text("default_notes"),
  // JSON arrays of template items: [{ name, trade, classification, laborClassificationId }]
  laborItems: jsonb("labor_items").default([]),
  // JSON arrays: [{ name, catalogEquipmentId, hours, quantity }]
  equipmentItems: jsonb("equipment_items").default([]),
  // JSON arrays: [{ name, quantity, unit, catalogMaterialId }]
  materialItems: jsonb("material_items").default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplate = typeof reportTemplatesTable.$inferSelect;
