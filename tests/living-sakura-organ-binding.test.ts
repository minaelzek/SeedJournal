import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  bindOrganToSegment,
  composeBoundedOrganInstanceMatrices,
  pivotWorldMatrix,
  segmentLocalMatrix,
} from "../features/garden/living-sakura/organBinding";

function translation(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

function binding(
  organId: string,
  projectionOrdinal: number,
  pivotId = "pivot/primary-01",
) {
  return bindOrganToSegment({
    organId,
    botanicalAddress: `trunk/primary-01/${organId}`,
    segmentId: "segment/primary-01",
    pivotId,
    attachmentT: 0.72,
    projectionOrdinal,
    localMatrix: segmentLocalMatrix(translation(0.25, 0.5, -0.1)),
  });
}

function matrixAt(values: Float32Array, index: number): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(values, index * 16);
}

describe("Living Sakura branch-local organ binding", () => {
  it("copies and preserves a stable segment-local organ matrix", () => {
    const source = translation(0.25, 0.5, -0.1);
    const local = segmentLocalMatrix(source);
    const organ = bindOrganToSegment({
      organId: "memory-01",
      botanicalAddress: "trunk/leader-01/memory-01",
      segmentId: "leader-01",
      pivotId: "pivot-leader-01",
      attachmentT: 0.68,
      projectionOrdinal: 4,
      localMatrix: local,
    });

    source.makeTranslation(99, 99, 99);

    expect(organ.localMatrix.elements[12]).toBe(0.25);
    expect(organ.localMatrix.elements[13]).toBe(0.5);
    expect(organ.localMatrix.elements[14]).toBe(-0.1);
    expect(organ.segmentId).toBe("leader-01");
    expect(organ.pivotId).toBe("pivot-leader-01");
  });

  it("composes parent world motion with local organ transforms", () => {
    const organ = binding("blossom-01", 0);
    const firstParent = pivotWorldMatrix(
      organ.pivotId,
      translation(2, 3, 4),
    );
    const movedParent = pivotWorldMatrix(
      organ.pivotId,
      new THREE.Matrix4()
        .makeRotationZ(Math.PI / 2)
        .setPosition(2, 3, 4),
    );

    const first = composeBoundedOrganInstanceMatrices({
      bindings: [organ],
      parentWorldMatrices: new Map([[organ.pivotId, firstParent]]),
      maxInstances: 1,
    });
    const moved = composeBoundedOrganInstanceMatrices({
      bindings: [organ],
      parentWorldMatrices: new Map([[organ.pivotId, movedParent]]),
      maxInstances: 1,
    });

    const firstPosition = new THREE.Vector3().setFromMatrixPosition(
      matrixAt(first.matrices, 0),
    );
    const movedPosition = new THREE.Vector3().setFromMatrixPosition(
      matrixAt(moved.matrices, 0),
    );
    expect(firstPosition.x).toBeCloseTo(2.25);
    expect(firstPosition.y).toBeCloseTo(3.5);
    expect(firstPosition.z).toBeCloseTo(3.9);
    expect(movedPosition.x).toBeCloseTo(1.5);
    expect(movedPosition.y).toBeCloseTo(3.25);
    expect(movedPosition.z).toBeCloseTo(3.9);
    expect(organ.localMatrix.elements.slice(12, 15)).toEqual([0.25, 0.5, -0.1]);
  });

  it("projects a deterministic bounded prefix into a contiguous matrix buffer", () => {
    const organs = [binding("late", 9), binding("first", 1), binding("second", 2)];
    const parent = pivotWorldMatrix(
      "pivot/primary-01",
      new THREE.Matrix4(),
    );

    const result = composeBoundedOrganInstanceMatrices({
      bindings: organs,
      parentWorldMatrices: new Map([[parent.pivotId, parent]]),
      maxInstances: 2,
    });

    expect(result.matrices).toHaveLength(32);
    expect(result.instances.map((instance) => instance.organId)).toEqual([
      "first",
      "second",
    ]);
    expect(result.instances.map((instance) => instance.matrixOffset)).toEqual([
      0,
      16,
    ]);
    expect(result.omittedOrganIds).toEqual(["late"]);
    expect(organs.map((organ) => organ.organId)).toEqual(["late", "first", "second"]);
  });

  it("rejects missing or mismatched parent pivots instead of mixing spaces", () => {
    const organ = binding("blossom-01", 0);

    expect(() =>
      composeBoundedOrganInstanceMatrices({
        bindings: [organ],
        parentWorldMatrices: new Map(),
        maxInstances: 1,
      }),
    ).toThrow(/Missing world matrix/);

    const mismatched = pivotWorldMatrix("another-pivot", new THREE.Matrix4());
    expect(() =>
      composeBoundedOrganInstanceMatrices({
        bindings: [organ],
        parentWorldMatrices: new Map([[organ.pivotId, mismatched]]),
        maxInstances: 1,
      }),
    ).toThrow(/pivot mismatch/);
  });
});
