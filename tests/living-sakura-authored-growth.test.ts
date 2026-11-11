import { describe, expect, it } from "vitest";

import {
  AUTHORED_CROWN_BLUEPRINT,
  AUTHORED_GROWTH_MILESTONES,
  authoredMemoryKey,
  planAuthoredSakuraGrowth,
  type AuthoredGrowthJournal,
} from "../features/garden/living-sakura/authoredGrowth";

const SUBJECT = "stable-private-subject";

function journal(
  ordinal: number,
  overrides: Partial<AuthoredGrowthJournal> = {},
): AuthoredGrowthJournal {
  return {
    entryId: `private-entry-${ordinal}`,
    ordinal,
    completed: true,
    reflectionDepth: (ordinal % 4) / 3,
    ...overrides,
  };
}

function history(count: number): readonly AuthoredGrowthJournal[] {
  return Array.from({ length: count }, (_, index) => journal(index + 1));
}

function plan(count: number) {
  return planAuthoredSakuraGrowth({ subjectId: SUBJECT, history: history(count) });
}

describe("authored Living Sakura growth contract", () => {
  it("activates a permanent authored crown monotonically", () => {
    const plans = [0, ...AUTHORED_GROWTH_MILESTONES].map(plan);

    for (let index = 1; index < plans.length; index += 1) {
      const earlier = plans[index - 1];
      const later = plans[index];
      expect(later.crown.map((element) => element.elementId)).toEqual(
        earlier.crown.map((element) => element.elementId),
      );
      for (let elementIndex = 0; elementIndex < later.crown.length; elementIndex += 1) {
        expect(later.crown[elementIndex].activation).toBeGreaterThanOrEqual(
          earlier.crown[elementIndex].activation,
        );
      }
      expect(
        later.crown.reduce((sum, element) => sum + element.activation, 0),
      ).toBeGreaterThan(
        earlier.crown.reduce((sum, element) => sum + element.activation, 0),
      );
    }
  });

  it("makes every required milestone visibly distinct without replacing geometry", () => {
    const milestonePlans = AUTHORED_GROWTH_MILESTONES.map(plan);

    expect(milestonePlans.map((result) => result.stage)).toEqual([
      "first-bloom",
      "sapling",
      "young-crown",
      "established-crown",
      "mature-crown",
      "enduring-crown",
    ]);
    expect(new Set(milestonePlans.map((result) =>
      result.crown.filter((element) => element.visible).length,
    )).size).toBe(AUTHORED_GROWTH_MILESTONES.length);
    expect(
      milestonePlans.every(
        (result) => result.crown.length === AUTHORED_CROWN_BLUEPRINT.length,
      ),
    ).toBe(true);
  });

  it.each([1, 12, 48, 96, 192, 1_000])(
    "assigns exactly one equal five-petal memory blossom per %i retained journals",
    (count) => {
      const result = plan(count);

      expect(result.memoryBlossoms).toHaveLength(count);
      expect(new Set(result.memoryBlossoms.map((item) => item.memoryKey)).size).toBe(
        count,
      );
      expect(new Set(result.memoryBlossoms.map((item) => item.socket.socketId)).size).toBe(
        count,
      );
      expect(
        result.memoryBlossoms.every((item) =>
          item.flower.petalCount === 5 &&
          item.flower.semanticImportance === "equal" &&
          item.flower.scale === 1,
        ),
      ).toBe(true);
      expect(new Set(result.memoryBlossoms.map((item) => item.flower))).toHaveLength(1);
    },
  );

  it("reconstructs identically and preserves socket assignments as history grows", () => {
    const first = planAuthoredSakuraGrowth({
      subjectId: SUBJECT,
      history: history(96),
    });
    const replay = planAuthoredSakuraGrowth({
      subjectId: SUBJECT,
      history: [...history(96)].reverse(),
    });
    const later = plan(1_000);

    expect(replay).toEqual(first);
    expect(later.memoryBlossoms.slice(0, 96)).toEqual(first.memoryBlossoms);
    expect(
      planAuthoredSakuraGrowth({
        subjectId: "different-subject",
        history: history(96),
      }).memoryBlossoms.map((item) => item.socket.socketId),
    ).not.toEqual(first.memoryBlossoms.map((item) => item.socket.socketId));
  });

  it("allows private depth to affect only surrounding botanical enrichment", () => {
    const variants = [0, 0.3, 0.6, 1].map((reflectionDepth) =>
      planAuthoredSakuraGrowth({
        subjectId: SUBJECT,
        history: [journal(1, { reflectionDepth })],
      }).memoryBlossoms[0],
    );

    const withoutSurroundings = variants.map((memory) => ({
      memoryKey: memory.memoryKey,
      socket: memory.socket,
      flower: memory.flower,
    }));
    expect(withoutSurroundings).toEqual([
      withoutSurroundings[0],
      withoutSurroundings[0],
      withoutSurroundings[0],
      withoutSurroundings[0],
    ]);
    expect(variants.map((item) => item.surroundingGrowth)).toEqual([
      {
        kind: "surrounding-growth",
        budCount: 0,
        leafPairCount: 0,
        fineShootActivation: 0,
        motionLift: 0,
      },
      {
        kind: "surrounding-growth",
        budCount: 1,
        leafPairCount: 1,
        fineShootActivation: 0.28,
        motionLift: 0.025,
      },
      {
        kind: "surrounding-growth",
        budCount: 2,
        leafPairCount: 1,
        fineShootActivation: 0.62,
        motionLift: 0.055,
      },
      {
        kind: "surrounding-growth",
        budCount: 3,
        leafPairCount: 2,
        fineShootActivation: 1,
        motionLift: 0.09,
      },
    ]);
  });

  it("removes readable metadata and depth-derived detail from deleted entries", () => {
    const secretId = "entry-secret-words-never-render";
    const result = planAuthoredSakuraGrowth({
      subjectId: SUBJECT,
      history: [
        {
          ...journal(1, { entryId: secretId, deleted: true, reflectionDepth: 1 }),
          privateTitle: "A readable secret title",
          plaintext: "A readable secret journal body",
        } as AuthoredGrowthJournal,
      ],
    });
    const serialized = JSON.stringify(result);

    expect(result.memoryBlossoms).toEqual([]);
    expect(result.anonymousTraces).toHaveLength(1);
    expect(result.anonymousTraces[0]).toMatchObject({
      kind: "anonymous-growth-trace",
      interactive: false,
    });
    expect(serialized).not.toContain(secretId);
    expect(serialized).not.toContain("readable secret");
    expect(serialized).not.toMatch(/entryId|reflectionDepth|privateTitle|plaintext/i);
  });

  it("bounds every adjacent milestone transition instead of swapping stages", () => {
    for (const milestone of AUTHORED_GROWTH_MILESTONES.slice(1)) {
      const before = plan(milestone - 1);
      const at = plan(milestone);

      expect(at.crown.map((element) => element.elementId)).toEqual(
        before.crown.map((element) => element.elementId),
      );
      const deltas = at.crown.map(
        (element, index) => element.activation - before.crown[index].activation,
      );
      expect(Math.max(...deltas)).toBeLessThanOrEqual(0.126);
      expect(deltas.every((delta) => delta >= 0)).toBe(true);
      expect(at.memoryBlossoms.length - before.memoryBlossoms.length).toBe(1);
    }
  });

  it("rejects histories that could destabilize permanent socket ownership", () => {
    expect(() =>
      planAuthoredSakuraGrowth({
        subjectId: SUBJECT,
        history: [journal(2)],
      }),
    ).toThrow(/contiguous from one/);
    expect(() =>
      planAuthoredSakuraGrowth({
        subjectId: SUBJECT,
        history: [journal(1), journal(2, { entryId: "private-entry-1" })],
      }),
    ).toThrow(/duplicate completed journal entryId/);
    expect(authoredMemoryKey(SUBJECT, "private-entry-1")).not.toContain(
      "private-entry-1",
    );
  });
});
