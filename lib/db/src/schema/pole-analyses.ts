import { pgTable, serial, integer, text, varchar, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { dailyReportsTable } from "./daily-reports";
import { pkbWorkPackagesTable } from "./pkb-work-packages";

/**
 * pole_analyses — immutable capture record created when a foreman submits a pole photo.
 * The original photo, GPS, OCR, AI proposals, and foreman confirmation are all stored here.
 * Nothing in the daily report can be submitted/billed before status = 'confirmed'.
 */
export const poleAnalysesTable = pgTable("pole_analyses", {
  id: serial("id").primaryKey(),

  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),

  createdByUserId: integer("created_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),

  // ── Original photo (immutable, stored forever for audit) ───────────────────
  photoData: text("photo_data").notNull(),          // base64-encoded image
  photoMimeType: varchar("photo_mime_type", { length: 20 }).notNull().default("image/jpeg"),

  // ── GPS at time of capture ─────────────────────────────────────────────────
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),
  gpsAccuracyM: numeric("gps_accuracy_m", { precision: 8, scale: 2 }),

  // ── OCR results ────────────────────────────────────────────────────────────
  ocrPoleTag: text("ocr_pole_tag"),               // e.g. "XY-4521"
  ocrConfidence: numeric("ocr_confidence", { precision: 5, scale: 4 }),
  ocrRawText: text("ocr_raw_text"),               // all visible text extracted

  // ── Job matching ───────────────────────────────────────────────────────────
  matchedProjectId: integer("matched_project_id")
    .references(() => projectsTable.id, { onDelete: "set null" }),
  matchedWorkPackageId: integer("matched_work_package_id")
    .references(() => pkbWorkPackagesTable.id, { onDelete: "set null" }),
  matchConfidence: numeric("match_confidence", { precision: 5, scale: 4 }),
  matchMethod: text("match_method"),   // "pole_tag" | "gps" | "schedule" | "manual" | "none"
  matchCandidates: jsonb("match_candidates"), // top N project candidates with scores

  // ── AI-proposed fields with per-field confidence ───────────────────────────
  proposedFields: jsonb("proposed_fields"),

  // ── Foreman confirmation ───────────────────────────────────────────────────
  // status: pending | analyzing | confirmed | rejected | error | duplicate
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  confirmedFields: jsonb("confirmed_fields"),     // what the foreman actually kept
  confirmedByUserId: integer("confirmed_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

  // ── Downstream report ──────────────────────────────────────────────────────
  linkedReportId: integer("linked_report_id")
    .references(() => dailyReportsTable.id, { onDelete: "set null" }),

  // ── Duplicate detection ────────────────────────────────────────────────────
  duplicateOfId: integer("duplicate_of_id"),      // FK to pole_analyses.id

  // ── Error tracking ─────────────────────────────────────────────────────────
  errorMessage: text("error_message"),

  // ── Full audit trail ───────────────────────────────────────────────────────
  // Array of { at, action, by, detail } objects — append-only
  auditLog: jsonb("audit_log"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPoleAnalysisSchema = createInsertSchema(poleAnalysesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertPoleAnalysis = z.infer<typeof insertPoleAnalysisSchema>;
export type PoleAnalysis = typeof poleAnalysesTable.$inferSelect;
