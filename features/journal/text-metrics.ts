export interface ReflectionEligibility {
  eligible: boolean;
  wordLikeTokens: number;
  graphemes: number;
}

export function measureReflectionEligibility(
  body: string,
): ReflectionEligibility {
  const graphemes = segmentCount(body, "grapheme");
  const wordLikeTokens = wordCount(body);
  return {
    eligible: wordLikeTokens >= 12 || graphemes >= 60,
    wordLikeTokens,
    graphemes,
  };
}

function segmentCount(
  value: string,
  granularity: Intl.SegmenterOptions["granularity"],
): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity });
    return Array.from(segmenter.segment(value)).length;
  }
  return Array.from(value).length;
}

function wordCount(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "word",
    });
    return Array.from(segmenter.segment(value)).filter(
      (segment) => segment.isWordLike,
    ).length;
  }
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

