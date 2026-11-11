/**
 * Phrase-level reading of a journal body so follow-ups can stay with
 * what is already alive — not a single repeated token stuffed into a template.
 * Runs on-device after decrypt. No model required.
 */

export interface SceneQuestion {
  id: string;
  text: string;
}

export interface WritingScene {
  causePhrase?: string;
  affectPhrase?: string;
  peoplePhrase?: string;
  eventPhrase?: string;
  loopPhrase?: string;
  placePhrase?: string;
  stayPhrase?: string;
  questions: readonly SceneQuestion[];
}

const PHRASE_MIN = 8;
const PHRASE_MAX = 140;

const PEOPLE_NOUNS =
  "friends?|partner|boyfriend|girlfriend|husband|wife|mom|dad|mother|father|sister|brother|family|colleague|coworker|manager|boss|teammate|roommate|therapist|grandma|grandpa|grandmother|grandfather|nana|aunt|uncle|cousin|neighbor|teacher|client|doctor|kids?|child|son|daughter|parents?";

const PEOPLE = new RegExp(`\\b(?:my\\s+)?(?:${PEOPLE_NOUNS})\\b`, "iu");
const MY_PEOPLE = new RegExp(`\\bmy\\s+(?:${PEOPLE_NOUNS})\\b`, "iu");

const EVENTS =
  /\b(?:concert|show|gig|dinner|lunch|breakfast|walk|hike|trip|party|wedding|funeral|class|meeting|game|match|flight|drive|date|vacation|holiday|interview|appointment)\b/iu;

const AFFECT =
  /\b(?:enjoyed|enjoy|happy|happier|glad|grateful|thankful|loved|love|relieved|proud|peaceful|calm|safe|held|cared|sad|lonely|hurt|afraid|anxious|angry|overwhelmed|tired|hopeful|tender|content|wonderful|worried|nervous|uneasy|scared|missing|missed|miss)\b/iu;

const PLACES =
  "hometown|living room|apartment|hallway|bedroom|kitchen|garden|office|house|home|room|street|park|school|campus|train|city|desk|porch|yard|car|bus";

const QUALITIES =
  "quiet|loud|empty|full|warm|cold|dark|bright|lonely|still|silent|cramped|spacious|heavy|safe|soft|honest|peaceful|calm|tense|hollow|close|far";

const CAUSE =
  /\b(?:because|since|'cause|’cause|cause|so that|which made me|that made me)\s+(.+?)(?:[.!?;]|$)/giu;

const LOOP_KEEP =
  /\bI\s+keep(?:\s+on)?\s+(\w+ing\b.+?)(?:[.!?;]|$)/giu;
const LOOP_STOP =
  /\bI\s+can(?:not|['’]t|\s+not)\s+stop\s+(\w+ing\b.+?)(?:[.!?;]|$)/giu;
const LOOP_GERUND =
  /\b((?:replaying|imagining|ruminating on|going over|thinking about)\s+.+?)(?:[.!?;]|$)/giu;

const FEEL_ABOUT =
  /\bI\s+(?:feel|felt|am feeling|was feeling)\s+[A-Za-z]+(?:\s+(?:about|when|after|during|around|over|at))\s+(.+?)(?=\s+(?:because|since|so that|which made me|that made me)\b|[.!?;]|$)/giu;

const MISS =
  /\bI\s+miss(?:ed)?\s+(.+?)(?:[.!?;]|$)/giu;

function collapseSpace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function toSecondPerson(phrase: string): string {
  return collapseSpace(
    phrase
      .replace(/\b(?:I am|I'm|I’m)\b/giu, "you are")
      .replace(/\b(?:I've|I’ve)\b/giu, "you've")
      .replace(/\b(?:I'd|I’d)\b/giu, "you'd")
      .replace(/\b(?:I'll|I’ll)\b/giu, "you'll")
      .replace(/\bI\b/gu, "you")
      .replace(/\bme\b/giu, "you")
      .replace(/\bmyself\b/giu, "yourself")
      .replace(/\bmy\b/giu, "your")
      .replace(/\bmine\b/giu, "yours")
      .replace(/\breally\s+/giu, "")
      .replace(/\btook care of\b/giu, "taking care of")
      .replace(/\btake care of\b/giu, "taking care of")
      .replace(/\blooked after\b/giu, "looking after")
      .replace(/\bwere there for\b/giu, "being there for")
      .replace(
        /\byou keep(?:\s+on)? (imagining|thinking|replaying|hearing|going over)\b/giu,
        "$1",
      )
      .replace(
        /\byou can(?:not|['’]t| not) stop (imagining|thinking|replaying|hearing|going over)\b/giu,
        "$1",
      ),
  );
}

function startLower(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase() + value.slice(1);
}

function looksNominal(phrase: string): boolean {
  return (
    /^(?:your|our|the|a|an|this|that|these|those|how|what|missing|being|feeling|seeming)\b/iu.test(
      phrase,
    ) || /^[A-Za-z]+ing\b/u.test(phrase)
  );
}

/** Shape a clause so it can sit after "about" / "with". */
function toAboutPhrase(raw: string): string {
  let phrase = toSecondPerson(raw);
  phrase = collapseSpace(
    phrase
      .replace(/^(?:that|which|because|of)\s+/iu, "")
      .replace(
        /^(?:you keep(?:\s+on)?|you cannot stop|you can['’]t stop|you can not stop)\s+/iu,
        "",
      )
      .replace(/^you missed\b/iu, "missing")
      .replace(/^you miss\b/iu, "missing")
      .replace(
        /\b((?:the|this|that|your|our)\s+[\w]+(?:\s+[\w]+)?)\s+(?:is|are|was|were)\s+/giu,
        "$1 being ",
      )
      .replace(
        /\b((?:the|this|that|your|our)\s+[\w]+(?:\s+[\w]+)?)\s+feels?\s+/giu,
        "$1 feeling ",
      )
      .replace(
        /\b((?:the|this|that|your|our)\s+[\w]+(?:\s+[\w]+)?)\s+felt\s+/giu,
        "$1 feeling ",
      ),
  );

  if (!looksNominal(phrase) && /^(?:he|she|they|we|you|it)\b/iu.test(phrase)) {
    phrase = `how ${phrase}`;
  }

  return startLower(collapseSpace(phrase));
}

function isThinPhrase(phrase: string): boolean {
  return (
    /^(?:how\s+)?(?:it|this|that|they|them|stuff|things?)\s+\w+$/iu.test(
      phrase,
    ) ||
    /^(?:it|this|that|them|things?|stuff|here|there)$/iu.test(phrase) ||
    /^missing\s+(?:it|this|that|them)$/iu.test(phrase)
  );
}

function fitPhrase(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = collapseSpace(value)
    .replace(/^[,.;:!?…\s]+|[,.;:!?…\s]+$/gu, "")
    .replace(/^(?:and|or|but)\s+/iu, "")
    .replace(/\s+(?:and|or|but)$/iu, "");
  if (cleaned.length < PHRASE_MIN || cleaned.length > PHRASE_MAX) {
    return undefined;
  }
  if (isThinPhrase(cleaned)) return undefined;
  return cleaned;
}

function firstFit(
  text: string,
  pattern: RegExp,
  pick: (match: RegExpMatchArray) => string | undefined,
): string | undefined {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const phrase = fitPhrase(pick(match));
    if (phrase) return phrase;
  }
  return undefined;
}

function possessivePeople(match: string): string {
  const lower = match.toLocaleLowerCase();
  if (lower.startsWith("my ")) return `your ${lower.slice(3)}`;
  if (lower.startsWith("your ")) return lower;
  if (lower === "friends" || lower === "friend") return "your friends";
  if (lower === "kids" || lower === "child") return "your child";
  if (lower === "parents" || lower === "parent") return "your parents";
  return `your ${lower}`;
}

function articleEvent(match: string): string {
  return `the ${match.toLocaleLowerCase()}`;
}

function aboutQuestions(
  phrase: string,
  source: "cause" | "loop" | "feel" | "place",
): SceneQuestion[] {
  if (source === "cause") {
    return [
      {
        id: "scene.v1.cause-feel",
        text: `What is it about ${phrase} that made you feel like this?`,
      },
      {
        id: "scene.v1.cause-stay",
        text: `What about ${phrase} is still sitting with you?`,
      },
      {
        id: "scene.v1.cause-notice",
        text: `If you stay with ${phrase} for a moment, what do you notice?`,
      },
    ];
  }

  const third: SceneQuestion =
    source === "loop"
      ? {
          id: "scene.v1.loop-wish",
          text: `What do you wish someone had understood about ${phrase}?`,
        }
      : {
          id: `scene.v1.${source}-truer`,
          text: "What would feel even 5% truer than the first sentence you wrote?",
        };

  return [
    {
      id: `scene.v1.${source}-stay`,
      text: `What about ${phrase} is still sitting with you?`,
    },
    {
      id: `scene.v1.${source}-notice`,
      text: `If you stay with ${phrase} for a moment, what do you notice?`,
    },
    third,
  ];
}

function extractCausePhrase(text: string): string | undefined {
  return firstFit(text, CAUSE, (match) => toAboutPhrase(match[1] ?? ""));
}

function extractLoopPhrase(text: string): string | undefined {
  return (
    firstFit(text, LOOP_KEEP, (match) => toAboutPhrase(match[1] ?? "")) ??
    firstFit(text, LOOP_STOP, (match) => toAboutPhrase(match[1] ?? "")) ??
    firstFit(text, LOOP_GERUND, (match) => toAboutPhrase(match[1] ?? ""))
  );
}

function extractFeelAboutPhrase(text: string): string | undefined {
  return firstFit(text, FEEL_ABOUT, (match) => toAboutPhrase(match[1] ?? ""));
}

function extractMissPhrase(text: string): string | undefined {
  return firstFit(text, MISS, (match) =>
    toAboutPhrase(`I miss ${match[1] ?? ""}`),
  );
}

const LOCATION_GERUNDS: Readonly<Record<string, string>> = {
  sat: "sitting",
  stood: "standing",
  lay: "lying",
  went: "going",
  stayed: "staying",
  waited: "waiting",
  walked: "walking",
  was: "being",
  were: "being",
};

function nominalizeLocationVerb(verb: string): string {
  const lower = verb.toLocaleLowerCase();
  return LOCATION_GERUNDS[lower] ?? lower;
}

function extractPlacePhrase(text: string): string | undefined {
  const clause = new RegExp(
    `\\b((?:the|my|this|that|our)\\s+(?:${PLACES})\\s+(?:is|are|was|were|feels?|felt|seems?|seemed)\\s+[^.!?;,]{3,72})`,
    "giu",
  );
  const fromClause = firstFit(text, clause, (match) => {
    const raw = (match[1] ?? "").replace(/\s+\band\b[\s\S]*$/iu, "");
    if (!new RegExp(`\\b(?:${QUALITIES})\\b`, "iu").test(raw)) return undefined;
    return toAboutPhrase(raw);
  });
  if (fromClause) return fromClause;

  const paired = new RegExp(
    `\\b((?:the|a|an|my|this|that|our)\\s+(?:${QUALITIES})\\s+(?:${PLACES}))\\b`,
    "giu",
  );
  const fromPaired = firstFit(text, paired, (match) =>
    toAboutPhrase(match[1] ?? ""),
  );
  if (fromPaired) return fromPaired;

  // "the quiet in the kitchen", not only "the quiet kitchen".
  const qualityInPlace = new RegExp(
    `\\b((?:the|a|an|my|this|that|our)\\s+(?:${QUALITIES})\\s+in\\s+(?:the|a|an|my|this|that|our)\\s+(?:${PLACES})|(?:quiet|dark|cold|warm|calm)\\s+in\\s+(?:the|a|an|my|this|that|our)\\s+(?:${PLACES}))\\b`,
    "giu",
  );
  const fromQualityInPlace = firstFit(text, qualityInPlace, (match) => {
    const raw = collapseSpace(match[1] ?? "");
    const phrase = /^(?:the|a|an|my|this|that|our)\b/iu.test(raw)
      ? raw
      : `the ${raw.toLocaleLowerCase()}`;
    return toAboutPhrase(phrase);
  });
  if (fromQualityInPlace) return fromQualityInPlace;

  // "sat in the kitchen" — keep the posture, not a bare place noun.
  const inPlace = new RegExp(
    `\\b(?:(sitting|standing|lying|staying|waiting|walking|resting|lingering|sat|stood|lay|went|stayed|waited|walked|was|were)\\s+)?(in\\s+(?:the|a|an|my|this|that|our)\\s+(?:${PLACES}))\\b`,
    "giu",
  );
  return firstFit(text, inPlace, (match) => {
    const verb = match[1];
    const prep = match[2] ?? "";
    const leading = verb ? `${nominalizeLocationVerb(verb)} ` : "being ";
    return toAboutPhrase(`${leading}${prep}`);
  });
}

export function extractWritingScene(body: string): WritingScene {
  const text = collapseSpace(body);
  if (!text) return { questions: [] };

  const causePhrase = extractCausePhrase(text);
  const loopPhrase = extractLoopPhrase(text);
  const feelAboutPhrase = extractFeelAboutPhrase(text);
  const missPhrase = extractMissPhrase(text);
  const placePhrase = extractPlacePhrase(text);

  const peopleMatch = text.match(MY_PEOPLE) ?? text.match(PEOPLE);
  const peoplePhrase = peopleMatch?.[0]
    ? possessivePeople(peopleMatch[0])
    : undefined;

  const eventMatch = text.match(EVENTS);
  const eventPhrase = eventMatch?.[0]
    ? articleEvent(eventMatch[0])
    : undefined;

  const affectMatch = text.match(AFFECT);
  const affectPhrase = affectMatch?.[0]?.toLocaleLowerCase();

  const questions: SceneQuestion[] = [];

  if (causePhrase) {
    questions.push(...aboutQuestions(causePhrase, "cause"));
  } else if (loopPhrase) {
    questions.push(...aboutQuestions(loopPhrase, "loop"));
  } else if (feelAboutPhrase) {
    questions.push(...aboutQuestions(feelAboutPhrase, "feel"));
  } else if (missPhrase && placePhrase && missPhrase !== placePhrase) {
    questions.push({
      id: "scene.v1.place-stay",
      text: `What about ${missPhrase} is still sitting with you?`,
    });
    questions.push({
      id: "scene.v1.place-notice",
      text: `If you stay with ${placePhrase} for a moment, what do you notice?`,
    });
    questions.push({
      id: "scene.v1.place-wish",
      text: `What do you wish someone had understood about ${missPhrase}?`,
    });
  } else if (placePhrase || missPhrase) {
    questions.push(...aboutQuestions(placePhrase ?? missPhrase ?? "", "place"));
  } else if (peoplePhrase && affectPhrase) {
    questions.push({
      id: "scene.v1.people-affect",
      text: `What was it about being with ${peoplePhrase} that felt that way?`,
    });
    questions.push({
      id: "scene.v1.people-stay",
      text: `What do you want to remember about ${peoplePhrase} from this?`,
    });
  } else if (eventPhrase && affectPhrase) {
    questions.push({
      id: "scene.v1.event-affect",
      text: `What about ${eventPhrase} is still sitting with you?`,
    });
    questions.push({
      id: "scene.v1.event-feel",
      text: `What is it about ${eventPhrase} that felt that way?`,
    });
  } else if (peoplePhrase) {
    questions.push({
      id: "scene.v1.people",
      text: `What about ${peoplePhrase} is still sitting with you?`,
    });
    questions.push({
      id: "scene.v1.people-wish",
      text: `What do you wish someone had understood about ${peoplePhrase}?`,
    });
  } else if (eventPhrase) {
    questions.push({
      id: "scene.v1.event",
      text: `What about ${eventPhrase} is still sitting with you?`,
    });
  }

  const stayPhrase =
    causePhrase ??
    loopPhrase ??
    feelAboutPhrase ??
    missPhrase ??
    placePhrase;

  return {
    causePhrase,
    affectPhrase,
    peoplePhrase,
    eventPhrase,
    loopPhrase,
    placePhrase: placePhrase ?? missPhrase,
    stayPhrase,
    questions,
  };
}

export function isSceneFollowUpId(id: string | undefined): boolean {
  return Boolean(id?.startsWith("scene."));
}
