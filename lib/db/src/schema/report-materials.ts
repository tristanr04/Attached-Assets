import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily-reports";
import { catalogMaterialsTable } from "./catalog-materials";

export const reportMaterialsTable = pgTable("report_materials", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  catalogMaterialId: integer("catalog_material_id").references(() => catalogMaterialsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: text("unit").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportMaterialSchema = createInsertSchema(reportMaterialsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportMaterial = z.infer<typeof insertReportMaterialSchema>;
export type ReportMaterial = typeof reportMaterialsTable.$inferSelect;
