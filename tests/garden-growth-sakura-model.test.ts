import { describe, expect, it } from "vitest";
import type { TreeGrowthEvent } from "../lib/contracts";
import {
  createGrowthSakuraModel,
  GROWTH_SAKURA_BLUEPRINT,
  growthSakuraAttachmentAudit,
  growthSakuraBranchContracts,
  growthSakuraCountsAt,
} from "../features/garden/img2threejs/growthSakuraModel";

describe("growth-constrained img2threejs Sakura", () => {
  it("uses a finite parent-first branch graph", () => {
    const contracts = growthSakuraBranchContracts();
    const byId = new Map(contracts.map((branch) => [branch.id, branch]));

    expect(contracts).toHaveLength(GROWTH_SAKURA_BLUEPRINT.branchCount);
    expect(GROWTH_SAKURA_BLUEPRINT.rootCount).toBe(6);
    expect(GROWTH_SAKURA_BLUEPRINT.scaffoldCount).toBeGreaterThanOrEqual(9);
    expect(GROWTH_SAKURA_BLUEPRINT.secondaryCount).toBeGreaterThanOrEqual(36);
    expect(GROWTH_SAKURA_BLUEPRINT.twigCount).toBeGreaterThanOrEqual(72);

    contracts.forEach((branch) => {
      expect(branch.startUnit).toBeGreaterThanOrEqual(1);
      expect(branch.endUnit).toBeLessThanOrEqual(192);
      expect(branch.endUnit).toBeGreaterThanOrEqual(branch.startUnit);
      if (!branch.parentId) return;
      const parent = byId.get(branch.parentId);
      expect(parent, branch.id).toBeDefined();
      expect(parent?.startUnit).toBeLessThanOrEqual(branch.startUnit);
    });
  });

  it("keeps every non-root child branch in contact with its parent", () => {
    const attachments = growthSakuraAttachmentAudit();
    expect(attachments.length).toBeGreaterThan(150);
    attachments.forEach((attachment) => {
      expect(attachment.gap, attachment.childId).toBeLessThan(0.001);
    });
  });

  it("grows monotonically through every product stage", () => {
    const checkpoints = [0, 1, 12, 48, 96, 192].map(growthSakuraCountsAt);
    for (let index = 1; index < checkpoints.length; index += 1) {
      expect(checkpoints[index].branches).toBeGreaterThanOrEqual(
        checkpoints[index - 1].branches,
      );
      expect(checkpoints[index].blossoms).toBeGreaterThanOrEqual(
        checkpoints[index - 1].blossoms,
      );
      expect(checkpoints[index].leaves).toBeGreaterThanOrEqual(
        checkpoints[index - 1].leaves,
      );
    }
    expect(checkpoints.at(-1)?.branches).toBe(
      GROWTH_SAKURA_BLUEPRINT.branchCount,
    );
    expect(checkpoints.at(-1)?.blossoms).toBe(
      GROWTH_SAKURA_BLUEPRINT.blossomSlotCount,
    );
  });

  it("hard-caps structural and organ growth after maturity", () => {
    const mature = growthSakuraCountsAt(192);
    expect(growthSakuraCountsAt(384)).toEqual(mature);
    expect(growthSakuraCountsAt(1_000)).toEqual(mature);
  });

  it("renders the seed separately from the mature tree", () => {
    const seed = createGrowthSakuraModel({ totalGrowthUnits: 0 });
    const mature = createGrowthSakuraModel({ totalGrowthUnits: 192 });

    expect(seed.getObjectByName("Cherry stone")).toBeDefined();
    expect(seed.getObjectByName("Sakura wood")).toBeUndefined();
    expect(mature.getObjectByName("Cherry stone")).toBeUndefined();
    expect(mature.getObjectByName("Sakura wood")).toBeDefined();
    expect(mature.userData.growthContract.maximumStructuralUnits).toBe(192);
    expect(mature.userData.sculptRuntime.maximumBranchCount).toBe(
      GROWTH_SAKURA_BLUEPRINT.branchCount,
    );
  });

  it("keeps the mature model to a small fixed draw-call surface", () => {
    const mature = createGrowthSakuraModel({ totalGrowthUnits: 192 });
    const meshes: string[] = [];
    mature.traverse((object) => {
      if (object.type === "Mesh") meshes.push(object.name);
    });

    expect(meshes).toContain("Sakura wood");
    expect(meshes).toContain("Surface roots");
    expect(meshes.length).toBeLessThanOrEqual(8);
  });

  it("bounds visible memory bindings after structural maturity", () => {
    const events: TreeGrowthEvent[] = Array.from({ length: 80 }, (_, index) => ({
      id: `event-${index}`,
      sequence: index + 1,
      entryId: `entry-${index}`,
      occurredAt: index + 1,
      localDate: "2026-08-04",
      kind: "memory_luminous_blossom",
      growthUnits: 6,
      seed: index,
    }));
    const model = createGrowthSakuraModel({ events });
    const positions = model.userData.sculptRuntime.memoryPositions as Record<
      string,
      readonly [number, number, number]
    >;

    expect(Object.keys(positions)).toHaveLength(
      GROWTH_SAKURA_BLUEPRINT.maximumInteractiveMemories,
    );
    expect(positions["entry-0"]).toBeUndefined();
    expect(positions["entry-79"]).toBeDefined();
    const visiblePositions = Object.values(positions);
    const xs = visiblePositions.map((position) => position[0]);
    const ys = visiblePositions.map((position) => position[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(3);
    expect(model.userData.growthContract.cappedStructuralUnits).toBe(192);
  });

  it("binds a memory to one blossom without repeating private identifiers", () => {
    const event: TreeGrowthEvent = {
      id: "memory-event",
      sequence: 1,
      entryId: "private-entry",
      occurredAt: 1,
      localDate: "2026-08-04",
      kind: "memory_luminous_blossom",
      growthUnits: 6,
      seed: 42,
    };
    const model = createGrowthSakuraModel({
      totalGrowthUnits: 192,
      events: [event],
    });
    const petals = model.getObjectByName("Sakura petals");
    const identifiers = (petals?.userData.instanceEntryIds ?? []) as Array<
      string | null
    >;

    expect(identifiers.filter(Boolean)).toEqual(["private-entry"]);
  });
});
