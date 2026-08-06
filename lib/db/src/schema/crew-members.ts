import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { crewsTable } from "./crews";
import { usersTable } from "./users";

export const crewMembersTable = pgTable("crew_members", {
  id: serial("id").primaryKey(),
  crewId: integer("crew_id").notNull().references(() => crewsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  classification: text("classification"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCrewMemberSchema = createInsertSchema(crewMembersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrewMember = z.infer<typeof insertCrewMemberSchema>;
export type CrewMember = typeof crewMembersTable.$inferSelect;
