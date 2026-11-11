import { describe, expect, it } from "vitest";
import { absenceSleep, nextNamedGrowth } from "../features/growth/overnightLife";

const FORBIDDEN = /\b(streak|missed|fail|guilt|xp|score)\b/i;

describe("nextNamedGrowth", () => {
  it("names week-one previews without streak language", () => {
    expect(nextNamedGrowth(0)?.label).toBe("A cherry stone is waiting to open.");
    expect(nextNamedGrowth(1)?.label).toBe("A second shoot is gathering.");
    expect(nextNamedGrowth(2)?.label).toBe("Another lateral is gathering.");
    expect(nextNamedGrowth(3)?.label).toBe("A third shoot is gathering.");
    expect(nextNamedGrowth(4)?.label).toBe("The stem is gathering more pink life.");
    expect(nextNamedGrowth(6)?.label).toBe("The stem is gathering more pink life.");
    expect(nextNamedGrowth(7)?.label).toBe("The sprout is still lengthening.");
    expect(nextNamedGrowth(10)?.label).toBe("The sprout is still lengthening.");
    expect(nextNamedGrowth(11)?.label).toBe("A sapling whip is gathering.");
  });

  it("teases the next chapter at sapling, open-V, and vase gates", () => {
    expect(nextNamedGrowth(47)?.label).toBe("An open V is gathering.");
    expect(nextNamedGrowth(95)?.label).toBe("A low sweeping bough is gathering.");
    expect(nextNamedGrowth(191)?.label).toBe("The mature vase is gathering.");
  });

  it("answers mid-chapter growth gently and rests after the mature vase", () => {
    expect(nextNamedGrowth(12)?.label).toBe("The crown is still answering.");
    expect(nextNamedGrowth(48)?.label).toBe("The crown is still answering.");
    expect(nextNamedGrowth(96)?.label).toBe("The crown is still answering.");
    expect(nextNamedGrowth(192)).toBeNull();
    expect(nextNamedGrowth(400)).toBeNull();
  });

  it("keeps every preview free of score and absence-shame language", () => {
    for (let count = 0; count <= 191; count += 1) {
      const named = nextNamedGrowth(count);
      expect(named).toBeTruthy();
      expect(named!.label).toBeTruthy();
      expect(named!.description).toBeTruthy();
      expect(`${named!.label} ${named!.description}`).not.toMatch(FORBIDDEN);
    }
  });
});

describe("absenceSleep", () => {
  it("sleeps with dew only after the companion has begun and today is still open", () => {
    expect(absenceSleep({ hasBegun: true, tendedToday: false })).toEqual({
      sleeping: true,
      dew: true,
    });
    expect(absenceSleep({ hasBegun: true, tendedToday: true })).toEqual({
      sleeping: false,
      dew: false,
    });
    expect(absenceSleep({ hasBegun: false, tendedToday: false })).toEqual({
      sleeping: false,
      dew: false,
    });
    expect(absenceSleep({ hasBegun: false, tendedToday: true })).toEqual({
      sleeping: false,
      dew: false,
    });
  });
});
