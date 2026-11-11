import { describe, expect, it } from "vitest";
import {
  buildLivingSakuraTopology,
  livingSakuraRadiusAt,
  sampleLivingSakuraSegment,
  type LivingSakuraSegment,
  type LivingVec3,
} from "../features/garden/living-sakura/livingTopology";

function distance(left: LivingVec3, right: LivingVec3): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function segmentLength(segment: LivingSakuraSegment): number {
  let result = 0;
  let previous = segment.start;
  for (let index = 1; index <= 24; index += 1) {
    const current = sampleLivingSakuraSegment(segment, index / 24);
    result += distance(previous, current);
    previous = current;
  }
  return result;
}

describe("living Sakura botanical topology", () => {
  it("is deterministic and keeps stable botanical addresses", () => {
    const first = buildLivingSakuraTopology({
      rootSeed: "quiet-rain",
      cumulativeEventCount: 10_000,
    });
    const second = buildLivingSakuraTopology({
      rootSeed: "quiet-rain",
      cumulativeEventCount: 10_000,
    });

    expect(second).toEqual(first);
    expect(new Set(first.segments.map((segment) => segment.id)).size).toBe(
      first.segments.length,
    );
    expect(new Set(first.segments.map((segment) => segment.address.path)).size).toBe(
      first.segments.length,
    );
    first.segments.forEach((segment, index) => {
      expect(segment.address.ordinal).toBe(index + 1);
    });
  });

  it("varies root-seed phenotype without leaving the Sakura art bounds", () => {
    const trees = ["quiet-rain", "first-light", "late-spring"].map((rootSeed) =>
      buildLivingSakuraTopology({ rootSeed, cumulativeEventCount: 10_000 }),
    );

    trees.forEach((tree) => {
      // Lean ~3–6° as horizontal offset at the fork (~3.3 m).
      expect(Math.abs(tree.phenotype.lean)).toBeGreaterThanOrEqual(0.18);
      expect(Math.abs(tree.phenotype.lean)).toBeLessThanOrEqual(0.4);
      expect(tree.phenotype.primaryCount).toBeGreaterThanOrEqual(6);
      expect(tree.phenotype.primaryCount).toBeLessThanOrEqual(8);
      expect(tree.phenotype.secondaryCount).toBeGreaterThanOrEqual(21);
      expect(tree.phenotype.secondaryCount).toBeLessThanOrEqual(26);
      expect(tree.phenotype.tertiaryCount).toBeGreaterThanOrEqual(82);
      expect(tree.phenotype.tertiaryCount).toBeLessThanOrEqual(101);
      expect(tree.segments.filter((segment) => segment.role === "trunk")).toHaveLength(1);
      expect(tree.segments.filter((segment) => segment.role === "leader")).toHaveLength(2);
    });

    expect(new Set(trees.map((tree) => JSON.stringify(tree.phenotype))).size).toBeGreaterThan(1);
    expect(new Set(trees.map((tree) => JSON.stringify(tree.segments[0].end))).size).toBeGreaterThan(1);
  });

  it("uses exact parent-local attachments and continuous pipe taper", () => {
    const tree = buildLivingSakuraTopology({
      rootSeed: "attachment-study",
      cumulativeEventCount: 10_000,
    });
    const byId = new Map(tree.segments.map((segment) => [segment.id, segment]));

    tree.segments.forEach((segment) => {
      expect(segment.radiusStart).toBeGreaterThan(segment.radiusEnd);
      expect(segment.radiusEnd).toBeGreaterThan(0);
      if (!segment.parentId) return;
      const parent = byId.get(segment.parentId);
      expect(parent, segment.id).toBeDefined();
      expect(distance(segment.start, sampleLivingSakuraSegment(parent!, segment.attachmentT))).toBeLessThan(1e-10);
      expect(segment.radiusStart).toBeLessThan(
        livingSakuraRadiusAt(parent!, segment.attachmentT),
      );
      expect(parent!.address.ordinal).toBeLessThan(segment.address.ordinal);
    });
  });

  it("has two unequal leaders and a signature asymmetric low sweep", () => {
    const tree = buildLivingSakuraTopology({
      rootSeed: "asymmetric-sakura",
      cumulativeEventCount: 10_000,
    });
    const leaders = tree.segments.filter((segment) => segment.role === "leader");
    const lengths = leaders.map(segmentLength).sort((left, right) => right - left);
    const sweep = tree.segments.find(
      (segment) => segment.signature === "low-sweeping-bough",
    );
    const trunk = tree.segments.find((segment) => segment.role === "trunk")!;
    const xs = tree.segments.map((segment) => segment.end[0]);
    const leftReach = trunk.end[0] - Math.min(...xs);
    const rightReach = Math.max(...xs) - trunk.end[0];

    expect(leaders).toHaveLength(2);
    expect(lengths[0] / lengths[1]).toBeGreaterThan(1.08);
    expect(sweep).toBeDefined();
    expect(sweep!.end[1]).toBeLessThan(2.5);
    expect(Math.abs(sweep!.end[0])).toBeGreaterThan(3.4);
    expect(Math.abs(sweep!.end[0])).toBeLessThan(4.4);
    expect(Math.abs(leftReach - rightReach)).toBeGreaterThan(0.35);
  });

  it("occupies three depth layers while preserving at least three crown windows", () => {
    const tree = buildLivingSakuraTopology({
      rootSeed: "open-crown",
      cumulativeEventCount: 10_000,
    });

    expect(new Set(tree.segments.map((segment) => segment.depthLayer))).toEqual(
      new Set([0, 1, 2]),
    );
    expect(tree.protectedWindows.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tree.protectedWindows.map((window) => window.id)).size).toBe(
      tree.protectedWindows.length,
    );

    tree.protectedWindows.forEach((window) => {
      tree.segments.forEach((segment) => {
        for (let index = 0; index <= 20; index += 1) {
          const point = sampleLivingSakuraSegment(segment, index / 20);
          const normalized =
            ((point[0] - window.center[0]) / window.radii[0]) ** 2 +
            ((point[1] - window.center[1]) / window.radii[1]) ** 2 +
            ((point[2] - window.center[2]) / window.radii[2]) ** 2;
          expect(normalized, `${segment.id} enters ${window.id}`).toBeGreaterThan(1);
        }
      });
    });
  });

  it("keeps an unbounded event ledger behind a bounded prefix-stable projection", () => {
    const eventCounts = [1, 193, 1_000, 10_000] as const;
    const projections = eventCounts.map((cumulativeEventCount) =>
      buildLivingSakuraTopology({
        rootSeed: "prefix-stable-tree",
        cumulativeEventCount,
      }),
    );
    const [one, mature, thousand, tenThousand] = projections;

    expect(one.segments).toHaveLength(1);
    expect(one.segments[0].role).toBe("trunk");
    // 193 is a life-chapter sample — may be a prefix of full capacity when tip plates densify.
    expect(mature.segments).toHaveLength(
      Math.min(193, mature.explicitCapacity),
    );
    expect(thousand.segments).toHaveLength(thousand.explicitCapacity);
    expect(tenThousand.segments).toEqual(thousand.segments);
    // Explicit botanical budget is denser (layered crown fill) but still bounded.
    expect(tenThousand.segments.length).toBeGreaterThanOrEqual(75);
    // Tip plates + denser secondary/tertiary still stay presentation-bounded.
    expect(tenThousand.segments.length).toBeLessThanOrEqual(400);
    expect(tenThousand.care.compactedEvents).toBe(
      10_000 - tenThousand.explicitCapacity,
    );
    expect(tenThousand.care.cumulativeCare).toBeGreaterThan(
      thousand.care.cumulativeCare,
    );

    for (let index = 1; index < projections.length; index += 1) {
      expect(projections[index].segments.slice(0, projections[index - 1].segments.length)).toEqual(
        projections[index - 1].segments,
      );
      expect(projections[index].protectedWindows).toEqual(
        projections[0].protectedWindows,
      );
    }
  });

  it("densifies one topology language across the mature chapter (no silhouette rewrite)", () => {
    const rootSeed = "one-language";
    const established = buildLivingSakuraTopology({
      rootSeed,
      cumulativeEventCount: 191,
    });
    const mature = buildLivingSakuraTopology({
      rootSeed,
      cumulativeEventCount: 192,
    });
    const enduring = buildLivingSakuraTopology({
      rootSeed,
      cumulativeEventCount: 1_000,
    });

    // Append-stable densification: mature is a prefix-compatible growth of established.
    expect(mature.segments.slice(0, established.segments.length)).toEqual(
      established.segments,
    );
    expect(enduring.segments.slice(0, mature.segments.length)).toEqual(mature.segments);
    // Structural signature never flips at the mature chapter boundary.
    expect(mature.phenotype.dominantSide).toBe(established.phenotype.dominantSide);
    expect(enduring.phenotype.dominantSide).toBe(established.phenotype.dominantSide);
    const establishedSweep = established.segments.find(
      (segment) => segment.signature === "low-sweeping-bough",
    );
    const matureSweep = mature.segments.find(
      (segment) => segment.signature === "low-sweeping-bough",
    );
    if (establishedSweep && matureSweep) {
      expect(matureSweep.id).toBe(establishedSweep.id);
      expect(matureSweep.end).toEqual(establishedSweep.end);
      expect(Math.sign(matureSweep.end[0])).toBe(-mature.phenotype.dominantSide);
    }
  });
});
