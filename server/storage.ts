import { db } from "./db";
import {
  projects,
  proofs,
  type Project,
  type InsertProject,
  type Proof,
  type InsertProof,
  type UpdateProofRequest
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;

  // Proofs
  getProofsByProjectId(projectId: number): Promise<Proof[]>;
  createProof(proof: InsertProof): Promise<Proof>;
  updateProof(id: number, proof: UpdateProofRequest): Promise<Proof | undefined>;
  deleteProof(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Proofs
  async getProofsByProjectId(projectId: number): Promise<Proof[]> {
    return await db.select().from(proofs).where(eq(proofs.projectId, projectId));
  }

  async createProof(insertProof: InsertProof): Promise<Proof> {
    const [proof] = await db.insert(proofs).values(insertProof).returning();
    return proof;
  }

  async updateProof(id: number, updates: UpdateProofRequest): Promise<Proof | undefined> {
    const [updated] = await db.update(proofs)
      .set(updates)
      .where(eq(proofs.id, id))
      .returning();
    return updated;
  }

  async deleteProof(id: number): Promise<void> {
    await db.delete(proofs).where(eq(proofs.id, id));
  }
}

export const storage = new DatabaseStorage();
