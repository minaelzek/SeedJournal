import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../lib/auth/session-cookie";

interface SessionRow {
  id: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

const rows = vi.hoisted(() => [] as SessionRow[]);

vi.mock("@/db", () => ({
  getD1: () => ({
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("INSERT")) {
                rows.push({
                  id: String(args[0]),
                  accountId: String(args[1]),
                  createdAt: Number(args[2]),
                  expiresAt: Number(args[3]),
                  lastSeenAt: Number(args[4]),
                });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE")) {
                const row = rows.find((item) => item.id === String(args[1]));
                if (!row) return { meta: { changes: 0 } };
                row.lastSeenAt = Number(args[0]);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("account_id")) {
                const accountId = String(args[0]);
                const before = rows.length;
                for (let index = rows.length - 1; index >= 0; index -= 1) {
                  if (rows[index]?.accountId === accountId) rows.splice(index, 1);
                }
                return { meta: { changes: before - rows.length } };
              }
              const index = rows.findIndex((item) => item.id === String(args[0]));
              if (index >= 0) rows.splice(index, 1);
              return { meta: { changes: index >= 0 ? 1 : 0 } };
            },
            async first<T>() {
              const id = String(args[0]);
              const now = Number(args[1]);
              const row = rows.find(
                (item) => item.id === id && item.expiresAt > now,
              );
              if (!row) return null;
              return {
                account_id: row.accountId,
                last_seen_at: row.lastSeenAt,
              } as T;
            },
          };
        },
      };
    },
  }),
}));

import {
  createAccountSession,
  hashSessionToken,
  resolveSessionAccountId,
  revokeAccountSessions,
  revokeSession,
  sessionIdleExpired,
} from "../lib/auth/session";
import { SESSION_IDLE_MS } from "../lib/auth/session-cookie";

beforeEach(() => {
  rows.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session storage", () => {
  it("stores a hash of the cookie token", async () => {
    const token = await createAccountSession("acct-1");
    expect(isSessionShaped(token)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(await hashSessionToken(token));
    expect(rows[0]?.id).not.toBe(token);
    await expect(resolveSessionAccountId(token)).resolves.toBe("acct-1");
  });

  it("drops an idle session instead of extending it", async () => {
    const token = await createAccountSession("acct-1");
    const row = rows[0];
    if (!row) throw new Error("missing session");
    row.lastSeenAt = Date.now() - SESSION_IDLE_MS;
    expect(sessionIdleExpired(row.lastSeenAt, Date.now())).toBe(true);
    await expect(resolveSessionAccountId(token)).resolves.toBeNull();
    expect(rows).toHaveLength(0);
  });

  it("revokes one session by token and every session for an account", async () => {
    const first = await createAccountSession("acct-1");
    const second = await createAccountSession("acct-1");
    await createAccountSession("acct-2");
    await revokeSession(first);
    expect(rows.map((row) => row.accountId)).toEqual(["acct-1", "acct-2"]);
    await expect(resolveSessionAccountId(first)).resolves.toBeNull();
    await expect(resolveSessionAccountId(second)).resolves.toBe("acct-1");
    await revokeAccountSessions("acct-1");
    expect(rows.map((row) => row.accountId)).toEqual(["acct-2"]);
  });

  it("does not treat an arbitrary string as a session token", async () => {
    expect(await resolveSessionAccountId("not-a-token")).toBeNull();
    expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

function isSessionShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
