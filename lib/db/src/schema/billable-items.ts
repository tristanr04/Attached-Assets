import { pgEnum, pgTable, serial, integer, text, numeric, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const billableItemCategoryEnum = pgEnum("billable_item_category", [
  "labor", "equipment", "materials", "work_units", "addon", "custom"
]);

export const billableItemsTable = pgTable("billable_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  category: billableItemCategoryEnum("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  billingCode: text("billing_code"),
  internalCode: text("internal_code"),
  customer: text("customer"),
  unitType: text("unit_type"),
  baseRate: numeric("base_rate", { precision: 12, scale: 4 }),
  overtimeRate: numeric("overtime_rate", { precision: 12, scale: 4 }),
  doubleTimeRate: numeric("double_time_rate", { precision: 12, scale: 4 }),
  emergencyRate: numeric("emergency_rate", { precision: 12, scale: 4 }),
  stormRate: numeric("storm_rate", { precision: 12, scale: 4 }),
  defaultQuantity: numeric("default_quantity", { precision: 10, scale: 3 }),
  taxable: boolean("taxable").notNull().default(false),
  active: boolean("active").notNull().default(true),
  effectiveDate: date("effective_date", { mode: "string" }),
  expirationDate: date("expiration_date", { mode: "string" }),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBillableItemSchema = createInsertSchema(billableItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBillableItem = z.infer<typeof insertBillableItemSchema>;
export type BillableItem = typeof billableItemsTable.$inferSelect;
