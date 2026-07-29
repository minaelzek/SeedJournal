import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TreeGrowthDelta, TreeGrowthEvent } from "../lib/contracts";
import {
  GrowthReveal,
  describeTreeStage,
  growthRevealKey,
  hasPresentedGrowthReveal,
  isExactGrowthDelta,
  markGrowthRevealPresented,
  memoryLineageAnchor,
  resolveMemoryLineage,
  stageForGrowthUnits,
  stageGrowthMessage,
  type GrowthRevealStorage,
} from "../features/growth";

function event(sequence: number): TreeGrowthEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    entryId: `entry-${sequence}`,
    occurredAt: 1_775_000_000_000 + sequence,
    localDate: "2026-07-29",
    kind: "memory_blossom",
    growthUnits: 4,
    seed: sequence,
  };
}

function delta(previousSequence = 10): TreeGrowthDelta {
  return {
    previousSequence,
    nextSequence: previousSequence + 2,
    events: [event(previousSequence + 1), event(previousSequence + 2)],
  };
}

class MemoryStorage implements GrowthRevealStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("seed-to-sakura growth experience", () => {
  it("maps cumulative growth to the six botanical stages at exact boundaries", () => {
    expect(
      [0, 1, 12, 48, 96, 192].map((units) => stageForGrowthUnits(units)),
    ).toEqual([
      "seed",
      "sprout",
      "sapling",
      "young-tree",
      "established",
      "mature",
    ]);
    expect(stageForGrowthUnits(-1)).toBe("seed");
    expect(stageForGrowthUnits(Number.NaN)).toBe("seed");
  });

  it("produces concise semantic descriptions without exposing evaluation", () => {
    const descriptions = [
      describeTreeStage("seed"),
      describeTreeStage("sprout", { memoryCount: 1 }),
      describeTreeStage("young-tree", { memoryCount: 9, branchCount: 2 }),
      describeTreeStage("mature", { memoryCount: 30, branchCount: 8 }),
      ...(
        [
          "seed",
          "sprout",
          "sapling",
          "young-tree",
          "established",
          "mature",
        ] as const
      ).flatMap((stage) => Object.values(stageGrowthMessage(stage))),
    ].join(" ");

    expect(descriptions).not.toMatch(
      /\b(score|scored|depth|signal|rubric|quality|grade|unit|points?)\b/i,
    );
  });

  it("accepts only a contiguous, exact committed growth delta", () => {
    expect(isExactGrowthDelta(delta())).toBe(true);
    expect(
      isExactGrowthDelta({
        previousSequence: 10,
        nextSequence: 12,
        events: [event(12), event(11)],
      }),
    ).toBe(false);
    expect(
      isExactGrowthDelta({
        previousSequence: 10,
        nextSequence: 12,
        events: [event(11)],
      }),
    ).toBe(false);
  });

  it("records a reveal once per tree and exact sequence range", () => {
    const storage = new MemoryStorage();
    const committed = delta(20);
    expect(hasPresentedGrowthReveal("tree-a", committed, storage)).toBe(false);
    markGrowthRevealPresented("tree-a", committed, storage);
    expect(hasPresentedGrowthReveal("tree-a", committed, storage)).toBe(true);
    expect(hasPresentedGrowthReveal("tree-b", committed, storage)).toBe(false);
    expect(growthRevealKey("tree-a", committed)).toContain(":20:22");
  });

  it("renders neutral completion language and one return action", () => {
    const markup = renderToStaticMarkup(
      <GrowthReveal
        delta={delta(40)}
        stage="young-tree"
        reducedMotion
        treeId="render-tree"
        onReturn={() => undefined}
      />,
    );
    expect(markup).toContain("Return to garden");
    expect(markup).toContain("living tree");
    expect(markup).not.toMatch(
      /\b(score|scored|depth|signal|rubric|quality|grade|unit|points?|luminous)\b/i,
    );
  });

  it("keeps revisits beside a valid parent and rejects broken lineage", () => {
    const records = [
      { entryId: "root" },
      { entryId: "revisit-1", parentEntryId: "root" },
      { entryId: "revisit-2", parentEntryId: "revisit-1" },
      { entryId: "orphan", parentEntryId: "missing" },
      { entryId: "cycle-a", parentEntryId: "cycle-b" },
      { entryId: "cycle-b", parentEntryId: "cycle-a" },
    ];

    expect(resolveMemoryLineage(records, "revisit-2")).toMatchObject({
      parentEntryId: "revisit-1",
      rootEntryId: "root",
      ancestorEntryIds: ["revisit-1", "root"],
      depth: 2,
      isRevisit: true,
    });
    expect(memoryLineageAnchor(records, "revisit-1")).toBe("root");
    expect(resolveMemoryLineage(records, "orphan")).toMatchObject({
      parentEntryId: null,
      orphaned: true,
    });
    expect(resolveMemoryLineage(records, "cycle-a")).toMatchObject({
      parentEntryId: null,
      cycleDetected: true,
      depth: 0,
    });
  });
});
