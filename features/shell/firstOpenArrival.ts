/**
 * First-open arrival on the home garden.
 * One line, alone. The journal button waits until the beat ends.
 * Reduced motion never plays, so the button is there immediately.
 * Plays once for a seed so welcome → home is a single beat.
 */

export const FIRST_OPEN_STORAGE_KEY = "seed-journal:first-open-seen";
export const FIRST_OPEN_ARRIVAL_MS = 3200;

export function shouldPlayFirstOpenArrival(input: {
  isSeed: boolean;
  alreadySeen: boolean;
  arriveQuery: boolean;
  reducedMotion: boolean;
}): boolean {
  if (!input.isSeed) return false;
  if (input.reducedMotion) return false;
  if (input.arriveQuery) return true;
  return !input.alreadySeen;
}

/** Home renders `title` only, and only for the beat. Eyebrow and description stay for tone checks. */
export const FIRST_OPEN_BEATS = [
  {
    eyebrow: "A private garden",
    title: "A seed is waiting.",
    description: "A few honest words wake it.",
  },
] as const;
