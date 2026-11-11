import { describe, expect, it } from "vitest";
import {
  measureAuthoredCrown,
  planAuthoredCrown,
  sampleAuthoredCrownSegment,
  tangentAuthoredCrownSegment,
  type AuthoredCrownSegment,
  type AuthoredCrownVec3,
} from "../features/garden/living-sakura/authoredCrown";

function distance(left: AuthoredCrownVec3, right: AuthoredCrownVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function dot(left: AuthoredCrownVec3, right: AuthoredCrownVec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function roleCount(segments: readonly AuthoredCrownSegment[], role: AuthoredCrownSegment["role"]): number {
  return segments.filter((segment) => segment.role === role).length;
}

describe("authored-procedural mature Sakura crown", () => {
  it("is stable for one identity while allowing restrained seed asymmetry", () => {
    const first = planAuthoredCrown({ rootSeed: "seed-journal-mature" });
    expect(planAuthoredCrown({ rootSeed: "seed-journal-mature" })).toEqual(first);
    expect(planAuthoredCrown({ rootSeed: "another-journal" })).not.toEqual(first);
    expect(new Set(first.segments.map((segment) => segment.id))).toHaveLength(first.segments.length);
    expect(new Set(first.neighborhoods.map((neighborhood) => neighborhood.id))).toHaveLength(7);
  });

  it("provides a continuous grounded trunk and five asymmetric buttress roots", () => {
    const plan = planAuthoredCrown({ rootSeed: "rooted-companion" });
    const { rings, rootSpread, treeHeight, firstForkHeightRatio } = plan.trunkProfile;

    expect(rings).toHaveLength(10);
    expect(rings[0].heightRatio).toBe(0);
    expect(rings.at(-1)?.heightRatio).toBe(firstForkHeightRatio);
    expect(rootSpread / treeHeight).toBeGreaterThanOrEqual(0.34);
    expect(rootSpread / treeHeight).toBeLessThanOrEqual(0.38);
    for (let index = 1; index < rings.length; index += 1) {
      expect(rings[index].heightRatio).toBeGreaterThan(rings[index - 1].heightRatio);
      expect(rings[index].radiusX).toBeLessThan(rings[index - 1].radiusX);
      expect(rings[index].radiusZ).toBeLessThan(rings[index - 1].radiusZ);
    }
    const roots = plan.segments.filter((segment) => segment.role === "root");
    expect(roots).toHaveLength(5);
    expect(new Set(roots.map((root) => Math.sign(root.end[0]))).size).toBe(2);
    expect(new Set(roots.map((root) => Math.sign(root.end[2]))).size).toBe(2);
    expect(Math.max(...roots.map((root) => Math.hypot(root.end[0], root.end[2])))).toBeGreaterThan(treeHeight * 0.3);
  });

  it("uses the locked authored hierarchy rather than random branch counts", () => {
    for (const rootSeed of ["quiet-rain", "first-light", "late-spring", "winter-sun"]) {
      const plan = planAuthoredCrown({ rootSeed });
      expect(plan.counts).toEqual({
        trunk: 1,
        roots: 5,
        leaders: 2,
        primaries: 7,
        secondaries: 28,
        tertiaries: 84,
      });
      expect(roleCount(plan.segments, "trunk")).toBe(1);
      expect(roleCount(plan.segments, "root")).toBe(5);
      expect(roleCount(plan.segments, "leader")).toBe(2);
      expect(roleCount(plan.segments, "primary")).toBe(7);
      expect(roleCount(plan.segments, "secondary")).toBe(28);
      expect(roleCount(plan.segments, "tertiary")).toBe(84);
      expect(plan.neighborhoods).toHaveLength(7);
      for (const neighborhood of plan.neighborhoods) {
        expect(plan.segments.some((segment) => segment.id === neighborhood.primarySegmentId)).toBe(true);
        expect(plan.segments.filter((segment) =>
          segment.role === "secondary" && segment.neighborhoodId === neighborhood.id)).toHaveLength(4);
        expect(plan.segments.filter((segment) =>
          segment.role === "tertiary" && segment.neighborhoodId === neighborhood.id)).toHaveLength(12);
      }
    }
  });

  it("attaches every child exactly to its parent curve with tangent-continuous departure", () => {
    const plan = planAuthoredCrown({ rootSeed: "continuous-growth" });
    const byId = new Map(plan.segments.map((segment) => [segment.id, segment]));
    const order = new Map(plan.segments.map((segment, index) => [segment.id, index]));

    for (const segment of plan.segments) {
      if (!segment.parentId) continue;
      const parent = byId.get(segment.parentId);
      expect(parent, segment.id).toBeDefined();
      expect(distance(segment.start, sampleAuthoredCrownSegment(parent!, segment.attachmentT)), segment.id).toBeLessThan(1e-6);
      expect(order.get(parent!.id)).toBeLessThan(order.get(segment.id)!);
      if (segment.role !== "root") {
        const parentTangent = tangentAuthoredCrownSegment(parent!, segment.attachmentT);
        const childTangent = tangentAuthoredCrownSegment(segment, 0);
        expect(dot(parentTangent, childTangent), segment.id).toBeGreaterThan(0.999);
      }
    }
  });

  it("uses unequal leaders and seven non-coplanar primary bough neighborhoods", () => {
    const plan = planAuthoredCrown({ rootSeed: "sculpted-not-antlers" });
    const leaders = plan.segments.filter((segment) => segment.role === "leader");
    const primaries = plan.segments.filter((segment) => segment.role === "primary");
    const leaderHeights = leaders.map((leader) => leader.end[1]).sort((left, right) => right - left);

    expect(leaders).toHaveLength(2);
    expect(leaderHeights[0] - leaderHeights[1]).toBeGreaterThan(0.65);
    expect(leaders[0].attachmentT).not.toBe(leaders[1].attachmentT);
    expect(primaries).toHaveLength(7);
    expect(new Set(primaries.map((segment) => segment.depthLayer)).size).toBe(2);
    expect(Math.max(...primaries.map((segment) => segment.end[2]))).toBeGreaterThan(0.9);
    expect(Math.min(...primaries.map((segment) => segment.end[2]))).toBeLessThan(-0.9);
    expect(primaries.filter((segment) => segment.signature === "low-sweeping-bough")).toHaveLength(1);
  });

  it("fills a volumetric crown with broad fine-wood occupancy and at least seven octants", () => {
    for (const rootSeed of ["seed-journal-mature", "quiet-rain", "first-light", "late-spring"]) {
      const plan = planAuthoredCrown({ rootSeed });
      const measured = measureAuthoredCrown(plan.segments);
      expect(measured).toEqual(plan.measurements);
      expect(measured.width / plan.trunkProfile.treeHeight).toBeGreaterThan(0.92);
      expect(measured.depth / measured.width).toBeGreaterThan(0.42);
      expect(measured.depth / measured.width).toBeLessThan(0.78);
      expect(measured.fineWoodWidthRatio).toBeGreaterThan(0.78);
      expect(measured.fineWoodHeightRatio).toBeGreaterThan(0.68);
      expect(measured.fineWoodDepthRatio).toBeGreaterThan(0.8);
      expect(measured.occupiedOctants.length).toBeGreaterThanOrEqual(7);
    }
  });

  it("maintains botanical taper and child-to-parent radius discipline", () => {
    const plan = planAuthoredCrown({ rootSeed: "tender-taper" });
    const byId = new Map(plan.segments.map((segment) => [segment.id, segment]));
    const ratioRange = {
      root: [0.4, 0.64],
      leader: [0.48, 0.66],
      primary: [0.44, 0.55],
      secondary: [0.32, 0.42],
      tertiary: [0.26, 0.34],
    } as const;

    for (const segment of plan.segments) {
      expect(segment.radiusStart, segment.id).toBeGreaterThan(segment.radiusEnd);
      expect(segment.radiusEnd, segment.id).toBeGreaterThan(0);
      if (!segment.parentId) continue;
      const parent = byId.get(segment.parentId)!;
      const parentRadius = parent.radiusStart +
        (parent.radiusEnd - parent.radiusStart) * segment.attachmentT;
      const ratio = segment.radiusStart / parentRadius;
      const [minimum, maximum] = ratioRange[segment.role as keyof typeof ratioRange];
      expect(ratio, segment.id).toBeGreaterThanOrEqual(minimum);
      expect(ratio, segment.id).toBeLessThanOrEqual(maximum);
    }
  });

  it("preserves three measurable breathing windows inside the mature crown", () => {
    const plan = planAuthoredCrown({ rootSeed: "room-to-breathe" });
    expect(plan.protectedWindows).toHaveLength(3);
    for (const window of plan.protectedWindows) {
      expect(Math.min(...window.radii)).toBeGreaterThan(0.24);
      for (const segment of plan.segments.filter((candidate) =>
        candidate.role !== "trunk" && candidate.role !== "root")) {
        for (let index = 0; index <= 30; index += 1) {
          const point = sampleAuthoredCrownSegment(segment, index / 30);
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
    expect(() => planAuthoredCrown({ rootSeed: "  " })).toThrow("rootSeed must not be empty");
  });
});
