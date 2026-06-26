import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { prisma } from "./db.js";

describe("app", () => {
  beforeEach(async () => {
    await prisma.workspace.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok"
    });
  });

  it("rejects workspace creation without a valid name", async () => {
    const response = await request(app).post("/workspaces").send({
      name: ""
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Workspace name is required"
    });
  });

  it("creates and lists workspaces from PostgreSQL", async () => {
    const createResponse = await request(app).post("/workspaces").send({
      name: "AutoDM AI Test"
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      name: "AutoDM AI Test"
    });

    const listResponse = await request(app).get("/workspaces");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      name: "AutoDM AI Test"
    });
  });
});
