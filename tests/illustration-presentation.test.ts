import { describe, expect, it } from "vitest";
import type { TreeGrowthEvent, TreeSnapshot } from "../lib/contracts";
import {
  assertSakuraSpeciesLaw,
  fillForUnits,
  morphIntentFromDelta,
  presentSakura,
  presentationAtSequence,
  totalGrowthUnitsFromEvents,
} from "../features/garden/illustration/presentation";

function memoryEvent(
  sequence: number,
  kind: TreeGrowthEvent["kind"],
  growthUnits: TreeGrowthEvent["growthUnits"],
): TreeGrowthEvent {
  return {
    id: `ev-${sequence}`,
    sequence,
    entryId: `entry-${sequence}`,
    occurredAt: 1_775_000_000_000 + sequence,
    localDate: "2026-07-31",
    kind,
    growthUnits,
    seed: sequence * 17,
  };
}

function snapshot(events: TreeGrowthEvent[]): TreeSnapshot {
  return {
    treeId: "tree-test",
    rootSeed: "root-seed",
    algorithmVersion: 2,
    totalEntries: events.filter((event) => event.entryId).length,
    distinctJournalDays: 1,
    events,
  };
}

describe("sakura illustration presentation", () => {
  it("starts as a seed with no barren canopy", () => {
    const presentation = presentSakura(snapshot([]));
    expect(presentation.stage).toBe("seed");
    expect(presentation.fill).toBe(0);
    expect(presentation.sakura.heightScale).toBeGreaterThan(0);
    expect(presentation.earlyFullness).toBe(false);
  });

  it("keeps early leaf progress loved (never dead stick)", () => {
    const events = [
      memoryEvent(1, "leaf", 0),
      memoryEvent(2, "memory_leaf", 1),
      memoryEvent(3, "leaf", 0),
      memoryEvent(4, "memory_leaf", 1),
      memoryEvent(5, "leaf", 0),
      memoryEvent(6, "memory_leaf", 1),
    ];
    const presentation = presentSakura(snapshot(events));
    expect(presentation.stage).toBe("sprout");
    expect(presentation.totalGrowthUnits).toBe(3);
    expect(presentation.earlyFullness).toBe(true);
    expect(presentation.sakura.leafDensity).toBeGreaterThanOrEqual(0.55);
    expect(presentation.sakura.canopyMass).toBeGreaterThan(0.35);
    expect(presentation.sakura.trunkWeight).toBeGreaterThan(0.3);
    expect(presentation.sakura.leafCount).toBeGreaterThanOrEqual(5);
    expect(presentation.sakura.blossomCount + presentation.sakura.budCount).toBeGreaterThan(
      0,
    );
  });

  it("enforces blossom-first sakura law from sapling upward", () => {
    const targets: Array<{ units: number; kind: TreeGrowthEvent["kind"] }> = [
      { units: 12, kind: "memory_blossom" },
      { units: 48, kind: "memory_blossom" },
      { units: 96, kind: "memory_blossom" },
      { units: 192, kind: "memory_blossom" },
    ];
    for (const target of targets) {
      const events: TreeGrowthEvent[] = [];
      let sequence = 0;
      let remaining = target.units;
      while (remaining > 0) {
        sequence += 1;
        const take = (remaining >= 4 ? 4 : remaining >= 2 ? 2 : 1) as 1 | 2 | 4;
        events.push(memoryEvent(sequence, target.kind, take));
        remaining -= take;
      }
      const presentation = presentSakura(snapshot(events));
      expect(presentation.totalGrowthUnits).toBe(target.units);
      expect(assertSakuraSpeciesLaw(presentation)).toBe(true);
      expect(presentation.sakura.blossomDensity).toBeGreaterThanOrEqual(
        presentation.sakura.leafDensity - 0.02,
      );
    }
  });

  it("classifies morph intents: micro vs hanami vs stage-cross", () => {
    expect(
      morphIntentFromDelta(
        {
          previousSequence: 0,
          nextSequence: 2,
          events: [
            memoryEvent(1, "leaf", 0),
            memoryEvent(2, "memory_leaf", 1),
          ],
        },
        "seed",
        "sprout",
      ),
    ).toBe("stage-cross");

    expect(
      morphIntentFromDelta(
        {
          previousSequence: 2,
          nextSequence: 4,
          events: [
            memoryEvent(3, "leaf", 0),
            memoryEvent(4, "memory_leaf", 1),
          ],
        },
        "sprout",
        "sprout",
      ),
    ).toBe("micro");

    expect(
      morphIntentFromDelta(
        {
          previousSequence: 4,
          nextSequence: 6,
          events: [
            memoryEvent(5, "leaf", 0),
            memoryEvent(6, "memory_blossom", 4),
          ],
        },
        "sprout",
        "sprout",
      ),
    ).toBe("hanami");
  });

  it("presentation at sequence is prefix-stable", () => {
    const events = [
      memoryEvent(1, "memory_leaf", 1),
      memoryEvent(2, "memory_bud", 2),
      memoryEvent(3, "memory_blossom", 4),
    ];
    const full = snapshot(events);
    const at2 = presentationAtSequence(full, 2);
    expect(totalGrowthUnitsFromEvents(at2.memoryMarkers.length ? events.slice(0, 2) : events.slice(0, 2))).toBe(3);
    expect(at2.totalGrowthUnits).toBe(3);
    expect(at2.stage).toBe("sprout");
    expect(presentationAtSequence(full, 3).totalGrowthUnits).toBe(7);
  });

  it("fill progresses within a stage", () => {
    expect(fillForUnits(1, "sprout")).toBeCloseTo(0, 5);
    expect(fillForUnits(6, "sprout")).toBeGreaterThan(0.3);
    expect(fillForUnits(12, "sapling")).toBeCloseTo(0, 5);
    expect(fillForUnits(30, "sapling")).toBeGreaterThan(0.4);
  });
});
