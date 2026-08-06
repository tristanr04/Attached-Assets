import { pgEnum, pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const roleEnum = pgEnum("role", ["admin", "supervisor", "foreman"]);

export const companyMembershipsTable = pgTable("company_memberships", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  clerkUserId: text("clerk_user_id"),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: roleEnum("role").notNull().default("foreman"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyMembershipSchema = createInsertSchema(companyMembershipsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyMembership = z.infer<typeof insertCompanyMembershipSchema>;
export type CompanyMembership = typeof companyMembershipsTable.$inferSelect;
