import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

// Conditional billing rules: IF conditions[] THEN suggestions[]
// conditions: [{field, operator, value}]
// suggestions: [{billingCode, description, unitType, quantityRule, requiresPhoto, requiresApproval}]
export const pkbConditionalRulesTable = pgTable("pkb_conditional_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  customerId: text("customer_id"),
  contractId: text("contract_id"),
  conditions: jsonb("conditions").notNull(), // [{field, operator, value}]
  suggestions: jsonb("suggestions").notNull(), // [{billingCode, description, unitType, defaultQty, requiresPhoto, requiresApproval}]
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0), // higher = evaluated first
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPkbConditionalRuleSchema = createInsertSchema(pkbConditionalRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPkbConditionalRule = z.infer<typeof insertPkbConditionalRuleSchema>;
export type PkbConditionalRule = typeof pkbConditionalRulesTable.$inferSelect;
