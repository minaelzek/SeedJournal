import type {
  PromptCategory,
  ReflectionSignal,
  ReflectionSnapshot,
} from "@/lib/contracts";

export const REFLECTION_ENGINE_VERSION = "1" as const;

const SIGNALS: readonly ReflectionSignal[] = [
  "context",
  "emotion",
  "meaning",
  "perspective",
  "integration",
];

const ENGLISH_CLUES =
  /\b(?:i|me|my|mine|myself|we|our|today|yesterday|tomorrow|feel|felt|because|when|what|this|that|the|and|but|was|were|am|is|are|have|had|want|need|will|would|could|should)\b/giu;

const EMOTIONS = [
  "afraid",
  "angry",
  "anxious",
  "ashamed",
  "calm",
  "content",
  "confused",
  "disappointed",
  "embarrassed",
  "excited",
  "frustrated",
  "glad",
  "grateful",
  "grief",
  "guilty",
  "happy",
  "hopeful",
  "hurt",
  "jealous",
  "joy",
  "lonely",
  "nervous",
  "overwhelmed",
  "peaceful",
  "proud",
  "relieved",
  "resentful",
  "sad",
  "scared",
  "tender",
  "uneasy",
  "worried",
] as const;

const BODY_SENSATIONS =
  /\b(?:ache|aching|breath|chest|heavy|lightness|numb|pulse|shaky|stomach|tense|tension|tight|tired|warm|weight)\b/giu;

const CONTEXT_TIME =
  /\b(?:today|tonight|yesterday|morning|afternoon|evening|week|month|year|earlier|later|before|after|during|while|when|at\s+\d{1,2}(?::\d{2})?)\b/giu;
const CONTEXT_PLACE =
  /\b(?:at|in|inside|outside|near|beside|behind|across|home|office|work|school|room|kitchen|street|park|car|train|bus|store|table|door|window)\b/giu;
const CONTEXT_ACTION =
  /\b(?:asked|called|came|drove|heard|left|looked|met|noticed|opened|read|said|sat|saw|spoke|stood|talked|told|walked|watched|went|worked|wrote)\b/giu;
const SENSORY =
  /\b(?:bright|cold|dark|heard|loud|quiet|saw|scent|smell|soft|sound|taste|touched|warm|watched)\b/giu;
const RELATIONSHIP =
  /\b(?:friend|partner|mother|father|mom|dad|sister|brother|family|colleague|coworker|manager|teacher|child|son|daughter|they|them|we|us)\b/giu;

const MEANING =
  /\b(?:because|means?|matter(?:s|ed)?|important|value|care about|need|wanted?|realized?|understand|reminds? me|shows? me|taught me|the reason|what this says|at stake)\b/giu;
const PERSPECTIVE =
  /\b(?:maybe|perhaps|might|could be|another way|on the other hand|from .* perspective|i wonder|i'm not sure|i am not sure|part of me|another part|kind to myself|forgive myself|doing my best|it's understandable|it is understandable|both .* and)\b/giu;
const INTEGRATION =
  /\b(?:next time|from now on|tomorrow|i will|i'll|i want to|i intend|i plan|i can|i choose|i need to|i'm going to|i am going to|take away|learned|carry forward|remember|boundary|ask for|let go|try to)\b/giu;

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return Array.from(text.matchAll(pattern)).length;
}

function strengthFromEvidence(
  evidence: number,
  strongThreshold = 2,
): 0 | 1 | 2 {
  if (evidence <= 0) return 0;
  return evidence >= strongThreshold ? 2 : 1;
}

export function stripOpeningPrompt(body: string, renderedPrompt?: string): string {
  let result = body;
  if (renderedPrompt?.trim()) {
    const escaped = renderedPrompt
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "giu"), " ");
  }
  return result
    .replace(/^\s*(?:>|“|")(.{8,240})(?:”|")\s*$/gmu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function getReflectionMode(
  body: string,
): ReflectionSnapshot["mode"] {
  const letters = body.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return "english-rules";

  const nonLatin = letters.filter((letter) => !/\p{Script=Latin}/u.test(letter));
  if (nonLatin.length / letters.length >= 0.2) return "language-neutral";

  const clues = body.match(ENGLISH_CLUES) ?? [];
  if (letters.length >= 60 && clues.length === 0) return "language-neutral";
  return "english-rules";
}

export function evaluateReflection(
  rawBody: string,
  options: {
    category?: PromptCategory;
    renderedPrompt?: string;
  } = {},
): ReflectionSnapshot {
  const body = stripOpeningPrompt(rawBody, options.renderedPrompt);
  const mode = getReflectionMode(body);
  const emptyStrengths: ReflectionSnapshot["strengths"] = {
    context: 0,
    emotion: 0,
    meaning: 0,
    perspective: 0,
    integration: 0,
  };

  if (mode === "language-neutral") {
    return {
      engineVersion: REFLECTION_ENGINE_VERSION,
      mode,
      strengths: emptyStrengths,
      selectedTarget: "language-neutral",
    };
  }

  const firstPerson = /\b(?:i|me|my|mine|myself)\b/iu.test(body);
  const emotionWords = new RegExp(`\\b(?:${EMOTIONS.join("|")})\\b`, "giu");
  const contextEvidence = [
    countMatches(body, CONTEXT_TIME) > 0,
    countMatches(body, CONTEXT_PLACE) > 0,
    countMatches(body, CONTEXT_ACTION) > 0,
    countMatches(body, SENSORY) > 0,
    countMatches(body, RELATIONSHIP) > 0,
  ].filter(Boolean).length;
  const emotionEvidence =
    (firstPerson && countMatches(body, emotionWords) > 0 ? 1 : 0) +
    (firstPerson && countMatches(body, BODY_SENSATIONS) > 0 ? 1 : 0) +
    (countMatches(body, emotionWords) >= 2 ? 1 : 0);
  const meaningEvidence = countMatches(body, MEANING);
  const perspectiveEvidence = countMatches(body, PERSPECTIVE);
  const integrationEvidence = countMatches(body, INTEGRATION);

  const strengths: ReflectionSnapshot["strengths"] = {
    context: strengthFromEvidence(contextEvidence, 3),
    emotion: strengthFromEvidence(emotionEvidence, 2),
    meaning: strengthFromEvidence(meaningEvidence, 2),
    perspective: strengthFromEvidence(perspectiveEvidence, 2),
    integration: strengthFromEvidence(integrationEvidence, 2),
  };

  return {
    engineVersion: REFLECTION_ENGINE_VERSION,
    mode,
    strengths,
    selectedTarget: selectReflectionTarget(strengths, options.category ?? "open"),
  };
}

const CATEGORY_PRIORITIES: Readonly<
  Record<PromptCategory, readonly ReflectionSignal[]>
> = {
  moment: ["emotion", "meaning", "perspective", "integration", "context"],
  feeling: ["context", "meaning", "perspective", "integration", "emotion"],
  relationship: ["perspective", "emotion", "meaning", "integration", "context"],
  decision: ["meaning", "perspective", "integration", "emotion", "context"],
  change: ["meaning", "perspective", "integration", "emotion", "context"],
  gratitude: ["meaning", "context", "emotion", "integration", "perspective"],
  open: SIGNALS,
};

export function selectReflectionTarget(
  strengths: ReflectionSnapshot["strengths"],
  category: PromptCategory,
): ReflectionSignal | "deepen" {
  if (SIGNALS.every((signal) => strengths[signal] > 0)) return "deepen";
  const minimum = Math.min(...SIGNALS.map((signal) => strengths[signal]));
  return (
    CATEGORY_PRIORITIES[category].find(
      (signal) => strengths[signal] === minimum,
    ) ?? "context"
  );
}
