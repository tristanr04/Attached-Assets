import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily-reports";
import { crewMembersTable } from "./crew-members";

export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  crewMemberId: integer("crew_member_id").references(() => crewMembersTable.id, { onDelete: "set null" }),
  employeeName: text("employee_name").notNull(),
  trade: text("trade").notNull(),
  regularHours: numeric("regular_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  doubleTimeHours: numeric("double_time_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntriesTable.$inferSelect;
