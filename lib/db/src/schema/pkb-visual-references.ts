import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const PKB_REF_CAMERA_ANGLES = [
  "full_pole", "pole_top", "pole_tag", "pole_base", "transformer", "framing",
  "guying", "anchor", "riser", "service", "before_work", "after_work",
  "correct_installation", "alternate_variation", "commonly_confused",
  "negative_example", "poor_quality"
] as const;

export type PkbRefCameraAngle = typeof PKB_REF_CAMERA_ANGLES[number];

export const pkbVisualReferencesTable = pgTable("pkb_visual_references", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  // Links to catalog entities (soft refs by ID)
  poleTypeId: integer("pole_type_id"),
  structureConfigId: integer("structure_config_id"),
  componentsVisible: jsonb("components_visible"),       // [{code, name}]
  workActionsRepresented: jsonb("work_actions_represented"), // [{code, name}]
  // Photo metadata
  cameraAngle: text("camera_angle"),   // PKB_REF_CAMERA_ANGLES
  distance: text("distance"),
  lightingCondition: text("lighting_condition"),
  imageQualityRating: integer("image_quality_rating"), // 1-5
  imageData: text("image_data"),       // base64 data URL
  // Provenance
  source: text("source"),
  permissionStatus: text("permission_status"), // company_owned, licensed, public
  // Approvals
  approvedForEvaluation: boolean("approved_for_evaluation").notNull().default(false),
  approvedForTraining: boolean("approved_for_training").notNull().default(false),
  uploadedBy: integer("uploaded_by"),
  verifiedBy: integer("verified_by"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbVisualReferenceSchema = createInsertSchema(pkbVisualReferencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbVisualReference = z.infer<typeof insertPkbVisualReferenceSchema>;
export type PkbVisualReference = typeof pkbVisualReferencesTable.$inferSelect;
