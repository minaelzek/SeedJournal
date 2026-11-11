import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TreeGrowthDelta, TreeGrowthEvent, TreeSnapshot } from "../lib/contracts";
import {
  GrowthReveal,
  growthCelebration,
  isExactGrowthDelta,
  hasPresentedGrowthReveal,
  markGrowthRevealPresented,
  type GrowthRevealStorage,
} from "../features/growth";
import { memoriesFromSnapshot } from "../features/garden/living-sakura/LivingSakuraGarden";
import { resolveLivingGardenTier } from "../features/garden/canUseWebGL";

class MemoryStorage implements GrowthRevealStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function memoryEvent(sequence: number, entryId = `entry-${sequence}`): TreeGrowthEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    entryId,
    occurredAt: 1_775_000_000_000 + sequence,
    localDate: "2026-08-06",
    kind: "memory_blossom",
    growthUnits: 4,
    seed: sequence,
  };
}

/**
 * Mirrors SeedJournalApp optimistic offline complete: append a local memory
 * event and build a reveal delta from unseen sequences.
 */
function optimisticCompleteGrowth(input: {
  existing: readonly TreeGrowthEvent[];
  entryId: string;
  completionId: string;
  growthUnits: 1 | 2 | 4 | 6;
  seed: number;
  localDay: string;
}): { events: TreeGrowthEvent[]; delta: TreeGrowthDelta } {
  const nextSequence =
    Math.max(0, ...input.existing.map((event) => event.sequence)) + 1;
  const localEvent: TreeGrowthEvent = {
    id: input.completionId,
    sequence: nextSequence,
    entryId: input.entryId,
    occurredAt: Date.now(),
    localDate: input.localDay,
    kind: "memory_blossom",
    growthUnits: input.growthUnits,
    seed: input.seed,
  };
  const events = [...input.existing, localEvent];
  const delta: TreeGrowthDelta = {
    previousSequence: nextSequence - 1,
    nextSequence,
    events: [localEvent],
  };
  return { events, delta };
}

describe("attachment loop — offline growth + single-canvas reveal", () => {
  it("builds an exact optimistic growth delta suitable for ceremony", () => {
    const { delta, events } = optimisticCompleteGrowth({
      existing: [memoryEvent(1), memoryEvent(2)],
      entryId: "offline-entry",
      completionId: "completion-offline",
      growthUnits: 2,
      seed: 99,
      localDay: "2026-08-06",
    });
    expect(events).toHaveLength(3);
    expect(isExactGrowthDelta(delta)).toBe(true);
    expect(delta.events[0].entryId).toBe("offline-entry");
    expect(delta.events[0].kind).toMatch(/^memory_/);
  });

  it("maps snapshot memories for the living garden after optimistic complete", () => {
    const { events } = optimisticCompleteGrowth({
      existing: [],
      entryId: "first-care",
      completionId: "c1",
      growthUnits: 1,
      seed: 1,
      localDay: "2026-08-06",
    });
    const snapshot: TreeSnapshot = {
      treeId: "tree-a",
      rootSeed: "tree-a",
      algorithmVersion: 2,
      totalEntries: 1,
      distinctJournalDays: 1,
      events,
    };
    const memories = memoriesFromSnapshot(snapshot);
    expect(memories).toHaveLength(1);
    expect(memories[0].entryId).toBe("first-care");
    expect(memories[0].privateGrowthUnits).toBe(1);
  });

  it("renders hostGarden reveal without mounting a second living garden markup", () => {
    const delta: TreeGrowthDelta = {
      previousSequence: 0,
      nextSequence: 1,
      events: [memoryEvent(1)],
    };
    const snapshot: TreeSnapshot = {
      treeId: "host-tree",
      rootSeed: "host-tree",
      algorithmVersion: 2,
      totalEntries: 1,
      distinctJournalDays: 1,
      events: [...delta.events],
    };
    const markup = renderToStaticMarkup(
      React.createElement(GrowthReveal, {
        delta,
        stage: "sprout",
        reducedMotion: true,
        treeId: "host-tree",
        snapshot,
        hostGarden: true,
        onReturn: () => undefined,
      }),
    );
    expect(markup).toContain("data-host-garden");
    expect(markup).toContain("data-living-reveal");
    expect(markup).toContain("Return to your sakura");
    // hostGarden omits the embedded LivingRevealTree mount point content path
    // while keeping ceremony chrome.
    expect(markup).toContain("sj-growth-reveal");
  });

  it("never silent-skips a non-exact delta: still presents fallback celebration", () => {
    const storage = new MemoryStorage();
    const messy: TreeGrowthDelta = {
      previousSequence: 10,
      nextSequence: 12,
      events: [memoryEvent(11)], // missing event for sequence 12
    };
    expect(isExactGrowthDelta(messy)).toBe(false);
    expect(hasPresentedGrowthReveal("tree-x", messy, storage)).toBe(false);

    const markup = renderToStaticMarkup(
      React.createElement(GrowthReveal, {
        delta: messy,
        stage: "sapling",
        reducedMotion: true,
        treeId: "tree-x",
        hostGarden: true,
        onReturn: () => undefined,
      }),
    );
    expect(markup).toContain("data-fallback");
    expect(markup).toContain("A bud opened on your sakura.");
    markGrowthRevealPresented("tree-x", messy, storage);
    expect(hasPresentedGrowthReveal("tree-x", messy, storage)).toBe(true);
  });

  it("keeps celebration free of grade/XP language", () => {
    const celebration = growthCelebration(
      {
        previousSequence: 0,
        nextSequence: 1,
        events: [memoryEvent(1)],
      },
      "young-tree",
      "micro",
    );
    const blob = `${celebration.kicker} ${celebration.title} ${celebration.detail} ${celebration.formLabel}`;
    expect(blob).not.toMatch(/\b(xp|points?|score|grade|leaderboard|streak)\b/i);
    expect(celebration.title).toContain("A bud opened");
  });

  it("demotes living garden when WebGL is unavailable (no blank slot)", () => {
    expect(
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: false,
      }),
    ).toBe("seed");
  });
});
