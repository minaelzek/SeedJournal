import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, growthEvents } from "@/db/schema";
import { isTreeSeed } from "@/features/garden/pendingTreeSeed";
import { resolveApiAccount } from "@/lib/auth/account";
import {
  readSessionTokensFromRequest,
  revokeAccountSessions,
  revokeSession,
  sessionClearCookieHeaders,
} from "@/lib/auth/session";
import {
  CSRF_COOKIE,
  CSRF_COOKIE_DEV,
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../_shared/http";
import { requireObject } from "../_shared/validation";

export const PATCH = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const body = requireObject(await readJson<unknown>(request));
  if (body.treeSeed === undefined) {
    return apiJson({ treeSeed: account.treeSeed });
  }
  if (!isTreeSeed(body.treeSeed)) {
    throw new ApiRouteError(
      400,
      "invalid_tree_seed",
      "The tree seed must be 16 to 64 hexadecimal characters.",
    );
  }

  const treeSeed = body.treeSeed.toLowerCase();
  if (treeSeed === account.treeSeed) {
    return apiJson({ treeSeed: account.treeSeed });
  }

  const db = getDb();
  const growthCount = await db
    .select({ value: count() })
    .from(growthEvents)
    .where(eq(growthEvents.accountId, account.id))
    .then((rows) => rows[0]?.value ?? 0);
  if (growthCount > 0) {
    throw new ApiRouteError(
      409,
      "tree_seed_locked",
      "This garden already has growth, so its seed cannot change.",
    );
  }

  const updatedAt = Date.now();
  await db
    .update(accounts)
    .set({ treeSeed, updatedAt })
    .where(eq(accounts.id, account.id));
  return apiJson({ treeSeed });
});

export const DELETE = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const body = requireObject(await readJson<unknown>(request));
  if (body.confirmation !== "DELETE") {
    throw new ApiRouteError(
      400,
      "confirmation_required",
      "Type DELETE to confirm account deletion.",
    );
  }
  await revokeAccountSessions(account.id);
  for (const token of readSessionTokensFromRequest(request)) {
    await revokeSession(token);
  }
  const db = getDb();
  await db.delete(accounts).where(eq(accounts.id, account.id));
  const headers = new Headers();
  for (const cookie of sessionClearCookieHeaders()) {
    headers.append("Set-Cookie", cookie);
  }
  headers.append("Set-Cookie", clearCsrfCookieHeader());
  return apiJson({ deleted: true }, { headers });
});

function clearCsrfCookieHeader(): string {
  const production = process.env.NODE_ENV === "production";
  const parts = [
    `${production ? CSRF_COOKIE : CSRF_COOKIE_DEV}=`,
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (production) parts.push("Secure");
  return parts.join("; ");
}
