import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { workspacesRouter } from "./routes/workspaces.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok"
  });
});

app.use("/workspaces", workspacesRouter);

app.use(errorHandler);
