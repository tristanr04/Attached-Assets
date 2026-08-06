import { pgEnum, pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const pkbImportJobStatusEnum = pgEnum("pkb_import_job_status", ["pending", "processing", "completed", "failed"]);

export const pkbImportJobsTable = pgTable("pkb_import_jobs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  fileName: text("file_name").notNull(),
  entityType: text("entity_type").notNull(),
  status: pkbImportJobStatusEnum("status").notNull().default("pending"),
  mappingProfile: jsonb("mapping_profile"),  // column → field mapping
  mappingProfileName: text("mapping_profile_name"),
  insertedCount: integer("inserted_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  errorCount: integer("error_count").default(0),
  results: jsonb("results"), // full results including row-level errors
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PkbImportJob = typeof pkbImportJobsTable.$inferSelect;
