import { buildLifelongSakuraSegments } from "./lifelongSakura";

/** Journals 1–11 are a tender sprout, not a prefix of the adult vase. */
export const YOUTH_CHAPTER_MAX_JOURNALS = 11;

export function isYouthChapter(journalCount: number): boolean {
  const n = Math.max(0, Math.floor(journalCount));
  return n > 0 && n <= YOUTH_CHAPTER_MAX_JOURNALS;
}

/** 1, then 2, then 3, then 4 from journal 4. Cap 4 (stem + 4 = 5 segments). */
export function youthShootCount(journalCount: number): number {
  const n = Math.min(
    YOUTH_CHAPTER_MAX_JOURNALS,
    Math.max(1, Math.floor(journalCount)),
  );
  return Math.min(4, n);
}

/**
 * Tender first-year seedling: the same stem that will become the lifelong bole.
 */
export function buildYouthChapterSegments(
  rootSeed: string,
  journalCount: number,
) {
  const n = Math.min(
    YOUTH_CHAPTER_MAX_JOURNALS,
    Math.max(1, Math.floor(journalCount)),
  );
  return buildLifelongSakuraSegments(rootSeed, n).filter(
    (segment) =>
      segment.id === "youth/stem" || segment.id.startsWith("youth/shoot/"),
  );
}
