import type {
  JournalEntryPayloadV1,
  PromptCategory,
  ReflectionSignal,
} from "@/lib/contracts";

export type GardenWeatherKind =
  | "still"
  | "dew"
  | "mist"
  | "breeze"
  | "sunbreak";

export interface GardenWeather {
  kind: GardenWeatherKind;
  label: string;
  description: string;
}

const WEATHER_BY_SIGNAL: Record<
  ReflectionSignal | "deepen" | "language-neutral",
  GardenWeather
> = {
  context: {
    kind: "dew",
    label: "Morning dew",
    description: "The garden is holding the details gently.",
  },
  emotion: {
    kind: "mist",
    label: "Soft mist",
    description: "Feeling has settled softly around the tree.",
  },
  meaning: {
    kind: "sunbreak",
    label: "Light through leaves",
    description: "A little meaning is warming the garden.",
  },
  perspective: {
    kind: "breeze",
    label: "Turning breeze",
    description: "A new perspective is moving through the branches.",
  },
  integration: {
    kind: "dew",
    label: "Clearing dew",
    description: "What you want to carry is resting with the tree.",
  },
  deepen: {
    kind: "sunbreak",
    label: "Open sky",
    description: "The garden feels spacious after a full reflection.",
  },
  "language-neutral": {
    kind: "still",
    label: "Quiet air",
    description: "The garden is resting with your words.",
  },
};

const WEATHER_BY_CATEGORY: Record<PromptCategory, GardenWeather> = {
  moment: WEATHER_BY_SIGNAL.context,
  feeling: WEATHER_BY_SIGNAL.emotion,
  relationship: WEATHER_BY_SIGNAL.perspective,
  decision: WEATHER_BY_SIGNAL.integration,
  change: WEATHER_BY_SIGNAL.perspective,
  gratitude: WEATHER_BY_SIGNAL.meaning,
  open: WEATHER_BY_SIGNAL["language-neutral"],
};

/**
 * Creates atmosphere only from content already decrypted on the user's
 * device. Weather is expressive, never a score or judgment.
 */
export function weatherForEntry(
  entry?: Pick<JournalEntryPayloadV1, "prompt" | "reflection">,
): GardenWeather {
  if (!entry) {
    return {
      kind: "still",
      label: "Quiet air",
      description: "The garden is waiting without hurry.",
    };
  }

  const target = entry.reflection?.selectedTarget;
  return target
    ? WEATHER_BY_SIGNAL[target]
    : WEATHER_BY_CATEGORY[entry.prompt.category];
}
