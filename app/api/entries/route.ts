import {
  and,
  desc,
  eq,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { getDb } from "@/db";
import { entries } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import {
  decodeEntryCursor,
  encodeEntryCursor,
  serializeEnvelope,
} from "../_shared/data";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../_shared/http";
import { parseEnvelope, parseLimit } from "../_shared/validation";

export const GET = withApi(async (request: Request) => {
  const account = await resolveApiAccount();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorValue = url.searchParams.get("cursor");
  const cursor = decodeEntryCursor(cursorValue);
  if (cursorValue && !cursor) {
    throw new ApiRouteError(400, "invalid_cursor", "The page cursor is invalid.");
  }
  const filters = [
    eq(entries.accountId, account.id),
    isNull(entries.deletedAt),
  ];
  if (cursor) {
    filters.push(
      or(
        lt(entries.updatedAt, cursor.updatedAt),
        and(
          eq(entries.updatedAt, cursor.updatedAt),
          lt(entries.id, cursor.id),
        ),
      )!,
    );
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(entries)
    .where(and(...filters))
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return apiJson({
    entries: page.map(serializeEnvelope),
    nextCursor:
      rows.length > limit && last
        ? encodeEntryCursor(last.updatedAt, last.id)
        : null,
  });
});

export const POST = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const envelope = parseEnvelope(await readJson<unknown>(request));
  if (envelope.revision !== 1 || envelope.state !== "draft") {
    throw new ApiRouteError(
      400,
      "invalid_initial_envelope",
      "A new entry must be a revision-one draft.",
    );
  }
  const now = Date.now();
  const db = getDb();
  const inserted = await db
    .insert(entries)
    .values({
      accountId: account.id,
      ...envelope,
      completedAt: envelope.completedAt ?? null,
      localDay: envelope.localDay ?? null,
      completionId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoNothing({
      target: [entries.accountId, entries.id],
    })
    .returning();
  if (inserted.length > 0) {
    return apiJson(
      { entry: serializeEnvelope(inserted[0]), idempotent: false },
      { status: 201 },
    );
  }

  const existing = await db.query.entries.findFirst({
    where: and(
      eq(entries.accountId, account.id),
      eq(entries.id, envelope.id),
    ),
  });
  if (
    existing &&
    existing.deletedAt === null &&
    sameEnvelope(existing, envelope)
  ) {
    return apiJson({
      entry: serializeEnvelope(existing),
      idempotent: true,
    });
  }
  throw new ApiRouteError(
    409,
    "entry_exists",
    "An entry with this identifier already exists.",
  );
});

function sameEnvelope(
  row: typeof entries.$inferSelect,
  envelope: ReturnType<typeof parseEnvelope>,
): boolean {
  return (
    row.state === envelope.state &&
    row.envelopeVersion === envelope.envelopeVersion &&
    row.iv === envelope.iv &&
    row.ciphertext === envelope.ciphertext &&
    row.revision === envelope.revision &&
    row.clientCreatedAt === envelope.clientCreatedAt &&
    row.clientUpdatedAt === envelope.clientUpdatedAt
  );
}
