import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

/**
 * pole_assets — company-scoped pole registry.
 *
 * One row per physical pole. Grows as crews confirm pole analyses.
 * Reference photos live in pole_reference_photos (FK → pole_asset_id).
 */
export const poleAssetsTable = pgTable("pole_assets", {
  id: serial("id").primaryKey(),

  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),

  // ── Identity tags ──────────────────────────────────────────────────────────
  poleNumber: text("pole_number"),    // official structure / pole ID (e.g. "XY-4521")
  utilityTag: text("utility_tag"),    // utility-company plate / tag (e.g. "PLN-00912")

  // ── Location ───────────────────────────────────────────────────────────────
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),

  // ── Job linkage ────────────────────────────────────────────────────────────
  projectId: integer("project_id")
    .references(() => projectsTable.id, { onDelete: "set null" }),
  workOrderId: text("work_order_id"),

  // ── Physical attributes ────────────────────────────────────────────────────
  poleMaterial: text("pole_material"),      // wood | steel | concrete | …
  poleHeight: text("pole_height"),          // "40ft", "45ft", …
  poleClass: text("pole_class"),            // "1", "2", "H1", …
  topFramingType: text("top_framing_type"), // single_crossarm | h_frame | …
  attributes: jsonb("attributes"),          // arbitrary extra key-value pairs

  // ── Verification ───────────────────────────────────────────────────────────
  isVerified: boolean("is_verified").notNull().default(false),
  referencePhotoCount: integer("reference_photo_count").notNull().default(0),

  createdByUserId: integer("created_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PoleAsset = typeof poleAssetsTable.$inferSelect;
export type InsertPoleAsset = typeof poleAssetsTable.$inferInsert;
