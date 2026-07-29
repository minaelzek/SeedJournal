import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { growthEvents } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import { serializeGrowthEvent } from "../_shared/data";
import { ApiRouteError, apiJson, withApi } from "../_shared/http";
import { parseLimit } from "../_shared/validation";

export const GET = withApi(async (request: Request) => {
  const account = await resolveApiAccount();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 100);
  const afterValue = url.searchParams.get("after") ?? "0";
  const after = Number(afterValue);
  if (!Number.isSafeInteger(after) || after < 0) {
    throw new ApiRouteError(
      400,
      "invalid_cursor",
      "The growth cursor is invalid.",
    );
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(growthEvents)
    .where(
      and(
        eq(growthEvents.accountId, account.id),
        gt(growthEvents.sequence, after),
      ),
    )
    .orderBy(asc(growthEvents.sequence))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return apiJson({
    previousSequence: after,
    nextSequence: page.at(-1)?.sequence ?? after,
    events: page.map(serializeGrowthEvent),
    hasMore: rows.length > limit,
  });
});
