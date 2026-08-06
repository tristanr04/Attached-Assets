import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily-reports";
import { catalogEquipmentTable } from "./catalog-equipment";

export const reportEquipmentTable = pgTable("report_equipment", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  catalogEquipmentId: integer("catalog_equipment_id").references(() => catalogEquipmentTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitId: text("unit_id"),
  hoursUsed: numeric("hours_used", { precision: 6, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportEquipmentSchema = createInsertSchema(reportEquipmentTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportEquipment = z.infer<typeof insertReportEquipmentSchema>;
export type ReportEquipment = typeof reportEquipmentTable.$inferSelect;
