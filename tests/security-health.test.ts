import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  fail: false,
}));

vi.mock("@/db", () => ({
  getD1: () => ({
    prepare() {
      return {
        async first() {
          if (database.fail) throw new Error("d1 down");
          return { ok: 1 };
        },
      };
    },
  }),
}));

import { GET } from "../app/api/health/route";

describe("health", () => {
  it("reports the database as up without leaking internals", async () => {
    database.fail = false;
    const response = await GET(new Request("https://seed.example/api/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      database: "up",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports the database as down without the driver error", async () => {
    database.fail = true;
    const response = await GET(new Request("https://seed.example/api/health"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      ok: boolean;
      database: string;
      error?: { message: string };
    };
    expect(body).toEqual({ ok: false, database: "down" });
    expect(JSON.stringify(body)).not.toContain("d1 down");
  });
});
