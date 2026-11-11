import { describe, expect, it } from "vitest";

import {
  livingFloweringSiteBudget,
  planLivingFloweringSpurs,
} from "../features/garden/living-sakura/livingFlowering";
import { buildLifelongSakuraSegments } from "../features/garden/living-sakura/lifelongSakura";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import type { FloweringSpurPlan } from "../features/garden/living-sakura/floweringSpurs";
import type { LivingSakuraSegment } from "../features/garden/living-sakura/livingTopology";

function planFor(rootSeed: string, journalCount: number) {
  const segments =
    journalCount > 0 ? buildLifelongSakuraSegments(rootSeed, journalCount) : [];
  return {
    segments,
    plan: planLivingFloweringSpurs({
      rootSeed,
      segments,
      journalCount,
    }),
  };
}

function ambientFlowerCount(model: ReturnType<typeof createLivingSakuraModel>): number {
  let ambient = 0;
  model.root.traverse((child) => {
    if (child.name === "Ambient sakura flowers" && "count" in child) {
      ambient += Number(child.count);
    }
  });
  return ambient;
}

function floralInstanceCount(model: ReturnType<typeof createLivingSakuraModel>): number {
  let total = 0;
  model.root.traverse((child) => {
    if (
      (child.name === "Ambient sakura flowers" ||
        child.name === "Half-open sakura flowers" ||
        child.name === "Ambient flower centers" ||
        child.name === "Enduring care flowers") &&
      "count" in child
    ) {
      total += Number(child.count);
    }
  });
  return total;
}

function expectValidLivingFloweringPlan(
  plan: FloweringSpurPlan,
  segments: readonly LivingSakuraSegment[],
) {
  const ids = new Set(segments.map((segment) => segment.id));
  expect(plan.potentialSiteCount).toBeGreaterThanOrEqual(72);
  expect(plan.potentialSiteCount).toBeLessThanOrEqual(140);
  expect(plan.sites).toHaveLength(plan.potentialSiteCount);
  expect(plan.activeSiteCount).toBe(plan.sites.filter((site) => site.active).length);
  expect(plan.activeRatio).toBeGreaterThanOrEqual(0.4);
  expect(plan.activeRatio).toBeLessThanOrEqual(0.58);
  expect(plan.sites.filter((site) => site.active && site.cluster === null)).toHaveLength(0);
  expect(plan.sites.filter((site) => !site.active && site.cluster !== null)).toHaveLength(0);

  for (const site of plan.sites) {
    expect(ids.has(site.segmentId), site.segmentId).toBe(true);
    if (!site.active) continue;
    expect(site.cluster).not.toBeNull();
    expect(site.cluster!.flowers.length).toBeGreaterThanOrEqual(2);
    expect(site.cluster!.flowers.length).toBeLessThanOrEqual(4);
    site.cluster!.flowers.forEach((flower) => {
      expect(flower.petalCount).toBe(5);
    });
  }
}

describe("Living Sakura living-flowering bridge", () => {
  it("returns null for seed, sprout, empty wood, or wood that cannot host sites", () => {
    expect(livingFloweringSiteBudget(0)).toBe(0);
    expect(livingFloweringSiteBudget(11)).toBe(0);
    expect(
      planLivingFloweringSpurs({
        rootSeed: "quiet-rain",
        segments: [],
        journalCount: 192,
      }),
    ).toBeNull();
    expect(planFor("quiet-rain", 0).plan).toBeNull();
    expect(planFor("quiet-rain", 1).plan).toBeNull();
    expect(planFor("quiet-rain", 11).plan).toBeNull();

    const mature = buildLifelongSakuraSegments("quiet-rain", 192);
    expect(
      planLivingFloweringSpurs({
        rootSeed: "quiet-rain",
        segments: mature,
        journalCount: 11,
      }),
    ).toBeNull();
    expect(
      planLivingFloweringSpurs({
        rootSeed: "quiet-rain",
        segments: mature.slice(0, 4),
        journalCount: 192,
      }),
    ).toBeNull();
  });

  it("chooses a 72–140 site budget that densifies with life chapter", () => {
    expect(livingFloweringSiteBudget(12)).toBe(72);
    expect(livingFloweringSiteBudget(47)).toBe(72);
    expect(livingFloweringSiteBudget(48)).toBe(88);
    expect(livingFloweringSiteBudget(95)).toBe(88);
    expect(livingFloweringSiteBudget(96)).toBe(104);
    expect(livingFloweringSiteBudget(191)).toBe(104);
    expect(livingFloweringSiteBudget(192)).toBe(118);
    expect(livingFloweringSiteBudget(400)).toBe(118);
    for (const n of [12, 48, 96, 192, 10_000]) {
      const budget = livingFloweringSiteBudget(n);
      expect(budget).toBeGreaterThanOrEqual(72);
      expect(budget).toBeLessThanOrEqual(140);
    }
  });

  it("returns a deterministic airy FloweringSpurPlan from journal 12+ when wood can host", () => {
    const matureWood = buildLifelongSakuraSegments("quiet-rain", 192);
    const atTwelve = planLivingFloweringSpurs({
      rootSeed: "quiet-rain",
      segments: matureWood,
      journalCount: 12,
    });
    expect(atTwelve).not.toBeNull();
    expect(atTwelve!.potentialSiteCount).toBe(72);
    expectValidLivingFloweringPlan(atTwelve!, matureWood);

    for (const journalCount of [48, 96, 192]) {
      const { segments, plan } = planFor("quiet-rain", journalCount);
      expect(plan, `quiet-rain @ ${journalCount}`).not.toBeNull();
      expect(plan!.potentialSiteCount).toBe(livingFloweringSiteBudget(journalCount));
      expectValidLivingFloweringPlan(plan!, segments);
      expect(
        planLivingFloweringSpurs({
          rootSeed: "quiet-rain",
          segments,
          journalCount,
        }),
      ).toEqual(plan);
    }
  });

  it("is non-null for quiet-rain at 12+ once lifelong wood can host sites", () => {
    const hosted: number[] = [];
    for (const journalCount of [12, 24, 36, 48, 96, 192]) {
      const { segments, plan } = planFor("quiet-rain", journalCount);
      if (!plan) continue;
      hosted.push(journalCount);
      expectValidLivingFloweringPlan(plan, segments);
    }
    expect(hosted[0], "first hosted chapter").toBeGreaterThanOrEqual(12);
    expect(hosted).toEqual(expect.arrayContaining([48, 96, 192]));
  });

  it("puts active umbels on the sweep and both leaders at maturity", () => {
    const { segments, plan } = planFor("quiet-rain", 192);
    expect(plan).not.toBeNull();
    const active = plan!.sites.filter((site) => site.active);
    const ids = new Set(active.map((site) => site.segmentId));
    expect(
      active.some((site) => site.segmentId === "life/sweep"),
      "sweep must carry bloom",
    ).toBe(true);
    expect(
      active.some((site) => site.segmentId === "young/leader/dominant"),
      "dominant leader must carry bloom",
    ).toBe(true);
    expect(
      active.some((site) => site.segmentId === "young/leader/subordinate"),
      "subordinate leader must carry bloom",
    ).toBe(true);
    expect(ids.size).toBeGreaterThan(8);
  });

  it("keeps a mature product canopy airy, memory-equal, and flowerless in structureOnly", () => {
    const model = createLivingSakuraModel({
      rootSeed: "quiet-rain",
      journalCount: 192,
      newestGrowthUnits: 4,
    });
    expect(model.memoryBlossomCount).toBe(192);
    expect(ambientFlowerCount(model)).toBeLessThan(280);

    const structure = createLivingSakuraModel({
      rootSeed: "quiet-rain",
      journalCount: 192,
      newestGrowthUnits: 4,
      structureOnly: true,
    });
    expect(structure.memoryBlossomCount).toBe(0);
    expect(floralInstanceCount(structure)).toBe(0);
    expect(structure.newestMemory).toBeNull();

    model.dispose();
    structure.dispose();
  });
});
