import { describe, expect, it } from "vitest";
import {
  createGrowthCeremonySchedule,
  sampleGrowthCeremony,
} from "../features/garden/living-sakura/growthCeremony";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";

describe("living model ceremony wiring (shipped path)", () => {
  it("exposes a real multi-segment parent path and multi-organ targets after journals accumulate", () => {
    const model = createLivingSakuraModel({
      rootSeed: "ceremony-path",
      journalCount: 24,
      newestGrowthUnits: 4,
      revealProgress: 0.001,
    });

    expect(model.ceremonyPathSegmentIds.length).toBeGreaterThan(1);
    expect(model.ceremonyOrganIds[0]).toBe("newest-memory");
    // Units 4 → memory petal + 7 surrounding + visible generosity shoot.
    expect(model.ceremonyOrganIds.length).toBe(1 + 7 + 1);
    expect(model.ceremonyOrganIds).toContain("generosity-shoot");
    expect(model.ceremonyWoodSegmentId).toBeTruthy();
    expect(model.newestMemory).not.toBeNull();

    const schedule = createGrowthCeremonySchedule({
      eventId: "ceremony-path:memory:24",
      parentPathSegmentIds: model.ceremonyPathSegmentIds,
      organIds: model.ceremonyOrganIds,
    });
    expect(schedule.path.length).toBe(model.ceremonyPathSegmentIds.length);
    expect(schedule.organs.length).toBe(model.ceremonyOrganIds.length);

    const mid = sampleGrowthCeremony(schedule, 2.0);
    expect(mid.woodProgress).toBeGreaterThan(0);
    expect(mid.organs.some((organ) => organ.progress > 0)).toBe(true);

    model.applyCeremonySample({
      parentPath: mid.parentPath,
      woodProgress: mid.woodProgress,
      organs: mid.organs,
    });
    // Newest petal scales with organ progress (not stuck at zero).
    const memoryOrgan = mid.organs.find((organ) => organ.organId === "newest-memory");
    expect(memoryOrgan).toBeDefined();
    expect(model.newestMemory!.scale.x).toBeGreaterThan(0.001);

    // Path pulse: mid-window on first path step (progress~0.5 → peak emphasis).
    const pathPulse = sampleGrowthCeremony(schedule, 0.15);
    const pathStep = pathPulse.parentPath.find(
      (step) =>
        step.segmentId !== model.ceremonyWoodSegmentId &&
        step.progress > 0.2 &&
        step.progress < 0.9 &&
        step.emphasis > 0.3,
    );
    expect(pathStep).toBeDefined();
    model.applyCeremonySample({
      parentPath: pathPulse.parentPath,
      woodProgress: pathPulse.woodProgress,
      organs: pathPulse.organs,
    });
    if (pathStep) {
      const pathPivot = model.pivots.find(
        (pivot) => pivot.segmentId === pathStep.segmentId,
      );
      expect(pathPivot).toBeDefined();
      // Cinematic path pulse: scale above base when emphasis is active.
      expect(pathPivot!.group.scale.x).toBeGreaterThan(1.01);
    }
    // Wood extension is anisotropic (length ahead of girth) when partial.
    const woodMid = sampleGrowthCeremony(schedule, 1.0);
    model.applyCeremonySample({
      parentPath: woodMid.parentPath,
      woodProgress: woodMid.woodProgress,
      organs: woodMid.organs,
    });
    if (
      model.ceremonyWoodSegmentId &&
      woodMid.woodProgress > 0.2 &&
      woodMid.woodProgress < 0.95
    ) {
      const woodPivot = model.pivots.find(
        (pivot) => pivot.segmentId === model.ceremonyWoodSegmentId,
      );
      expect(woodPivot).toBeDefined();
      // Y (length axis of local grow) should lead girth on partial woodProgress.
      expect(woodPivot!.group.scale.y).toBeGreaterThan(
        woodPivot!.group.scale.x * 0.95,
      );
    }

    model.dispose();
  });

  it("keeps early journals loved: visible wood, memory petal, surrounding life", () => {
    for (const count of [1, 2, 3] as const) {
      const model = createLivingSakuraModel({
        rootSeed: "early-love",
        journalCount: count,
        newestGrowthUnits: 1,
      });
      expect(model.visibleBranchCount).toBeGreaterThanOrEqual(1);
      expect(model.memoryBlossomCount).toBe(count);
      expect(model.newestMemory).not.toBeNull();
      expect(model.ceremonyOrganIds[0]).toBe("newest-memory");
      expect(model.ceremonyOrganIds.length).toBeGreaterThanOrEqual(
        count === 1 ? 1 : 2,
      );
      // Not a microscopic barren stick.
      expect(model.root.scale.y).toBeGreaterThan(0.35);
      model.dispose();
    }
  });

  it("applies production wood presentation by established chapter (96+)", () => {
    const young = createLivingSakuraModel({
      rootSeed: "prod-wood",
      journalCount: 48,
      newestGrowthUnits: 2,
    });
    const established = createLivingSakuraModel({
      rootSeed: "prod-wood",
      journalCount: 96,
      newestGrowthUnits: 2,
    });
    // Established densifies further; both remain visible companions.
    expect(established.visibleBranchCount).toBeGreaterThanOrEqual(
      young.visibleBranchCount,
    );
    expect(established.root.scale.y).toBeGreaterThan(young.root.scale.y * 0.9);
    young.dispose();
    established.dispose();
  });
});
