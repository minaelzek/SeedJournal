export interface MemoryLineageRecord {
  entryId: string;
  parentEntryId?: string | null;
}

export interface MemoryLineage {
  entryId: string;
  parentEntryId: string | null;
  rootEntryId: string;
  ancestorEntryIds: string[];
  childEntryIds: string[];
  depth: number;
  isRevisit: boolean;
  orphaned: boolean;
  cycleDetected: boolean;
}

/**
 * Resolves journal revisit relationships without reading journal text. Invalid,
 * missing, self-referential, and cyclic parents never become render anchors.
 */
export function resolveMemoryLineage(
  records: readonly MemoryLineageRecord[],
  entryId: string,
): MemoryLineage | null {
  const byId = new Map<string, MemoryLineageRecord>();
  for (const record of records) {
    if (record.entryId && !byId.has(record.entryId)) {
      byId.set(record.entryId, record);
    }
  }

  const record = byId.get(entryId);
  if (!record) return null;

  const rawParentId = record.parentEntryId?.trim() || null;
  const parentEntryId =
    rawParentId && rawParentId !== entryId && byId.has(rawParentId)
      ? rawParentId
      : null;
  const orphaned = Boolean(
    rawParentId && rawParentId !== entryId && !byId.has(rawParentId),
  );
  const ancestorEntryIds: string[] = [];
  const visited = new Set<string>([entryId]);
  let cursor = parentEntryId;
  let cycleDetected = rawParentId === entryId;

  while (cursor) {
    if (visited.has(cursor)) {
      cycleDetected = true;
      break;
    }
    visited.add(cursor);
    ancestorEntryIds.push(cursor);
    const next = byId.get(cursor)?.parentEntryId?.trim() || null;
    cursor = next && byId.has(next) ? next : null;
  }

  const childEntryIds = records
    .filter(
      (candidate) =>
        candidate.entryId !== entryId &&
        candidate.parentEntryId?.trim() === entryId,
    )
    .map((candidate) => candidate.entryId)
    .filter((candidateId, index, all) => all.indexOf(candidateId) === index)
    .sort();

  return {
    entryId,
    parentEntryId: cycleDetected ? null : parentEntryId,
    rootEntryId: cycleDetected
      ? entryId
      : (ancestorEntryIds.at(-1) ?? entryId),
    ancestorEntryIds: cycleDetected ? [] : ancestorEntryIds,
    childEntryIds,
    depth: cycleDetected ? 0 : ancestorEntryIds.length,
    isRevisit: !cycleDetected && parentEntryId !== null,
    orphaned,
    cycleDetected,
  };
}

/**
 * Returns the valid parent memory anchor for a revisit growth event.
 */
export function memoryLineageAnchor(
  records: readonly MemoryLineageRecord[],
  entryId: string,
): string | null {
  return resolveMemoryLineage(records, entryId)?.parentEntryId ?? null;
}
