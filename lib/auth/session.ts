import { getD1 } from "@/db";
import {
  createSessionToken,
  isSessionToken,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
} from "./session-cookie";

export {
  createSessionToken,
  isSessionToken,
  readCookieValue,
  readSessionTokenFromRequest,
  readSessionTokensFromRequest,
  SESSION_COOKIE_DEV,
  SESSION_COOKIE_PROD,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
  sessionClearCookieHeaders,
  sessionCookieName,
  sessionSetCookieHeader,
} from "./session-cookie";

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function sessionIdleExpired(lastSeenAt: number, now: number): boolean {
  if (!Number.isSafeInteger(lastSeenAt) || !Number.isSafeInteger(now)) {
    return true;
  }
  return now - lastSeenAt >= SESSION_IDLE_MS;
}

export async function createAccountSession(accountId: string): Promise<string> {
  const token = createSessionToken();
  const id = await hashSessionToken(token);
  const now = Date.now();
  await getD1()
    .prepare(
      `INSERT INTO sessions (id, account_id, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, accountId, now, now + SESSION_TTL_MS, now)
    .run();
  return token;
}

interface SessionRow {
  account_id: string;
  last_seen_at: number;
}

export async function resolveSessionAccountId(
  token: string | null,
): Promise<string | null> {
  if (!token || !isSessionToken(token)) return null;
  const id = await hashSessionToken(token);
  const now = Date.now();
  const row = await getD1()
    .prepare(
      `SELECT account_id, last_seen_at
         FROM sessions
        WHERE id = ? AND expires_at > ?`,
    )
    .bind(id, now)
    .first<SessionRow>();
  if (!row) return null;
  if (sessionIdleExpired(Number(row.last_seen_at), now)) {
    await getD1().prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
    return null;
  }
  await getD1()
    .prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();
  return row.account_id;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token || !isSessionToken(token)) return;
  const id = await hashSessionToken(token);
  await getD1().prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
}

export async function revokeAccountSessions(accountId: string): Promise<void> {
  await getD1()
    .prepare(`DELETE FROM sessions WHERE account_id = ?`)
    .bind(accountId)
    .run();
}
