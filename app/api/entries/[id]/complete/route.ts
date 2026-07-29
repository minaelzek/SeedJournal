import { and, asc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { entries, growthEvents } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import type { GrowthKind } from "@/lib/contracts";
import { serializeEnvelope, serializeGrowthEvent } from "../../../_shared/data";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../../../_shared/http";
import {
  parseCompletion,
  parseEnvelope,
  parseExpectedRevision,
  parseUuid,
  requireObject,
} from "../../../_shared/validation";

type RouteContext = { params: Promise<{ id: string }> };

interface NewGrowthEvent {
  id: string;
  sequence: number;
  entryId: string;
  sourceCompletionId: string;
  occurredAt: number;
  localDate: string;
  kind: GrowthKind;
  growthUnits: 0 | 1 | 2 | 4 | 6;
  seed: number;
}

const MEMORY_KIND = {
  leaf: "memory_leaf",
  bud: "memory_bud",
  blossom: "memory_blossom",
  "luminous-blossom": "memory_luminous_blossom",
} as const;

export const POST = withApi(
  async (request: Request, context: RouteContext) => {
    await assertSafeMutation(request);
    const account = await resolveApiAccount();
    const id = parseUuid((await context.params).id);
    const body = requireObject(await readJson<unknown>(request));
    const expectedRevision = parseExpectedRevision(body.expectedRevision);
    const envelope = parseEnvelope(body.envelope);
    const completion = parseCompletion(body.completion);
    if (
      envelope.id !== id ||
      envelope.state !== "complete" ||
      envelope.revision !== expectedRevision + 1 ||
      !envelope.completedAt ||
      !envelope.localDay
    ) {
      throw new ApiRouteError(
        400,
        "invalid_completion",
        "The completed envelope or revision is invalid.",
      );
    }

    const db = getDb();
    const existing = await db.query.entries.findFirst({
      where: and(
        eq(entries.accountId, account.id),
        eq(entries.id, id),
      ),
    });
    if (!existing || existing.deletedAt !== null) {
      throw new ApiRouteError(404, "not_found", "The entry was not found.");
    }
    if (existing.completionId === completion.id) {
      const events = await db
        .select()
        .from(growthEvents)
        .where(
          and(
            eq(growthEvents.accountId, account.id),
            eq(growthEvents.sourceCompletionId, completion.id),
          ),
        )
        .orderBy(asc(growthEvents.sequence));
      return apiJson({
        entry: serializeEnvelope(existing),
        events: events.map(serializeGrowthEvent),
        idempotent: true,
      });
    }
    if (
      existing.state !== "draft" ||
      existing.revision !== expectedRevision ||
      existing.completionId !== null
    ) {
      throw new ApiRouteError(
        409,
        "revision_conflict",
        "The entry changed or was completed on another device.",
      );
    }

    const d1 = getD1();
    const metrics = await d1
      .prepare(
        `SELECT
           COALESCE(MAX(sequence), 0) AS lastSequence,
           COALESCE(SUM(growth_units), 0) AS totalUnits,
           COALESCE(SUM(CASE WHEN kind = 'twig' THEN 1 ELSE 0 END), 0) AS twigCount
         FROM growth_events
         WHERE account_id = ?`,
      )
      .bind(account.id)
      .first<{
        lastSequence: number;
        totalUnits: number;
        twigCount: number;
      }>();
    const lastSequence = Number(metrics?.lastSequence ?? 0);
    const totalUnits = Number(metrics?.totalUnits ?? 0);
    const twigCount = Number(metrics?.twigCount ?? 0);
    const createsTwig =
      Math.floor(totalUnits / 12) <
      Math.floor((totalUnits + completion.growthUnits) / 12);
    const createsBranch = createsTwig && (twigCount + 1) % 4 === 0;
    const now = Date.now();
    const eventSpecs: Array<{
      kind: GrowthKind;
      units: 0 | 1 | 2 | 4 | 6;
      seedOffset: number;
    }> = [
      { kind: "leaf", units: 0, seedOffset: 0x13579 },
      {
        kind: MEMORY_KIND[completion.memoryForm],
        units: completion.growthUnits,
        seedOffset: 0x2468a,
      },
      ...(createsTwig
        ? [{ kind: "twig" as const, units: 0 as const, seedOffset: 0x5a17 }]
        : []),
      ...(createsBranch
        ? [{ kind: "branch" as const, units: 0 as const, seedOffset: 0x6b28 }]
        : []),
    ];
    const newEvents: NewGrowthEvent[] = eventSpecs.map((spec, index) => ({
      id: crypto.randomUUID(),
      sequence: lastSequence + index + 1,
      entryId: id,
      sourceCompletionId: completion.id,
      occurredAt: envelope.completedAt!,
      localDate: envelope.localDay!,
      kind: spec.kind,
      growthUnits: spec.units,
      seed: (completion.seed ^ spec.seedOffset) & 0x7fffffff,
    }));

    const update = d1
      .prepare(
        `UPDATE entries
            SET state = 'complete', envelope_version = 1, iv = ?,
                ciphertext = ?, revision = ?, client_updated_at = ?,
                completed_at = ?, local_day = ?, completion_id = ?,
                updated_at = ?
          WHERE account_id = ? AND id = ? AND revision = ?
            AND state = 'draft' AND completion_id IS NULL
            AND deleted_at IS NULL`,
      )
      .bind(
        envelope.iv,
        envelope.ciphertext,
        envelope.revision,
        envelope.clientUpdatedAt,
        envelope.completedAt,
        envelope.localDay,
        completion.id,
        now,
        account.id,
        id,
        expectedRevision,
      );
    const inserts = newEvents.map((event) =>
      d1
        .prepare(
          `INSERT INTO growth_events (
             id, account_id, sequence, entry_id, source_completion_id,
             occurred_at, local_date, kind, growth_units, seed
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM entries
              WHERE account_id = ? AND id = ? AND completion_id = ?
                AND state = 'complete' AND deleted_at IS NULL
           )`,
        )
        .bind(
          event.id,
          account.id,
          event.sequence,
          event.entryId,
          event.sourceCompletionId,
          event.occurredAt,
          event.localDate,
          event.kind,
          event.growthUnits,
          event.seed,
          account.id,
          id,
          completion.id,
        ),
    );

    let results: Array<{ meta: { changes?: number } }>;
    try {
      results = await d1.batch([update, ...inserts]);
    } catch {
      throw new ApiRouteError(
        409,
        "completion_conflict",
        "Completion conflicted with another journal update. Refresh and try again.",
      );
    }
    if (
      (results[0]?.meta.changes ?? 0) !== 1 ||
      results.slice(1).some((result) => (result.meta.changes ?? 0) !== 1)
    ) {
      throw new ApiRouteError(
        409,
        "revision_conflict",
        "The entry changed or was completed on another device.",
      );
    }

    const completed = await db.query.entries.findFirst({
      where: and(eq(entries.accountId, account.id), eq(entries.id, id)),
    });
    if (!completed) {
      throw new Error("Completed entry could not be loaded.");
    }
    return apiJson(
      {
        entry: serializeEnvelope(completed),
        events: newEvents.map((event) => ({
          id: event.id,
          sequence: event.sequence,
          entryId: event.entryId,
          occurredAt: event.occurredAt,
          localDate: event.localDate,
          kind: event.kind,
          growthUnits: event.growthUnits,
          seed: event.seed,
        })),
        idempotent: false,
      },
      { status: 201 },
    );
  },
);
