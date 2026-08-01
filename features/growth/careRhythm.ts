export interface CareRhythmDay {
  localDay: string;
  label: string;
  fullLabel: string;
  tended: boolean;
  isToday: boolean;
}

export interface CareRhythm {
  days: readonly CareRhythmDay[];
  tendedToday: boolean;
  recentCareDays: number;
  currentRhythm: number;
}

export type CarePullState =
  | "first"
  | "draft"
  | "return-bud"
  | "open"
  | "tended";

export interface CareInvitation {
  state: CarePullState;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  footnote: string;
}

const LOCAL_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function createCareRhythm(
  completedLocalDays: readonly string[],
  todayLocalDay: string,
  locale?: string,
): CareRhythm {
  const today = parseLocalDay(todayLocalDay);
  const tendedDays = new Set(completedLocalDays);
  const shortWeekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const fullDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const localDay = formatLocalDay(date);
    return {
      localDay,
      label: shortWeekday.format(date),
      fullLabel: fullDate.format(date),
      tended: tendedDays.has(localDay),
      isToday: index === 6,
    };
  });

  const tendedToday = tendedDays.has(todayLocalDay);
  const rhythmCursor = new Date(today);
  if (!tendedToday) rhythmCursor.setDate(rhythmCursor.getDate() - 1);

  let currentRhythm = 0;
  while (tendedDays.has(formatLocalDay(rhythmCursor))) {
    currentRhythm += 1;
    rhythmCursor.setDate(rhythmCursor.getDate() - 1);
  }

  return {
    days,
    tendedToday,
    recentCareDays: days.filter((day) => day.tended).length,
    currentRhythm,
  };
}

/**
 * Calm copy for the home care loop — single primary path, no score language.
 * Pure so the habit pull can be unit-tested without rendering the tree.
 */
export function careInvitation(input: {
  hasBegun: boolean;
  hasUnfinishedReflection?: boolean;
  hasReturnBud?: boolean;
  reflectionCount?: number;
  rhythm?: CareRhythm | null;
}): CareInvitation {
  const reflectionCount = Math.max(0, Math.floor(input.reflectionCount ?? 0));
  const rhythm = input.rhythm ?? null;
  const tendedToday = rhythm?.tendedToday ?? false;
  const currentRhythm = rhythm?.currentRhythm ?? 0;

  if (input.hasUnfinishedReflection) {
    return {
      state: "draft",
      eyebrow: "Reflection in progress",
      title: "Your thought is still here.",
      description: "Continue exactly where you left off.",
      ctaLabel: "Continue reflection",
      footnote: "Saved privately on this device",
    };
  }

  if (input.hasReturnBud) {
    return {
      state: "return-bud",
      eyebrow: "A memory, returning",
      // Short top line only — actions live in the bottom dock, not over the tree.
      title: "A thought returned.",
      description:
        "Something you left with the sakura is ready to meet you again.",
      // Not shown as primary while return-bud owns the dock.
      ctaLabel: "Sit with this",
      footnote:
        reflectionCount === 0
          ? "Your sakura is waiting patiently."
          : `${reflectionCount} ${reflectionCount === 1 ? "reflection" : "reflections"} held in the sakura`,
    };
  }

  if (tendedToday) {
    return {
      state: "tended",
      eyebrow: "Today’s care is held",
      // Short title — the sakura is the message.
      title: "Let it settle.",
      description:
        currentRhythm > 1
          ? `${currentRhythm} quiet days of care are living in your sakura.`
          : "Your sakura is carrying what you found.",
      ctaLabel: "Write another page",
      footnote:
        reflectionCount === 0
          ? "Your sakura is waiting patiently."
          : `${reflectionCount} ${reflectionCount === 1 ? "reflection" : "reflections"} held in the sakura`,
    };
  }

  if (!input.hasBegun) {
    return {
      state: "first",
      eyebrow: "Plant a cherry stone",
      title: "How are you, really?",
      description:
        "A few honest words wake the sakura. Deeper noticing opens pink life.",
      ctaLabel: "Begin a reflection",
      footnote: "Your sakura is waiting patiently.",
    };
  }

  // Open day — short top line; the sakura + CTA carry the habit pull.
  if (currentRhythm > 1) {
    return {
      state: "open",
      eyebrow: "Your sakura is waiting",
      title: "Keep the rhythm.",
      description: `${currentRhythm} quiet days of care are still yours.`,
      ctaLabel: "Care for the sakura",
      footnote:
        reflectionCount === 0
          ? "Your sakura is waiting patiently."
          : `${reflectionCount} ${reflectionCount === 1 ? "reflection" : "reflections"} held in the sakura`,
    };
  }

  if (currentRhythm === 1) {
    return {
      state: "open",
      eyebrow: "Welcome back",
      title: "One quiet return.",
      description: "Yesterday’s care still counts.",
      ctaLabel: "Care for the sakura",
      footnote:
        reflectionCount === 0
          ? "Your sakura is waiting patiently."
          : `${reflectionCount} ${reflectionCount === 1 ? "reflection" : "reflections"} held in the sakura`,
    };
  }

  return {
    state: "open",
    eyebrow: "Welcome back",
    title: "Your sakura is here.",
    description: "Give it a moment of honest attention.",
    ctaLabel: "Care for the sakura",
    footnote:
      reflectionCount === 0
        ? "Your sakura is waiting patiently."
        : `${reflectionCount} ${reflectionCount === 1 ? "reflection" : "reflections"} held in the sakura`,
  };
}

/** Human-readable care rhythm line — botanical, never scored. */
export function careRhythmDetail(rhythm: CareRhythm): string {
  if (rhythm.tendedToday) {
    if (rhythm.currentRhythm > 1) {
      return `${rhythm.currentRhythm} quiet days together`;
    }
    return "Tended today";
  }

  if (rhythm.currentRhythm > 1) {
    return `${rhythm.currentRhythm}-day rhythm, still yours`;
  }

  if (rhythm.currentRhythm === 1) {
    return "Yesterday’s care still counts";
  }

  if (rhythm.recentCareDays > 0) {
    return `${rhythm.recentCareDays} quiet ${rhythm.recentCareDays === 1 ? "return" : "returns"} this week`;
  }

  return "Today is open";
}

function parseLocalDay(localDay: string): Date {
  const match = localDay.match(LOCAL_DAY_PATTERN);
  if (!match) throw new Error(`Invalid local day: ${localDay}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function formatLocalDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
