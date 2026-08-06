import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
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
  billingCode: text("billing_code"),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull().default("1"),
  hoursUsed: numeric("hours_used", { precision: 6, scale: 2 }).notNull().default("0"),
  daysUsed: numeric("days_used", { precision: 5, scale: 2 }).notNull().default("0"),
  standbyHours: numeric("standby_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  mobilization: boolean("mobilization").notNull().default(false),
  demobilization: boolean("demobilization").notNull().default(false),
  overtimeUsage: boolean("overtime_usage").notNull().default(false),
  stormUsage: boolean("storm_usage").notNull().default(false),
  emergencyUsage: boolean("emergency_usage").notNull().default(false),
  calculatedCharge: numeric("calculated_charge", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportEquipmentSchema = createInsertSchema(reportEquipmentTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportEquipment = z.infer<typeof insertReportEquipmentSchema>;
export type ReportEquipment = typeof reportEquipmentTable.$inferSelect;
