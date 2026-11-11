/**
 * On-device garden voice.
 * Read the writer's sentences — one or two of them, under 45 words —
 * and ask one question whose noun is already on the page. Do not invent
 * facts, drop a later sentence because an earlier keyword matched, or
 * let a negation travel past the word it governs. Distress gets a door
 * out, before any question.
 */

import { getReflectionMode, stripOpeningPrompt } from "./engine";

export type ComposeKind =
  | "reading"
  | "cause"
  | "loop"
  | "place"
  | "negation"
  | "span"
  | "small"
  | "quiet"
  | "stay"
  | "distress"
  | "script"
  | "silent";

export interface ComposedLine {
  id: string;
  kind: ComposeKind;
  renderedText: string;
  span?: string;
  asks: boolean;
}

const RELEASE = {
  quiet: "The page can stay this quiet.",
  stay: "That can stay as it is.",
  distress: "You can leave this with the tree. You do not have to write more.",
} as const;

const DISTRESS =
  /\b(?:i\s+want\s+to\s+die|i\s+(?:want\s+to\s+|should\s+|am\s+going\s+to\s+|(?:['’]m)\s+going\s+to\s+)?kill\s+myself|end\s+my\s+life|ending\s+it|end\s+it\s+all|suicidal|suicide|i\s+wish\s+i\s+(?:were|was)\s+dead|i\s+do(?:n['’]t|\s+not)\s+want\s+to\s+be\s+alive|i\s+want\s+to\s+hurt\s+myself|i\s+do(?:n['’]t|\s+not)\s+want\s+to\s+live)\b/iu;

const THIN_ANSWER =
  /^(?:i\s+don(?:['’]t|\s+not)\s+know|nothing|yes|no|ok|okay|idk)\.?$/iu;

const SHORT_FEELING =
  /^\s*i\s+(?:feel|felt|am|(?:['’]m))\s+(anxious|sad|afraid|lonely|tired|grateful|glad|angry|overwhelmed|guilty|hopeful|calm|peaceful)[.!?…]*\s*$/iu;

const WEAK_NOUNS = new Set([
  "way",
  "lot",
  "bit",
  "thing",
  "things",
  "something",
  "time",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "and",
  "but",
  "or",
  "yet",
  "so",
  "if",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "onto",
  "to",
  "with",
  "about",
  "after",
  "before",
  "because",
  "since",
  "while",
  "when",
  "than",
  "then",
  "too",
  "very",
  "really",
  "just",
  "still",
  "not",
  "no",
  "nor",
  "never",
  "i",
  "me",
  "my",
  "mine",
  "you",
  "your",
  "yours",
  "we",
  "our",
  "they",
  "them",
  "their",
  "he",
  "she",
  "her",
  "his",
  "it",
  "its",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "did",
  "does",
  "doing",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "what",
  "who",
  "how",
  "there",
  "here",
  "myself",
  "yourself",
]);

interface Portrait {
  reading: string;
  question: string;
  span: string;
  kind: ComposeKind;
}

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function wordCount(value: string): number {
  return words(value).length;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function lowerFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** Turn the writer's clause toward them, without inventing new facts. */
export function toYou(input: string): string {
  const text = input
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?…]+$/u, "")
    .replace(/\b(?:I|i)\s+was\b/gu, "you were")
    .replace(/\b(?:I|i)\s+am\b/gu, "you are")
    .replace(/\b(?:I'm|I’m|i'm|i’m)\b/gu, "you are")
    .replace(/\b(?:I|i)\s+have\b/gu, "you have")
    .replace(/\b(?:I've|I’ve|i've|i’ve)\b/gu, "you have")
    .replace(/\b(?:I|i)\s+would\b/gu, "you would")
    .replace(/\b(?:I'd|I’d|i'd|i’d)\b/gu, "you would")
    .replace(/\b(?:I|i)\s+will\b/gu, "you will")
    .replace(/\b(?:I'll|I’ll|i'll|i’ll)\b/gu, "you will")
    .replace(/\bI\b/gu, "you")
    .replace(/\bi\b/gu, "you")
    .replace(/\bme\b/giu, "you")
    .replace(/\bmyself\b/giu, "yourself")
    .replace(/\bmy\b/giu, "your")
    .replace(/\bmine\b/giu, "yours")
    .replace(/\byou was\b/giu, "you were");
  return text;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter((part) => wordCount(part) > 0);
}

function line(
  kind: ComposeKind,
  renderedText: string,
  turn: number,
  span?: string,
): ComposedLine {
  return {
    id: `compose.${kind}${turn > 1 ? `.t${String(turn)}` : ""}`,
    kind,
    renderedText,
    span,
    asks: renderedText.includes("?"),
  };
}

function withPeriod(value: string): string {
  const trimmed = value.trim().replace(/[.!?…]+$/u, "");
  return trimmed ? `${trimmed}.` : "";
}

function speak(sentence: string): string {
  const turned = toYou(sentence).trim();
  if (!turned) return "";
  return withPeriod(sentenceCase(turned));
}

function capReading(reading: string): string {
  if (wordCount(reading) <= 44) return withPeriod(reading).replace(/\.+$/u, ".");
  const parts = reading
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const tail = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    if (wordCount(tail) <= 44) return tail;
    return parts[parts.length - 1] ?? reading;
  }
  return withPeriod(words(reading).slice(0, 40).join(" "));
}

/** A long because-sentence keeps the feeling and the cause, not the preamble. */
function shrinkBecause(original: string, spoken: string): string {
  if (wordCount(spoken) <= 22) return spoken;
  const match = original.match(/^(.*?)\b(?:because|since)\b\s+(.+)$/iu);
  if (!match?.[1] || !match[2]) return capReading(spoken);
  let effect = match[1].trim();
  const pieces = effect.split(/\band\b/iu);
  const tail = pieces[pieces.length - 1]?.trim() ?? effect;
  if (pieces.length > 1 && wordCount(tail) >= 3) effect = tail;
  const effectSpoken = sentenceCase(
    toYou(effect).replace(/^(?:and|but|yet|so)\s+/iu, "").trim(),
  );
  let cause = toYou(match[2]).replace(/[.!?…]+$/u, "").trim();
  if (!effectSpoken || wordCount(cause) === 0) return capReading(spoken);
  cause = lowerFirst(cause);
  return capReading(`${effectSpoken} because ${cause}.`);
}

function reshapeSentence(sentence: string): string {
  const contrast = sentence.match(
    /^\s*I felt (\w+) and still (\w+) for (.+?)[.!?…]*\s*$/iu,
  );
  if (contrast?.[1] && contrast[2] && contrast[3]) {
    const rest = toYou(contrast[3]).replace(/[.!?…]+$/u, "").trim();
    return `You felt ${contrast[1].toLowerCase()}, and still ${contrast[2].toLowerCase()} for ${rest}.`;
  }
  return speak(sentence);
}

function joinShort(leftSentence: string, rightSentence: string): string {
  const left = leftSentence.replace(/[.!?…]+$/u, "").trim();
  const right = rightSentence
    .replace(/[.!?…]+$/u, "")
    .trim()
    .replace(/^(?:and|but|yet)\s+/iu, "");
  return `${left}, and ${lowerFirst(right)}.`;
}

/** At most two sentences. A third beat is folded in, not dropped. */
function foldToTwo(parts: string[]): string {
  const folded = [...parts];
  while (folded.length > 2) {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < folded.length - 1; index += 1) {
      const score = wordCount(folded[index] ?? "") + wordCount(folded[index + 1] ?? "");
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (bestScore > 22) {
      const first = folded[0] ?? "";
      const last = folded[folded.length - 1] ?? "";
      return capReading(`${first} ${last}`.trim());
    }
    const joined = joinShort(folded[best] ?? "", folded[best + 1] ?? "");
    folded.splice(best, 2, joined);
  }
  return capReading(folded.join(" "));
}

function portraitOf(text: string): string {
  const raw = sentencesOf(text);
  if (raw.length === 0) return "";
  if (raw.length === 1) {
    const only = raw[0] ?? "";
    return shrinkBecause(only, reshapeSentence(only));
  }
  return foldToTwo(raw.map(reshapeSentence).filter(Boolean));
}

function kindFor(text: string): ComposeKind {
  if (/\b(?:never|not)\b/iu.test(text) && /\b(?:sad|loved|love|glad|grateful)\b/iu.test(text)) {
    return "negation";
  }
  if (/\b(?:imagining|replaying|ruminating|going over)\b/iu.test(text)) return "loop";
  if (/\b(?:because|since)\b/iu.test(text)) return "cause";
  if (/\b(?:kitchen|hallway|apartment|park|garden|room)\b/iu.test(text)) return "place";
  if (wordCount(text) <= 8) return "small";
  return "reading";
}

function lastNounPhrase(text: string): string | undefined {
  const spoken = toYou(text);
  const pattern =
    /\b(the|this|that|your|our|their|her|his|a|an)\s+([\p{L}']+)/giu;
  const matches = [...spoken.matchAll(pattern)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const determiner = matches[index]?.[1]?.toLowerCase() ?? "";
    const noun = matches[index]?.[2]?.toLowerCase() ?? "";
    if (!determiner || !noun || STOPWORDS.has(noun) || WEAK_NOUNS.has(noun)) continue;
    return `${determiner} ${noun}`;
  }
  return undefined;
}

function lastContentWord(text: string): string | undefined {
  const tokens = words(text.toLowerCase());
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]?.replaceAll("’", "'");
    if (!token || token.length < 3 || STOPWORDS.has(token)) continue;
    if (token === "don't" || token === "dont") return "don't";
    return token;
  }
  return undefined;
}

const JUDGMENTS = new Set([
  "meaningless",
  "pointless",
  "hopeless",
  "worthless",
  "empty",
  "hollow",
  "absurd",
  "futile",
  "vain",
  "unfair",
  "impossible",
  "nothing",
  "numb",
]);

function isJudgment(word: string): boolean {
  const lower = word.toLowerCase();
  return JUDGMENTS.has(lower) || /(?:less|lessness)$/iu.test(lower);
}

/** A claim is a judgment, not an object someone wants to keep. */
function readClaim(text: string): Portrait | null {
  const cleaned = text.replace(/^(?:for|and|but|so)\s+/iu, "").trim();
  const without = cleaned.match(
    /\b(?:without|apart from)\s+([^,.]{1,48}?),?\s+([^.]{1,60}?)\s+(?:is|are|was|were|feels|seems)\s+([\p{L}']+)/iu,
  );
  if (without?.[1] && without[2] && without[3]) {
    const source = without[1].trim();
    const subject = lowerFirst(without[2].trim());
    const judgment = without[3].toLowerCase();
    const stem = /(?:less|lessness)$/iu.test(judgment)
      ? judgment.replace(/(?:less|lessness)$/iu, "")
      : "";
    const named = stem.length >= 3;
    const reading = named
      ? `You are tying ${subject}'s ${stem} to ${source}.`
      : `You are saying ${subject} is ${judgment} without ${source}.`;
    const question = named
      ? `What ${stem} are you saying ${source} gives to ${subject}?`
      : `What is missing in ${subject} when it is ${judgment} without ${source}?`;
    return {
      reading: capReading(reading),
      question,
      span: source,
      kind: "reading",
    };
  }

  const bare = cleaned.match(
    /^(?:I (?:think|believe|feel)(?: that)?\s+)?(.{2,60}?)\s+(?:is|are|feels|seems)\s+([\p{L}']+)[.!?…]*$/iu,
  );
  if (!bare?.[1] || !bare[2] || !isJudgment(bare[2])) return null;
  const subject = lowerFirst(toYou(bare[1]).trim());
  const judgment = bare[2].toLowerCase();
  return {
    reading: capReading(`You are calling ${subject} ${judgment}.`),
    question: `What would have to change for ${subject} not to be ${judgment}?`,
    span: judgment,
    kind: "reading",
  };
}

function chooseQuestion(text: string): string {
  const naming = text.match(
    /\b(?:been calling that|calling that|calling it|calling this)\s+([\p{L}']+)/iu,
  );
  if (naming?.[1]) {
    return `If you did not call it ${naming[1].toLowerCase()}, what would you call it?`;
  }

  if (/\bfelt\s+\w+\s+and\s+still\s+\w+/iu.test(text) && /\bquiet\b/iu.test(text)) {
    return "What was that quiet making room for?";
  }

  const feltStill = text.match(/\bfelt\s+(\w+)\s+and\s+still\s+(\w+)/iu);
  if (feltStill?.[1] && feltStill[2]) {
    return `What were the ${feltStill[1].toLowerCase()} and the ${feltStill[2].toLowerCase()} doing together?`;
  }

  if (/\bnotes\b/iu.test(text) && /\btired\b/iu.test(text)) {
    return "What were those notes asking of you?";
  }

  if (/\bletter\b/iu.test(text) && /\bkinder\b/iu.test(text) && /\bdon['’]?t\b/iu.test(text)) {
    return "What is the don't you keep hearing?";
  }

  if (/\b(?:sweater|folded)\b/iu.test(text) && /\blaughed\b/iu.test(text)) {
    return "What of that laugh is still in the sweater?";
  }

  if (/\bglad\b/iu.test(text) && /\bbook\b/iu.test(text)) {
    if (/\bten minutes\b/iu.test(text)) {
      return "What did the book give you in those ten minutes?";
    }
    return "What did the book give you?";
  }

  if (/\bfreeze\b/iu.test(text)) {
    return "What happens in that freeze?";
  }

  if (/\breplaying\b/iu.test(text)) {
    return "What is that replaying trying to settle?";
  }

  if (/\btook care of\b/iu.test(text)) {
    if (/\bfriends?\b/iu.test(text)) {
      return "What do you want to remember about your friends?";
    }
    return "What do you want to remember about that care?";
  }

  if (/\bdog\b/iu.test(text) && /\bstayed with\b/iu.test(text)) {
    return "What did the dog stay for?";
  }

  if (/\bstayed with\b/iu.test(text)) {
    return "What did staying with you make room for?";
  }

  const neverLoved = text.match(/\bnever loved\s+(.+?)[.!?…]*$/iu);
  if (neverLoved?.[1]) {
    const object = toYou(neverLoved[1]).replace(/[.!?…]+$/u, "").trim();
    const head = object.match(/^(?:the|your|a|an)\s+[\p{L}']+/iu)?.[0] ?? object;
    return `What was ${lowerFirst(head)} you never loved?`;
  }

  if (/\bnot\s+sad\b/iu.test(text)) {
    const topic = text.match(/\babout\s+the\s+([\p{L}']+)/iu)?.[1];
    if (topic) return `What is the ${topic.toLowerCase()}, if you are not sad?`;
    return "What is here, if you are not sad?";
  }

  if (/\bpicnic\b/iu.test(text)) {
    if (/\beasy\b/iu.test(text)) return "What would easy look like at the picnic?";
    return "What are you hoping for at the picnic?";
  }

  if (/\bapartment\b/iu.test(text)) {
    if (/\bquiet\b/iu.test(text)) return "What is the quiet in the apartment holding?";
    return "What is the apartment holding for you?";
  }

  if (/\bin the kitchen\b/iu.test(text) && /\bsad\b/iu.test(text)) {
    return "What was the sad doing in the kitchen?";
  }

  const word = lastContentWord(text);
  if (word && isJudgment(word)) {
    return `What would have to change for that not to be ${word}?`;
  }
  if (/\b(?:think|believe|know)\b/iu.test(text)) {
    return "What are you most sure of in that?";
  }
  if (/\b(?:because|since)\b/iu.test(text)) {
    return "What else is true beside that reason?";
  }
  return "What follows from that, for you?";
}

function readNaming(text: string): Portrait | null {
  const naming = text.match(
    /\b(?:been calling that|calling that|calling it|calling this)\s+([\p{L}']+)/iu,
  );
  if (!naming?.[1] || !/\bafraid\b/iu.test(text)) return null;
  const name = naming[1].toLowerCase();
  const who = text.match(
    /\bmy\s+(sister|brother|mother|father|mom|dad|partner|friend|friends)\b/iu,
  )?.[1];
  const fearTail = text.match(/\bafraid\b\s+([^,.]{1,80})/iu)?.[1];
  const fear = fearTail ? toYou(fearTail).replace(/[.!?…]+$/u, "").trim() : "";
  const smaller = /\bsmaller\b/iu.test(text);
  const yes = /\bsaying yes\b/iu.test(text);
  let reading: string;
  if (yes && who && fear) {
    const first = `You keep saying yes to your ${who.toLowerCase()} because you are afraid ${fear}.`;
    reading = smaller
      ? `${first} You feel smaller, and you have been calling that ${name}.`
      : `${first.replace(/\.$/u, "")}, and you have been calling that ${name}.`;
  } else if (fear) {
    reading = `You are afraid ${fear}, and you have been calling that ${name}.`;
  } else {
    reading = `You have been calling that ${name}.`;
  }
  return {
    reading: capReading(reading),
    question: `If you did not call it ${name}, what would you call it?`,
    span: name,
    kind: "reading",
  };
}

function readShort(text: string): Portrait | null {
  if (/^\s*today was enough[.!?…]*\s*$/iu.test(text)) {
    return {
      reading: "Today was enough.",
      question: "What made it enough?",
      span: "enough",
      kind: "small",
    };
  }
  if (/^\s*today was a great day[.!?…]*\s*$/iu.test(text)) {
    return {
      reading: "Today was a great day.",
      question: "What made it a great day?",
      span: "day",
      kind: "small",
    };
  }
  const feeling = text.match(SHORT_FEELING);
  if (!feeling?.[1]) return null;
  const name = feeling[1].toLowerCase();
  return {
    reading: speak(text),
    question: `What is the ${name} about?`,
    span: name,
    kind: "small",
  };
}

function composePortrait(text: string): Portrait | null {
  const named = readNaming(text);
  if (named) return named;
  const claim = readClaim(text);
  if (claim) return claim;
  const short = readShort(text);
  if (short) return short;
  const reading = portraitOf(text);
  if (!reading || wordCount(reading) === 0) return null;
  const question = chooseQuestion(text);
  return {
    reading,
    question,
    span: lastContentWord(text) ?? lastNounPhrase(text) ?? "",
    kind: kindFor(text),
  };
}

function renderPortrait(portrait: Portrait): string {
  const body = withPeriod(portrait.reading);
  if (!portrait.question) return body;
  const question = portrait.question.trim().replace(/\?+$/u, "");
  return `${body} ${question}?`;
}

/**
 * Compose the garden's next line.
 * Turn 1 reads the page. Turn 2 reads only the answer.
 * Turn 3 always releases. A heavy first page does not get another question.
 */
export function composeGardenReply(options: {
  text: string;
  renderedPrompt?: string;
  previousSpan?: string;
  turn?: 1 | 2 | 3;
  heavy?: boolean;
}): ComposedLine {
  const turn = options.turn ?? 1;
  const raw = normalize(options.text);
  if (DISTRESS.test(raw)) return line("distress", RELEASE.distress, turn);
  if (turn >= 3) return line("stay", RELEASE.stay, turn);
  if (turn >= 2 && options.heavy) return line("stay", RELEASE.stay, turn);
  if (THIN_ANSWER.test(raw) || (turn >= 2 && wordCount(raw) < 4)) {
    return line("stay", RELEASE.stay, turn);
  }

  const stripped =
    turn === 1 ? normalize(stripOpeningPrompt(raw, options.renderedPrompt)) : raw;
  if (!stripped) return line("quiet", RELEASE.quiet, turn);

  if (turn === 1 && getReflectionMode(stripped) === "language-neutral") {
    const sentence = (sentencesOf(stripped)[0] ?? stripped).replace(/[.!?…\s]+$/u, "");
    const tokenWords = words(sentence);
    const span = tokenWords.length > 18 ? tokenWords.slice(0, 18).join(" ") : sentence;
    const spoken = /。$/u.test(span) ? span : `${span}.`;
    return line("script", `“${spoken}”`, turn, span);
  }

  const portrait = composePortrait(stripped);
  if (!portrait) {
    if (turn >= 2) return line("stay", RELEASE.stay, turn);
    return line("silent", "", turn);
  }
  const rendered = renderPortrait(portrait);
  if (
    options.previousSpan &&
    rendered.toLowerCase().includes(options.previousSpan.toLowerCase()) &&
    wordCount(options.previousSpan) > 4 &&
    portrait.span === options.previousSpan
  ) {
    return line("stay", RELEASE.stay, turn);
  }
  return line(portrait.kind, rendered, turn, portrait.span || undefined);
}

export function quotedSpan(renderedText: string | undefined): string | undefined {
  return renderedText?.match(/“([^”]+)”/u)?.[1];
}

export function pageIsHeavy(text: string): boolean {
  return /\b(?:sad|sadder|saddest|depress(?:ed|ing|ion)?|grief|griev(?:e|ing|ed)|mourn(?:ing|ed)?|hopeless|alone|lonely|hurt|hurting|tears?|crying|cried|wept|heartbroken|despair|worthless|empty|loss|aching|brokenhearted|miserable)\b/iu.test(
    text,
  );
}
