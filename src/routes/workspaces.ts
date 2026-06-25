import { Router } from "express";
import { prisma } from "../db.js";

export const workspacesRouter = Router();

workspacesRouter.get("/", async (_req, res, next) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    res.status(200).json({
      data: workspaces
    });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post("/", async (req, res, next) => {
  try {
    const name = req.body?.name;

    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        error: "Workspace name is required"
      });
      return;
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim()
      }
    });

    res.status(201).json({
      data: workspace
    });
  } catch (error) {
    next(error);
  }
});
