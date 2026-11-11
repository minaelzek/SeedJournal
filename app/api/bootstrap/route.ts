import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { entries } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import { ensureAccountDataKey } from "@/lib/auth/account-key";
import { apiJson, issueCsrf, withApi } from "../_shared/http";

export const GET = withApi(async (request: Request) => {
  const account = await resolveApiAccount();
  const dataKey = await ensureAccountDataKey(account.id);
  const db = getDb();
  const entryCount = await db
    .select({ value: count() })
    .from(entries)
    .where(and(eq(entries.accountId, account.id), isNull(entries.deletedAt)))
    .then((rows) => rows[0]?.value ?? 0);
  const csrf = issueCsrf(request);
  const headers = csrf.setCookie
    ? { "Set-Cookie": csrf.setCookie }
    : undefined;

  return apiJson(
    {
      account: {
        id: account.id,
        treeSeed: account.treeSeed,
        treeAlgorithmVersion: account.treeAlgorithmVersion,
        email: account.email,
        displayName: account.displayName,
      },
      vault: { configured: true, wrap: "session" },
      dataKey,
      journal: { entryCount },
      csrfToken: csrf.token,
    },
    { headers },
  );
});
