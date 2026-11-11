import { describe, expect, it } from "vitest";
import {
  planProductionPresentationFromLiving,
  planProductionWood,
  sampleProductionWoodSegment,
  type ProductionVec3,
  type ProductionWoodSegment,
} from "../features/garden/living-sakura/productionWood";
import {
  buildLivingSakuraTopology,
  resolveLivingSakuraIdentity,
} from "../features/garden/living-sakura/livingTopology";

function distance(left: ProductionVec3, right: ProductionVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function sampledLength(segment: ProductionWoodSegment): number {
  let total = 0;
  let previous = segment.start;
  for (let index = 1; index <= 32; index += 1) {
    const current = sampleProductionWoodSegment(segment, index / 32);
    total += distance(previous, current);
    previous = current;
  }
  return total;
}

describe("Living Sakura production wood foundation", () => {
  it("is deterministic while retaining seed-controlled asymmetry", () => {
    const first = planProductionWood({ rootSeed: "quiet-rain" });
    expect(planProductionWood({ rootSeed: "quiet-rain" })).toEqual(first);
    expect(planProductionWood({ rootSeed: "late-spring" })).not.toEqual(first);
    expect(new Set(first.segments.map((segment) => segment.id))).toHaveLength(first.segments.length);
  });

  it("defines a continuous trunk-to-root-flare ring profile", () => {
    const plan = planProductionWood({ rootSeed: "continuous-flare" });
    const { rings, firstForkHeightRatio, treeHeight } = plan.trunkProfile;

    expect(rings.length).toBeGreaterThanOrEqual(8);
    expect(rings[0].heightRatio).toBe(0);
    expect(rings.at(-1)?.heightRatio).toBe(firstForkHeightRatio);
    expect(firstForkHeightRatio).toBeGreaterThanOrEqual(0.32);
    expect(firstForkHeightRatio).toBeLessThanOrEqual(0.4);
    for (let index = 1; index < rings.length; index += 1) {
      expect(rings[index].heightRatio).toBeGreaterThan(rings[index - 1].heightRatio);
      expect(rings[index].center[1]).toBeCloseTo(rings[index].heightRatio * treeHeight, 5);
      expect(distance(rings[index - 1].center, rings[index].center)).toBeLessThan(treeHeight * 0.9);
      expect(rings[index].radiusX).toBeLessThan(rings[index - 1].radiusX);
      expect(rings[index].radiusZ).toBeLessThan(rings[index - 1].radiusZ);
    }
    expect(rings[0].radiusX / rings[4].radiusX).toBeGreaterThan(1.8);
    expect(rings[0].radiusX / rings[4].radiusX).toBeLessThan(2.3);
  });

  it("meets the mature hierarchy and crown proportion contracts", () => {
    for (const rootSeed of ["quiet-rain", "first-light", "late-spring", "winter-sun"]) {
      const plan = planProductionWood({ rootSeed });
      expect(plan.counts).toMatchObject({ trunk: 1, leaders: 2 });
      // Open vase: 6–8 primaries, lighter secondary/tertiary scaffolding.
      expect(plan.counts.primaries).toBeGreaterThanOrEqual(6);
      expect(plan.counts.primaries).toBeLessThanOrEqual(8);
      expect(plan.counts.secondaries).toBeGreaterThanOrEqual(16);
      expect(plan.counts.secondaries).toBeLessThanOrEqual(24);
      expect(plan.counts.tertiaries).toBeGreaterThanOrEqual(55);
      expect(plan.counts.tertiaries).toBeLessThanOrEqual(85);
      // Airy silhouette: modest W/H, not a filled dome.
      expect(plan.crown.crownWidthToHeight).toBeGreaterThanOrEqual(1.05);
      expect(plan.crown.crownWidthToHeight).toBeLessThanOrEqual(1.22);
      expect(plan.crown.crownDepthToWidth).toBeGreaterThanOrEqual(0.42);
      expect(plan.crown.crownDepthToWidth).toBeLessThanOrEqual(0.65);
      expect(plan.crown.crownCentroidOffsetRatio).toBeGreaterThanOrEqual(0.04);
      expect(plan.crown.crownCentroidOffsetRatio).toBeLessThanOrEqual(0.08);
      // Mass / void ratios measured from wood + windows (not seed-hash fakes).
      expect(plan.crown.leftRightMassDifference).toBeGreaterThanOrEqual(0.1);
      expect(plan.crown.leftRightMassDifference).toBeLessThanOrEqual(0.2);
      expect(plan.crown.negativeSpaceRatio).toBeGreaterThanOrEqual(0.25);
      expect(plan.crown.negativeSpaceRatio).toBeLessThanOrEqual(0.35);
      expect(plan.crown.visibleWoodRatio).toBeGreaterThanOrEqual(0.35);
      expect(plan.crown.visibleWoodRatio).toBeLessThanOrEqual(0.45);
    }
  });

  it("keeps every child exactly attached to a parent curve with parent-first ordering", () => {
    const plan = planProductionWood({ rootSeed: "parent-continuity" });
    const byId = new Map(plan.segments.map((segment) => [segment.id, segment]));
    const order = new Map(plan.segments.map((segment, index) => [segment.id, index]));

    for (const segment of plan.segments) {
      expect(segment.radiusStart).toBeGreaterThan(segment.radiusEnd);
      expect(segment.radiusEnd).toBeGreaterThan(0);
      if (!segment.parentId) continue;
      const parent = byId.get(segment.parentId);
      expect(parent, segment.id).toBeDefined();
      expect(distance(segment.start, sampleProductionWoodSegment(parent!, segment.attachmentT))).toBeLessThan(1e-9);
      expect(order.get(parent!.id)).toBeLessThan(order.get(segment.id)!);
    }
  });

  it("uses unequal, staggered, non-mirrored leaders and one low signature bough", () => {
    const plan = planProductionWood({ rootSeed: "no-mirror" });
    const leaders = plan.segments.filter((segment) => segment.role === "leader");
    const lengths = leaders.map(sampledLength).sort((left, right) => right - left);
    const departures = leaders.map((leader) => [
      leader.controlA[0] - leader.start[0],
      leader.controlA[1] - leader.start[1],
      leader.controlA[2] - leader.start[2],
    ] as ProductionVec3);
    const sweep = plan.segments.find((segment) => segment.signature === "low-sweeping-bough");

    expect(leaders).toHaveLength(2);
    expect(leaders[0].attachmentT).not.toBe(leaders[1].attachmentT);
    expect(lengths[0] / lengths[1]).toBeGreaterThan(1.08);
    expect(Math.abs(departures[0][0] + departures[1][0])).toBeGreaterThan(0.02);
    expect(Math.abs(departures[0][2] + departures[1][2])).toBeGreaterThan(0.02);
    expect(sweep).toBeDefined();
    expect(sweep!.end[1] / plan.crown.height).toBeGreaterThanOrEqual(0.3);
    expect(sweep!.end[1] / plan.crown.height).toBeLessThanOrEqual(0.42);
  });

  it("ends a botanical share of fine terminals with gravity droop", () => {
    const plan = planProductionWood({ rootSeed: "droop-study" });
    const terminals = plan.segments.filter(
      (segment) => segment.role === "secondary" || segment.role === "tertiary",
    );
    const descending = terminals.filter(
      (segment) => segment.end[1] < segment.controlB[1] - 0.02,
    );
    const ratio = descending.length / terminals.length;
    // Design band: 10–18% of terminal gestures descend under gravity.
    expect(ratio).toBeGreaterThanOrEqual(0.08);
    expect(ratio).toBeLessThanOrEqual(0.28);
  });

  it("distributes fine wood across every primary and most of the crown", () => {
    for (const rootSeed of [
      "seed-journal-living-sakura-v2",
      "quiet-rain",
      "first-light",
      "late-spring",
      "winter-sun",
    ]) {
      const plan = planProductionWood({ rootSeed });
      const primaries = plan.segments.filter((segment) => segment.role === "primary");
      const secondaries = plan.segments.filter((segment) => segment.role === "secondary");
      const parentCounts = new Map<string, number>();
      for (const segment of secondaries) {
        parentCounts.set(segment.parentId!, (parentCounts.get(segment.parentId!) ?? 0) + 1);
      }
      const horizontalSpan =
        Math.max(...secondaries.map((segment) => segment.end[0])) -
        Math.min(...secondaries.map((segment) => segment.end[0]));

      expect(parentCounts.size).toBe(primaries.length);
      expect(Math.max(...parentCounts.values()) / secondaries.length).toBeLessThanOrEqual(0.3);
      expect(horizontalSpan / plan.crown.width).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("preserves three measurable crown windows", () => {
    const plan = planProductionWood({ rootSeed: "open-crown" });
    expect(plan.protectedWindows).toHaveLength(3);
    for (const window of plan.protectedWindows) {
      expect(Math.min(...window.radii)).toBeGreaterThan(0.2);
      for (const segment of plan.segments) {
        for (let index = 0; index <= 24; index += 1) {
          const point = sampleProductionWoodSegment(segment, index / 24);
          const normalized =
            ((point[0] - window.center[0]) / window.radii[0]) ** 2 +
            ((point[1] - window.center[1]) / window.radii[1]) ** 2 +
            ((point[2] - window.center[2]) / window.radii[2]) ** 2;
          expect(normalized, `${segment.id} enters ${window.id}`).toBeGreaterThan(1);
        }
      }
    }
  });

  it("rejects an empty identity seed", () => {
    expect(() => planProductionWood({ rootSeed: " " })).toThrow("rootSeed must not be empty");
  });

  it("shares lean/sweep structural identity with living densification", () => {
    for (const rootSeed of ["quiet-rain", "first-light", "late-spring", "winter-sun"]) {
      const identity = resolveLivingSakuraIdentity(rootSeed);
      const plan = planProductionWood({ rootSeed });
      expect(plan.dominantSide).toBe(identity.dominantSide);
      expect(plan.counts.primaries).toBe(identity.primaryCount);
      const sweep = plan.segments.find(
        (segment) => segment.signature === "low-sweeping-bough",
      );
      expect(sweep).toBeDefined();
      // Low sweep counterweights the dominant leader (classic sakura imbalance).
      expect(Math.sign(sweep!.end[0] - plan.segments[0].end[0])).toBe(
        -identity.dominantSide,
      );
    }
  });

  it("layers mature presentation onto living topology without replacing segment ids", () => {
    const topology = buildLivingSakuraTopology({
      rootSeed: "continuity-living",
      cumulativeEventCount: 10_000,
    });
    const presentation = planProductionPresentationFromLiving({
      rootSeed: "continuity-living",
      topology,
    });
    expect(presentation.dominantSide).toBe(topology.phenotype.dominantSide);
    expect(presentation.segments.map((segment) => segment.id)).toEqual(
      topology.segments.map((segment) => segment.id),
    );
    expect(presentation.segments.map((segment) => segment.parentId)).toEqual(
      topology.segments.map((segment) => segment.parentId),
    );
    const livingSweep = topology.segments.find(
      (segment) => segment.signature === "low-sweeping-bough",
    );
    const presentedSweep = presentation.segments.find(
      (segment) => segment.signature === "low-sweeping-bough",
    );
    expect(presentedSweep?.id).toBe(livingSweep?.id);
    expect(presentedSweep?.end).toEqual(livingSweep?.end);
    // Continuous trunk follows the living trunk path (same start/end language).
    const trunk = topology.segments.find((segment) => segment.role === "trunk")!;
    expect(presentation.trunkProfile.rings[0].center[1]).toBeCloseTo(trunk.start[1], 5);
    expect(
      presentation.trunkProfile.rings.at(-1)!.center[1],
    ).toBeCloseTo(trunk.end[1], 5);
    expect(presentation.protectedWindows.length).toBeGreaterThanOrEqual(3);
  });
});
