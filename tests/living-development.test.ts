import { describe, expect, it } from "vitest";
import {
  botanicalMemoryAnchorKey,
  createLivingDevelopment,
  createLivingDevelopmentLedger,
  historicalMemoryMarker,
  livingMaturityForOrdinal,
  projectActiveMemoryMarkers,
  type LivingMemoryInput,
  type PrivateGrowthUnits,
} from "../features/growth/livingDevelopment";

const TREE_KEY = "private-tree";

function memory(
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

describe("renderer-independent living development", () => {
  it.each([
    [1, "sprout", 0],
    [193, "enduring", 1],
    [1_000, "enduring", 17],
    [10_000, "enduring", 205],
  ] as const)(
    "keeps entry %i visibly developing in the %s phase",
    (ordinal, phase, enduringCycle) => {
      const development = createLivingDevelopment(
        TREE_KEY,
        memory(ordinal, 1),
      );

      expect(development.maturity.phase).toBe(phase);
      expect(development.maturity.enduringCycle).toBe(enduringCycle);
      expect(development.surrounding.persistentChangeCount).toBeGreaterThan(0);
      expect(
        development.surrounding.features.every(
          (feature) => feature.persistence === "permanent" && feature.count > 0,
        ),
      ).toBe(true);
      expect(development.memory.persistence).toBe("permanent");
    },
  );

  it("has no visible maturity cap after entry 192", () => {
    expect(livingMaturityForOrdinal(192)).toEqual({
      phase: "mature",
      enduringCycle: 0,
      enduringPosition: 0,
    });
    expect(livingMaturityForOrdinal(193)).toMatchObject({
      phase: "enduring",
      enduringCycle: 1,
      enduringPosition: 1,
    });
    expect(livingMaturityForOrdinal(10_000).enduringCycle).toBeGreaterThan(
      livingMaturityForOrdinal(1_000).enduringCycle,
    );

    const lateLocations = [193, 1_000, 10_000].map(
      (ordinal) =>
        createLivingDevelopment(TREE_KEY, memory(ordinal)).memory.location
          .locationKey,
    );
    expect(new Set(lateLocations).size).toBe(lateLocations.length);
  });

  it("maps private 1/2/4/6 values to monotonically more generous surroundings", () => {
    const units = [1, 2, 4, 6] as const;
    const developments = units.map((privateGrowthUnits) =>
      createLivingDevelopment(
        TREE_KEY,
        memory(250, privateGrowthUnits, {
          entryId: "same-memory",
          seed: "same-seed",
        }),
      ),
    );

    expect(
      developments.map(
        (development) => development.surrounding.privateGenerosity,
      ),
    ).toEqual([1, 2, 3, 4]);
    expect(
      developments.map(
        (development) => development.surrounding.persistentChangeCount,
      ),
    ).toEqual([2, 4, 7, 11]);
    expect(
      developments.map((development) =>
        development.surrounding.features.reduce(
          (total, feature) => total + feature.count,
          0,
        ),
      ),
    ).toEqual([2, 4, 7, 11]);
  });

  it("never punishes a thin session — every complete journal still grows the tree", () => {
    const thin = createLivingDevelopment(TREE_KEY, memory(7, 1));
    const rich = createLivingDevelopment(TREE_KEY, memory(7, 6, { entryId: "rich" }));
    expect(thin.surrounding.persistentChangeCount).toBeGreaterThan(0);
    expect(rich.surrounding.persistentChangeCount).toBeGreaterThan(
      thin.surrounding.persistentChangeCount,
    );
    expect(thin.memory.semanticImportance).toBe("equal");
    expect(rich.memory.semanticImportance).toBe("equal");
    expect(thin.memory.kind).toBe("memory-blossom");
    expect(rich.memory.kind).toBe("memory-blossom");
  });

  it("gives every memory identical semantic importance independent of richness or age", () => {
    const developments = [
      createLivingDevelopment(TREE_KEY, memory(1, 1)),
      createLivingDevelopment(TREE_KEY, memory(193, 2)),
      createLivingDevelopment(TREE_KEY, memory(1_000, 4)),
      createLivingDevelopment(TREE_KEY, memory(10_000, 6)),
    ];

    for (const development of developments) {
      expect(development.memory).toMatchObject({
        kind: "memory-blossom",
        semanticImportance: "equal",
        persistence: "permanent",
      });
    }
    expect(new Set(developments.map((item) => item.memory.kind))).toEqual(
      new Set(["memory-blossom"]),
    );
    expect(
      new Set(developments.map((item) => item.memory.semanticImportance)),
    ).toEqual(new Set(["equal"]));
  });

  it("is deterministic while providing varied recipes for equal generosity", () => {
    const input = memory(300, 4, {
      entryId: "deterministic-memory",
      seed: "repeatable-seed",
    });
    expect(createLivingDevelopment(TREE_KEY, input)).toEqual(
      createLivingDevelopment(TREE_KEY, input),
    );

    const variants = new Set(
      Array.from({ length: 32 }, (_, index) =>
        createLivingDevelopment(
          TREE_KEY,
          memory(300 + index, 4, {
            entryId: `variant-entry-${index}`,
            seed: `variant-seed-${index}`,
          }),
        ).surrounding.variantKey,
      ),
    );
    expect(variants.size).toBeGreaterThan(3);
  });

  it("keeps stable botanical keys and places revisits adjacent to their lineage", () => {
    const parent = createLivingDevelopment(
      TREE_KEY,
      memory(12, 1, { entryId: "parent" }),
    );
    const revisit = createLivingDevelopment(
      TREE_KEY,
      memory(193, 6, {
        entryId: "revisit",
        parentEntryId: "parent",
        lineageRootEntryId: "parent",
      }),
    );

    expect(parent.memory.location.anchorKey).toBe(
      botanicalMemoryAnchorKey(TREE_KEY, "parent"),
    );
    expect(revisit.memory.location.adjacentToKey).toBe(
      parent.memory.location.anchorKey,
    );
    expect(revisit.memory.location.familyKey).toBe(
      parent.memory.location.anchorKey,
    );
    expect(
      createLivingDevelopment(
        TREE_KEY,
        memory(193, 1, {
          entryId: "revisit",
          parentEntryId: "parent",
          lineageRootEntryId: "parent",
          seed: "different-recipe",
        }),
      ).memory.location,
    ).toEqual(revisit.memory.location);
  });

  it("bounds active markers without deleting historical reachability", () => {
    const ledger = createLivingDevelopmentLedger(
      TREE_KEY,
      Array.from({ length: 1_000 }, (_, index) => memory(index + 1)),
    );
    const projection = projectActiveMemoryMarkers(ledger.developments, {
      limit: 12,
      selectedEntryIds: ["entry-1"],
    });

    expect(projection.activeMarkers).toHaveLength(12);
    expect(projection.activeMarkers.some((item) => item.entryId === "entry-1"))
      .toBe(true);
    expect(projection.totalHistorical).toBe(1_000);
    expect(Object.keys(projection.historicalByEntryId)).toHaveLength(1_000);
    expect(historicalMemoryMarker(projection, "entry-500")?.entryId).toBe(
      "entry-500",
    );
    expect(historicalMemoryMarker(projection, "entry-1")?.location).toEqual(
      ledger.byEntryId["entry-1"].memory.location,
    );
  });

  it("never decays, replaces, or mutates earlier development as history grows", () => {
    const firstInputs = Array.from({ length: 193 }, (_, index) =>
      memory(index + 1, index % 2 === 0 ? 1 : 6),
    );
    const firstLedger = createLivingDevelopmentLedger(TREE_KEY, firstInputs);
    const firstSnapshot = structuredClone(firstLedger.developments[0]);
    const matureSnapshot = structuredClone(firstLedger.developments[192]);

    const extendedLedger = createLivingDevelopmentLedger(
      TREE_KEY,
      Array.from({ length: 10_000 }, (_, index) =>
        memory(index + 1, index % 2 === 0 ? 1 : 6),
      ),
    );
    const projection = projectActiveMemoryMarkers(extendedLedger.developments, {
      limit: 24,
    });

    expect(extendedLedger.byEntryId["entry-1"]).toEqual(firstSnapshot);
    expect(extendedLedger.byEntryId["entry-193"]).toEqual(matureSnapshot);
    expect(Object.keys(projection.historicalByEntryId)).toHaveLength(10_000);
    expect(
      extendedLedger.developments.every(
        (development) =>
          development.memory.persistence === "permanent" &&
          development.surrounding.features.every(
            (feature) => feature.persistence === "permanent",
          ),
      ),
    ).toBe(true);
  });
});
