import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const catalogEquipmentTable = pgTable("catalog_equipment", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogEquipmentSchema = createInsertSchema(catalogEquipmentTable).omit({ id: true, createdAt: true });
export type InsertCatalogEquipment = z.infer<typeof insertCatalogEquipmentSchema>;
export type CatalogEquipment = typeof catalogEquipmentTable.$inferSelect;
