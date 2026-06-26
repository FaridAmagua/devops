import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("app", () => {
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
});
