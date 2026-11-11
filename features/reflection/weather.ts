import type {
  JournalEntryPayloadV1,
  PromptCategory,
  ReflectionSignal,
} from "@/lib/contracts";

export type GardenWeatherKind =
  | "still"
  | "dew"
  | "mist"
  | "rain"
  | "breeze"
  | "sunbreak"
  | "restless";

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

const RAIN: GardenWeather = {
  kind: "rain",
  label: "Soft rain",
  description: "The garden is keeping company in the rain.",
};

const HEAVY_LANGUAGE =
  /\b(?:sad|sadder|saddest|depress(?:ed|ing|ion)?|grief|griev(?:e|ing|ed)|mourn(?:ing|ed)?|hopeless|alone|lonely|hurt|hurting|tears?|crying|cried|wept|heartbroken|despair|worthless|empty|loss|aching|brokenhearted|miserable)\b/iu;
const GLAD_LANGUAGE =
  /\b(?:happy|happier|happiest|grateful|gratitude|joy(?:ful)?|glad|thankful|hope(?:ful)?|peace(?:ful)?|laugh(?:ed|ing)?|smil(?:e|ed|ing)|wonderful|delighted|content|warmth|relieved|enjoyed|enjoy)\b/iu;
const RESTLESS_LANGUAGE =
  /\b(?:anxious|anxiety|worried|worry|scared|afraid|fear|nervous|restless|uneasy)\b/iu;
const NEGATION = /\b(?:not|never|no|without)\b|\b[\p{L}]+n't\b/iu;

const RESTLESS: GardenWeather = {
  kind: "restless",
  label: "Restless air",
  description: "The garden is awake with you, and the tree is unhurt.",
};

function lexiconHit(text: string, pattern: RegExp): boolean {
  const clauses = text.split(/[,;:.!?]|[\u2014\u2013]|\b(?:and|but)\b/iu);
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const expression = new RegExp(pattern.source, flags);
  for (const clause of clauses) {
    for (const match of clause.matchAll(expression)) {
      const at = match.index ?? 0;
      const before = clause.slice(Math.max(0, at - 18), at);
      if (NEGATION.test(before)) continue;
      return true;
    }
  }
  return false;
}

function spokenReflection(
  entry: Partial<
    Pick<JournalEntryPayloadV1, "body" | "followUp" | "secondFollowUp">
  >,
): string {
  return [
    entry.body ?? "",
    entry.followUp && !entry.followUp.skipped ? entry.followUp.response : "",
    entry.secondFollowUp && !entry.secondFollowUp.skipped
      ? entry.secondFollowUp.response
      : "",
  ]
    .join(" ")
    .trim();
}

function localAtmosphereFromWriting(
  entry: Pick<JournalEntryPayloadV1, "prompt" | "reflection"> &
    Partial<
      Pick<JournalEntryPayloadV1, "body" | "followUp" | "secondFollowUp">
    >,
): GardenWeather | null {
  const writing = spokenReflection(entry);
  if (!writing) return null;
  const heavy = lexiconHit(writing, HEAVY_LANGUAGE);
  const glad = lexiconHit(writing, GLAD_LANGUAGE);
  const restless = lexiconHit(writing, RESTLESS_LANGUAGE);
  // Mood changes the sky only. Mixed days stay mist, never a penalty.
  if (heavy && glad) return WEATHER_BY_SIGNAL.emotion;
  if (heavy && !glad) return RAIN;
  if (glad && !heavy) return WEATHER_BY_SIGNAL.meaning;
  if (restless) return RESTLESS;
  return {
    kind: "still",
    label: "Quiet air",
    description: "The garden is resting with your words.",
  };
}

/**
 * Creates atmosphere only from content already decrypted on the user's
 * device. Weather is the garden's weather — never a score or judgment.
 */
export function weatherForEntry(
  entry?: Pick<JournalEntryPayloadV1, "prompt" | "reflection"> &
    Partial<
      Pick<JournalEntryPayloadV1, "body" | "followUp" | "secondFollowUp">
    >,
): GardenWeather {
  if (!entry) {
    return {
      kind: "still",
      label: "Quiet air",
      description: "The garden is waiting without hurry.",
    };
  }

  const fromWriting = localAtmosphereFromWriting(entry);
  if (fromWriting) return fromWriting;

  if (spokenReflection(entry)) {
    return WEATHER_BY_SIGNAL["language-neutral"];
  }

  const target = entry.reflection?.selectedTarget;
  return target
    ? WEATHER_BY_SIGNAL[target]
    : WEATHER_BY_CATEGORY[entry.prompt.category];
}
