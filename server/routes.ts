import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Projects
  app.get(api.projects.list.path, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json(project);
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const project = await storage.createProject(input);
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.projects.update.path, async (req, res) => {
    try {
      const input = api.projects.update.input.parse(req.body);
      const project = await storage.updateProject(Number(req.params.id), input);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.projects.delete.path, async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.status(204).send();
  });

  // Proofs
  app.get(api.proofs.list.path, async (req, res) => {
    const proofs = await storage.getProofsByProjectId(Number(req.params.projectId));
    res.json(proofs);
  });

  app.post(api.proofs.create.path, async (req, res) => {
    try {
      const input = api.proofs.create.input.parse(req.body);
      const proof = await storage.createProof(input);
      res.status(201).json(proof);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.proofs.update.path, async (req, res) => {
    try {
      const input = api.proofs.update.input.parse(req.body);
      const proof = await storage.updateProof(Number(req.params.id), input);
      if (!proof) return res.status(404).json({ message: "Proof not found" });
      res.json(proof);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.proofs.delete.path, async (req, res) => {
    await storage.deleteProof(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}

// Seed function
async function seedDatabase() {
  const existing = await storage.getProjects();
  if (existing.length === 0) {
    const p1 = await storage.createProject({
      name: "Downtown Office Complex",
      description: "Renovation of the main lobby and 1st floor offices",
      location: "123 Main St, Cityville",
      status: "active"
    });
    
    await storage.createProof({
      projectId: p1.id,
      title: "Lobby Framing",
      description: "Steel framing installation complete for the reception area",
      imageUrl: "https://images.unsplash.com/photo-1503387762-592deb58ef4e",
      verified: true
    });
    
    await storage.createProof({
      projectId: p1.id,
      title: "Electrical Rough-in",
      description: "Initial wiring for the conference rooms",
      imageUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e",
      verified: false
    });

    const p2 = await storage.createProject({
      name: "Westside Apartments",
      description: "New construction of 20-unit apartment block",
      location: "456 West Ave",
      status: "active"
    });
    
    await storage.createProof({
      projectId: p2.id,
      title: "Foundation Pour",
      description: "Concrete foundation poured and curing",
      imageUrl: "https://images.unsplash.com/photo-1621905252507-b35a830099bb",
      verified: true
    });
  }
}

// Trigger seed on import (this is safe as it checks for existing data)
seedDatabase().catch(console.error);
