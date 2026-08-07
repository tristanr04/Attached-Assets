import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { poleAssetsTable } from "./pole-assets";

/**
 * pole_reference_photos — verified reference photos for known poles.
 *
 * Added automatically after foreman confirmation. Used by the Pole Identity
 * Engine to build a visual fingerprint for future matches. More reference
 * photos → higher identification confidence on future captures.
 */
export const poleReferencePhotosTable = pgTable("pole_reference_photos", {
  id: serial("id").primaryKey(),

  poleAssetId: integer("pole_asset_id")
    .notNull()
    .references(() => poleAssetsTable.id, { onDelete: "cascade" }),

  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),

  // ── Photo ──────────────────────────────────────────────────────────────────
  photoData: text("photo_data").notNull(),  // base64
  photoMimeType: varchar("photo_mime_type", { length: 20 }).notNull().default("image/jpeg"),

  // ── Capture metadata ───────────────────────────────────────────────────────
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),

  /**
   * Synthesized keyword string for visual fingerprinting.
   * Built from: material, height, class, framingType, equipment list.
   * Example: "wood 40ft class2 single_crossarm transformer cutout guy_wire"
   * Used for Jaccard-similarity matching in the identity engine.
   */
  visualDescription: text("visual_description"),

  // Link back to the analysis that produced this reference
  poleAnalysisId: integer("pole_analysis_id"),

  // Soft-delete: stale / superseded photos can be deactivated
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PoleReferencePhoto = typeof poleReferencePhotosTable.$inferSelect;
export type InsertPoleReferencePhoto = typeof poleReferencePhotosTable.$inferInsert;
