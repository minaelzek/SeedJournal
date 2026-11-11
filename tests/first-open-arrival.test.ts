import { describe, expect, it } from "vitest";
import {
  FIRST_OPEN_BEATS,
  shouldPlayFirstOpenArrival,
} from "../features/shell/firstOpenArrival";

describe("first-open home arrival", () => {
  it("plays for a first seed visit that has not been seen", () => {
    expect(
      shouldPlayFirstOpenArrival({
        isSeed: true,
        alreadySeen: false,
        arriveQuery: false,
        reducedMotion: false,
      }),
    ).toBe(true);
  });

  it("plays again when welcome hands off with ?arrive=1", () => {
    expect(
      shouldPlayFirstOpenArrival({
        isSeed: true,
        alreadySeen: true,
        arriveQuery: true,
        reducedMotion: false,
      }),
    ).toBe(true);
  });

  it("does not play after the companion has begun or when motion is reduced", () => {
    expect(
      shouldPlayFirstOpenArrival({
        isSeed: false,
        alreadySeen: false,
        arriveQuery: true,
        reducedMotion: false,
      }),
    ).toBe(false);
    expect(
      shouldPlayFirstOpenArrival({
        isSeed: true,
        alreadySeen: false,
        arriveQuery: true,
        reducedMotion: true,
      }),
    ).toBe(false);
  });

  it("keeps arrival copy free of grades and streaks", () => {
    const blob = FIRST_OPEN_BEATS.map(
      (beat) => `${beat.eyebrow} ${beat.title} ${beat.description}`,
    ).join(" ");
    expect(FIRST_OPEN_BEATS).toHaveLength(1);
    expect(FIRST_OPEN_BEATS[0].title).toBe("A seed is waiting.");
    expect(blob).not.toMatch(/\b(xp|points?|score|streak|grade|leaderboard)\b/i);
    expect(blob).toMatch(/seed/i);
  });
});
