import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("active"), // active, completed, archived
  createdAt: timestamp("created_at").defaultNow(),
});

export const proofs = pgTable("proofs", {
  id: serial("id").primaryKey(),
  projectId: serial("project_id").notNull(), // Relation handling in storage
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertProofSchema = createInsertSchema(proofs).omit({ id: true, createdAt: true });

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Proof = typeof proofs.$inferSelect;
export type InsertProof = z.infer<typeof insertProofSchema>;

export type CreateProofRequest = InsertProof;
export type UpdateProofRequest = Partial<InsertProof>;
