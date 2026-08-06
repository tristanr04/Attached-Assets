import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily-reports";

export const signaturesTable = pgTable("signatures", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().unique().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  dataUrl: text("data_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSignatureSchema = createInsertSchema(signaturesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSignature = z.infer<typeof insertSignatureSchema>;
export type Signature = typeof signaturesTable.$inferSelect;
