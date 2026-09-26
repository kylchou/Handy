import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { createTestDb } from "./helpers";

let server: App;
let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
  server = await buildApp({
    config: loadConfig({ seedOnStart: false, jwtSecret: "docs-test", aiServiceModule: "", matchingServiceModule: "", docsEnabled: true }),
    dbHandle: handle,
    logger: false,
    backgroundJobs: false,
  });
});

afterAll(async () => {
  await server.app.close();
  await handle.close();
});

type Op = { tags?: string[]; security?: unknown[]; requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }; parameters?: Array<{ name: string; in: string }> };

describe("API docs", () => {
  it("serves the docs page", async () => {
    const res = await server.app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("swagger");
  });

  it("documents every endpoint with bodies, params and auth", async () => {
    const spec = (await server.app.inject({ method: "GET", url: "/docs/json" })).json() as {
      openapi: string;
      paths: Record<string, Record<string, Op>>;
    };
    expect(spec.openapi).toMatch(/^3\./);

    const login = spec.paths["/api/v1/auth/login"]!.post!;
    expect(login.tags).toEqual(["Auth"]);
    expect(login.security).toBeUndefined();
    expect(Object.keys(login.requestBody!.content["application/json"]!.schema.properties!)).toEqual(["email", "password"]);

    expect(spec.paths["/api/v1/auth/me"]!.get!.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/api/v1/jobs/{jobId}/status"]!.patch!.parameters).toContainEqual(expect.objectContaining({ name: "jobId", in: "path" }));
    expect(spec.paths["/api/v1/jobs"]!.get!.parameters).toContainEqual(expect.objectContaining({ name: "status", in: "query" }));
    expect(spec.paths["/api/v1/events"]!.get!.tags).toEqual(["Realtime"]);

    // Every operation is documented (has a tag), and internal routes are hidden.
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) expect(op.tags, `${method} ${path}`).toBeDefined();
    }
    expect(spec.paths["/api/v1/ws"]).toBeUndefined();
    expect(spec.paths["/health"]).toBeUndefined();
    const operations = Object.values(spec.paths).reduce((n, ops) => n + Object.keys(ops).length, 0);
    expect(operations).toBe(50); // the 49 endpoints in ApiResponses, plus the SSE stream
  });

  it("doesn't change how requests are validated or answered", async () => {
    const bad = await server.app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { role: "ADMIN" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_FAILED");

    const login = await server.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "margaret@handy.demo", password: "password123" },
    });
    // The full response comes back (nothing stripped by a response schema).
    expect(Object.keys(login.json()).sort()).toEqual(["expiresAt", "token", "user"]);
  });
});
