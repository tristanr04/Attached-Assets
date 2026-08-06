import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const laborClassificationsTable = pgTable("labor_classifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  billingCode: text("billing_code"),
  baseRate: numeric("base_rate", { precision: 10, scale: 2 }),
  overtimeRate: numeric("overtime_rate", { precision: 10, scale: 2 }),
  doubleTimeRate: numeric("double_time_rate", { precision: 10, scale: 2 }),
  stormRate: numeric("storm_rate", { precision: 10, scale: 2 }),
  emergencyRate: numeric("emergency_rate", { precision: 10, scale: 2 }),
  perDiemRate: numeric("per_diem_rate", { precision: 10, scale: 2 }),
  travelRate: numeric("travel_rate", { precision: 10, scale: 2 }),
  minimumBillableHours: numeric("minimum_billable_hours", { precision: 5, scale: 2 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborClassificationSchema = createInsertSchema(laborClassificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLaborClassification = z.infer<typeof insertLaborClassificationSchema>;
export type LaborClassification = typeof laborClassificationsTable.$inferSelect;
