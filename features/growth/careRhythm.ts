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
  nextChangeLabel?: string;
}): CareInvitation {
  const reflectionCount = Math.max(0, Math.floor(input.reflectionCount ?? 0));
  const rhythm = input.rhythm ?? null;
  const tendedToday = rhythm?.tendedToday ?? false;
  const nextChangeLabel = input.nextChangeLabel?.trim() || undefined;

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
      footnote: quietFootnote(reflectionCount),
    };
  }

  if (tendedToday) {
    return {
      state: "tended",
      eyebrow: "",
      // The only line. No care badge, no reflection count.
      title: "Let it settle.",
      description: "",
      ctaLabel: "Write another page",
      footnote: "",
    };
  }

  if (!input.hasBegun) {
    return {
      state: "first",
      eyebrow: "",
      title: "A seed is waiting.",
      description: "",
      ctaLabel: "Begin a reflection",
      footnote: "Your sakura is waiting patiently.",
    };
  }

  // Open day — the companion slept; it is still here. Never a day-count hook.
  return {
    state: "open",
    eyebrow: "Your sakura is here",
    title: "Your sakura slept.",
    description: withOptionalNextChange("It is still here.", nextChangeLabel),
    ctaLabel: "Care for the sakura",
    footnote: quietFootnote(reflectionCount),
  };
}

/** Never a visible tally. An empty garden may still say it is waiting. */
function quietFootnote(reflectionCount: number): string {
  return reflectionCount === 0 ? "Your sakura is waiting patiently." : "";
}

function withOptionalNextChange(
  base: string,
  nextChangeLabel?: string,
): string {
  return nextChangeLabel ? `${base} ${nextChangeLabel}` : base;
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
