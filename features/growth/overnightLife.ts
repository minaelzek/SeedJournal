/**
 * Overnight companion presence — named next growth, and sleep (never wilt).
 * Pure copy helpers; no streak or absence-shame language.
 */

export interface NamedGrowthPreview {
  label: string;
  description: string;
}

export interface AbsenceSleep {
  sleeping: boolean;
  dew: boolean;
}

function preview(label: string, description: string): NamedGrowthPreview {
  return { label, description };
}

/**
 * Week-one named previews and chapter-gate teases.
 * After the mature vase, there is no next named form.
 */
export function nextNamedGrowth(
  journalCount: number,
): NamedGrowthPreview | null {
  const count = Number.isFinite(journalCount)
    ? Math.max(0, Math.floor(journalCount))
    : 0;

  if (count === 0) {
    return preview(
      "A cherry stone is waiting to open.",
      "The first honest page will wake the stone.",
    );
  }
  if (count === 1) {
    return preview(
      "A second shoot is gathering.",
      "Another tender stem is gathering beside the first.",
    );
  }
  if (count === 2) {
    return preview(
      "Another lateral is gathering.",
      "A new lateral is gathering from the living stem.",
    );
  }
  if (count === 3) {
    return preview(
      "A third shoot is gathering.",
      "A third tender shoot is gathering along the stem.",
    );
  }
  if (count <= 6) {
    return preview(
      "The stem is gathering more pink life.",
      "Pink is gathering along the lengthening stem.",
    );
  }
  if (count <= 10) {
    return preview(
      "The sprout is still lengthening.",
      "The sprout is still reaching, quiet and green.",
    );
  }
  if (count === 11) {
    return preview(
      "A sapling whip is gathering.",
      "The next chapter is a single sapling whip.",
    );
  }
  if (count === 47) {
    return preview(
      "An open V is gathering.",
      "Two unequal leaders are gathering into an open V.",
    );
  }
  if (count === 95) {
    return preview(
      "A low sweeping bough is gathering.",
      "A low sweeping bough is gathering at the established crown.",
    );
  }
  if (count === 191) {
    return preview(
      "The mature vase is gathering.",
      "The mature vase is gathering its open crown.",
    );
  }
  if (count >= 192) return null;

  return preview(
    "The crown is still answering.",
    "The living crown is still answering your care.",
  );
}

/**
 * Absence is sleep, not wilt. Dew gathers on an open day after the companion
 * has begun — never a mark against the person who did not write.
 */
export function absenceSleep(input: {
  tendedToday: boolean;
  hasBegun: boolean;
}): AbsenceSleep {
  const resting = input.hasBegun && !input.tendedToday;
  return { sleeping: resting, dew: resting };
}
