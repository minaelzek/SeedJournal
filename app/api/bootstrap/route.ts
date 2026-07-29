import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { entries, vaults } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import { apiJson, issueCsrf, withApi } from "../_shared/http";

export const GET = withApi(async (request: Request) => {
  const account = await resolveApiAccount();
  const db = getDb();
  const [vault, entryCount] = await Promise.all([
    db.query.vaults.findFirst({
      where: eq(vaults.accountId, account.id),
      columns: { accountId: true },
    }),
    db
      .select({ value: count() })
      .from(entries)
      .where(
        and(eq(entries.accountId, account.id), isNull(entries.deletedAt)),
      )
      .then((rows) => rows[0]?.value ?? 0),
  ]);
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
      },
      vault: { configured: Boolean(vault) },
      journal: { entryCount },
      csrfToken: csrf.token,
    },
    { headers },
  );
});
