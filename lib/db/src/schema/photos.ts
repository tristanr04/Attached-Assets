import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily-reports";

export const PHOTO_CATEGORIES = [
  "full_pole",
  "pole_tag",
  "top_framing",
  "transformer",
  "base",
  "damage",
  "before_work",
  "during_work",
  "after_work",
  "other",
] as const;

export type PhotoCategory = typeof PHOTO_CATEGORIES[number];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  full_pole: "Full Pole",
  pole_tag: "Pole Tag / Stamp",
  top_framing: "Top Framing",
  transformer: "Transformer / Equipment",
  base: "Pole Base",
  damage: "Damage",
  before_work: "Before Work",
  during_work: "During Work",
  after_work: "After Work",
  other: "Other",
};

export const photosTable = pgTable("photos", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  caption: text("caption"),
  category: text("category").default("other"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPhotoSchema = createInsertSchema(photosTable).omit({ id: true, createdAt: true });
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type Photo = typeof photosTable.$inferSelect;
