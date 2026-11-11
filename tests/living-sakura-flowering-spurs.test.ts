import { describe, expect, it } from "vitest";
import { planFloweringSpurs } from "../features/garden/living-sakura/floweringSpurs";
import { planProductionWood, type ProductionVec3 } from "../features/garden/living-sakura/productionWood";

function dot(left: ProductionVec3, right: ProductionVec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(value: ProductionVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

describe("Living Sakura flowering-spur foundation", () => {
  it("is deterministic and keeps a bounded production site budget", () => {
    const wood = planProductionWood({ rootSeed: "quiet-rain" });
    const first = planFloweringSpurs({ rootSeed: "quiet-rain", wood });
    expect(planFloweringSpurs({ rootSeed: "quiet-rain", wood })).toEqual(first);
    expect(first.potentialSiteCount).toBeGreaterThanOrEqual(72);
    expect(first.potentialSiteCount).toBeLessThanOrEqual(140);
    expect(first.sites).toHaveLength(first.potentialSiteCount);
    expect(new Set(first.sites.map((site) => site.id))).toHaveLength(first.sites.length);
  });

  it("activates only ~40–55 percent of potential flowering sites (airy canopy)", () => {
    for (const rootSeed of ["quiet-rain", "first-light", "late-spring"]) {
      const wood = planProductionWood({ rootSeed });
      const plan = planFloweringSpurs({ rootSeed, wood });
      expect(plan.activeSiteCount).toBe(plan.sites.filter((site) => site.active).length);
      expect(plan.activeRatio).toBeGreaterThanOrEqual(0.4);
      expect(plan.activeRatio).toBeLessThanOrEqual(0.58);
      expect(plan.sites.filter((site) => site.active && site.cluster === null)).toHaveLength(0);
      expect(plan.sites.filter((site) => !site.active && site.cluster !== null)).toHaveLength(0);
    }
  });

  it("balances active blossoms across left, right, lower, and upper crown neighborhoods", () => {
    for (const rootSeed of ["quiet-rain", "first-light", "late-spring", "balanced-crown"]) {
      const wood = planProductionWood({ rootSeed });
      const plan = planFloweringSpurs({ rootSeed, wood, potentialSiteCount: 120 });
      const centerX = (wood.crown.bounds.min[0] + wood.crown.bounds.max[0]) / 2;
      const centerY = (wood.crown.crownBaseHeight + wood.crown.bounds.max[1]) / 2;
      const active = plan.sites.filter((site) => site.active);
      const left = active.filter((site) => site.worldAnchor[0] < centerX);
      const right = active.filter((site) => site.worldAnchor[0] >= centerX);
      const lower = active.filter((site) => site.worldAnchor[1] < centerY);
      const upper = active.filter((site) => site.worldAnchor[1] >= centerY);

      // Real sakura is gently asymmetric (signature sweep + lean). Require every
      // half and quadrant to still carry umbels — not equal foam, not empty voids.
      expect(left.length, `${rootSeed}: left present`).toBeGreaterThan(active.length * 0.2);
      expect(right.length, `${rootSeed}: right present`).toBeGreaterThan(active.length * 0.2);
      expect(lower.length, `${rootSeed}: lower present`).toBeGreaterThan(active.length * 0.15);
      expect(upper.length, `${rootSeed}: upper present`).toBeGreaterThan(active.length * 0.15);

      for (const horizontal of ["left", "right"] as const) {
        for (const vertical of ["lower", "upper"] as const) {
          const quadrant = active.filter((site) =>
            horizontal === "left" ? site.worldAnchor[0] < centerX : site.worldAnchor[0] >= centerX,
          ).filter((site) =>
            vertical === "lower" ? site.worldAnchor[1] < centerY : site.worldAnchor[1] >= centerY,
          );
          expect(quadrant.length, `${rootSeed}: ${vertical}-${horizontal}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps crown-neighborhood allocation deterministic", () => {
    const wood = planProductionWood({ rootSeed: "deterministic-neighborhoods" });
    const first = planFloweringSpurs({
      rootSeed: "deterministic-neighborhoods",
      wood,
      potentialSiteCount: 100,
    });
    const second = planFloweringSpurs({
      rootSeed: "deterministic-neighborhoods",
      wood,
      potentialSiteCount: 100,
    });

    expect(second.sites.map(({ segmentId, attachmentT, worldAnchor, active }) => ({
      segmentId,
      attachmentT,
      worldAnchor,
      active,
    }))).toEqual(first.sites.map(({ segmentId, attachmentT, worldAnchor, active }) => ({
      segmentId,
      attachmentT,
      worldAnchor,
      active,
    })));
  });

  it("creates branch-oriented orthonormal frames on flowering-capable wood", () => {
    const wood = planProductionWood({ rootSeed: "branch-frames" });
    const plan = planFloweringSpurs({ rootSeed: "branch-frames", wood, potentialSiteCount: 100 });
    const byId = new Map(wood.segments.map((segment) => [segment.id, segment]));

    for (const site of plan.sites) {
      const host = byId.get(site.segmentId);
      expect(host).toBeDefined();
      expect(["leader", "primary", "secondary", "tertiary"]).toContain(host!.role);
      expect(length(site.frame.tangent)).toBeCloseTo(1, 6);
      expect(length(site.frame.normal)).toBeCloseTo(1, 6);
      expect(length(site.frame.binormal)).toBeCloseTo(1, 6);
      expect(dot(site.frame.tangent, site.frame.normal)).toBeCloseTo(0, 6);
      expect(dot(site.frame.tangent, site.frame.binormal)).toBeCloseTo(0, 6);
      expect(dot(site.frame.normal, site.frame.binormal)).toBeCloseTo(0, 6);
    }
  });

  it("builds rich Sakura clusters with flowers, buds, half-open, and pedicels", () => {
    const rootSeed = "cluster-morphology";
    const wood = planProductionWood({ rootSeed });
    const plan = planFloweringSpurs({ rootSeed, wood, potentialSiteCount: 100 });

    let sawHalfOpen = false;
    for (const site of plan.sites.filter((candidate) => candidate.active)) {
      const cluster = site.cluster!;
      expect(cluster.flowers.length).toBeGreaterThanOrEqual(2);
      expect(cluster.flowers.length).toBeLessThanOrEqual(4);
      expect(cluster.buds.length).toBeGreaterThanOrEqual(1);
      expect(cluster.buds.length).toBeLessThanOrEqual(2);
      expect(cluster.halfOpen.length).toBeGreaterThanOrEqual(0);
      expect(cluster.halfOpen.length).toBeLessThanOrEqual(1);
      expect(cluster.pedicels.length).toBe(1);
      if (cluster.halfOpen.length > 0) sawHalfOpen = true;
      cluster.flowers.forEach((flower) => {
        expect(flower.petalCount).toBe(5);
        expect(flower.cupDepth).toBeGreaterThan(0);
      });
      cluster.halfOpen.forEach((half) => {
        expect(half.opening).toBeGreaterThanOrEqual(0.4);
        expect(half.opening).toBeLessThanOrEqual(0.75);
        expect(half.scale).toBeGreaterThan(0);
      });
      const organIds = new Set([
        ...cluster.flowers.map((flower) => flower.id),
        ...cluster.buds.map((bud) => bud.id),
        ...cluster.halfOpen.map((half) => half.id),
      ]);
      cluster.pedicels.forEach((pedicel) => {
        expect(organIds.has(pedicel.organId)).toBe(true);
        expect(pedicel.localStart).toEqual([0, 0, 0]);
        expect(length(pedicel.localEnd)).toBeGreaterThan(0);
      });
    }
    expect(sawHalfOpen).toBe(true);
  });

  it("keeps active organs outside protected crown windows", () => {
    const rootSeed = "protected-bloom-windows";
    const wood = planProductionWood({ rootSeed });
    const plan = planFloweringSpurs({ rootSeed, wood });
    for (const site of plan.sites.filter((candidate) => candidate.active)) {
      for (const window of wood.protectedWindows) {
        const normalized =
          ((site.worldAnchor[0] - window.center[0]) / window.radii[0]) ** 2 +
          ((site.worldAnchor[1] - window.center[1]) / window.radii[1]) ** 2 +
          ((site.worldAnchor[2] - window.center[2]) / window.radii[2]) ** 2;
        expect(normalized, `${site.id} enters ${window.id}`).toBeGreaterThan(1);
      }
    }
  });

  it("validates seeds and production site-count overrides", () => {
    const wood = planProductionWood({ rootSeed: "validation" });
    expect(() => planFloweringSpurs({ rootSeed: " ", wood })).toThrow("rootSeed must not be empty");
    expect(() => planFloweringSpurs({ rootSeed: "validation", wood, potentialSiteCount: 71 })).toThrow(
      "potentialSiteCount must be an integer from 72 to 140",
    );
    expect(() => planFloweringSpurs({ rootSeed: "validation", wood, potentialSiteCount: 141 })).toThrow(
      "potentialSiteCount must be an integer from 72 to 140",
    );
  });
});
