import { buildLifelongSakuraSegments } from "./lifelongSakura";
import type { LivingSakuraSegment } from "./livingTopology";

/** Journals 12–191 are the mid-life habit window (sapling → established). */
export const LIFE_CHAPTER_MIN_JOURNALS = 12;
export const LIFE_CHAPTER_MAX_JOURNALS = 191;

export function isLifeChapter(journalCount: number): boolean {
  const n = Math.max(0, Math.floor(journalCount));
  return n >= LIFE_CHAPTER_MIN_JOURNALS && n <= LIFE_CHAPTER_MAX_JOURNALS;
}

/**
 * World-scale wood for any grown companion. Same lifelong ids as the sprout
 * stem — later chapters only append children.
 */
export function buildLifeChapterSegments(
  rootSeed: string,
  journalCount: number,
): LivingSakuraSegment[] {
  return buildLifelongSakuraSegments(
    rootSeed,
    Math.max(12, Math.floor(journalCount)),
  );
}
