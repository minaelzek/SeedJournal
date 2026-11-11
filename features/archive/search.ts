import type { PromptCategory } from "@/lib/contracts";
import type { DecryptedJournalEntry } from "@/features/journal";
import { monthDayFromLocalDay } from "@/features/growth/onThisDay";

export interface ArchiveFilters {
  query?: string;
  category?: PromptCategory | "all";
  tag?: string;
  from?: number;
  to?: number;
  /**
   * When set (YYYY-MM-DD), keep entries that share that calendar month-day
   * (On This Day rediscovery). Does not require the same year.
   */
  onThisDayLocalDay?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function searchableText(entry: DecryptedJournalEntry): string {
  const payload = entry.payload;
  return normalize(
    [
      payload.title,
      payload.body,
      payload.seedInsight,
      payload.prompt.renderedText,
      payload.followUp?.renderedText,
      payload.followUp?.response,
      payload.secondFollowUp?.renderedText,
      payload.secondFollowUp?.response,
      ...payload.tags,
      ...payload.threads,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function searchEntries(
  entries: readonly DecryptedJournalEntry[],
  filters: ArchiveFilters = {},
): DecryptedJournalEntry[] {
  const terms = normalize(filters.query ?? "")
    .split(" ")
    .filter(Boolean);
  const normalizedTag = normalize(filters.tag ?? "");

  const onThisDayKey = filters.onThisDayLocalDay
    ? monthDayFromLocalDay(filters.onThisDayLocalDay)
    : null;

  return entries
    .filter((entry) => {
      const completedAt =
        entry.completedAt ?? entry.updatedAt ?? entry.createdAt;
      if (filters.from && completedAt < filters.from) return false;
      if (filters.to && completedAt > filters.to) return false;
      if (
        filters.category &&
        filters.category !== "all" &&
        entry.payload.prompt.category !== filters.category
      ) {
        return false;
      }
      if (
        normalizedTag &&
        !entry.payload.tags.some((tag) => normalize(tag) === normalizedTag)
      ) {
        return false;
      }
      if (onThisDayKey) {
        const entryDay =
          (entry.localDay && monthDayFromLocalDay(entry.localDay)) ||
          monthDayFromCompletedAt(completedAt);
        if (entryDay !== onThisDayKey) return false;
      }
      if (terms.length > 0) {
        const haystack = searchableText(entry);
        if (!terms.every((term) => haystack.includes(term))) return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        (right.completedAt ?? right.updatedAt) -
          (left.completedAt ?? left.updatedAt) ||
        right.id.localeCompare(left.id),
    );
}

function monthDayFromCompletedAt(completedAt: number): string | null {
  try {
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  } catch {
    return null;
  }
}

export function collectArchiveTags(
  entries: readonly DecryptedJournalEntry[],
): string[] {
  const displayByNormalized = new Map<string, string>();
  entries.forEach((entry) => {
    entry.payload.tags.forEach((tag) => {
      const trimmed = tag.trim();
      if (trimmed) displayByNormalized.set(normalize(trimmed), trimmed);
    });
  });
  return [...displayByNormalized.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, display]) => display);
}

export function entryExcerpt(body: string, maxGraphemes = 150): string {
  const clean = body.replace(/\s+/gu, " ").trim();
  if (!clean) return "A quiet seed.";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(clean),
    );
    if (segments.length <= maxGraphemes) return clean;
    return `${segments
      .slice(0, maxGraphemes)
      .map((item) => item.segment)
      .join("")
      .trimEnd()}…`;
  }
  return clean.length > maxGraphemes
    ? `${clean.slice(0, maxGraphemes).trimEnd()}…`
    : clean;
}
