import { and, eq, isNull } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { entries } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import { serializeEnvelope } from "../../_shared/data";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../../_shared/http";
import {
  parseEnvelope,
  parseExpectedRevision,
  parseUuid,
  requireObject,
} from "../../_shared/validation";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApi(async (_request: Request, context: RouteContext) => {
  const account = await resolveApiAccount();
  const id = parseUuid((await context.params).id);
  const db = getDb();
  const entry = await db.query.entries.findFirst({
    where: and(
      eq(entries.accountId, account.id),
      eq(entries.id, id),
      isNull(entries.deletedAt),
    ),
  });
  if (!entry) {
    throw new ApiRouteError(404, "not_found", "The entry was not found.");
  }
  return apiJson({ entry: serializeEnvelope(entry) });
});

export const PUT = withApi(async (request: Request, context: RouteContext) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const id = parseUuid((await context.params).id);
  const body = requireObject(await readJson<unknown>(request));
  const expectedRevision = parseExpectedRevision(body.expectedRevision);
  const envelope = parseEnvelope(body.envelope);
  if (envelope.id !== id || envelope.revision !== expectedRevision + 1) {
    throw new ApiRouteError(
      400,
      "invalid_revision",
      "The envelope identifier or revision is invalid.",
    );
  }

  const db = getDb();
  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.accountId, account.id), eq(entries.id, id)),
  });
  if (!existing || existing.deletedAt !== null) {
    throw new ApiRouteError(404, "not_found", "The entry was not found.");
  }
  if (existing.revision !== expectedRevision) {
    throw new ApiRouteError(
      409,
      "revision_conflict",
      "The entry changed on another device.",
    );
  }
  if (
    existing.state === "complete" &&
    (envelope.state !== "complete" ||
      envelope.completedAt !== existing.completedAt ||
      envelope.localDay !== existing.localDay)
  ) {
    throw new ApiRouteError(
      400,
      "completed_entry_invariant",
      "Completed entry metadata cannot be changed.",
    );
  }

  const updated = await db
    .update(entries)
    .set({
      state: envelope.state,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
      revision: envelope.revision,
      clientUpdatedAt: envelope.clientUpdatedAt,
      completedAt: envelope.completedAt ?? null,
      localDay: envelope.localDay ?? null,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(entries.accountId, account.id),
        eq(entries.id, id),
        eq(entries.revision, expectedRevision),
        isNull(entries.deletedAt),
      ),
    )
    .returning();
  if (updated.length === 0) {
    throw new ApiRouteError(
      409,
      "revision_conflict",
      "The entry changed on another device.",
    );
  }
  return apiJson({ entry: serializeEnvelope(updated[0]) });
});

export const DELETE = withApi(
  async (request: Request, context: RouteContext) => {
    await assertSafeMutation(request);
    const account = await resolveApiAccount();
    const id = parseUuid((await context.params).id);
    const body = requireObject(await readJson<unknown>(request));
    const expectedRevision = parseExpectedRevision(body.expectedRevision);
    const db = getDb();
    const existing = await db.query.entries.findFirst({
      where: and(eq(entries.accountId, account.id), eq(entries.id, id)),
      columns: { revision: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw new ApiRouteError(404, "not_found", "The entry was not found.");
    }
    if (existing.revision !== expectedRevision) {
      throw new ApiRouteError(
        409,
        "revision_conflict",
        "The entry changed on another device.",
      );
    }

    const now = Date.now();
    const d1 = getD1();
    const [wipeResult] = await d1.batch([
      d1
        .prepare(
          `UPDATE entries
             SET ciphertext = '', iv = '', revision = revision + 1,
                 updated_at = ?, deleted_at = ?
           WHERE account_id = ? AND id = ? AND revision = ?
             AND deleted_at IS NULL`,
        )
        .bind(now, now, account.id, id, expectedRevision),
      d1
        .prepare(
          `UPDATE growth_events
              SET entry_id = NULL
            WHERE account_id = ? AND entry_id = ?
              AND EXISTS (
                SELECT 1 FROM entries
                 WHERE account_id = ? AND id = ? AND deleted_at = ?
              )`,
        )
        .bind(account.id, id, account.id, id, now),
    ]);
    if ((wipeResult.meta.changes ?? 0) !== 1) {
      throw new ApiRouteError(
        409,
        "revision_conflict",
        "The entry changed on another device.",
      );
    }
    return apiJson({ deleted: true, id });
  },
);
