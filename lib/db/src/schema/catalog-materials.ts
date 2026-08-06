import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const catalogMaterialsTable = pgTable("catalog_materials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogMaterialSchema = createInsertSchema(catalogMaterialsTable).omit({ id: true, createdAt: true });
export type InsertCatalogMaterial = z.infer<typeof insertCatalogMaterialSchema>;
export type CatalogMaterial = typeof catalogMaterialsTable.$inferSelect;
