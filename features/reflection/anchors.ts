const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "before",
  "being",
  "could",
  "didn't",
  "does",
  "doing",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "most",
  "much",
  "myself",
  "really",
  "should",
  "some",
  "something",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "think",
  "this",
  "those",
  "through",
  "today",
  "very",
  "want",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

const UNSAFE_ANCHORS = new Set([
  "abuse",
  "assault",
  "blood",
  "diagnosis",
  "disorder",
  "dying",
  "kill",
  "killed",
  "medical",
  "medication",
  "murder",
  "pregnant",
  "pregnancy",
  "selfharm",
  "suicide",
  "trauma",
]);

function words(text: string): string[] {
  return (text.normalize("NFC").toLocaleLowerCase().match(/\p{L}[\p{L}'’-]*/gu) ??
    [])
    .map((word) => word.replace(/^[’'-]+|[’'-]+$/gu, ""))
    .filter(
      (word) =>
        word.length >= 4 &&
        word.length <= 28 &&
        !STOP_WORDS.has(word) &&
        !UNSAFE_ANCHORS.has(word) &&
        !/\d|@|https?|www/iu.test(word),
    );
}

export function extractSafeAnchor(body: string): string | undefined {
  const candidates = words(body);
  const counts = new Map<string, { count: number; first: number }>();
  candidates.forEach((word, index) => {
    const current = counts.get(word);
    counts.set(word, {
      count: (current?.count ?? 0) + 1,
      first: current?.first ?? index,
    });
  });

  return [...counts.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort(
      ([leftWord, left], [rightWord, right]) =>
        right.count - left.count ||
        left.first - right.first ||
        leftWord.localeCompare(rightWord),
    )[0]?.[0];
}

export function extractLongitudinalAnchor(
  currentBody: string,
  previousBodies: readonly string[],
): string | undefined {
  const current = new Set(words(currentBody));
  const occurrence = new Map<string, number>();

  previousBodies.slice(0, 10).forEach((body) => {
    new Set(words(body)).forEach((word) => {
      if (current.has(word)) {
        occurrence.set(word, (occurrence.get(word) ?? 0) + 1);
      }
    });
  });

  return [...occurrence.entries()]
    .filter(([, count]) => count >= 2)
    .sort(
      ([leftWord, leftCount], [rightWord, rightCount]) =>
        rightCount - leftCount || leftWord.localeCompare(rightWord),
    )[0]?.[0];
}

