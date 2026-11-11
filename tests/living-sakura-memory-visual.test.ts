import { describe, expect, it } from "vitest";
import type { GardenMemoryRecord } from "../features/garden/MemoryNavigator";
import {
  createLivingMemoryVisualProjection,
  type LivingMemoryVisualProjection,
} from "../features/garden/living-sakura/livingMemoryVisual";
import {
  createLivingDevelopmentLedger,
  type LivingMemoryInput,
  type PrivateGrowthUnits,
} from "../features/growth/livingDevelopment";

const TREE_KEY = "renderer-safe-tree";

function input(
  ordinal: number,
  privateGrowthUnits: PrivateGrowthUnits = 2,
  overrides: Partial<LivingMemoryInput> = {},
): LivingMemoryInput {
  return {
    entryId: `entry-${ordinal}`,
    ordinal,
    privateGrowthUnits,
    seed: `seed-${ordinal}`,
    ...overrides,
  };
}

function record(
  ordinal: number,
  overrides: Partial<GardenMemoryRecord> & Record<string, unknown> = {},
): GardenMemoryRecord {
  return {
    entryId: `entry-${ordinal}`,
    eventId: `event-${ordinal}`,
    dateLabel: `August ${ordinal}, 2026`,
    title: `Private title ${ordinal}`,
    seedInsight: `Private insight ${ordinal}`,
    form: "luminous-blossom",
    ...overrides,
  };
}

function projection(
  count: number,
  overrides: Partial<
    Parameters<typeof createLivingMemoryVisualProjection>[0]
  > = {},
): LivingMemoryVisualProjection {
  const inputs = Array.from({ length: count }, (_, index) =>
    input(index + 1, ([1, 2, 4, 6] as const)[index % 4]),
  );
  const ledger = createLivingDevelopmentLedger(TREE_KEY, inputs);
  return createLivingMemoryVisualProjection({
    memories: Array.from({ length: count }, (_, index) => record(index + 1)),
    developments: ledger.developments,
    locked: false,
    ...overrides,
  });
}

describe("LivingMemoryVisual product contract", () => {
  it.each([1, 96, 192, 1_000])(
    "creates one stable equal five-petal visual for %i completed entries",
    (count) => {
      const first = projection(count);
      const second = projection(count);

      expect(first.history).toHaveLength(count);
      expect(first).toEqual(second);
      expect(new Set(first.history.map((visual) => visual.entryId)).size).toBe(
        count,
      );
      expect(
        new Set(
          first.history.map(
            (visual) => visual.botanicalIdentity.locationKey,
          ),
        ).size,
      ).toBe(count);
      expect(
        first.history.every(
          (visual) =>
            visual.blossom?.petalCount === 5 &&
            visual.blossom.semanticImportance === "equal" &&
            visual.blossom.interactionTarget === "whole-flower" &&
            visual.branchLocalTransform.space === "segment-local",
        ),
      ).toBe(true);
      expect(first.active).toHaveLength(Math.min(count, 256));
    },
  );

  it("keeps earlier identity stable as history grows", () => {
    const at96 = projection(96);
    const at1_000 = projection(1_000);

    expect(at1_000.history.slice(0, 96)).toEqual(at96.history);
  });

  it("does not let reflection depth change blossom identity or importance", () => {
    const variants = ([1, 2, 4, 6] as const).map((privateGrowthUnits) => {
      const ledger = createLivingDevelopmentLedger(TREE_KEY, [
        input(1, privateGrowthUnits, {
          entryId: "same-entry",
          seed: "same-seed",
        }),
      ]);
      return createLivingMemoryVisualProjection({
        memories: [record(1, { entryId: "same-entry" })],
        developments: ledger.developments,
        locked: false,
      }).history[0];
    });

    expect(variants).toEqual([variants[0], variants[0], variants[0], variants[0]]);
    expect(variants[0].blossom).toEqual({
      kind: "memory-blossom",
      petalCount: 5,
      semanticImportance: "equal",
      interactionTarget: "whole-flower",
      treatment: "equal-memory-v1",
    });
  });

  it("allowlists renderer metadata and excludes all journal and scoring content", () => {
    const ledger = createLivingDevelopmentLedger(TREE_KEY, [input(1, 6)]);
    const memories = [
      record(1, {
        title: "TOP SECRET TITLE",
        seedInsight: "TOP SECRET INSIGHT",
        plaintext: "TOP SECRET PLAINTEXT",
        score: 999,
        growthUnits: 6,
        ciphertext: "TOP SECRET CIPHERTEXT",
        passphrase: "TOP SECRET PASSPHRASE",
      }),
    ];
    const result = createLivingMemoryVisualProjection({
      memories,
      developments: ledger.developments,
      locked: false,
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("TOP SECRET");
    expect(serialized).not.toMatch(
      /title|insight|plaintext|score|growthUnits|ciphertext|passphrase/i,
    );
    expect(serialized).not.toContain("privateGenerosity");
    expect(serialized).not.toContain("persistentChangeCount");
  });

  it("anonymizes deleted memories while preserving only a stable inert trace", () => {
    const result = projection(3, { deletedEntryIds: ["entry-2"] });
    const deleted = result.history[1];

    expect(deleted).toMatchObject({
      entryId: null,
      ordinal: 2,
      state: "deleted",
      interactive: false,
      renderRole: "anonymous-growth-trace",
      blossom: null,
    });
    expect(deleted.botanicalIdentity.locationKey).toBeTruthy();
    expect(result.active[1]).toEqual(deleted);
    expect(JSON.stringify(deleted)).not.toContain("entry-2");
  });

  it("marks missing or unavailable records inert without inventing content", () => {
    const inputs = [input(1), input(2)];
    const ledger = createLivingDevelopmentLedger(TREE_KEY, inputs);
    const result = createLivingMemoryVisualProjection({
      memories: [record(1)],
      developments: ledger.developments,
      unavailableEntryIds: ["entry-1"],
      locked: false,
    });

    expect(result.history.map((visual) => visual.state)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(result.history.every((visual) => !visual.interactive)).toBe(true);
  });

  it("rejects a completed record without a stable development marker", () => {
    expect(() =>
      createLivingMemoryVisualProjection({
        memories: [record(1)],
        developments: [],
        locked: false,
      }),
    ).toThrow("completed garden memory has no living development: entry-1");
  });

  it("redacts the entire personalized projection while locked", () => {
    const result = projection(192, {
      locked: true,
      selectedEntryId: "entry-1",
      deletedEntryIds: ["entry-2"],
    });

    expect(result).toEqual({
      schemaVersion: 1,
      locked: true,
      history: [],
      active: [],
      projectionRequests: [],
      totalCompleted: 0,
      activeLimit: 0,
    });
    expect(JSON.stringify(result)).not.toContain("entry-");
  });

  it("requests and pins a selected old memory outside the recent active window", () => {
    const result = projection(1_000, {
      activeLimit: 256,
      selectedEntryId: "entry-1",
    });

    expect(result.active).toHaveLength(256);
    expect(result.active[0]).toMatchObject({
      entryId: "entry-1",
      state: "selected",
      interactive: true,
    });
    expect(result.projectionRequests).toEqual([
      {
        kind: "project-selected-memory",
        entryId: "entry-1",
        botanicalAddress:
          result.active[0].branchLocalTransform.botanicalAddress,
        reason: "selected-outside-active-window",
        required: true,
      },
    ]);
  });

  it("does not project a deleted, unavailable, or unknown selection", () => {
    for (const overrides of [
      { selectedEntryId: "entry-1", deletedEntryIds: ["entry-1"] },
      { selectedEntryId: "entry-1", unavailableEntryIds: ["entry-1"] },
      { selectedEntryId: "missing-entry" },
    ]) {
      const result = projection(192, { activeLimit: 12, ...overrides });
      expect(result.projectionRequests).toEqual([]);
      expect(result.history.some((visual) => visual.state === "selected")).toBe(
        false,
      );
    }
  });

  it("preserves revisit lineage through botanical identities only", () => {
    const ledger = createLivingDevelopmentLedger(TREE_KEY, [
      input(1, 1, { entryId: "origin" }),
      input(2, 6, {
        entryId: "revisit",
        parentEntryId: "origin",
        lineageRootEntryId: "origin",
      }),
    ]);
    const result = createLivingMemoryVisualProjection({
      memories: [
        record(1, { entryId: "origin" }),
        record(2, { entryId: "revisit" }),
      ],
      developments: ledger.developments,
      locked: false,
    });

    expect(result.history[1].lineage.adjacentToAnchorKey).toBe(
      result.history[0].botanicalIdentity.anchorKey,
    );
    expect(result.history[1].lineage.familyAnchorKey).toBe(
      result.history[0].botanicalIdentity.anchorKey,
    );
  });
});
