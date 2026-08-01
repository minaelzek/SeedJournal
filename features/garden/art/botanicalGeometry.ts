import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { branchRadiusAt, sampleCubic } from "../topology";
import type {
  CubicBranch,
  FoliageNode,
  TransferableOrganBuffers,
  TransferableBranchBuffers,
  Vec3Tuple,
} from "../types";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_SIDE = new THREE.Vector3(1, 0, 0);
const WORLD_DEPTH = new THREE.Vector3(0, 0, 1);

export interface BarkLenticel {
  position: Vec3Tuple;
  quaternion: readonly [number, number, number, number];
  scale: readonly [number, number, number];
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function tangentAt(branch: CubicBranch, amount: number): THREE.Vector3 {
  const before = new THREE.Vector3().fromArray(
    sampleCubic(branch, Math.max(0, amount - 0.012)),
  );
  const after = new THREE.Vector3().fromArray(
    sampleCubic(branch, Math.min(1, amount + 0.012)),
  );
  return after.sub(before).normalize();
}

/**
 * Produces one contiguous GPU buffer for the entire branch system. Each curve
 * uses parallel-transported frames, extra collar rings, and an elliptical
 * cross-section so the bark reads as grown wood rather than plumbing.
 */
export function buildBotanicalBranchGeometry(
  branches: readonly CubicBranch[],
  radialSegments = 9,
  curveSegments = 12,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const branch of branches) {
    const priorNormal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const point = new THREE.Vector3();
    const ringStarts: number[] = [];
    const branchVariation = seededUnit(hashText(branch.id));

    for (let ring = 0; ring <= curveSegments; ring += 1) {
      const progress = ring / curveSegments;
      point.fromArray(sampleCubic(branch, progress));
      tangent.copy(tangentAt(branch, progress));

      if (ring === 0) {
        priorNormal
          .crossVectors(
            Math.abs(tangent.dot(WORLD_UP)) > 0.86 ? WORLD_SIDE : WORLD_UP,
            tangent,
          )
          .normalize();
      } else {
        priorNormal
          .addScaledVector(tangent, -priorNormal.dot(tangent))
          .normalize();
      }
      binormal.crossVectors(tangent, priorNormal).normalize();

      const collar =
        progress < 0.115
          ? 1 + Math.sin((1 - progress / 0.115) * Math.PI * 0.5) * 0.32
          : 1;
      const taper = branchRadiusAt(branch, progress) * collar;
      const irregularity = 0.94 + branchVariation * 0.09;
      ringStarts.push(vertexOffset);

      for (let side = 0; side < radialSegments; side += 1) {
        const theta = (side / radialSegments) * Math.PI * 2;
        const radial = new THREE.Vector3()
          .copy(priorNormal)
          .multiplyScalar(Math.cos(theta) * irregularity)
          .addScaledVector(binormal, Math.sin(theta) * (2 - irregularity))
          .normalize();
        const ribbing =
          1 +
          Math.sin(theta * 3 + branchVariation * 9 + progress * 7) *
            Math.min(0.045, taper * 0.08);
        const vertex = point.clone().addScaledVector(radial, taper * ribbing);
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(radial.x, radial.y, radial.z);

        const grain =
          0.86 +
          0.1 * Math.sin(progress * 31 + theta * 2 + branchVariation * 11);
        colors.push(grain * 1.03, grain * 0.9, grain * 0.95);
        vertexOffset += 1;
      }
    }

    for (let ring = 0; ring < curveSegments; ring += 1) {
      const current = ringStarts[ring];
      const next = ringStarts[ring + 1];
      for (let side = 0; side < radialSegments; side += 1) {
        const following = (side + 1) % radialSegments;
        indices.push(
          current + side,
          next + side,
          next + following,
          current + side,
          next + following,
          current + following,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function geometryFromBranchBuffers(
  buffers: TransferableBranchBuffers,
  visibleBranchIndices?: ReadonlySet<number>,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(buffers.positions, 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute(
    "growthBirthSequence",
    new THREE.BufferAttribute(
      Float32Array.from(buffers.birthSequence),
      1,
    ),
  );
  geometry.setAttribute(
    "growthAxisProgress",
    new THREE.BufferAttribute(buffers.axisProgress, 1),
  );
  geometry.setAttribute(
    "growthWindWeight",
    new THREE.BufferAttribute(buffers.windWeight, 1),
  );
  if (visibleBranchIndices) {
    const visibleIndexCount = [...visibleBranchIndices].reduce(
      (count, branchIndex) => count + buffers.ranges[branchIndex * 4 + 3],
      0,
    );
    const visibleIndices = new Uint32Array(visibleIndexCount);
    let writeOffset = 0;
    visibleBranchIndices.forEach((branchIndex) => {
      const sourceOffset = buffers.ranges[branchIndex * 4 + 2];
      const sourceCount = buffers.ranges[branchIndex * 4 + 3];
      visibleIndices.set(
        buffers.indices.subarray(sourceOffset, sourceOffset + sourceCount),
        writeOffset,
      );
      writeOffset += sourceCount;
    });
    geometry.setIndex(new THREE.BufferAttribute(visibleIndices, 1));
  } else {
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  }

  const color = new Float32Array(buffers.barkVariation.length * 3);
  for (let index = 0; index < buffers.barkVariation.length; index += 1) {
    const grain =
      0.86 +
      Math.sin(
        buffers.axisProgress[index] * 37 +
          buffers.barkVariation[index] * 13,
      ) *
        0.1;
    color[index * 3] = grain * 1.03;
    color[index * 3 + 1] = grain * 0.82;
    color[index * 3 + 2] = grain * 0.88;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const BUFFER_ORGAN_KIND: FoliageNode["kind"][] = [
  "seed",
  "radicle",
  "leaf",
  "bud",
  "blossom",
  "luminous-blossom",
];

export function foliageFromOrganBuffers(
  buffers: TransferableOrganBuffers,
): FoliageNode[] {
  return Array.from({ length: buffers.scales.length }, (_, index) => ({
    id: `render-organ-${index}`,
    parentBranchId: null,
    position: [
      buffers.positions[index * 3],
      buffers.positions[index * 3 + 1],
      buffers.positions[index * 3 + 2],
    ],
    rotation: [
      buffers.rotations[index * 3],
      buffers.rotations[index * 3 + 1],
      buffers.rotations[index * 3 + 2],
    ],
    scale: buffers.scales[index],
    kind: BUFFER_ORGAN_KIND[buffers.kinds[index]] ?? "leaf",
    entryId: null,
    memoryRenderId: buffers.memoryRenderIds[index],
    sequence: buffers.birthSequence[index],
    birthSequence: buffers.birthSequence[index],
    axisProgress: buffers.axisProgress[index],
    windWeight: buffers.windWeight[index],
  }));
}

export function buildPointedLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(-0.34, -0.28, -0.42, 0.12, -0.06, 0.56);
  shape.bezierCurveTo(-0.03, 0.6, 0.03, 0.6, 0.06, 0.56);
  shape.bezierCurveTo(0.42, 0.12, 0.34, -0.28, 0, -0.5);
  const geometry = new THREE.ShapeGeometry(shape, 10);
  geometry.rotateX(-0.12);

  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    position.setZ(index, (1 - Math.abs(y) / 0.6) * 0.052 - Math.abs(x) * 0.025);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildNotchedPetalGeometry(): THREE.BufferGeometry {
  // Classic sakura petal: soft heart notch at the tip, wider mid-body.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.bezierCurveTo(-0.34, 0.02, -0.46, 0.38, -0.22, 0.66);
  shape.bezierCurveTo(-0.12, 0.76, -0.045, 0.68, 0, 0.58);
  shape.bezierCurveTo(0.045, 0.68, 0.12, 0.76, 0.22, 0.66);
  shape.bezierCurveTo(0.46, 0.38, 0.34, 0.02, 0, -0.06);
  const geometry = new THREE.ShapeGeometry(shape, 14);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    const x = position.getX(index);
    // Gentle cup — reads as soft petal, not a flat chip.
    position.setZ(index, y * y * 0.16 - Math.abs(x) * 0.05 + 0.02);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSakuraBlossomGeometry(): THREE.BufferGeometry {
  const source = buildNotchedPetalGeometry();
  const petals = Array.from({ length: 5 }, (_, index) => {
    const angle = (index / 5) * Math.PI * 2;
    const petal = source.clone();
    petal.rotateZ(angle);
    petal.rotateX(0.28 + (index % 2) * 0.08);
    petal.rotateY((index - 2) * 0.04);
    petal.translate(
      Math.sin(angle) * 0.028,
      Math.cos(angle) * 0.028,
      (index % 3) * 0.01,
    );
    petal.scale(1.12, 1.12, 1.12);
    return petal;
  });
  const merged = mergeGeometries(petals, false);
  source.dispose();
  petals.forEach((petal) => petal.dispose());
  if (!merged) throw new Error("Unable to build sakura blossom geometry.");
  merged.computeVertexNormals();
  return merged;
}

export function buildStamenClusterGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.008, 0.36, 5);
  const anther = new THREE.SphereGeometry(0.025, 5, 4);
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const radius = index % 2 === 0 ? 0.16 : 0.11;
    const stemPiece = stem.clone();
    stemPiece.rotateX(Math.PI / 2);
    stemPiece.rotateZ(angle);
    stemPiece.translate(
      Math.cos(angle) * radius * 0.48,
      Math.sin(angle) * radius * 0.48,
      0.16,
    );
    const antherPiece = anther.clone();
    antherPiece.translate(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0.34,
    );
    pieces.push(stemPiece, antherPiece);
  }
  const merged = mergeGeometries(pieces, false);
  stem.dispose();
  anther.dispose();
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error("Unable to build stamen cluster geometry.");
  return merged;
}

export function buildBudGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0, -0.34),
    new THREE.Vector2(0.13, -0.22),
    new THREE.Vector2(0.19, 0.04),
    new THREE.Vector2(0.13, 0.27),
    new THREE.Vector2(0.035, 0.43),
    new THREE.Vector2(0, 0.47),
  ];
  return new THREE.LatheGeometry(profile, 9);
}

export function buildRadicleGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0.34, 0),
    new THREE.Vector3(-0.06, 0.12, 0),
    new THREE.Vector3(0.08, -0.18, 0.02),
    new THREE.Vector3(0.03, -0.48, 0),
  );
  return new THREE.TubeGeometry(curve, 10, 0.055, 6, false);
}

export function buildCherryStoneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 28, 20);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const vertical = THREE.MathUtils.clamp((y + 1) * 0.5, 0, 1);
    const endTaper = 0.72 + Math.sin(vertical * Math.PI) * 0.28;
    const asymmetric = 1 + y * 0.07 + Math.sin(y * 3.2) * 0.025;
    position.setXYZ(
      index,
      x * endTaper * asymmetric + y * 0.045,
      y * (0.97 + Math.max(0, y) * 0.08),
      z * endTaper * (0.92 + x * 0.035),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSeedCreaseGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-0.012, -0.62, 0.91),
    new THREE.Vector3(-0.055, -0.2, 1.01),
    new THREE.Vector3(0.05, 0.2, 1.01),
    new THREE.Vector3(0.008, 0.57, 0.91),
  );
  return new THREE.TubeGeometry(curve, 14, 0.018, 5, false);
}

export function collectBarkLenticels(
  branches: readonly CubicBranch[],
  maximum = 72,
): BarkLenticel[] {
  const result: BarkLenticel[] = [];
  const eligible = branches.filter(
    (branch) => Math.max(branch.radiusStart, branch.radiusEnd) > 0.075,
  );

  for (const branch of eligible) {
    const count = Math.max(1, Math.min(7, Math.round(branch.radiusStart * 19)));
    const hash = hashText(branch.id);
    for (let index = 0; index < count && result.length < maximum; index += 1) {
      const random = seededUnit(hash + index * 977);
      const progress = 0.12 + ((index + random) / count) * 0.77;
      const center = new THREE.Vector3().fromArray(sampleCubic(branch, progress));
      const tangent = tangentAt(branch, progress);
      const normal = new THREE.Vector3()
        .crossVectors(
          tangent,
          Math.abs(tangent.dot(WORLD_DEPTH)) > 0.86 ? WORLD_SIDE : WORLD_DEPTH,
        )
        .normalize();
      if (random > 0.5) normal.negate();
      const radius = branchRadiusAt(branch, progress);
      center.addScaledVector(normal, radius * 1.012);
      const matrix = new THREE.Matrix4().lookAt(
        new THREE.Vector3(),
        normal,
        tangent,
      );
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
      result.push({
        position: [center.x, center.y, center.z],
        quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        scale: [
          Math.max(0.022, radius * 0.62),
          Math.max(0.006, radius * 0.09),
          1,
        ],
      });
    }
  }
  return result;
}

export function organWindWeight(node: FoliageNode): number {
  if (Number.isFinite(node.windWeight)) {
    return THREE.MathUtils.clamp(node.windWeight, 0, 1);
  }
  const positionWeight = THREE.MathUtils.clamp((node.position[1] + 1.8) / 7, 0, 1);
  return 0.2 + positionWeight * 0.8;
}
