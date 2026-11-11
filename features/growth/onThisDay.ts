/**
 * “On this day” rediscovery — market best practice (e.g. Day One) without streaks.
 * Matches calendar month-day so past years (and same-year earlier entries) resurface.
 */

const LOCAL_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function monthDayFromLocalDay(localDay: string): string | null {
  const match = LOCAL_DAY_PATTERN.exec(localDay.trim());
  if (!match) return null;
  return `${match[2]}-${match[3]}`;
}

export interface OnThisDayMemoryLike {
  entryId: string;
  /** ISO-ish local day YYYY-MM-DD when known. */
  localDay?: string | null;
  /** Fallback when localDay missing: epoch ms. */
  occurredAt?: number | null;
  dateLabel?: string;
}

/**
 * Memories whose calendar month-day matches `todayLocalDay`, excluding today itself
 * when `excludeToday` is true (default) so the dock does not re-list today's work.
 */
export function selectOnThisDayMemories<T extends OnThisDayMemoryLike>(
  memories: readonly T[],
  todayLocalDay: string,
  options?: { excludeToday?: boolean; limit?: number },
): T[] {
  const todayKey = monthDayFromLocalDay(todayLocalDay);
  if (!todayKey) return [];

  const excludeToday = options?.excludeToday !== false;
  const limit = Math.max(1, Math.floor(options?.limit ?? 5));

  const hits = memories.filter((memory) => {
    const day =
      (memory.localDay && monthDayFromLocalDay(memory.localDay)) ||
      (typeof memory.occurredAt === "number" && Number.isFinite(memory.occurredAt)
        ? monthDayFromEpoch(memory.occurredAt)
        : null);
    if (!day || day !== todayKey) return false;
    if (excludeToday && memory.localDay === todayLocalDay) return false;
    return true;
  });

  // Prefer older years first (nostalgia), then stable entry id.
  hits.sort((left, right) => {
    const leftDay = left.localDay ?? "";
    const rightDay = right.localDay ?? "";
    if (leftDay !== rightDay) return leftDay.localeCompare(rightDay);
    return left.entryId.localeCompare(right.entryId);
  });

  return hits.slice(0, limit);
}

function monthDayFromEpoch(occurredAt: number): string | null {
  try {
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  } catch {
    return null;
  }
}
