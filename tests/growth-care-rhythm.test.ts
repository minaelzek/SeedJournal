import { describe, expect, it } from "vitest";
import {
  careInvitation,
  careRhythmDetail,
  createCareRhythm,
} from "../features/growth/careRhythm";
import { selectDueReturnBud } from "../features/growth/returnBud";

describe("calm care rhythm", () => {
  it("maps the rolling seven-day rhythm without turning it into a score", () => {
    const rhythm = createCareRhythm(
      ["2026-07-28", "2026-07-29", "2026-07-30"],
      "2026-07-30",
      "en-CA",
    );

    expect(rhythm.days).toHaveLength(7);
    expect(rhythm.days[0].localDay).toBe("2026-07-24");
    expect(rhythm.days[6]).toMatchObject({
      localDay: "2026-07-30",
      tended: true,
      isToday: true,
    });
    expect(rhythm).toMatchObject({
      tendedToday: true,
      recentCareDays: 3,
      currentRhythm: 3,
    });
  });

  it("keeps yesterday's rhythm available throughout an open day", () => {
    const rhythm = createCareRhythm(
      ["2026-07-27", "2026-07-28", "2026-07-29"],
      "2026-07-30",
      "en-CA",
    );

    expect(rhythm.tendedToday).toBe(false);
    expect(rhythm.currentRhythm).toBe(3);
    expect(rhythm.days.at(-1)?.tended).toBe(false);
  });

  it("breaks the rhythm after a missed day without inventing continuity", () => {
    const rhythm = createCareRhythm(
      ["2026-07-25", "2026-07-26", "2026-07-28"],
      "2026-07-30",
      "en-CA",
    );

    expect(rhythm.tendedToday).toBe(false);
    expect(rhythm.currentRhythm).toBe(0);
    expect(rhythm.recentCareDays).toBe(3);
    expect(careRhythmDetail(rhythm)).toBe("3 quiet returns this week");
  });

  it("handles calendar boundaries in local time", () => {
    const rhythm = createCareRhythm(
      ["2026-01-30", "2026-01-31", "2026-02-01"],
      "2026-02-01",
      "en-CA",
    );

    expect(rhythm.days.map((day) => day.localDay)).toEqual([
      "2026-01-26",
      "2026-01-27",
      "2026-01-28",
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ]);
    expect(rhythm.currentRhythm).toBe(3);
  });
});

describe("care invitation pull (Duolingo-style loop, calm copy)", () => {
  it("offers a single primary path on an open day with attachment language", () => {
    const rhythm = createCareRhythm(
      ["2026-07-27", "2026-07-28", "2026-07-29"],
      "2026-07-30",
      "en-CA",
    );
    const invitation = careInvitation({
      hasBegun: true,
      reflectionCount: 4,
      rhythm,
      nextChangeLabel: "A second shoot is gathering.",
    });

    expect(invitation.state).toBe("open");
    expect(invitation.ctaLabel).toBe("Care for the sakura");
    expect(invitation.title).toBe("Your sakura slept.");
    expect(invitation.description).toBe(
      "It is still here. A second shoot is gathering.",
    );
    expect(invitation.footnote).not.toMatch(/\d|reflection/i);
    expect(`${invitation.eyebrow} ${invitation.title} ${invitation.ctaLabel}`).not.toMatch(
      /\b(xp|points?|score|streak freeze|leaderboard|gems?)\b/i,
    );
  });

  it("acknowledges completion without nagging when tended today", () => {
    const rhythm = createCareRhythm(
      ["2026-07-28", "2026-07-29", "2026-07-30"],
      "2026-07-30",
      "en-CA",
    );
    const invitation = careInvitation({
      hasBegun: true,
      reflectionCount: 3,
      rhythm,
      nextChangeLabel: "A third shoot is gathering.",
    });

    expect(invitation.state).toBe("tended");
    expect(invitation.ctaLabel).toBe("Write another page");
    expect(invitation.title).toBe("Let it settle.");
    expect(invitation.eyebrow).toBe("");
    expect(invitation.description).toBe("");
    expect(invitation.footnote).toBe("");
    expect(
      `${invitation.eyebrow} ${invitation.title} ${invitation.description} ${invitation.footnote}`,
    ).not.toMatch(/reflection|care complete|\d/i);
    expect(careRhythmDetail(rhythm)).toBe("3 quiet days together");
  });

  it("prioritizes an unfinished draft over care pull", () => {
    const rhythm = createCareRhythm(["2026-07-29"], "2026-07-30", "en-CA");
    const invitation = careInvitation({
      hasBegun: true,
      hasUnfinishedReflection: true,
      reflectionCount: 2,
      rhythm,
    });

    expect(invitation.state).toBe("draft");
    expect(invitation.ctaLabel).toBe("Continue reflection");
  });

  it("names the open first visit without inventing a false rhythm", () => {
    const invitation = careInvitation({
      hasBegun: false,
      reflectionCount: 0,
    });

    expect(invitation.state).toBe("first");
    expect(invitation.ctaLabel).toBe("Begin a reflection");
    expect(invitation.title).toBe("A seed is waiting.");
    expect(invitation.eyebrow).toBe("");
    expect(invitation.description).toBe("");
    expect(`${invitation.title} ${invitation.description}`).not.toMatch(
      /how are you|deeper noticing/i,
    );
    expect(invitation.footnote).toBe("Your sakura is waiting patiently.");
  });

  it("keeps an open day as sleep, even after a single quiet return", () => {
    const rhythm = createCareRhythm(["2026-07-29"], "2026-07-30", "en-CA");
    expect(careRhythmDetail(rhythm)).toBe("Yesterday’s care still counts");
    const invitation = careInvitation({
      hasBegun: true,
      reflectionCount: 1,
      rhythm,
    });
    expect(invitation.title).toBe("Your sakura slept.");
    expect(invitation.description).toBe("It is still here.");
  });
});

describe("patient return bud", () => {
  const entry = (
    id: string,
    completedAt: number,
    dueLocalDay: string,
    state: "waiting" | "opened" | "released" = "waiting",
  ) => ({
    id,
    completedAt,
    payload: {
      seedInsight: `Insight from ${id}`,
      returnBud: { dueLocalDay, state },
    },
  });

  it("surfaces only the newest due waiting bud", () => {
    expect(
      selectDueReturnBud(
        [
          entry("older", 100, "2026-07-29"),
          entry("newer", 200, "2026-07-30"),
          entry("future", 300, "2026-07-31"),
        ],
        "2026-07-30",
      ),
    ).toEqual({
      entryId: "newer",
      seedInsight: "Insight from newer",
      dueLocalDay: "2026-07-30",
    });
  });

  it("leaves opened and released buds at rest", () => {
    expect(
      selectDueReturnBud(
        [
          entry("opened", 200, "2026-07-29", "opened"),
          entry("released", 100, "2026-07-29", "released"),
        ],
        "2026-07-30",
      ),
    ).toBeNull();
  });
});
