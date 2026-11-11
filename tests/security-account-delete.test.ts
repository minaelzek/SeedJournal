import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "../lib/auth/errors";
import { createSessionToken } from "../lib/auth/session-cookie";
import {
  CSRF_COOKIE,
  CSRF_COOKIE_DEV,
  CSRF_HEADER,
  issueCsrf,
} from "../app/api/_shared/http";

const state = vi.hoisted(() => ({
  account: null as { id: string } | null,
  revoked: [] as string[],
  revokedTokens: [] as string[],
  deleted: 0,
  sql: [] as string[],
}));

vi.mock("@/lib/auth/account", () => ({
  resolveApiAccount: vi.fn(async () => {
    if (!state.account) throw new AuthenticationRequiredError();
    return state.account;
  }),
}));

vi.mock("@/lib/auth/session", async () => {
  const cookie = await vi.importActual<
    typeof import("../lib/auth/session-cookie")
  >("../lib/auth/session-cookie");
  return {
    readSessionTokensFromRequest: cookie.readSessionTokensFromRequest,
    sessionClearCookieHeaders: cookie.sessionClearCookieHeaders,
    revokeAccountSessions: vi.fn(async (accountId: string) => {
      state.revoked.push(accountId);
    }),
    revokeSession: vi.fn(async (token: string | null) => {
      if (token) state.revokedTokens.push(token);
    }),
  };
});

vi.mock("@/db", () => ({
  getDb: () => ({
    delete: () => ({
      where: async () => {
        state.deleted += 1;
      },
    }),
  }),
  getD1: () => ({
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({ sql, args }),
    }),
    batch: async (statements: Array<{ sql: string }>) => {
      state.sql = statements.map((statement) => statement.sql);
      state.deleted += 1;
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  }),
}));

import { DELETE } from "../app/api/account/route";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

beforeEach(() => {
  state.account = null;
  state.revoked.length = 0;
  state.revokedTokens.length = 0;
  state.deleted = 0;
  state.sql = [];
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

function deleteRequest(body: unknown, sessionCookie = ""): Request {
  const issued = issueCsrf(new Request("https://seed.example/api/auth/csrf"));
  const cookieName =
    process.env.NODE_ENV === "production" ? CSRF_COOKIE : CSRF_COOKIE_DEV;
  const cookie = [`${cookieName}=${issued.token}`, sessionCookie]
    .filter(Boolean)
    .join("; ");
  return new Request("https://seed.example/api/account", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "https://seed.example",
      "sec-fetch-site": "same-origin",
      cookie,
      [CSRF_HEADER]: issued.token,
    },
    body: JSON.stringify(body),
  });
}

describe("account deletion", () => {
  it("does not delete without a signed-in account", async () => {
    const response = await DELETE(deleteRequest({ confirmation: "DELETE" }));
    expect(response.status).toBe(401);
    expect(state.deleted).toBe(0);
    expect(state.revoked).toEqual([]);
  });

  it("does not delete without the confirmation token", async () => {
    state.account = { id: "acct-1" };
    const response = await DELETE(deleteRequest({ confirmation: "delete" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("confirmation_required");
    expect(state.deleted).toBe(0);
    expect(state.revoked).toEqual([]);
  });

  it("revokes the account and clears both session cookies", async () => {
    mutableEnv.NODE_ENV = "development";
    state.account = { id: "acct-1" };
    const response = await DELETE(deleteRequest({ confirmation: "DELETE" }));
    expect(response.status).toBe(200);
    expect(state.revoked).toEqual(["acct-1"]);
    expect(state.deleted).toBe(1);
    expect(state.sql.some((sql) => sql.includes("ciphertext = ''"))).toBe(true);
    expect(state.sql.some((sql) => sql.startsWith("DELETE FROM accounts"))).toBe(
      true,
    );
    expect(response.headers.getSetCookie()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "seedjournal-csrf=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    ]);
  });

  it("clears both session cookies and the host csrf cookie in production", async () => {
    mutableEnv.NODE_ENV = "production";
    state.account = { id: "acct-1" };
    const host = createSessionToken();
    const dev = createSessionToken();
    const response = await DELETE(
      deleteRequest(
        { confirmation: "DELETE" },
        `__Host-seedjournal-session=${host}; seedjournal-session=${dev}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(state.revoked).toEqual(["acct-1"]);
    expect(state.revokedTokens).toEqual([host, dev]);
    expect(response.headers.getSetCookie()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "__Host-seedjournal-csrf=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
    ]);
  });
});
