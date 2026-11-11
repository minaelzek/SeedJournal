import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import {
  LIFELONG_TRUNK_ID,
  buildLifelongSakuraSegments,
} from "../features/garden/living-sakura/lifelongSakura";

function idsAt(journalCount: number, seed = "lifelong-identity") {
  return new Set(
    buildLifelongSakuraSegments(seed, journalCount).map((segment) => segment.id),
  );
}

describe("lifelong append-only sakura graph", () => {
  it("keeps the sprout stem as the bole from journal 1 through 400", () => {
    for (const n of [1, 8, 12, 48, 96, 192, 400]) {
      const segments = buildLifelongSakuraSegments("same-tree", n);
      expect(segments[0]?.id).toBe(LIFELONG_TRUNK_ID);
      expect(segments[0]?.role).toBe("trunk");
    }
  });

  it("only appends children as journals accumulate", () => {
    const checkpoints = [1, 8, 12, 48, 96, 192, 400];
    const sets = checkpoints.map((n) => idsAt(n));
    for (let index = 1; index < sets.length; index += 1) {
      for (const id of sets[index - 1]) {
        expect(
          sets[index].has(id),
          `lost ${id} between ${checkpoints[index - 1]} and ${checkpoints[index]}`,
        ).toBe(true);
      }
      expect(sets[index].size).toBeGreaterThan(sets[index - 1].size);
    }
  });

  it("does not remesh the live model at sapling or first maturity", () => {
    const sprout = createLivingSakuraModel({
      rootSeed: "same-tree",
      journalCount: 8,
      newestGrowthUnits: 2,
    });
    const sapling = createLivingSakuraModel({
      rootSeed: "same-tree",
      journalCount: 12,
      newestGrowthUnits: 2,
    });
    const mature = createLivingSakuraModel({
      rootSeed: "same-tree",
      journalCount: 192,
      newestGrowthUnits: 2,
    });
    expect(sprout.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    expect(sapling.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    expect(mature.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    expect(mature.root.getObjectByName("Wood life/sweep")).toBeTruthy();
    const sproutIds = new Set(sprout.pivots.map((pivot) => pivot.segmentId));
    const saplingIds = new Set(sapling.pivots.map((pivot) => pivot.segmentId));
    const matureIds = new Set(mature.pivots.map((pivot) => pivot.segmentId));
    for (const id of sproutIds) {
      expect(saplingIds.has(id), `lost sprout wood ${id} at 12`).toBe(true);
      expect(matureIds.has(id), `lost sprout wood ${id} at 192`).toBe(true);
    }
    sprout.dispose();
    sapling.dispose();
    mature.dispose();
  });

  it("opens a rounded mature crown instead of a vertical candelabra", () => {
    const mature = buildLifelongSakuraSegments("same-tree", 192);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;
    for (const segment of mature) {
      for (const point of [segment.start, segment.end] as const) {
        minX = Math.min(minX, point[0]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
    const width = maxX - minX;
    const trunk = mature.find((segment) => segment.id === "youth/stem");
    const forkY = Math.max(
      mature.find((segment) => segment.id === "young/leader/dominant")?.start[1] ??
        0,
      mature.find((segment) => segment.id === "young/leader/subordinate")
        ?.start[1] ?? 0,
    );
    expect(width).toBeGreaterThan(2.6);
    expect(width / maxY).toBeGreaterThan(1.1);
    expect(forkY / maxY).toBeLessThan(0.58);
    expect(trunk?.end[1] ?? 0).toBeLessThan(maxY * 0.62);
    expect(mature.some((segment) => segment.id === "life/shoulder/1")).toBe(
      true,
    );
    expect(mature.some((segment) => segment.id.startsWith("life/plate/"))).toBe(
      true,
    );
  });

  it("keeps 192 journal petals spaced so they can be seen and tapped", () => {
    const model = createLivingSakuraModel({
      rootSeed: "hanami-cloud",
      journalCount: 192,
      newestGrowthUnits: 4,
    });
    let ambient = 0;
    model.root.traverse((child) => {
      if (child.name === "Ambient sakura flowers" && "count" in child) {
        ambient += Number(child.count);
      }
    });
    expect(model.memoryBlossomCount).toBe(192);
    expect(model.memoryInstances).toHaveLength(192);
    expect(ambient).toBeLessThan(280);
    const positions = model.memoryInstances.map((memory) =>
      model.getMemoryWorldPosition(memory.entryId, new THREE.Vector3()),
    );
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < positions.length; i += 1) {
      const left = positions[i];
      if (!left) continue;
      for (let j = i + 1; j < positions.length; j += 1) {
        const right = positions[j];
        if (!right) continue;
        minDistance = Math.min(minDistance, left.distanceTo(right));
      }
    }
    expect(minDistance).toBeGreaterThan(0.08);
    model.dispose();
  });

  it("opens the young fork at 48 and the sweeping bough at 96", () => {
    const young = idsAt(48);
    const established = idsAt(96);
    expect(young.has("young/leader/dominant")).toBe(true);
    expect(young.has("life/sweep")).toBe(false);
    expect(established.has("life/sweep")).toBe(true);
    expect(
      buildLifelongSakuraSegments("same-tree", 96).some(
        (segment) => segment.signature === "low-sweeping-bough",
      ),
    ).toBe(true);
  });
});
