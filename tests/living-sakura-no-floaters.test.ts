import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import { distanceToLivingWood } from "../features/garden/living-sakura/livingTopology";

function maxAllowedDistance(journalCount: number): number {
  if (journalCount < 12) return 0.055;
  if (journalCount < 48) return 0.065;
  if (journalCount < 96) return 0.075;
  return 0.085;
}

function collectBlossomCenters(model: ReturnType<typeof createLivingSakuraModel>) {
  model.root.updateWorldMatrix(true, true);
  const centers: Array<{ name: string; point: THREE.Vector3 }> = [];
  const world = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  for (const memory of model.memoryInstances) {
    const point = model.getMemoryWorldPosition(memory.entryId, new THREE.Vector3());
    if (point) centers.push({ name: `memory:${memory.entryId}`, point: point.clone() });
  }

  model.root.traverse((child) => {
    const name = child.name;
    if (/fallen/i.test(name)) return;
    if (child instanceof THREE.InstancedMesh) {
      if (
        !/flower|blossom|umbel|surround|petal|bud|half/i.test(name)
      ) {
        return;
      }
      child.updateWorldMatrix(true, false);
      for (let index = 0; index < child.count; index += 1) {
        child.getMatrixAt(index, matrix);
        world.setFromMatrixPosition(matrix);
        world.applyMatrix4(child.matrixWorld);
        centers.push({ name: `${name}#${index}`, point: world.clone() });
      }
      return;
    }
    if (/Newest surrounding/i.test(name)) {
      child.getWorldPosition(world);
      centers.push({ name, point: world.clone() });
      return;
    }
    if (
      child instanceof THREE.Mesh &&
      /surround|blossom|flower|petal/i.test(name)
    ) {
      child.getWorldPosition(world);
      centers.push({ name, point: world.clone() });
    }
  });

  if (model.newestMemory) {
    model.newestMemory.getWorldPosition(world);
    centers.push({ name: "newest-memory", point: world.clone() });
  }

  return centers;
}

describe("no floating petals in any life chapter", () => {
  it.each([1, 3, 6, 12, 24, 48, 96, 192] as const)(
    "keeps every blossom on wood at %i journals",
    (journalCount) => {
      const model = createLivingSakuraModel({
        rootSeed: "no-float-screenshot",
        journalCount,
        newestGrowthUnits: 6,
      });
      model.updateMemoryTransforms(0.72);
      const centers = collectBlossomCenters(model);
      expect(centers.length).toBeGreaterThan(0);

      const allowed = maxAllowedDistance(journalCount);
      const floaters: string[] = [];
      for (const blossom of centers) {
        const distance = distanceToLivingWood(
          [blossom.point.x, blossom.point.y, blossom.point.z],
          model.woodSegments,
        );
        if (distance > allowed) {
          floaters.push(`${blossom.name} d=${distance.toFixed(3)}`);
        }
      }

      expect(floaters, floaters.join("; ")).toEqual([]);
      model.dispose();
    },
    15_000,
  );
});
