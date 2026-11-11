import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import {
  createSessionToken,
  isSessionToken,
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
  SESSION_TTL_MS,
  sessionClearCookieHeaders,
  sessionCookieName,
  sessionSetCookieHeader,
} from "./session-cookie";

export async function createAccountSession(accountId: string): Promise<string> {
  const token = createSessionToken();
  const now = Date.now();
  const db = getDb();
  await db.insert(sessions).values({
    id: token,
    accountId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
  });
  return token;
}

export async function resolveSessionAccountId(
  token: string | null,
): Promise<string | null> {
  if (!token || !isSessionToken(token)) return null;
  const now = Date.now();
  const db = getDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, token), gt(sessions.expiresAt, now)),
  });
  if (!session) return null;
  await db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(eq(sessions.id, token));
  return session.accountId;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token || !isSessionToken(token)) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function revokeAccountSessions(accountId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.accountId, accountId));
}
