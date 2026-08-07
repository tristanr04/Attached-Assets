import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { companiesTable } from "./companies";
import { dailyReportsTable } from "./daily-reports";
import { photosTable } from "./photos";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const poleProfilesTable = pgTable("pole_profiles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  assetKey: text("asset_key").notNull(),
  poleNumber: text("pole_number"),
  locationLabel: text("location_label"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  workOrderRef: text("work_order_ref"),
  tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
  visualAttributes: jsonb("visual_attributes").notNull().default(sql`'[]'::jsonb`),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("pole_profiles_company_asset_key_uq").on(table.companyId, table.assetKey),
  uniqueIndex("pole_profiles_company_id_uq").on(table.companyId, table.id),
  check("pole_profiles_version_positive", sql`${table.version} > 0`),
  check("pole_profiles_latitude_range", sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
  check("pole_profiles_longitude_range", sql`${table.longitude} is null or ${table.longitude} between -180 and 180`),
]);

export const poleTypeCatalogItemsTable = pgTable("pole_type_catalog_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  axis: text("axis").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  genericValues: jsonb("generic_values").notNull().default(sql`'[]'::jsonb`),
  evidenceRules: jsonb("evidence_rules").notNull().default(sql`'[]'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("pole_type_catalog_company_axis_code_uq").on(table.companyId, table.axis, table.code),
  check("pole_type_catalog_axis_allowed", sql`${table.axis} in ('asset_purpose', 'phase_configuration', 'construction_role', 'equipment_role', 'framing_configuration')`),
]);

export const poleReferencePhotosTable = pgTable("pole_reference_photos", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  poleProfileId: integer("pole_profile_id").notNull(),
  photoId: integer("photo_id").notNull().references(() => photosTable.id),
  imageSha256: text("image_sha256").notNull(),
  visualFingerprint: jsonb("visual_fingerprint"),
  verifiedByUserId: integer("verified_by_user_id").notNull().references(() => usersTable.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("pole_reference_photos_profile_photo_uq").on(table.poleProfileId, table.photoId),
  uniqueIndex("pole_reference_photos_company_hash_uq").on(table.companyId, table.imageSha256),
  foreignKey({
    name: "pole_reference_photos_company_profile_fk",
    columns: [table.companyId, table.poleProfileId],
    foreignColumns: [poleProfilesTable.companyId, poleProfilesTable.id],
  }),
  check("pole_reference_photos_sha256_format", sql`${table.imageSha256} ~ '^[0-9a-fA-F]{64}$'`),
]);

export const poleAnalysisRunsTable = pgTable("pole_analysis_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id),
  photoId: integer("photo_id").notNull().references(() => photosTable.id),
  analysisKey: text("analysis_key").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("ai_proposed"),
  targetMatch: text("target_match").notNull(),
  selectedPoleProfileId: integer("selected_pole_profile_id"),
  modelProvider: text("model_provider").notNull(),
  modelName: text("model_name").notNull(),
  modelVersion: text("model_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawResult: jsonb("raw_result").notNull(),
  targetEvidence: jsonb("target_evidence").notNull().default(sql`'[]'::jsonb`),
  limitations: jsonb("limitations").notNull().default(sql`'[]'::jsonb`),
  idempotencyKey: text("idempotency_key").notNull(),
  confirmationIdempotencyKey: text("confirmation_idempotency_key"),
  confirmedByUserId: integer("confirmed_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, table => [
  uniqueIndex("pole_analysis_runs_photo_version_uq").on(table.photoId, table.version),
  uniqueIndex("pole_analysis_runs_company_idempotency_uq").on(table.companyId, table.idempotencyKey),
  uniqueIndex("pole_analysis_runs_company_confirmation_idempotency_uq")
    .on(table.companyId, table.confirmationIdempotencyKey)
    .where(sql`${table.confirmationIdempotencyKey} is not null`),
  uniqueIndex("pole_analysis_runs_company_analysis_key_version_uq").on(table.companyId, table.analysisKey, table.version),
  uniqueIndex("pole_analysis_runs_company_id_uq").on(table.companyId, table.id),
  foreignKey({
    name: "pole_analysis_runs_company_profile_fk",
    columns: [table.companyId, table.selectedPoleProfileId],
    foreignColumns: [poleProfilesTable.companyId, poleProfilesTable.id],
  }),
  check("pole_analysis_runs_version_positive", sql`${table.version} > 0`),
  check("pole_analysis_runs_status_allowed", sql`${table.status} in ('ai_proposed', 'foreman_confirmed', 'rejected', 'failed')`),
  check("pole_analysis_runs_target_allowed", sql`${table.targetMatch} in ('confirmed', 'ambiguous', 'conflict', 'no_match')`),
]);

export const poleAnalysisCandidatesTable = pgTable("pole_analysis_candidates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  analysisRunId: integer("analysis_run_id").notNull(),
  poleProfileId: integer("pole_profile_id").notNull(),
  rank: integer("rank").notNull(),
  score: numeric("score", { precision: 5, scale: 4 }).notNull(),
  signalEvidence: jsonb("signal_evidence").notNull().default(sql`'[]'::jsonb`),
}, table => [
  uniqueIndex("pole_analysis_candidates_run_profile_uq").on(table.analysisRunId, table.poleProfileId),
  uniqueIndex("pole_analysis_candidates_run_rank_uq").on(table.analysisRunId, table.rank),
  foreignKey({
    name: "pole_analysis_candidates_company_run_fk",
    columns: [table.companyId, table.analysisRunId],
    foreignColumns: [poleAnalysisRunsTable.companyId, poleAnalysisRunsTable.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "pole_analysis_candidates_company_profile_fk",
    columns: [table.companyId, table.poleProfileId],
    foreignColumns: [poleProfilesTable.companyId, poleProfilesTable.id],
  }),
  check("pole_analysis_candidates_rank_range", sql`${table.rank} between 1 and 3`),
  check("pole_analysis_candidates_score_range", sql`${table.score} between 0 and 1`),
]);

export const poleAnalysisFieldsTable = pgTable("pole_analysis_fields", {
  id: serial("id").primaryKey(),
  analysisRunId: integer("analysis_run_id").notNull().references(() => poleAnalysisRunsTable.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  proposedValue: jsonb("proposed_value").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
  reviewRequirement: text("review_requirement").notNull(),
  additionalPhotoRequest: text("additional_photo_request"),
}, table => [
  uniqueIndex("pole_analysis_fields_run_field_uq").on(table.analysisRunId, table.fieldKey),
  check("pole_analysis_fields_confidence_range", sql`${table.confidence} between 0 and 1`),
  check("pole_analysis_fields_review_allowed", sql`${table.reviewRequirement} in ('foreman_review', 'manual_selection', 'additional_photo')`),
]);

export const poleAnalysisDecisionsTable = pgTable("pole_analysis_decisions", {
  id: serial("id").primaryKey(),
  analysisRunId: integer("analysis_run_id").notNull().references(() => poleAnalysisRunsTable.id),
  fieldKey: text("field_key").notNull(),
  action: text("action").notNull(),
  originalValue: jsonb("original_value").notNull(),
  finalValue: jsonb("final_value"),
  note: text("note"),
  actorUserId: integer("actor_user_id").notNull().references(() => usersTable.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("pole_analysis_decisions_run_field_uq").on(table.analysisRunId, table.fieldKey),
  check("pole_analysis_decisions_action_allowed", sql`${table.action} in ('accept', 'edit', 'reject')`),
]);

export type PoleProfile = typeof poleProfilesTable.$inferSelect;
export type PoleTypeCatalogItem = typeof poleTypeCatalogItemsTable.$inferSelect;
export type PoleAnalysisRun = typeof poleAnalysisRunsTable.$inferSelect;
