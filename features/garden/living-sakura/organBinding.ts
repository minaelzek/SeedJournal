/**
 * Pure branch-local organ binding for Living Sakura.
 *
 * Organ transforms are authored once in a botanical segment's local space.
 * World space is introduced only when the owning pivot's current world matrix
 * is composed with that local matrix for the bounded render projection.
 */

export type Matrix4Elements = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type Matrix4Input =
  | ArrayLike<number>
  | { readonly elements: ArrayLike<number> };

export interface SegmentLocalMatrix {
  readonly space: "segment-local";
  readonly elements: Matrix4Elements;
}

export interface PivotWorldMatrix {
  readonly space: "world";
  readonly pivotId: string;
  readonly elements: Matrix4Elements;
}

export interface BranchLocalOrganBinding {
  readonly organId: string;
  readonly botanicalAddress: string;
  readonly segmentId: string;
  readonly pivotId: string;
  readonly attachmentT: number;
  readonly projectionOrdinal: number;
  readonly localMatrix: SegmentLocalMatrix;
}

export interface ComposedOrganInstance {
  readonly organId: string;
  readonly botanicalAddress: string;
  readonly segmentId: string;
  readonly pivotId: string;
  readonly matrixOffset: number;
}

export interface BoundedOrganInstanceMatrices {
  /** Column-major matrices, directly consumable by Three.js Matrix4.fromArray. */
  readonly matrices: Float32Array;
  readonly instances: readonly ComposedOrganInstance[];
  readonly omittedOrganIds: readonly string[];
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return value;
}

function nonEmpty(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new TypeError(`${label} must not be empty.`);
  return result;
}

function matrixSource(input: Matrix4Input): ArrayLike<number> {
  return "elements" in input ? input.elements : input;
}

function copyMatrix(input: Matrix4Input, label: string): Matrix4Elements {
  const source = matrixSource(input);
  if (source.length !== 16) {
    throw new RangeError(`${label} must contain exactly 16 elements.`);
  }
  const values = Array.from({ length: 16 }, (_, index) =>
    finite(source[index], `${label}[${index}]`),
  ) as unknown as Matrix4Elements;
  return Object.freeze(values);
}

/** Copies an arbitrary matrix into the explicitly tagged segment-local space. */
export function segmentLocalMatrix(input: Matrix4Input): SegmentLocalMatrix {
  return Object.freeze({
    space: "segment-local" as const,
    elements: copyMatrix(input, "localMatrix"),
  });
}

/** Copies a current pivot transform into the explicitly tagged world space. */
export function pivotWorldMatrix(
  pivotId: string,
  input: Matrix4Input,
): PivotWorldMatrix {
  return Object.freeze({
    space: "world" as const,
    pivotId: nonEmpty(pivotId, "pivotId"),
    elements: copyMatrix(input, "worldMatrix"),
  });
}

/**
 * Creates an immutable organ binding. No world position is accepted here;
 * callers must provide a matrix relative to the named botanical segment.
 */
export function bindOrganToSegment(input: {
  organId: string;
  botanicalAddress: string;
  segmentId: string;
  pivotId: string;
  attachmentT: number;
  projectionOrdinal: number;
  localMatrix: SegmentLocalMatrix;
}): BranchLocalOrganBinding {
  const attachmentT = finite(input.attachmentT, "attachmentT");
  if (attachmentT < 0 || attachmentT > 1) {
    throw new RangeError("attachmentT must be between 0 and 1.");
  }
  const projectionOrdinal = finite(
    input.projectionOrdinal,
    "projectionOrdinal",
  );
  if (!Number.isInteger(projectionOrdinal) || projectionOrdinal < 0) {
    throw new RangeError("projectionOrdinal must be a non-negative integer.");
  }
  if (input.localMatrix.space !== "segment-local") {
    throw new TypeError("localMatrix must be in segment-local space.");
  }

  return Object.freeze({
    organId: nonEmpty(input.organId, "organId"),
    botanicalAddress: nonEmpty(input.botanicalAddress, "botanicalAddress"),
    segmentId: nonEmpty(input.segmentId, "segmentId"),
    pivotId: nonEmpty(input.pivotId, "pivotId"),
    attachmentT,
    projectionOrdinal,
    localMatrix: segmentLocalMatrix(input.localMatrix.elements),
  });
}

/** Column-major multiplication matching Three.js: result = parentWorld * local. */
function multiplyMatrix4(
  parentWorld: Matrix4Elements,
  local: Matrix4Elements,
): Matrix4Elements {
  const output = new Array<number>(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += parentWorld[index * 4 + row] * local[column * 4 + index];
      }
      output[column * 4 + row] = value;
    }
  }
  return Object.freeze(output) as unknown as Matrix4Elements;
}

function stableBindingOrder(
  left: BranchLocalOrganBinding,
  right: BranchLocalOrganBinding,
): number {
  return (
    left.projectionOrdinal - right.projectionOrdinal ||
    left.organId.localeCompare(right.organId)
  );
}

/**
 * Composes a deterministic bounded instance projection after parent motion.
 * Bindings and parent matrices are never mutated. Missing or mismatched pivots
 * throw instead of silently falling back to root/world coordinates.
 */
export function composeBoundedOrganInstanceMatrices(input: {
  bindings: readonly BranchLocalOrganBinding[];
  parentWorldMatrices: ReadonlyMap<string, PivotWorldMatrix>;
  maxInstances: number;
}): BoundedOrganInstanceMatrices {
  const maxInstances = finite(input.maxInstances, "maxInstances");
  if (!Number.isInteger(maxInstances) || maxInstances < 0) {
    throw new RangeError("maxInstances must be a non-negative integer.");
  }

  const ordered = [...input.bindings].sort(stableBindingOrder);
  const projected = ordered.slice(0, maxInstances);
  const matrices = new Float32Array(projected.length * 16);
  const instances = projected.map((binding, index) => {
    const parent = input.parentWorldMatrices.get(binding.pivotId);
    if (!parent) {
      throw new Error(
        `Missing world matrix for organ ${binding.organId} pivot ${binding.pivotId}.`,
      );
    }
    if (parent.space !== "world" || parent.pivotId !== binding.pivotId) {
      throw new Error(
        `World matrix pivot mismatch for organ ${binding.organId}.`,
      );
    }
    matrices.set(
      multiplyMatrix4(parent.elements, binding.localMatrix.elements),
      index * 16,
    );
    return Object.freeze({
      organId: binding.organId,
      botanicalAddress: binding.botanicalAddress,
      segmentId: binding.segmentId,
      pivotId: binding.pivotId,
      matrixOffset: index * 16,
    });
  });

  return Object.freeze({
    matrices,
    instances: Object.freeze(instances),
    omittedOrganIds: Object.freeze(
      ordered.slice(maxInstances).map((binding) => binding.organId),
    ),
  });
}
