import { pgEnum, pgTable, serial, integer, text, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { projectsTable } from "./projects";
import { crewsTable } from "./crews";
import { usersTable } from "./users";

export const reportStatusEnum = pgEnum("report_status", ["draft", "complete"]);

export const dailyReportsTable = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  crewId: integer("crew_id").references(() => crewsTable.id, { onDelete: "set null" }),
  foremanId: integer("foreman_id").references(() => usersTable.id, { onDelete: "set null" }),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  status: reportStatusEnum("status").notNull().default("draft"),
  workLocation: text("work_location"),
  generalForeman: text("general_foreman"),
  startTime: text("start_time"),
  stopTime: text("stop_time"),
  weatherConditions: text("weather_conditions"),
  workPerformed: text("work_performed"),
  structuresInstalled: text("structures_installed"),
  safetyMeeting: boolean("safety_meeting"),
  safetyNotes: text("safety_notes"),
  delays: text("delays"),
  outages: text("outages"),
  customerIssues: text("customer_issues"),
  injuries: boolean("injuries"),
  injuryDetails: text("injury_details"),
  additionalNotes: text("additional_notes"),
  workPackageId: integer("work_package_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyReportSchema = createInsertSchema(dailyReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;
