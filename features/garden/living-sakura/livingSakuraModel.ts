import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  createLivingDevelopmentLedger,
  projectActiveMemoryMarkers,
  type LivingMemoryInput,
} from "../../growth/livingDevelopment";
import {
  livingSakuraRadiusAt,
  sampleLivingSakuraSegment,
  tangentLivingSakuraSegment,
  type LivingSakuraSegment,
  type LivingVec3,
} from "./livingTopology";
import { type ContinuousTrunkProfile } from "./productionWood";
import { isYouthChapter } from "./youthChapter";
import {
  buildLifelongSakuraSegments,
  createLifelongProtectedWindows,
} from "./lifelongSakura";
import { planLivingFloweringSpurs } from "./livingFlowering";

export interface LivingSakuraModelOptions {
  rootSeed: string;
  journalCount: number;
  memories?: readonly LivingMemoryInput[];
  selectedEntryIds?: readonly string[];
  newestGrowthUnits?: 1 | 2 | 4 | 6;
  revealProgress?: number;
  /**
   * Founder still-pack: wood-only silhouette review.
   * Suppresses ambient organs, canopy underlay, and memory petals so branch
   * structure can be judged without floral density.
   */
  structureOnly?: boolean;
}

export interface LivingSakuraPivot {
  segmentId: string;
  group: THREE.Group;
  order: LivingSakuraSegment["order"];
  depthLayer: LivingSakuraSegment["depthLayer"];
  phase: number;
  side: number;
}

export interface LivingMemoryInstance {
  entryId: string;
  ordinal: number;
  botanicalAddress: string;
  instanceIndex: number;
  segmentId: string;
}

export interface LivingCeremonyOrganTarget {
  readonly organId: string;
  readonly group: THREE.Object3D;
  readonly fullScale: number;
}

export interface LivingSakuraModel {
  root: THREE.Group;
  pivots: LivingSakuraPivot[];
  newestMemory: THREE.Group | null;
  /** Parent-first segment path from trunk to the newest memory host. */
  ceremonyPathSegmentIds: readonly string[];
  /** Organ ids for the equal-duration growth ceremony (newest petal first). */
  ceremonyOrganIds: readonly string[];
  ceremonyOrgans: readonly LivingCeremonyOrganTarget[];
  /** Newest structural wood segment scaled during wood-extension phase. */
  ceremonyWoodSegmentId: string | null;
  journalCount: number;
  visibleBranchCount: number;
  memoryBlossomCount: number;
  historicalMemoryCount: number;
  activeMemoryEntryIds: readonly string[];
  memoryAddressByEntryId: Readonly<Record<string, string>>;
  memoryInstances: readonly LivingMemoryInstance[];
  memoryHitTargets: THREE.InstancedMesh;
  /**
   * Cherished cherry stone. Present only when there are no journals —
   * never empty root ribs standing in for a seed.
   */
  seedKernel: THREE.Group | null;
  hasSeedKernel: boolean;
  updateMemoryTransforms: (hitDiameterWorld: number) => void;
  /**
   * Applies a sampled growth ceremony: parent-path emphasis, wood grow-in,
   * and staggered organ scales. Safe to call every frame.
   */
  applyCeremonySample: (sample: {
    parentPath: readonly { segmentId: string; progress: number; emphasis: number }[];
    woodProgress: number;
    organs: readonly {
      organId: string;
      progress: number;
      localSettleOffset: number;
    }[];
  }) => void;
  getMemoryWorldPosition: (
    entryId: string,
    target: THREE.Vector3,
  ) => THREE.Vector3 | null;
  /** Moves the selection ring. Does not rebuild the tree. */
  setSelectedMemory: (entryId: string | null) => void;
  /** World-space centers of journal blossoms, refreshed every frame. */
  petalPoints: readonly { entryId: string; position: THREE.Vector3 }[];
  /** Visible wood used to prove blossoms sit on bark. */
  woodSegments: readonly LivingSakuraSegment[];
  careCycle: number;
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomFor(seed: string): () => number {
  let state = hashText(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function toVector(value: LivingVec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

/**
 * Presentation-only radius scale. Lifelong graph radii stay untouched
 * (same segment ids). Trunk and leader are fattened so mature wood reads
 * as a Japanese cherry bole — thick at the soil, softly tapering — not a
 * bundle of equal pipes. Other roles keep graph radius; mesh pinch thins
 * terminals.
 *
 * Multipliers on livingSakuraRadiusAt:
 *   trunk  1.64 at soil → 1.30 at crown
 *   leader 1.34 at join → 1.14 at tip
 *   else   1.00
 */
function presentationRadiusScale(
  segment: Pick<LivingSakuraSegment, "role">,
  amount: number,
): number {
  const t = clamp(amount, 0, 1);
  if (segment.role === "trunk") {
    const ease = t * t * (3 - 2 * t);
    return 1.64 - ease * 0.34;
  }
  if (segment.role === "leader") {
    return 1.34 - t * 0.2;
  }
  return 1;
}

function presentationRadiusAt(
  segment: LivingSakuraSegment,
  amount: number,
): number {
  return (
    livingSakuraRadiusAt(segment, amount) *
    presentationRadiusScale(segment, amount)
  );
}

function barkVertexColor(
  segmentId: string,
  amountAlong: number,
  sideIndex: number,
): [number, number, number] {
  // Cool taupe / ash / grey-umber — Prunus bark, not chocolate plastic.
  const coolTaupe: [number, number, number] = [0.78, 0.71, 0.63];
  const ashBrown: [number, number, number] = [0.5, 0.44, 0.38];
  const greyUmber: [number, number, number] = [0.3, 0.26, 0.23];
  const seed = hashText(`${segmentId}:bark`);
  // Horizontal lenticel dashes — localized arcs, never full-ring zebra.
  const lenticelWave = Math.sin(
    amountAlong * Math.PI * 18.4 +
      (seed % 1000) * 0.01 +
      sideIndex * 0.42,
  );
  const lenticelGate =
    0.5 +
    0.5 *
      Math.sin(
        amountAlong * Math.PI * 3.4 +
          sideIndex * 1.45 +
          (seed % 53) * 0.09,
      );
  const lenticel = clamp(lenticelWave * 0.58 + lenticelGate * 0.42, 0, 1);
  // Soft longitudinal shade — restrained, so the silhouette stays round.
  const ridge =
    0.5 +
    0.5 * Math.sin(sideIndex * 0.95 + (seed % 97) * 0.07 + amountAlong * 1.6);
  const plane =
    0.5 +
    0.5 *
      Math.sin(
        amountAlong * Math.PI * 0.85 + (seed % 41) * 0.11 + sideIndex * 0.04,
      );
  const sideJitter =
    ((hashText(`${segmentId}:tone:${sideIndex}`) % 100) / 100 - 0.5) * 0.12;
  const mix = clamp(
    lenticel * 0.3 + ridge * 0.3 + plane * 0.32 + sideJitter,
    0,
    1,
  );
  const warm = amountAlong < 0.12 ? 0.08 : amountAlong > 0.88 ? 0.045 : 0.02;
  let r: number;
  let g: number;
  let b: number;
  if (mix < 0.5) {
    const t = mix * 2;
    r = coolTaupe[0] + (ashBrown[0] - coolTaupe[0]) * t;
    g = coolTaupe[1] + (ashBrown[1] - coolTaupe[1]) * t;
    b = coolTaupe[2] + (ashBrown[2] - coolTaupe[2]) * t;
  } else {
    const t = (mix - 0.5) * 2;
    r = ashBrown[0] + (greyUmber[0] - ashBrown[0]) * t;
    g = ashBrown[1] + (greyUmber[1] - ashBrown[1]) * t;
    b = ashBrown[2] + (greyUmber[2] - ashBrown[2]) * t;
  }
  const fleck =
    lenticel > 0.78 && lenticelGate > 0.62
      ? 0.16
      : lenticel > 0.68
        ? 0.07
        : 0;
  // Furrows between lenticels so close bark is not one chocolate tone.
  const furrow = lenticel < 0.32 ? 0.07 : lenticel < 0.45 ? 0.03 : 0;
  const joint = amountAlong < 0.07 ? 0.05 : 0;
  r = clamp(r + warm * 0.07 + fleck - furrow - joint, 0, 1);
  g = clamp(g + warm * 0.035 + fleck * 0.62 - furrow * 0.85 - joint, 0, 1);
  b = clamp(b + warm * 0.014 + fleck * 0.34 - furrow * 0.7 - joint * 0.6, 0, 1);
  return [r, g, b];
}

function createContinuousTrunkGeometry(
  profile: ContinuousTrunkProfile,
): THREE.BufferGeometry {
  // Extra radial sides so the bole silhouette stays round, not a hex pipe.
  const radialSegments = 24;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const ringCount = profile.rings.length;
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const ring = profile.rings[ringIndex];
    const amountAlong =
      ringCount <= 1 ? 0 : ringIndex / (ringCount - 1);
    for (let side = 0; side < radialSegments; side += 1) {
      const angle =
        (side / radialSegments) * Math.PI * 2 + ring.rotationRadians;
      // Soft bark undulation — restrained so the bole stays round, not fluted.
      const ridge =
        1 +
        0.04 * Math.sin(angle * 2.4 + ringIndex * 0.85) +
        0.026 * Math.sin(angle * 4.2 - ringIndex * 0.55 + side * 0.2) +
        0.034 * Math.sin(angle * 9.6 + ringIndex * 1.35);
      // Slight vertical squash on the silhouette plane for organic oval section.
      const ovalX = ring.radiusX * ridge;
      const ovalZ = ring.radiusZ * ridge * 0.84;
      vertices.push(
        ring.center[0] + Math.cos(angle) * ovalX,
        ring.center[1],
        ring.center[2] + Math.sin(angle) * ovalZ,
      );
      const [r, g, b] = barkVertexColor("wood/trunk", amountAlong, side);
      colors.push(r, g, b);
    }
  }
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    const current = ring * radialSegments;
    const next = (ring + 1) * radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const nextSide = (side + 1) % radialSegments;
      indices.push(
        current + side,
        next + side,
        current + nextSide,
        current + nextSide,
        next + side,
        next + nextSide,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // Soft averaged normals — continuous bark, not hard facets.
  geometry.computeVertexNormals();
  // Bias normals toward multi-lobe ridges so trunk stills read sculpture.
  const posAttr = geometry.getAttribute("position");
  const nrmAttr = geometry.getAttribute("normal");
  if (posAttr && nrmAttr) {
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const ring = profile.rings[ringIndex];
      for (let side = 0; side < radialSegments; side += 1) {
        const i = ringIndex * radialSegments + side;
        const ox = posAttr.getX(i) - ring.center[0];
        const oy = posAttr.getY(i) - ring.center[1];
        const oz = posAttr.getZ(i) - ring.center[2];
        const olen = Math.hypot(ox, oy, oz) || 1;
        const rx = ox / olen;
        const ry = oy / olen;
        const rz = oz / olen;
        const nx = nrmAttr.getX(i) * 0.74 + rx * 0.26;
        const ny = nrmAttr.getY(i) * 0.74 + ry * 0.26;
        const nz = nrmAttr.getZ(i) * 0.74 + rz * 0.26;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        nrmAttr.setXYZ(i, nx / nlen, ny / nlen, nz / nlen);
      }
    }
    nrmAttr.needsUpdate = true;
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function createRootButtressGeometry(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
): THREE.BufferGeometry {
  // Broad soil pads that leave the bole and flatten — never pointed radial feet.
  const lengthSegments = 11;
  const radialSegments = 12;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const direction = end.clone().sub(start);
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z);
  if (horizontal.lengthSq() < 1e-8) {
    horizontal.set(1, 0, 0);
  } else {
    horizontal.normalize();
  }
  const side = new THREE.Vector3(-horizontal.z, 0, horizontal.x).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  for (let ring = 0; ring <= lengthSegments; ring += 1) {
    const amount = ring / lengthSegments;
    const eased = amount * amount * (3 - 2 * amount);
    const settle = Math.pow(amount, 1.28);
    const center = start.clone().lerp(end, settle);
    // Mound only against the bole; the pad sits on y≈0.
    const mound = Math.sin(Math.min(1, amount * 1.2) * Math.PI) * 0.02 * (1 - amount);
    center.y = THREE.MathUtils.lerp(start.y, 0, settle) + mound;
    // Keep a spreading pad — do not pinch to a spike.
    const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, eased * 0.7);
    const verticalScale = THREE.MathUtils.lerp(0.56, 0.08, Math.pow(amount, 0.72));
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const angle = (radial / radialSegments) * Math.PI * 2;
      const offset = side
        .clone()
        .multiplyScalar(Math.cos(angle) * radius)
        .add(up.clone().multiplyScalar(Math.sin(angle) * radius * verticalScale));
      const y = Math.max(-0.006, center.y + offset.y);
      vertices.push(center.x + offset.x, y, center.z + offset.z);
      const [r, g, b] = barkVertexColor(`root-buttress`, amount, radial);
      colors.push(r * 0.92, g * 0.92, b * 0.9);
    }
  }
  for (let ring = 0; ring < lengthSegments; ring += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      const a = ring * radialSegments + radial;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + radial;
      indices.push(a, d, b, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTaperedBranchGeometry(
  segment: LivingSakuraSegment,
  parentRadiusAtJoin?: number,
): THREE.BufferGeometry {
  // Extra sides on trunk/primaries soften pipe facets cheaply (one mesh each).
  const lengthSegments =
    segment.role === "trunk"
      ? 22
      : segment.role === "tertiary"
        ? 12
        : segment.role === "secondary"
          ? 14
          : 18;
  const radialSegments =
    segment.role === "trunk"
      ? 28
      : segment.role === "primary" || segment.role === "leader"
        ? 22
        : segment.role === "tertiary"
          ? 12
          : 16;
  // Continuous pipe-flare collar: match parent girth at join, then ease to child taper.
  // No separate sphere props — radius is the only collar language.
  const isTipPlate =
    segment.id.startsWith("secondary-tip-") ||
    segment.id.startsWith("tertiary-tip-");
  // Collar is a short world-length join, never half the child. Short lace
  // used to inherit bole girth for 40% of its length and read as tumors.
  const collarLength =
    segment.role === "leader"
      ? 0.22
      : segment.role === "primary"
        ? 0.16
        : segment.role === "secondary"
          ? 0.12
          : 0.1;
  const collarBoost =
    segment.role === "leader" || segment.role === "primary" ? 1.08 : 1.04;
  const childJoinRadius = Math.max(segment.radiusStart, 0.012);
  const joinCap =
    segment.role === "leader"
      ? childJoinRadius * 1.45
      : segment.role === "primary"
        ? childJoinRadius * 1.28
        : childJoinRadius * 1.16;
  const joinMatchRadius =
    typeof parentRadiusAtJoin === "number" && parentRadiusAtJoin > 0
      ? Math.min(parentRadiusAtJoin, joinCap)
      : null;
  const isYouthShoot = segment.id.startsWith("youth/");
  const oval =
    0.88 +
    ((hashText(`${segment.id}:oval`) % 100) / 100) * 0.08;
  const ridgePhase = (hashText(`${segment.id}:ridge`) % 628) / 100;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const origin = toVector(segment.start);
  let previousNormal = new THREE.Vector3(0, 0, 1);
  let previousBinormal = new THREE.Vector3(1, 0, 0);

  for (let ring = 0; ring <= lengthSegments; ring += 1) {
    const amount = ring / lengthSegments;
    const center = toVector(sampleLivingSakuraSegment(segment, amount)).sub(
      origin,
    );
    const tangent = toVector(
      tangentLivingSakuraSegment(segment, amount),
    ).normalize();
    const reference = Math.abs(tangent.dot(UP)) > 0.92 ? SIDE : UP;
    let binormal = new THREE.Vector3()
      .crossVectors(tangent, reference)
      .normalize();
    let normal = new THREE.Vector3()
      .crossVectors(binormal, tangent)
      .normalize();
    if (ring > 0) {
      // Parallel-transport frame so bark ridges don't twist into candy-cane pipes.
      if (normal.dot(previousNormal) < 0) {
        normal.multiplyScalar(-1);
        binormal.multiplyScalar(-1);
      }
      normal
        .add(previousNormal.clone().multiplyScalar(0.35))
        .normalize();
      binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    }
    previousNormal = normal.clone();
    previousBinormal = binormal.clone();

    const childRadius = presentationRadiusAt(segment, amount);
    let baseRadius = childRadius;
    if (joinMatchRadius !== null && amount < collarLength) {
      const collarT = amount / collarLength;
      // Hold parent girth through the first third, then ease to the child.
      const ease = collarT * collarT * (3 - 2 * collarT);
      const slow = ease * ease;
      baseRadius = joinMatchRadius * (1 - slow) + childRadius * slow;
      const hump = Math.sin(collarT * Math.PI) * (collarBoost - 1);
      baseRadius *= 1 + hump;
    }
    if (
      segment.role === "trunk" &&
      segment.radiusStart > 0.05 &&
      amount < 0.18
    ) {
      const flareT = 1 - amount / 0.18;
      baseRadius *= 1 + flareT * flareT * 0.26;
    }
    const isOuterLace = isTipPlate || segment.role === "tertiary";
    let tipMul = 1;
    if (!isYouthShoot) {
      const tipStart =
        segment.role === "trunk"
          ? 0.62
          : isOuterLace
            ? 0.48
            : segment.role === "secondary"
              ? 0.52
              : 0.58;
      if (amount > tipStart) {
        const tipT = (amount - tipStart) / (1 - tipStart);
        const ease = tipT * tipT * (3 - 2 * tipT);
        const pinch =
          segment.role === "trunk"
            ? 0.22
            : isOuterLace
              ? segment.role === "tertiary"
                ? 0.42
                : 0.36
              : segment.role === "secondary"
                ? 0.4
                : 0.32;
        tipMul = 1 - ease * pinch;
      }
    }
    // Keep majors full through mid-limb, then the tip pinch reads as cherry wood.
    const alongKeep =
      segment.role === "trunk" ||
      segment.role === "leader" ||
      segment.role === "primary"
        ? 1 - Math.pow(amount, 1.7) * 0.06
        : 1 - Math.pow(amount, 1.2) * 0.16;
    const minRadius = isOuterLace
      ? segment.role === "tertiary"
        ? 0.006
        : 0.008
      : segment.role === "secondary"
        ? 0.0075
        : segment.role === "trunk"
          ? 0.018
          : 0.009;
    const radius = Math.max(minRadius, baseRadius * tipMul * alongKeep);

    for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
      const angle = (sideIndex / radialSegments) * Math.PI * 2;
      // Soft bark undulation — round silhouette, not a fluted column.
      const ridgeAmp =
        segment.role === "tertiary"
          ? 0.028
          : segment.role === "secondary"
            ? 0.036
            : segment.role === "trunk"
              ? 0.042
              : 0.038;
      const ridge =
        1 +
        ridgeAmp * 0.85 * Math.sin(angle * 2.1 + ridgePhase + amount * 1.1) +
        ridgeAmp * 0.5 * Math.sin(angle * 3.8 - ridgePhase * 0.6 + amount * 1.8) +
        ridgeAmp * 0.72 * Math.sin(angle * 9.4 + ridgePhase * 0.9 + amount * 14);
      const groove =
        segment.role === "trunk" || segment.role === "primary"
          ? 1 -
            0.05 *
              Math.pow(
                Math.max(
                  0,
                  Math.sin(amount * Math.PI * 28 + sideIndex * 0.18),
                ),
                12,
              )
          : 1;
      const rx = radius * ridge * groove;
      const rz = radius * ridge * oval * groove;
      const ringOffset = normal
        .clone()
        .multiplyScalar(Math.cos(angle) * rx)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * rz));
      const vertex = center.clone().add(ringOffset);
      vertices.push(vertex.x, vertex.y, vertex.z);
      const [r, g, b] = barkVertexColor(segment.id, amount, sideIndex);
      colors.push(r, g, b);
    }
  }

  // Soft tip: last ring already pinched; close with a short apex (no blunt disc).
  // Outer lace: almost no apex extend — wood plate stubs, not fine wire needles.
  const endCenterIndex = vertices.length / 3;
  const endCenter = toVector(segment.end).sub(origin);
  const endTangent = toVector(tangentLivingSakuraSegment(segment, 1)).normalize();
  const isOuterLaceTip = isTipPlate || segment.role === "tertiary";
  const tipExtend = isYouthShoot
    ? 0
    : isOuterLaceTip
      ? segment.role === "tertiary"
        ? 0.003
        : 0.005
      : segment.role === "secondary"
        ? 0.009
        : 0.008;
  endCenter.addScaledVector(endTangent, tipExtend);
  vertices.push(endCenter.x, endCenter.y, endCenter.z);
  const [tipR, tipG, tipB] = barkVertexColor(segment.id, 1, 0);
  colors.push(tipR * 0.95, tipG * 0.95, tipB * 0.92);

  for (let ring = 0; ring < lengthSegments; ring += 1) {
    for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
      const nextSide = (sideIndex + 1) % radialSegments;
      const a = ring * radialSegments + sideIndex;
      const b = ring * radialSegments + nextSide;
      const c = (ring + 1) * radialSegments + nextSide;
      const d = (ring + 1) * radialSegments + sideIndex;
      indices.push(a, d, b, b, d, c);
    }
  }
  const finalRingOffset = lengthSegments * radialSegments;
  for (let sideIndex = 0; sideIndex < radialSegments; sideIndex += 1) {
    const nextSide = (sideIndex + 1) % radialSegments;
    indices.push(
      endCenterIndex,
      finalRingOffset + nextSide,
      finalRingOffset + sideIndex,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // Averaged normals = soft continuous wood (analytical ring normals look plastic).
  geometry.computeVertexNormals();
  // Re-emphasize multi-lobe ridges after smooth normals: bias normal toward the
  // radial offset so raking light still sculpts bark in structure stills.
  const posAttr = geometry.getAttribute("position");
  const nrmAttr = geometry.getAttribute("normal");
  if (posAttr && nrmAttr && segment.role !== "tertiary") {
    const sides = radialSegments;
    for (let ring = 0; ring <= lengthSegments; ring += 1) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let s = 0; s < sides; s += 1) {
        const i = ring * sides + s;
        cx += posAttr.getX(i);
        cy += posAttr.getY(i);
        cz += posAttr.getZ(i);
      }
      cx /= sides;
      cy /= sides;
      cz /= sides;
      for (let s = 0; s < sides; s += 1) {
        const i = ring * sides + s;
        const ox = posAttr.getX(i) - cx;
        const oy = posAttr.getY(i) - cy;
        const oz = posAttr.getZ(i) - cz;
        const olen = Math.hypot(ox, oy, oz) || 1;
        const rx = ox / olen;
        const ry = oy / olen;
        const rz = oz / olen;
        const nx = nrmAttr.getX(i) * 0.62 + rx * 0.38;
        const ny = nrmAttr.getY(i) * 0.62 + ry * 0.38;
        const nz = nrmAttr.getZ(i) * 0.62 + rz * 0.38;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        nrmAttr.setXYZ(i, nx / nlen, ny / nlen, nz / nlen);
      }
    }
    nrmAttr.needsUpdate = true;
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Small decorative tip umbels — journal petals stay the readable faces. */
const AMBIENT_FLOWER_BASE_SCALE = 0.2;
/** Memory blossoms stay ≥1.22× ambient and slightly more luminous. */
const MEMORY_FLOWER_BASE_SCALE = AMBIENT_FLOWER_BASE_SCALE * 1.32;
/** Spur umbel scale vs recipe — kept below memory so journal petals read first. */
const SPUR_UMBEL_SCALE = 0.88;
const SPUR_HALF_OPEN_SCALE = 0.78;
/** Slide umbels toward the host tip without leaving wood (floater budget). */
const SPUR_TIP_BIAS = 0.01;
/** Hard floor: journal petals must always read larger than decorative umbels. */
const MEMORY_TO_AMBIENT_MIN_RATIO = 1.22;
/**
 * Max pedicel reach from bark for memory blossoms (world units in root space
 * before stage scale). Youth stays tighter so petals never read as free-float.
 */
const MEMORY_PEDICEL_MAX_YOUTH = 0.028;
const MEMORY_PEDICEL_MAX_MATURE = 0.045;

/**
 * Legacy densify budget used only as a floral-host ordinal ceiling.
 * Wood itself is the lifelong graph — this no longer remeshes chapters.
 */
export function presentationSegmentBudget(
  journalCount: number,
  explicitCapacity: number,
): number {
  const n = Math.max(0, Math.floor(journalCount));
  const cap = Math.max(0, Math.floor(explicitCapacity));
  if (n <= 0 || cap <= 0) return 0;
  // Dedicated sprout body — never a 16-segment dollhouse of the adult.
  if (n < 12) return 0;
  // n=12 → 52 … n=24 → 88 — mid youth densifies lace earlier.
  if (n < 24) return Math.min(cap, 52 + Math.floor((n - 12) * 3));
  // n=24 → 88 … n=48 → ~65% of capacity so mid-life stills aren't half-bare.
  if (n < 48) {
    const floor24 = Math.min(cap, Math.max(88, Math.floor(cap * 0.42)));
    return Math.min(
      cap,
      floor24 + Math.floor(((n - 24) / 24) * Math.max(0, Math.floor(cap * 0.65) - floor24)),
    );
  }
  // n=48 → ~65% cap … n=96 → full capacity (mature lace plate early).
  if (n < 96) {
    const floor48 = Math.min(cap, Math.max(110, Math.floor(cap * 0.65)));
    return Math.min(
      cap,
      floor48 + Math.floor(((n - 48) / 48) * Math.max(0, cap - floor48)),
    );
  }
  return cap;
}

/** Equal-beauty memory flower scale, capped so youth wood is never dwarfed. */
function memoryFlowerScaleForHost(
  ordinal: number,
  hostRadius: number,
): number {
  const equalBeauty = Math.max(
    MEMORY_FLOWER_BASE_SCALE * 1.05,
    AMBIENT_FLOWER_BASE_SCALE * MEMORY_TO_AMBIENT_MIN_RATIO,
  );
  void hostRadius;
  if (ordinal < 12) {
    // Readable from the dock, never a hydrangea that swallows the stem.
    return Math.min(0.24, Math.max(0.22, hostRadius * 8.4));
  }
  // Journal petals stay larger than decorative umbels so they can be found and tapped.
  // Mature canopies sit inside umbels — still readable, never a hydrangea foam card.
  if (ordinal >= 96) {
    // Equal-beauty journal face, ≥1.22× the reduced mature umbel.
    return Math.min(
      0.28,
      Math.max(AMBIENT_FLOWER_BASE_SCALE * MEMORY_TO_AMBIENT_MIN_RATIO, equalBeauty),
    );
  }
  return Math.min(0.34, Math.max(0.26, equalBeauty));
}

/** Minimum world-space gap between active memory blossoms. */
export function memoryMinSeparation(journalCount: number): number {
  const n = Math.max(0, Math.floor(journalCount));
  if (n < 12) return 0.08;
  if (n < 48) return 0.14;
  if (n < 96) return 0.18;
  return 0.24;
}
/** Petal length used for notch-depth contracts in createFlowerGeometry. */
const FLOWER_PETAL_LENGTH = 0.24;
/** Notch depth as a fraction of petal length (≥ ~10% for a clear heart notch). */
const FLOWER_NOTCH_FRACTION = 0.12;

/**
 * Pale sakura blush ramp — warm white → soft rose, never neon.
 * Used for ambient umbels so the canopy stays product-beautiful and consistent.
 */
const PALE_BLUSH = {
  rose: "#e7aeb9",
  mid: "#f2cbd3",
  soft: "#fae4e3",
  white: "#fff0ed",
} as const;

/**
 * Low-poly five-petal Sakura blossom: notched tips, deep soft cup, instanceable.
 * 50 verts (5 petals × 10). Petals lie in XY with cup along +Z.
 * Wider mid-lobes read thicker/softer without leaving the instancing budget.
 */
export function createFlowerGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const petalLength = FLOWER_PETAL_LENGTH;
  const notchDepth = petalLength * FLOWER_NOTCH_FRACTION;
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = (petal / 5) * Math.PI * 2 - Math.PI / 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const acrossX = -dirY;
    const acrossY = dirX;
    const baseIndex = vertices.length / 3;
    // Heart notch stays on the same radii the tests measure.
    // Cup is deeper at the lobes than the notch so the petal folds, not a card.
    // [radial, across, cupZ]
    const outline: ReadonlyArray<readonly [number, number, number]> = [
      [0.018, 0, -0.07],
      [0.078, 0.092, -0.02],
      [0.138, 0.124, 0.05],
      [0.192, 0.098, 0.12],
      [petalLength, 0.052, 0.155],
      [petalLength - notchDepth, 0, 0.07],
      [petalLength, -0.052, 0.155],
      [0.192, -0.098, 0.12],
      [0.138, -0.124, 0.05],
      [0.078, -0.092, -0.02],
    ];
    for (const [radial, across, cup] of outline) {
      vertices.push(
        dirX * radial + acrossX * across,
        dirY * radial + acrossY * across,
        cup,
      );
      const tip = Math.min(1, radial / petalLength);
      const edge = Math.min(1, Math.abs(across) / 0.13);
      colors.push(
        0.99 - tip * 0.09 - edge * 0.02,
        0.95 - tip * 0.26 - edge * 0.04,
        0.93 - tip * 0.18 - edge * 0.03,
      );
    }
    // Fan triangulation from base through the 9-edge outline.
    for (let edge = 1; edge < 9; edge += 1) {
      indices.push(baseIndex, baseIndex + edge, baseIndex + edge + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Anthers in the cup — a cluster, not one gold ball. */
export function createStamenClusterGeometry(): THREE.BufferGeometry {
  const anther = new THREE.SphereGeometry(0.007, 5, 4);
  const pieces: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 5; index += 1) {
    const piece = anther.clone();
    if (index === 0) {
      piece.translate(0, 0, 0.006);
    } else {
      const angle = ((index - 1) / 4) * Math.PI * 2;
      piece.translate(Math.cos(angle) * 0.016, Math.sin(angle) * 0.016, 0.01);
    }
    pieces.push(piece);
  }
  anther.dispose();
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error("Unable to build stamen cluster.");
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Half-open sakura: petals partially unfurled, still instanceable.
 * 40 verts (5 petals × 8). Smaller footprint than full bloom, taller than bud.
 */
export function createHalfOpenFlowerGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const petalLength = 0.16;
  const notchDepth = petalLength * 0.08;
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = (petal / 5) * Math.PI * 2 - Math.PI / 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const acrossX = -dirY;
    const acrossY = dirX;
    const baseIndex = vertices.length / 3;
    // Petals lift upward (negative cup at base, modest open at tip) — half-unfurled.
    const outline: ReadonlyArray<readonly [number, number, number]> = [
      [0.012, 0, -0.02],
      [0.055, 0.042, 0.02],
      [0.1, 0.048, 0.055],
      [petalLength, 0.028, 0.09],
      [petalLength - notchDepth, 0, 0.085],
      [petalLength, -0.028, 0.09],
      [0.1, -0.048, 0.055],
      [0.055, -0.042, 0.02],
    ];
    for (const [radial, across, cup] of outline) {
      // Scale radial slightly so half-open reads narrower than full bloom.
      const r = radial * 0.72;
      vertices.push(
        dirX * r + acrossX * across * 0.7,
        dirY * r + acrossY * across * 0.7,
        cup,
      );
    }
    indices.push(
      baseIndex,
      baseIndex + 1,
      baseIndex + 7,
      baseIndex + 1,
      baseIndex + 2,
      baseIndex + 7,
      baseIndex + 2,
      baseIndex + 6,
      baseIndex + 7,
      baseIndex + 2,
      baseIndex + 3,
      baseIndex + 6,
      baseIndex + 3,
      baseIndex + 5,
      baseIndex + 6,
      baseIndex + 3,
      baseIndex + 4,
      baseIndex + 5,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Closed sakura bud — a sepal capsule, taller than it is wide. */
export function createBudGeometry(): THREE.BufferGeometry {
  const points = [
    new THREE.Vector2(0.004, -0.08),
    new THREE.Vector2(0.028, -0.05),
    new THREE.Vector2(0.04, -0.01),
    new THREE.Vector2(0.032, 0.04),
    new THREE.Vector2(0.014, 0.078),
    new THREE.Vector2(0.001, 0.096),
  ];
  const geometry = new THREE.LatheGeometry(points, 7);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const tip = Math.min(1, Math.max(0, (y + 0.02) / 0.1));
    colors[index * 3] = 0.45 + tip * 0.45;
    colors[index * 3 + 1] = 0.48 - tip * 0.22;
    colors[index * 3 + 2] = 0.32 + tip * 0.2;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLeafGeometry(): THREE.BufferGeometry {
  // Ovate Prunus leaf — serrated oval, not a star blade.
  const vertices = new Float32Array([
    0, -0.06, 0,
    -0.028, -0.01, 0.006,
    -0.038, 0.04, 0.01,
    -0.022, 0.09, 0.008,
    0, 0.14, 0.002,
    0.022, 0.09, -0.004,
    0.038, 0.04, -0.007,
    0.028, -0.01, -0.004,
    0, 0.03, 0.016,
  ]);
  const indices = [0, 1, 8, 1, 2, 8, 2, 3, 8, 3, 4, 8, 4, 5, 8, 5, 6, 8, 6, 7, 8, 7, 0, 8];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function insideProtectedWindow(
  point: THREE.Vector3,
  windows: readonly {
    center: readonly [number, number, number];
    radii: readonly [number, number, number];
  }[],
): boolean {
  return windows.some((window) => {
    const dx = (point.x - window.center[0]) / (window.radii[0] * 1.3);
    const dy = (point.y - window.center[1]) / (window.radii[1] * 1.3);
    const dz = (point.z - window.center[2]) / (window.radii[2] * 1.3);
    return dx * dx + dy * dy + dz * dz < 1;
  });
}

function setOrganMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: number | THREE.Vector3,
): void {
  const matrix = new THREE.Matrix4();
  const scaleVector =
    typeof scale === "number"
      ? new THREE.Vector3(scale, scale, scale)
      : scale;
  matrix.compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    scaleVector,
  );
  mesh.setMatrixAt(index, matrix);
}

/** CylinderGeometry is Y-up with unit-ish height; stretch to span start→end. */
function setPedicelMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  referenceHeight = 0.15,
  referenceRadius = 0.011,
): void {
  const direction = end.clone().sub(start);
  const length = Math.max(direction.length(), 1e-4);
  const mid = start.clone().lerp(end, 0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    UP,
    direction.multiplyScalar(1 / length),
  );
  const matrix = new THREE.Matrix4();
  const radial = Math.max(radius, 0.004) / referenceRadius;
  matrix.compose(
    mid,
    quaternion,
    new THREE.Vector3(radial, length / referenceHeight, radial),
  );
  mesh.setMatrixAt(index, matrix);
}

interface OrganInstancePlacement {
  segmentId: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number | THREE.Vector3;
  color?: THREE.Color;
}

/** Ambient canopy must not steal pointer hits from journal memory petals. */
function disableRaycast(object: THREE.Object3D): void {
  object.raycast = () => undefined;
  object.traverse((child) => {
    child.raycast = () => undefined;
  });
}

function commitOrganInstances(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly OrganInstancePlacement[],
  pivotBySegmentId: Map<string, THREE.Group>,
  fallbackRoot: THREE.Object3D,
  options?: {
    castShadow?: boolean;
    name?: string;
    /** Decorative only — default true so memory hits remain tappable. */
    blockPointer?: boolean;
  },
): THREE.InstancedMesh[] {
  if (placements.length === 0) return [];
  const bySegment = new Map<string, OrganInstancePlacement[]>();
  for (const placement of placements) {
    const list = bySegment.get(placement.segmentId);
    if (list) list.push(placement);
    else bySegment.set(placement.segmentId, [placement]);
  }
  const meshes: THREE.InstancedMesh[] = [];
  for (const [segmentId, items] of bySegment) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    if (options?.name) mesh.name = options.name;
    mesh.castShadow = options?.castShadow ?? false;
    items.forEach((item, index) => {
      setOrganMatrix(mesh, index, item.position, item.rotation, item.scale);
      if (item.color) mesh.setColorAt(index, item.color);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Default: decorative organs never capture pointer — journal petals do.
    if (options?.blockPointer !== false) {
      disableRaycast(mesh);
    }
    const host = pivotBySegmentId.get(segmentId) ?? fallbackRoot;
    host.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

function worldToSegmentLocal(
  world: THREE.Vector3,
  segment: LivingSakuraSegment,
): THREE.Vector3 {
  return world.clone().sub(toVector(segment.start));
}

function makeOrganPlacement(
  segment: LivingSakuraSegment,
  random: () => number,
  spread = 0.02,
): THREE.Vector3 {
  // Tip-biased, bark-snapped. Spread is along the limb only — never free air.
  const amount = clamp(0.58 + random() * 0.36, 0.42, 0.97);
  const { point, tangent, binormal } = memoryBranchFrame(segment, amount);
  const radius = livingSakuraRadiusAt(segment, amount);
  const along = (random() - 0.5) * Math.min(0.04, Math.max(0, spread));
  return point
    .clone()
    .addScaledVector(tangent, along)
    .addScaledVector(binormal, radius + 0.014);
}

function syntheticMemories(
  count: number,
  newestGrowthUnits: 1 | 2 | 4 | 6,
): LivingMemoryInput[] {
  const units = [1, 2, 4, 6] as const;
  return Array.from({ length: count }, (_, index) => ({
    entryId: `study-memory-${index + 1}`,
    ordinal: index + 1,
    privateGrowthUnits:
      index === count - 1 ? newestGrowthUnits : units[index % units.length],
    seed: `study-memory-seed-${index + 1}`,
  }));
}

/**
 * Interactive journal-memory petals on the living tree.
 * Raised so dense journals stay touchable; full history remains in the ledger.
 */
export const ACTIVE_MEMORY_HIT_LIMIT = 256;
interface MemoryPlacementSeed {
  readonly entryId: string;
  readonly ordinal: number;
}

interface MemoryPlacement {
  entryId: string;
  ordinal: number;
  segment: LivingSakuraSegment;
  amount: number;
  position: THREE.Vector3;
  /** Unit tangent at the attachment amount — preferred push axis. */
  tangent: THREE.Vector3;
  /** Unit side vector spanning the crown surface with the binormal. */
  side: THREE.Vector3;
  binormal: THREE.Vector3;
}

interface FloweringSite {
  segment: LivingSakuraSegment;
  amount: number;
}

/**
 * Discrete, append-stable blossom addresses on wood. Journal ordinal N always
 * claims site N-1; new limbs only add later sites, so older petals never jump.
 */
const FLOWERING_SHELL_T: Partial<
  Record<LivingSakuraSegment["role"], readonly number[]>
> = {
  tertiary: [0.72, 0.84, 0.94],
  secondary: [0.58, 0.74, 0.88, 0.96],
  primary: [0.48, 0.66, 0.82, 0.94],
  leader: [0.42, 0.64, 0.84, 0.95],
  trunk: [0.78, 0.92],
};

function floweringSitesFor(
  segments: readonly LivingSakuraSegment[],
): FloweringSite[] {
  if (segments.length === 0) return [];
  const laterals = segments.filter(
    (segment) =>
      segment.role === "primary" ||
      segment.role === "leader" ||
      segment.role === "secondary" ||
      segment.role === "tertiary",
  );
  const hosts = segments.filter((segment) => {
    if (segment.role === "trunk") return laterals.length === 0;
    // Leaders and the signature sweep always carry journal petals — the
    // mature crotch must not hoard every memory on interior lace.
    if (segment.role === "leader") return true;
    if (segment.signature === "low-sweeping-bough") return true;
    if (segment.role === "primary") return true;
    if (segment.role === "secondary" || segment.role === "tertiary") return true;
    return false;
  });
  const ordered = (hosts.length > 0 ? hosts : segments).slice().sort(
    (left, right) =>
      left.address.ordinal - right.address.ordinal ||
      left.id.localeCompare(right.id),
  );
  const sites: FloweringSite[] = [];
  for (const segment of ordered) {
    const levels = FLOWERING_SHELL_T[segment.role] ?? [0.92];
    for (const amount of levels) {
      sites.push({ segment, amount });
    }
  }
  return sites;
}

function siteForMemory(
  sites: readonly FloweringSite[],
  segments: readonly LivingSakuraSegment[],
  ordinal: number,
): { site: FloweringSite; generation: number } {
  const fallback: FloweringSite = {
    segment: segments[segments.length - 1] ?? segments[0],
    amount: 0.86,
  };
  if (sites.length === 0) {
    return { site: fallback, generation: 0 };
  }
  const index = Math.max(0, Math.floor(ordinal) - 1);
  const generation = Math.floor(index / sites.length);
  const base = sites[index % sites.length] ?? fallback;
  if (generation === 0) return { site: base, generation };
  // Extra journals on the same limb slide further along the wood — never off it.
  return {
    site: {
      segment: base.segment,
      amount: clamp(base.amount - generation * 0.07, 0.34, 0.97),
    },
    generation,
  };
}

/** Orient a flower cup (+Z) along a spur outward normal with recipe tilt. */
function umbelOrientation(
  frame: { normal: readonly [number, number, number]; tangent: readonly [number, number, number] },
  tiltDegrees: number,
  radialOffsetDegrees: number,
  spin: number,
): THREE.Euler {
  const outward = new THREE.Vector3(frame.normal[0], frame.normal[1], frame.normal[2]);
  if (outward.lengthSq() < 1e-8) outward.set(0, 1, 0);
  else outward.normalize();
  // Bias slightly upward so umbels open into the light, not straight into wood.
  outward.y += 0.35;
  outward.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    outward,
  );
  const tilt = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(tiltDegrees),
      THREE.MathUtils.degToRad(radialOffsetDegrees),
      spin,
      "XYZ",
    ),
  );
  quat.multiply(tilt);
  return new THREE.Euler().setFromQuaternion(quat, "XYZ");
}

function memoryBranchFrame(
  segment: LivingSakuraSegment,
  amount: number,
): {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  binormal: THREE.Vector3;
} {
  const point = toVector(sampleLivingSakuraSegment(segment, amount));
  const tangent = toVector(tangentLivingSakuraSegment(segment, amount));
  if (tangent.lengthSq() < 1e-10) {
    tangent.set(0, 1, 0);
  } else {
    tangent.normalize();
  }
  const side = new THREE.Vector3().crossVectors(UP, tangent);
  if (side.lengthSq() < 1e-8) {
    side.crossVectors(SIDE, tangent);
  }
  side.normalize();
  const binormal = new THREE.Vector3().crossVectors(tangent, side).normalize();
  return { point, tangent, side, binormal };
}

/**
 * Deterministic base placement for one memory blossom: samples the stable
 * segment attachment, then offsets along the branch tangent and crown surface
 * so neighboring hashes are less likely to stack on the same point.
 */
function memoryPosition(
  segments: readonly LivingSakuraSegment[],
  rootSeed: string,
  entryId: string,
  ordinal: number,
  sites?: readonly FloweringSite[],
): MemoryPlacement {
  const resolvedSites = sites ?? floweringSitesFor(segments);
  const { site, generation } = siteForMemory(resolvedSites, segments, ordinal);
  const segment = site.segment;
  const random = randomFor(`${rootSeed}:memory:${entryId}`);
  const entrySlot =
    (hashText(`${rootSeed}:memory-slot:${entryId}`) % 1000) / 1000;
  // Site amount is the botanical address; jitter stays inside the slot gap.
  const amount = clamp(site.amount + (entrySlot - 0.5) * 0.028, 0.42, 0.97);
  const { point, tangent, side, binormal } = memoryBranchFrame(segment, amount);
  const hostRadius = livingSakuraRadiusAt(segment, amount);
  const pedicel =
    hostRadius +
    (ordinal < 12 ? 0.014 : 0.02) +
    random() * 0.004;
  const along = (entrySlot - 0.5) * (ordinal < 12 ? 0.01 : 0.018);
  const umbel =
    generation === 0 ? 0 : Math.min(0.028, 0.01 + generation * 0.006);
  const spin = entrySlot * Math.PI * 2 + generation * 0.9;
  const position = point
    .clone()
    .addScaledVector(tangent, along)
    .addScaledVector(side, Math.cos(spin) * umbel)
    .addScaledVector(binormal, pedicel);
  return {
    entryId,
    ordinal,
    segment,
    amount,
    position,
    tangent: tangent.clone(),
    side: side.clone(),
    binormal: binormal.clone(),
  };
}

/** Plans bark-attached world placements for the active memory projection. */
function planActiveMemoryPlacements(
  segments: readonly LivingSakuraSegment[],
  rootSeed: string,
  markers: readonly MemoryPlacementSeed[],
  stageScaleXZ = 1,
): Map<string, MemoryPlacement> {
  const ordered = [...markers].sort(
    (left, right) =>
      left.ordinal - right.ordinal || left.entryId.localeCompare(right.entryId),
  );
  const sites = floweringSitesFor(segments);
  void stageScaleXZ;
  const amounts = ordered.length < 48 ? [0.88] : [0.58, 0.76, 0.9, 0.97];
  const pool: MemoryPlacement[] = [];
  for (const site of sites) {
    for (const amount of amounts) {
      const frame = memoryBranchFrame(site.segment, amount);
      const bark = livingSakuraRadiusAt(site.segment, amount) + 0.018;
      pool.push({
        entryId: "",
        ordinal: 0,
        segment: site.segment,
        amount,
        position: frame.point.clone().addScaledVector(frame.binormal, bark),
        tangent: frame.tangent.clone(),
        side: frame.side.clone(),
        binormal: frame.binormal.clone(),
      });
    }
  }
  const used = new Set<number>();
  const taken: THREE.Vector3[] = [];
  const gapToTaken = (position: THREE.Vector3) =>
    taken.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...taken.map((point) => point.distanceTo(position)));
  const placements = ordered.map((marker, index) => {
    const preferred = memoryPosition(
      segments,
      rootSeed,
      marker.entryId,
      marker.ordinal,
      sites,
    );
    let chosen = preferred;
    let bestGap = gapToTaken(preferred.position);
    let bestRadial = Math.hypot(preferred.position.x, preferred.position.z);
    let bestPool = -1;
    const start = (index * 7) % Math.max(1, pool.length);
    for (let offset = 0; offset < pool.length; offset += 1) {
      const poolIndex = (start + offset) % pool.length;
      if (used.has(poolIndex)) continue;
      const candidate = pool[poolIndex];
      const gap = gapToTaken(candidate.position);
      const radial = Math.hypot(candidate.position.x, candidate.position.z);
      const wider = gap > bestGap + 0.012;
      const sameGapOuter =
        gap + 0.01 >= bestGap &&
        radial > bestRadial + 0.08 &&
        gap > 0.1;
      if (wider || sameGapOuter) {
        bestGap = gap;
        bestRadial = radial;
        bestPool = poolIndex;
        chosen = {
          ...candidate,
          entryId: marker.entryId,
          ordinal: marker.ordinal,
        };
      }
    }
    if (bestPool >= 0) used.add(bestPool);
    taken.push(chosen.position.clone());
    return chosen;
  });
  return new Map(placements.map((placement) => [placement.entryId, placement]));
}

/** Smooth Prunus kernel — umber, slight ventral crease, tiny shoulder highlight. */
function createCherryStoneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.168, 36, 28);
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const umber: [number, number, number] = [0.2, 0.12, 0.08];
  const warm: [number, number, number] = [0.38, 0.24, 0.16];
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    x *= 1.02;
    y *= 0.62;
    z *= 0.78;
    const suture = Math.exp(-(x * x) * 46) * Math.max(0, z + 0.015);
    z -= suture * 0.05;
    x *= 1 - suture * 0.2;
    const pore = Math.sin(x * 17 + y * 13) * Math.cos(z * 15) * 0.003;
    pos.setXYZ(i, x * (1 + pore), y * (1 + pore * 0.5), z * (1 + pore));
    const light = clamp(0.42 + y * 0.9 - x * 0.35 + z * 0.15, 0, 1);
    const creaseShade = 1 - suture * 0.45;
    colors[i * 3] = (umber[0] + (warm[0] - umber[0]) * light) * creaseShade;
    colors[i * 3 + 1] = (umber[1] + (warm[1] - umber[1]) * light) * creaseShade;
    colors[i * 3 + 2] = (umber[2] + (warm[2] - umber[2]) * light) * creaseShade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSeedKernelGroup(
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "Seed kernel";
  group.userData.baseScale = 1;
  // Nest cup sits near y≈0.06; bury the lower third so the stone sits IN soil.
  group.position.set(0, 0.128, 0);
  group.rotation.set(0.18, 0.35, -0.12);

  const geometry = createCherryStoneGeometry();
  geometries.add(geometry);
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.62,
    metalness: 0.04,
    vertexColors: true,
    envMapIntensity: 0.42,
  });
  materials.add(material);
  const stone = new THREE.Mesh(geometry, material);
  stone.name = "Cherry stone";
  stone.castShadow = true;
  stone.receiveShadow = true;
  disableRaycast(stone);
  group.add(stone);
  disableRaycast(group);
  return group;
}

function addYouthLeaves(
  root: THREE.Group,
  segments: readonly LivingSakuraSegment[],
  pivots: Map<string, THREE.Group>,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  rootSeed: string,
  journalCount: number,
): void {
  const random = randomFor(`${rootSeed}:youth-leaves`);
  const hosts =
    segments.filter((segment) => segment.role === "primary").length > 0
      ? segments.filter((segment) => segment.role === "primary")
      : segments;
  // A living first-year cherry is leafy, not a holly bush of giant blades.
  const count = journalCount === 1 ? 3 : 5 + journalCount;
  for (let index = 0; index < count; index += 1) {
    const host = hosts[index % hosts.length] ?? segments[0];
    if (!host) continue;
    const pivot = pivots.get(host.id) ?? root;
    const amount = 0.28 + random() * 0.68;
    const frame = memoryBranchFrame(host, amount);
    const radius = livingSakuraRadiusAt(host, amount);
    const leaf = new THREE.Mesh(geometry, material);
    leaf.name = `Sprout leaf ${index + 1}`;
    if (journalCount === 1) {
      // First leaves hug the stem. A flag would stand off the bark.
      leaf.position
        .copy(frame.point)
        .sub(toVector(host.start))
        .addScaledVector(frame.binormal, radius * 0.42)
        .addScaledVector(frame.side, (index - 1) * radius * 0.35);
      leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), frame.tangent);
      leaf.rotateX(0.28);
      leaf.rotateY(index * 2.15);
      leaf.scale.setScalar(0.2);
    } else {
      leaf.position.copy(
        frame.point
          .clone()
          .sub(toVector(host.start))
          .addScaledVector(frame.binormal, radius + 0.008)
          .addScaledVector(frame.side, (random() - 0.5) * 0.018),
      );
      leaf.rotation.set(
        -0.35 + random() * 0.2,
        random() * 0.5 - 0.25,
        random() * 0.35 - 0.18,
      );
      leaf.scale.setScalar(0.62 + random() * 0.18);
    }
    leaf.castShadow = true;
    disableRaycast(leaf);
    pivot.add(leaf);
  }
}

function createGenerosityShoot(options: {
  units: 4 | 6 | 1 | 2;
  origin: THREE.Vector3;
  random: () => number;
  bark: THREE.Material;
  geometries: Set<THREE.BufferGeometry>;
}): { group: THREE.Group } {
  const group = new THREE.Group();
  group.name = "Generosity shoot";
  const length = options.units >= 6 ? 0.12 : 0.08;
  const start = options.origin.clone();
  const yaw = options.random() * Math.PI * 2;
  const end = start
    .clone()
    .add(
      new THREE.Vector3(
        Math.cos(yaw) * length,
        length * 0.42,
        Math.sin(yaw) * length,
      ),
    );
  const mid = start.clone().lerp(end, 0.52).add(new THREE.Vector3(0, 0.012, 0));
  const curve = new THREE.CatmullRomCurve3([start, mid, end]);
  const geometry = new THREE.TubeGeometry(
    curve,
    6,
    options.units >= 6 ? 0.013 : 0.009,
    6,
    false,
  );
  options.geometries.add(geometry);
  const mesh = new THREE.Mesh(geometry, options.bark);
  mesh.name = "Generosity wood";
  mesh.castShadow = true;
  disableRaycast(mesh);
  group.add(mesh);
  disableRaycast(group);
  return { group };
}

function addSproutBase(
  root: THREE.Group,
  rootSeed: string,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
): void {
  const huskMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.7,
    metalness: 0.04,
    vertexColors: true,
  });
  materials.add(huskMaterial);
  const stone = createCherryStoneGeometry();
  geometries.add(stone);
  const left = new THREE.Mesh(stone, huskMaterial);
  left.name = "Sprout husk left";
  left.position.set(-0.045, 0.06, 0.01);
  left.rotation.set(0.4, 0.2, 1.15);
  left.scale.set(0.52, 0.42, 0.38);
  const right = new THREE.Mesh(stone, huskMaterial);
  right.name = "Sprout husk right";
  right.position.set(0.05, 0.055, -0.015);
  right.rotation.set(-0.25, -0.15, -1.05);
  right.scale.set(0.48, 0.38, 0.34);
  disableRaycast(left);
  disableRaycast(right);
  root.add(left, right);

  const threadMaterial = new THREE.MeshStandardMaterial({
    color: "#6a5848",
    roughness: 0.92,
    metalness: 0,
  });
  materials.add(threadMaterial);
  // A short flare so the first shoot meets the soil instead of standing like a stake.
  const collarProfile = [
    new THREE.Vector2(0.012, 0.16),
    new THREE.Vector2(0.028, 0.1),
    new THREE.Vector2(0.046, 0.045),
    new THREE.Vector2(0.058, 0.012),
    new THREE.Vector2(0.034, 0),
  ];
  const collar = new THREE.LatheGeometry(collarProfile, 14);
  geometries.add(collar);
  const collarMesh = new THREE.Mesh(collar, threadMaterial);
  collarMesh.name = "Sprout collar";
  collarMesh.castShadow = true;
  collarMesh.receiveShadow = true;
  disableRaycast(collarMesh);
  root.add(collarMesh);
  const threadCount = 2 + (hashText(`${rootSeed}|radicle`) % 2);
  for (let index = 0; index < threadCount; index += 1) {
    const angle = -0.4 + index * 1.35 + hashText(`${rootSeed}|thread|${index}`) * 0.000001;
    const reach = 0.16 + (index % 2) * 0.06;
    const start = new THREE.Vector3(0, 0.03, 0);
    const end = new THREE.Vector3(
      Math.cos(angle) * reach,
      -0.01,
      Math.sin(angle) * reach,
    );
    const geometry = createRootButtressGeometry(start, end, 0.012, 0.003);
    geometries.add(geometry);
    const thread = new THREE.Mesh(geometry, threadMaterial);
    thread.name = `Sprout root thread ${index + 1}`;
    thread.castShadow = true;
    disableRaycast(thread);
    root.add(thread);
  }
}

export function createLivingSakuraModel(
  options: LivingSakuraModelOptions,
): LivingSakuraModel {
  const structureOnly = options.structureOnly === true;
  const requestedCount = Math.max(0, Math.floor(options.journalCount));
  const memoryInputs = options.memories
    ? [...options.memories]
    : syntheticMemories(requestedCount, options.newestGrowthUnits ?? 1);
  const journalCount = memoryInputs.length;
  const ledger = createLivingDevelopmentLedger(options.rootSeed, memoryInputs);
  const activeProjection = projectActiveMemoryMarkers(ledger.developments, {
    limit: ACTIVE_MEMORY_HIT_LIMIT,
    selectedEntryIds: options.selectedEntryIds,
  });
  const youthChapter = isYouthChapter(journalCount);
  // Mid-life and mature share the same append-only graph. Youth is only a
  // bark/husk/leaf dressing of that same stem — never a remesh.
  const lifeChapter = journalCount >= 12;
  const lifelongSegments =
    journalCount > 0
      ? buildLifelongSakuraSegments(options.rootSeed, journalCount)
      : [];
  const topology = {
    segments: lifelongSegments,
    explicitCapacity: Math.max(lifelongSegments.length, journalCount),
    protectedWindows: createLifelongProtectedWindows(lifelongSegments),
  };
  const renderSegments: readonly LivingSakuraSegment[] = topology.segments;
  const stableRenderSegments: readonly LivingSakuraSegment[] = renderSegments;
  const productionSpurs = planLivingFloweringSpurs({
    rootSeed: options.rootSeed,
    segments: renderSegments,
    journalCount,
  });
  const root = new THREE.Group();
  root.name = "Living Sakura v2";
  const enduringExpansion = Math.min(
    0.08,
    Math.log1p(Math.max(0, journalCount - 192)) * 0.011,
  );
  if (journalCount < 192) {
    // Lifelong wood is already world-scale. Only enduring seasons add a
    // gentle expansion so 1,000 journals still feel older than 192.
    root.scale.set(1, 1, 1);
    root.position.y = 0;
  } else {
    root.scale.set(
      1 + enduringExpansion,
      1 + enduringExpansion * 0.42,
      1 + enduringExpansion,
    );
  }
  const pivots: LivingSakuraPivot[] = [];
  const disposableGeometries = new Set<THREE.BufferGeometry>();
  const disposableMaterials = new Set<THREE.Material>();
  const pivotBySegmentId = new Map<string, THREE.Group>();
  const segmentById = new Map(renderSegments.map((segment) => [segment.id, segment]));
  const age = Math.log1p(Math.max(0, journalCount - topology.explicitCapacity));
  // Cool taupe base — multi-tone variation lives in vertex colors (not muddy #725849 alone).
  const barkAgeDarken = Math.min(0.08, age * 0.007);
  const barkBase = new THREE.Color("#7a6e62").offsetHSL(0, -0.015, -barkAgeDarken);
  // Solid bark for meshes without a color attribute (flare, enduring shoots).
  const bark = new THREE.MeshStandardMaterial({
    color: barkBase,
    roughness: 0.92,
    metalness: 0.015,
    flatShading: false,
    side: THREE.DoubleSide,
    envMapIntensity: 0.28,
  });
  disposableMaterials.add(bark);
  // Matte continuous bark — vertex color carries lenticels, not plastic sheen.
  const softBark = new THREE.MeshStandardMaterial({
    color: "#c4b3a2",
    roughness: 0.72,
    metalness: 0.02,
    flatShading: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.42,
  });
  disposableMaterials.add(softBark);
  // Outer lace still cool/taupe but thicker plate material (not wire-thin plastic).
  const fineBark = new THREE.MeshStandardMaterial({
    color: "#cfc0b0",
    roughness: 0.8,
    metalness: 0.02,
    flatShading: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.36,
  });
  disposableMaterials.add(fineBark);
  const youthBark = new THREE.MeshStandardMaterial({
    color: "#d2c2b2",
    roughness: 0.8,
    metalness: 0.02,
    vertexColors: true,
    side: THREE.DoubleSide,
    envMapIntensity: 0.48,
  });
  disposableMaterials.add(youthBark);

  // Root tips sit at y→0 so they widen from the trunk and disappear into the ground.
  // No dodecahedron "root ball" prop — continuous buttress flare only (screenshot killer).
  const rootRibTargets = [
    [-0.82, 0, 0.34],
    [0.76, 0, 0.4],
    [-0.48, 0, -0.56],
    [0.5, 0, -0.5],
    [-0.9, 0, -0.12],
    [0.88, 0, -0.08],
  ] as const;
  // Youth still needs a grounded collar — scale buttresses with life chapter.
  const youthRootScale =
    journalCount < 12 ? 0.72 + (journalCount / 12) * 0.28 : 1;
  let seedKernel: THREE.Group | null = null;
  if (journalCount === 0) {
    seedKernel = createSeedKernelGroup(
      disposableGeometries,
      disposableMaterials,
    );
    root.add(seedKernel);
  } else if (youthChapter) {
    addSproutBase(
      root,
      options.rootSeed,
      disposableGeometries,
      disposableMaterials,
    );
  } else {
    // Soft continuous flare pads — never a separate ball or pointed feet.
    // Chapter-true counts: sapling 3–4, young/mature 4.
    const trunkSegment = renderSegments.find(
      (segment) => segment.role === "trunk",
    );
    const boleRadius = trunkSegment
      ? presentationRadiusAt(trunkSegment, 0)
      : 0.07;
    const chapterRootCount =
      journalCount < 48 ? (journalCount < 30 ? 3 : 4) : 4;
    const chapterReach =
      journalCount < 48 ? 0.2 : journalCount < 96 ? 0.26 : 0.3;
    rootRibTargets.slice(0, chapterRootCount).forEach((target, index) => {
      const yaw = Math.atan2(target[2], target[0]);
      const emerge = boleRadius * 0.42 * youthRootScale;
      const start = new THREE.Vector3(
        Math.cos(yaw) * emerge,
        Math.max(0.034, boleRadius * 0.2),
        Math.sin(yaw) * emerge,
      );
      const end = new THREE.Vector3(
        target[0] * youthRootScale * chapterReach,
        0,
        target[2] * youthRootScale * chapterReach,
      );
      const startR = boleRadius * (0.78 - index * 0.07) * youthRootScale;
      const endR = startR * 0.46;
      const geometry = createRootButtressGeometry(
        start,
        end,
        startR,
        endR,
      );
      disposableGeometries.add(geometry);
      const rib = new THREE.Mesh(geometry, softBark);
      rib.name = `Surface root ${index + 1}`;
      rib.castShadow = true;
      rib.receiveShadow = true;
      disableRaycast(rib);
      root.add(rib);
    });
  }

  for (const segment of renderSegments) {
    const pivot = new THREE.Group();
    pivot.name = `Pivot ${segment.address.path}`;
    const parentSegment = segment.parentId
      ? segmentById.get(segment.parentId)
      : undefined;
    if (parentSegment && pivotBySegmentId.has(parentSegment.id)) {
      const local = toVector(segment.start).sub(toVector(parentSegment.start));
      pivot.position.copy(local);
      pivotBySegmentId.get(parentSegment.id)!.add(pivot);
    } else {
      pivot.position.copy(toVector(segment.start));
      root.add(pivot);
    }
    const parentRadiusAtJoin = parentSegment
      ? presentationRadiusAt(parentSegment, segment.attachmentT)
      : undefined;
    const geometry = createTaperedBranchGeometry(segment, parentRadiusAtJoin);
    disposableGeometries.add(geometry);
    const woodMaterial = youthChapter
      ? youthBark
      : segment.role === "tertiary"
        ? fineBark
        : softBark;
    const mesh = new THREE.Mesh(geometry, woodMaterial);
    mesh.name = `Wood ${segment.address.path}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    disableRaycast(mesh);
    pivot.add(mesh);
    // Collars live in tapered ring geometry (createTaperedBranchGeometry), not
    // separate sphere beads — beads read as dark tumors on structure stills.
    pivotBySegmentId.set(segment.id, pivot);
    pivots.push({
      segmentId: segment.id,
      group: pivot,
      order: segment.order,
      depthLayer: segment.depthLayer,
      phase: (hashText(`${options.rootSeed}:${segment.id}`) % 628) / 100,
      side: Math.sign(segment.end[0] - segment.start[0]) || 1,
    });
  }

  const terminalSegments = renderSegments.filter(
    (segment) => segment.role === "tertiary",
  );
  const organSegments = youthChapter
    ? topology.segments
    : terminalSegments.length > 0
      ? terminalSegments
      : topology.segments;
  const stableOrganSegments = youthChapter
    ? stableRenderSegments.filter(
        (segment) => segment.role === "primary" || segment.role === "trunk",
      )
    : lifeChapter
      ? stableRenderSegments.filter(
          (segment) =>
            segment.role === "tertiary" ||
            segment.role === "secondary" ||
            (journalCount >= 48 && segment.role === "primary"),
        )
      : stableRenderSegments.filter((segment) => segment.role === "tertiary");
  const enduringShootCount = Math.min(
    24,
    Math.floor(Math.sqrt(Math.max(0, journalCount - 192) / 3)),
  );
  /** Segment-local tips so care flowers can inherit tertiary pivot sway. */
  const enduringShootTips: Array<{
    segmentId: string;
    tipLocal: THREE.Vector3;
  }> = [];
  if (terminalSegments.length > 0 && enduringShootCount > 0) {
    const shootRandom = randomFor(`${options.rootSeed}:enduring-shoots`);
    for (let index = 0; index < enduringShootCount; index += 1) {
      const parent = terminalSegments[index % terminalSegments.length];
      const host = pivotBySegmentId.get(parent.id);
      // Segment-local tip: end of parent wood + outward growth gesture.
      const localEnd = toVector(parent.end).sub(toVector(parent.start));
      const side = shootRandom() < 0.5 ? -1 : 1;
      const tipLocal = localEnd
        .clone()
        .add(
          new THREE.Vector3(
            side * (0.24 + shootRandom() * 0.36),
            0.28 + shootRandom() * 0.42,
            (shootRandom() - 0.5) * 0.48,
          ),
        );
      const mid = localEnd
        .clone()
        .lerp(tipLocal, 0.48)
        .add(new THREE.Vector3(side * 0.07, 0.08, 0));
      const curve = new THREE.CatmullRomCurve3([
        localEnd.clone(),
        mid,
        tipLocal.clone(),
      ]);
      const geometry = new THREE.TubeGeometry(
        curve,
        5,
        0.013 + shootRandom() * 0.007,
        5,
        false,
      );
      disposableGeometries.add(geometry);
      const shoot = new THREE.Mesh(geometry, bark);
      shoot.name = `Enduring care shoot ${index + 1}`;
      shoot.castShadow = true;
      disableRaycast(shoot);
      (host ?? root).add(shoot);
      enduringShootTips.push({ segmentId: parent.id, tipLocal });
    }
  }

  // Tertiary lace comes from topology densify (true wood segments), not extra
  // TubeGeometry twigs — thin tubes read as wire/X junk on structure stills.
  // Ambient (decorative) bloom densifies with each journal — memory petals are separate.
  // structureOnly (founder still-pack) zeroes floral mass so wood silhouette can be judged.
  const enduringBloom = Math.floor(
    Math.log1p(Math.max(0, journalCount - 192)) * 10,
  );
  const spurFlowerBudget = productionSpurs
    ? productionSpurs.sites.reduce(
        (total, site) =>
          total +
          (site.cluster?.flowers.length ?? 0) +
          (site.cluster?.halfOpen.length ?? 0),
        0,
      )
    : 0;
  // Mid/mature canopies need more than the raw spur recipe alone — fill tip umbels.
  // Youth is a flowering first-year cherry, never a barren stick waiting for year two.
  const ambientFloor =
    journalCount < 1
      ? 0
      : journalCount === 1
        ? 0
        : journalCount < 12
          ? 6 + journalCount
          : journalCount < 48
            ? 14 + Math.floor((journalCount - 12) * 0.5)
            : journalCount < 96
              ? 24 + Math.floor((journalCount - 48) * 0.3)
              : journalCount < 192
                ? 32 + Math.floor((journalCount - 96) * 0.15)
                : 40 + Math.min(24, enduringBloom);
  const ambientFlowerCount = structureOnly
    ? 0
    : organSegments.length
      ? Math.max(spurFlowerBudget, ambientFloor)
      : 0;
  // Spring leaves stay secondary to bloom, but youth must look leafy.
  const leafCount = structureOnly
    ? 0
    : youthChapter
      ? 0
      : organSegments.length
        ? Math.max(
            Math.floor(ambientFlowerCount * 0.12),
            journalCount < 48 ? 14 : 8,
          )
        : 0;
  const budCount = structureOnly
    ? 0
    : organSegments.length
      ? productionSpurs
        ? productionSpurs.sites.reduce(
            (total, site) => total + (site.cluster?.buds.length ?? 0),
            0,
          )
        : Math.floor(ambientFlowerCount * 0.18)
      : 0;
  const activeMemoryCount = structureOnly
    ? 0
    : activeProjection.activeMarkers.length;

  const flowerGeometry = createFlowerGeometry();
  const halfOpenGeometry = createHalfOpenFlowerGeometry();
  const centerGeometry = createStamenClusterGeometry();
  const leafGeometry = createLeafGeometry();
  const budGeometry = createBudGeometry();
  const pedicelGeometry = new THREE.CylinderGeometry(0.009, 0.013, 0.15, 5);
  disposableGeometries.add(flowerGeometry);
  disposableGeometries.add(halfOpenGeometry);
  disposableGeometries.add(centerGeometry);
  disposableGeometries.add(leafGeometry);
  disposableGeometries.add(budGeometry);
  disposableGeometries.add(pedicelGeometry);
  // Soft petals — pale blush ramp, readable from both sides.
  const palePetal = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.58,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: "#f7d6dc",
    emissiveIntensity: 0.035,
  });
  const rosePetal = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.52,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: "#f0c4ce",
    emissiveIntensity: 0.06,
  });
  // Journal memory petals — luminous and larger so they read as touchable history.
  const memoryPetal = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.48,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: "#ffd0dc",
    emissiveIntensity: 0.08,
  });
  const halfOpenPetal = new THREE.MeshStandardMaterial({
    color: PALE_BLUSH.mid,
    roughness: 0.74,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide,
    emissive: "#e8a8b8",
    emissiveIntensity: 0.1,
  });
  const flowerCenter = new THREE.MeshStandardMaterial({
    color: "#c6a15a",
    roughness: 0.46,
    metalness: 0.02,
    emissive: "#8a6a32",
    emissiveIntensity: 0.08,
    flatShading: false,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#7a8458",
    roughness: 0.84,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide,
  });
  const budMaterial = new THREE.MeshStandardMaterial({
    color: "#c86f91",
    roughness: 0.78,
    flatShading: false,
  });
  const pedicelMaterial = new THREE.MeshStandardMaterial({
    color: "#6e5a4a",
    roughness: 0.88,
    flatShading: false,
  });
  const canopyUnderlayMaterial = new THREE.MeshBasicMaterial({
    color: "#f3cfd8",
    transparent: true,
    opacity: journalCount >= 192 ? 0.16 : 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  [
    palePetal,
    rosePetal,
    memoryPetal,
    halfOpenPetal,
    flowerCenter,
    leafMaterial,
    budMaterial,
    pedicelMaterial,
    canopyUnderlayMaterial,
  ].forEach((material) => disposableMaterials.add(material));

  const organRandom = randomFor(`${options.rootSeed}:ambient`);
  const organOffset =
    stableOrganSegments.length > 0
      ? hashText(`${options.rootSeed}:ambient-offset`) % stableOrganSegments.length
      : 0;
  const flowerPlacements: OrganInstancePlacement[] = [];
  const halfOpenPlacements: OrganInstancePlacement[] = [];
  const centerPlacements: OrganInstancePlacement[] = [];
  const pedicelPlacements: OrganInstancePlacement[] = [];
  const budPlacements: OrganInstancePlacement[] = [];
  const leafPlacements: OrganInstancePlacement[] = [];
  if (youthChapter && !structureOnly) {
    addYouthLeaves(
      root,
      renderSegments,
      pivotBySegmentId,
      leafGeometry,
      leafMaterial,
      options.rootSeed,
      journalCount,
    );
  }

  const resolveHostSegment = (
    segmentId: string,
  ): LivingSakuraSegment | undefined =>
    segmentById.get(segmentId) ??
    stableRenderSegments.find((segment) => segment.id === segmentId);

  // structureOnly skips all floral mass (including production spur umbels).
  if (productionSpurs && !structureOnly) {
    for (const site of productionSpurs.sites) {
      if (!site.cluster) continue;
      const host = resolveHostSegment(site.segmentId);
      if (!host) continue;
      const anchorWorld = toVector(site.worldAnchor);
      const anchorLocal = worldToSegmentLocal(anchorWorld, host);
      const tipDelta = worldToSegmentLocal(toVector(host.end), host).sub(
        anchorLocal,
      );
      const tipBiasLen = tipDelta.length();
      const tipShift =
        tipBiasLen > 1e-5
          ? tipDelta.multiplyScalar(
              Math.min(SPUR_TIP_BIAS, tipBiasLen * 0.35) / tipBiasLen,
            )
          : new THREE.Vector3();

      for (const flower of site.cluster.flowers) {
        const localOffset = toVector(flower.localCenter);
        const position = anchorLocal.clone().add(localOffset).add(tipShift);
        const rotation = umbelOrientation(
          site.frame,
          flower.tiltDegrees,
          flower.radialOffsetDegrees,
          organRandom() * Math.PI * 2,
        );
        const lateral = flower.scale * AMBIENT_FLOWER_BASE_SCALE * SPUR_UMBEL_SCALE;
        // Recipe cupDepth deepens the bowl along Z without changing canopy footprint.
        const cupZ = lateral * (0.85 + flower.cupDepth * 4.2);
        const scale = new THREE.Vector3(lateral, lateral, cupZ);
        const tone = organRandom();
        const color = new THREE.Color(
          tone < 0.2
            ? "#f4e4e6"
            : tone < 0.55
              ? "#fff4f2"
              : tone < 0.82
                ? "#fff8f6"
                : "#fffdfb",
        );
        flowerPlacements.push({
          segmentId: host.id,
          position,
          rotation,
          scale,
          color,
        });
        centerPlacements.push({
          segmentId: host.id,
          position: position.clone().lerp(anchorLocal, 0.28),
          rotation,
          scale: lateral * 0.82,
        });
        // Every open flower rides a short pedicel from the spur anchor.
        pedicelPlacements.push({
          segmentId: host.id,
          position: anchorLocal.clone(),
          rotation: new THREE.Euler(position.x, position.y, position.z),
          scale: 0.0075,
        });
      }

      for (const bud of site.cluster.buds) {
        const position = anchorLocal.clone().add(toVector(bud.localCenter)).add(tipShift);
        const rotation = new THREE.Euler(
          (organRandom() - 0.5) * 0.42,
          (organRandom() - 0.5) * 0.56,
          organRandom() * Math.PI * 2,
        );
        // Opening scales the bud slightly so tighter buds read smaller.
        const budScale = bud.scale * (0.82 + bud.opening * 0.35);
        budPlacements.push({
          segmentId: host.id,
          position,
          rotation,
          scale: new THREE.Vector3(
            budScale * 0.9,
            budScale * (1.05 + bud.opening * 0.2),
            budScale * 0.9,
          ),
        });
        pedicelPlacements.push({
          segmentId: host.id,
          position: anchorLocal.clone(),
          rotation: new THREE.Euler(position.x, position.y, position.z),
          scale: 0.0065,
        });
      }

      for (const half of site.cluster.halfOpen) {
        const localOffset = toVector(half.localCenter);
        const position = anchorLocal.clone().add(localOffset).add(tipShift);
        const rotation = umbelOrientation(
          site.frame,
          half.tiltDegrees,
          (organRandom() - 0.5) * 10,
          organRandom() * Math.PI * 2,
        );
        const lateral = half.scale * AMBIENT_FLOWER_BASE_SCALE * SPUR_HALF_OPEN_SCALE;
        // Opening stretches the half-open cup so more-open ones flare wider.
        const openZ = lateral * (0.9 + half.opening * 0.55);
        halfOpenPlacements.push({
          segmentId: host.id,
          position,
          rotation,
          scale: new THREE.Vector3(
            lateral * (0.85 + half.opening * 0.25),
            lateral * (0.85 + half.opening * 0.25),
            openZ,
          ),
          color: new THREE.Color(
            organRandom() < 0.45 ? PALE_BLUSH.rose : PALE_BLUSH.mid,
          ),
        });
        pedicelPlacements.push({
          segmentId: host.id,
          position: anchorLocal.clone(),
          rotation: new THREE.Euler(position.x, position.y, position.z),
          scale: 0.007,
        });
      }

      // Authored recipe pedicels add radius variation on top of per-organ stems.
      for (const pedicel of site.cluster.pedicels) {
        const start = anchorLocal.clone().add(toVector(pedicel.localStart));
        const end = anchorLocal.clone().add(toVector(pedicel.localEnd));
        pedicelPlacements.push({
          segmentId: host.id,
          position: start,
          rotation: new THREE.Euler(end.x, end.y, end.z),
          scale: pedicel.radius,
        });
      }
    }
  }
  // Decorative singles only before the crown can carry tip umbels.
  // At 96+ the flowering shell is tip umbels + spaced memory petals — no foam fill.
  if (journalCount < 96 && (!productionSpurs || journalCount >= 192)) {
    let attempts = 0;
    const fillHosts = (
      youthChapter
        ? renderSegments.filter(
            (segment) =>
              segment.role === "primary" && pivotBySegmentId.has(segment.id),
          )
        : lifeChapter
          ? renderSegments.filter(
              (segment) =>
                (segment.role === "tertiary" ||
                  segment.role === "secondary" ||
                  segment.role === "primary") &&
                pivotBySegmentId.has(segment.id),
            )
          : organSegments.length > 0
            ? organSegments
            : stableOrganSegments
    ).filter((segment) => pivotBySegmentId.has(segment.id));
    const organSpread =
      journalCount < 12 ? 0.018 : journalCount < 48 ? 0.028 : 0.04;
    while (
      flowerPlacements.length < ambientFlowerCount &&
      attempts < ambientFlowerCount * 8 &&
      fillHosts.length > 0
    ) {
      attempts += 1;
      const segment =
        fillHosts[(organOffset + attempts * 37) % fillHosts.length];
      if (!pivotBySegmentId.has(segment.id) && !segmentById.has(segment.id)) {
        continue;
      }
      const world = makeOrganPlacement(segment, organRandom, organSpread);
      if (insideProtectedWindow(world, topology.protectedWindows)) continue;
      const position = worldToSegmentLocal(world, segment);
      const rotation = new THREE.Euler(
        (organRandom() - 0.5) * 0.55,
        (organRandom() - 0.5) * 0.75,
        organRandom() * Math.PI * 2,
      );
      const scale =
        AMBIENT_FLOWER_BASE_SCALE *
        (journalCount < 12
          ? 0.34 + organRandom() * 0.08
          : journalCount < 48
            ? 0.48 + organRandom() * 0.1
            : journalCount < 96
              ? 0.54 + organRandom() * 0.1
              : 0.58 + organRandom() * 0.1);
      const colorChoice = organRandom();
      flowerPlacements.push({
        segmentId: segment.id,
        position,
        rotation,
        scale,
        color: new THREE.Color(
          colorChoice < 0.18
            ? "#f3e2e4"
            : colorChoice < 0.52
              ? "#fff3f1"
              : colorChoice < 0.8
                ? "#fff7f5"
                : "#fffdfb",
        ),
      });
      centerPlacements.push({
        segmentId: segment.id,
        position: position.clone().add(new THREE.Vector3(0, 0, 0.022)),
        rotation,
        scale,
      });
      // Short pedicel from tip wood out to the open flower.
      const woodAttach = worldToSegmentLocal(
        toVector(sampleLivingSakuraSegment(segment, 0.94)),
        segment,
      );
      pedicelPlacements.push({
        segmentId: segment.id,
        position: woodAttach,
        rotation: new THREE.Euler(position.x, position.y, position.z),
        scale: 0.0065,
      });
    }
  }

  // Terminal umbels — compact clusters on flowering tips (not foam clouds).
  // Production spurs dress the mid canopy; the vase silhouette still needs
  // tip tufts on the sweep and both leaders or those limbs stay bare.
  const signatureTerminals = structureOnly
    ? []
    : renderSegments.filter(
        (segment) =>
          pivotBySegmentId.has(segment.id) &&
          journalCount >= 48 &&
          (segment.signature === "low-sweeping-bough" ||
            segment.role === "leader"),
      );
  const floweringTerminals = (
    productionSpurs
      ? signatureTerminals
      : stableOrganSegments.length > 0
        ? stableOrganSegments
        : organSegments
  ).filter((segment) => {
    if (!pivotBySegmentId.has(segment.id)) return false;
    // Journal 1 is one memory blossom on the shoot — no extra umbel kebab.
    if (journalCount < 2) return false;
    if (journalCount < 12) {
      return segment.role === "primary";
    }
    if (
      segment.signature === "low-sweeping-bough" ||
      segment.role === "leader"
    ) {
      return journalCount >= 48;
    }
    if (productionSpurs) return false;
    if (journalCount >= 96) {
      const chance =
        segment.role === "tertiary" ? 62 : segment.role === "secondary" ? 28 : 0;
      return (
        chance > 0 &&
        hashText(`${options.rootSeed}:flowering-terminal:${segment.id}`) % 100 <
          chance
      );
    }
    if (segment.role !== "tertiary" && segment.role !== "secondary") {
      return false;
    }
    return (
      hashText(`${options.rootSeed}:flowering-terminal:${segment.id}`) % 100 <
      (journalCount >= 48 ? 58 : 72)
    );
  });
  const terminalRandom = randomFor(`${options.rootSeed}:terminal-umbels`);
  for (const segment of floweringTerminals) {
    const flowersInUmbel = journalCount < 12
      ? 2 + (hashText(`${options.rootSeed}:umbel:${segment.id}`) % 2)
      : journalCount < 48
        ? 2 + (hashText(`${options.rootSeed}:umbel:${segment.id}`) % 2)
        : segment.signature === "low-sweeping-bough" ||
            segment.role === "leader"
          ? 4
          : 3;
    const tipLocal = worldToSegmentLocal(toVector(segment.end), segment);
    for (let index = 0; index < flowersInUmbel; index += 1) {
      const angle =
        (index / flowersInUmbel) * Math.PI * 2 + terminalRandom() * 0.35;
      const radius =
        journalCount < 12
          ? index === 0
            ? 0.012
            : 0.016 + terminalRandom() * 0.01
          : index === 0
            ? 0.022
            : 0.04 + terminalRandom() * 0.018;
      const position = tipLocal.clone().add(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0.01 + Math.sin(angle) * radius * 0.35,
          Math.sin(angle * 1.3) * radius * 0.4,
        ),
      );
      flowerPlacements.push({
        segmentId: segment.id,
        position,
        rotation: new THREE.Euler(
          journalCount < 12 ? -0.55 : (terminalRandom() - 0.5) * 0.45,
          journalCount < 12 ? 0.15 : (terminalRandom() - 0.5) * 0.6,
          angle,
        ),
        scale:
          AMBIENT_FLOWER_BASE_SCALE *
          (journalCount < 12
            ? 0.36 + terminalRandom() * 0.08
            : journalCount < 48
              ? 0.48 + terminalRandom() * 0.1
              : journalCount < 96
                ? 0.58 + terminalRandom() * 0.08
                : 0.62 + terminalRandom() * 0.1),
        color: (() => {
          const tone = terminalRandom();
          return new THREE.Color(
            tone < 0.25
              ? "#f6e6e8"
              : tone < 0.55
                ? "#fff4f2"
                : "#fffaf8",
          );
        })(),
      });
      if (journalCount >= 3) {
        pedicelPlacements.push({
          segmentId: segment.id,
          position: tipLocal.clone(),
          rotation: new THREE.Euler(position.x, position.y, position.z),
          scale: 0.0058,
        });
      }
    }
    // Occasional half-open companion on the same terminal spur.
    if (
      hashText(`${options.rootSeed}:umbel-half:${segment.id}`) % 100 <
      (journalCount >= 96 ? 22 : 28)
    ) {
      const halfAngle = terminalRandom() * Math.PI * 2;
      const halfPos = tipLocal.clone().add(
        new THREE.Vector3(
          Math.cos(halfAngle) * 0.018,
          0.01,
          Math.sin(halfAngle) * 0.016,
        ),
      );
      halfOpenPlacements.push({
        segmentId: segment.id,
        position: halfPos,
        rotation: new THREE.Euler(
          (terminalRandom() - 0.5) * 0.35,
          (terminalRandom() - 0.5) * 0.45,
          halfAngle,
        ),
        scale: AMBIENT_FLOWER_BASE_SCALE * (0.7 + terminalRandom() * 0.18),
        color: new THREE.Color(PALE_BLUSH.mid),
      });
    }
  }

  const crownTips =
    journalCount >= 24 && journalCount < 96 && !productionSpurs
      ? stableRenderSegments.filter(
          (segment) =>
            (segment.role === "primary" ||
              segment.role === "leader" ||
              (journalCount >= 48 && segment.role === "secondary")) &&
            pivotBySegmentId.has(segment.id),
        )
      : [];
  if (crownTips.length > 0) {
    const tipRandom = randomFor(`${options.rootSeed}:crown-tip-flowers`);
    for (const segment of crownTips) {
      const tipLocal = worldToSegmentLocal(toVector(segment.end), segment);
      const tipCount =
        (journalCount >= 96 ? 5 : 3) +
        (hashText(`${options.rootSeed}:crown-tip:${segment.id}`) % 3);
      for (let localIndex = 0; localIndex < tipCount; localIndex += 1) {
        const angle = (localIndex / tipCount) * Math.PI * 2 + tipRandom() * 0.3;
        const position = tipLocal.clone().add(
          new THREE.Vector3(
            Math.cos(angle) * (0.014 + tipRandom() * 0.008),
            0.008 + Math.sin(angle) * 0.006,
            Math.sin(angle) * (0.012 + tipRandom() * 0.006),
          ),
        );
        flowerPlacements.push({
          segmentId: segment.id,
          position,
          rotation: new THREE.Euler(0, 0, angle),
          scale:
            AMBIENT_FLOWER_BASE_SCALE *
            (journalCount >= 96 ? 0.62 : 0.72) *
            (1.0 + tipRandom() * 0.14),
          color: new THREE.Color(
            tipRandom() < 0.4 ? PALE_BLUSH.soft : PALE_BLUSH.white,
          ),
        });
      }
    }
  }

  // Enduring care flowers ride tertiary pivots with their shoots.
  if (enduringShootTips.length > 0) {
    const careRandom = randomFor(`${options.rootSeed}:enduring-flowers`);
    const carePlacements: OrganInstancePlacement[] = [];
    for (const tip of enduringShootTips) {
      for (let index = 0; index < 3; index += 1) {
        carePlacements.push({
          segmentId: tip.segmentId,
          position: tip.tipLocal
            .clone()
            .add(
              new THREE.Vector3(
                (careRandom() - 0.5) * 0.024,
                0.008 + (careRandom() - 0.5) * 0.012,
                (careRandom() - 0.5) * 0.024,
              ),
            ),
          rotation: new THREE.Euler(
            0,
            (careRandom() - 0.5) * 0.7,
            careRandom() * Math.PI * 2,
          ),
          scale: AMBIENT_FLOWER_BASE_SCALE * (1.1 + careRandom() * 0.35),
        });
      }
    }
    commitOrganInstances(
      flowerGeometry,
      palePetal,
      carePlacements,
      pivotBySegmentId,
      root,
      { castShadow: true, name: "Enduring care flowers" },
    );
  }

  commitOrganInstances(
    flowerGeometry,
    palePetal,
    flowerPlacements.filter((item) => item.segmentId !== "__root__"),
    pivotBySegmentId,
    root,
    { castShadow: true, name: "Ambient sakura flowers" },
  );
  commitOrganInstances(
    halfOpenGeometry,
    halfOpenPetal,
    halfOpenPlacements,
    pivotBySegmentId,
    root,
    { castShadow: true, name: "Half-open sakura flowers" },
  );
  commitOrganInstances(
    centerGeometry,
    flowerCenter,
    centerPlacements,
    pivotBySegmentId,
    root,
    { name: "Ambient flower centers" },
  );

  // Leaves with cheap spring copper / olive / ochre instance tint.
  const leafRandom = randomFor(`${options.rootSeed}:leaves`);
  const leafOffset =
    stableOrganSegments.length > 0
      ? hashText(`${options.rootSeed}:leaf-offset`) % stableOrganSegments.length
      : 0;
  let leafAttempts = 0;
  while (
    leafPlacements.length < leafCount &&
    leafAttempts < Math.max(leafCount * 6, 1) &&
    stableOrganSegments.length > 0
  ) {
    leafAttempts += 1;
    const segment =
      stableOrganSegments[
        (leafOffset + leafAttempts * 29) % stableOrganSegments.length
      ];
    if (!pivotBySegmentId.has(segment.id)) continue;
    const world = makeOrganPlacement(
      segment,
      leafRandom,
      journalCount < 48 ? 0.05 : 0.1,
    );
    const position = worldToSegmentLocal(world, segment);
    const tone = leafRandom();
    leafPlacements.push({
      segmentId: segment.id,
      position,
      rotation: new THREE.Euler(
        (leafRandom() - 0.5) * 0.7,
        (leafRandom() - 0.5) * 1.2,
        leafRandom() * Math.PI * 2,
      ),
      scale: 0.72 + leafRandom() * 0.46,
      color: new THREE.Color(
        tone < 0.28 ? "#a67c52" : tone < 0.58 ? "#6b7c3f" : "#7a8458",
      ),
    });
  }
  commitOrganInstances(
    leafGeometry,
    leafMaterial,
    leafPlacements,
    pivotBySegmentId,
    root,
    { name: "Spring leaves" },
  );

  const budRandom = randomFor(`${options.rootSeed}:buds`);
  const budOffset =
    stableOrganSegments.length > 0
      ? hashText(`${options.rootSeed}:bud-offset`) % stableOrganSegments.length
      : 0;
  if (!productionSpurs) {
    let budAttempts = 0;
    while (
      budPlacements.length < budCount &&
      budAttempts < Math.max(budCount * 6, 1) &&
      stableOrganSegments.length > 0
    ) {
      budAttempts += 1;
      const segment =
        stableOrganSegments[
          (budOffset + budAttempts * 31) % stableOrganSegments.length
        ];
      if (!pivotBySegmentId.has(segment.id)) continue;
      const world = makeOrganPlacement(
        segment,
        budRandom,
        journalCount < 48 ? 0.04 : 0.08,
      );
      const position = worldToSegmentLocal(world, segment);
      const rotation = new THREE.Euler(
        (budRandom() - 0.5) * 0.55,
        (budRandom() - 0.5) * 0.7,
        (budRandom() - 0.5) * 0.55,
      );
      budPlacements.push({
        segmentId: segment.id,
        position,
        rotation,
        scale: 0.62 + budRandom() * 0.28,
      });
      pedicelPlacements.push({
        segmentId: segment.id,
        position: position.clone().multiplyScalar(0.2),
        rotation: new THREE.Euler(position.x, position.y, position.z),
        scale: 0.008,
      });
    }
  }
  commitOrganInstances(
    budGeometry,
    budMaterial,
    budPlacements,
    pivotBySegmentId,
    root,
    { castShadow: true, name: "Sakura buds" },
  );

  // Pedicels: span from packed start→end (euler xyz holds end when used as recipe).
  if (pedicelPlacements.length > 0) {
    const bySegment = new Map<string, OrganInstancePlacement[]>();
    for (const placement of pedicelPlacements) {
      const list = bySegment.get(placement.segmentId);
      if (list) list.push(placement);
      else bySegment.set(placement.segmentId, [placement]);
    }
    for (const [segmentId, items] of bySegment) {
      const mesh = new THREE.InstancedMesh(
        pedicelGeometry,
        pedicelMaterial,
        items.length,
      );
      mesh.name = "Sakura pedicels";
      disableRaycast(mesh);
      items.forEach((item, index) => {
        const start = item.position;
        // Euler channels stash the pedicel end in local space.
        const end = new THREE.Vector3(
          item.rotation.x,
          item.rotation.y,
          item.rotation.z,
        );
        const hasPackedEnd = end.lengthSq() > 1e-8;
        if (hasPackedEnd) {
          const radius =
            typeof item.scale === "number" ? Math.max(item.scale, 0.005) : 0.008;
          setPedicelMatrix(mesh, index, start, end, radius);
        } else {
          // Fallback short stub under the organ.
          setOrganMatrix(
            mesh,
            index,
            start.clone().add(new THREE.Vector3(0, -0.04, 0)),
            new THREE.Euler(0, 0, 0),
            0.7,
          );
        }
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
      (pivotBySegmentId.get(segmentId) ?? root).add(mesh);
    }
  }

  const newestInput = structureOnly ? null : (memoryInputs.at(-1) ?? null);
  const historicalMarkers = structureOnly
    ? []
    : activeProjection.activeMarkers.filter(
        (marker) => marker.entryId !== newestInput?.entryId,
      );
  const historicalMemoryCount = historicalMarkers.length;
  const stageScaleXZ = journalCount < 192 ? 1 : 1 + enduringExpansion;
  // Display hosts come from the VISIBLE densified graph so petals always attach
  // to wood that exists. Stable botanical addresses still live in the ledger;
  // free-air remaps from mature phenotype → sparse youth were the float bug.
  const activeMemoryPlacements = planActiveMemoryPlacements(
    renderSegments.length > 0 ? renderSegments : stableRenderSegments,
    options.rootSeed,
    activeProjection.activeMarkers,
    stageScaleXZ,
  );

  const resolveVisibleHost = (
    segment: LivingSakuraSegment,
  ): LivingSakuraSegment => {
    let current: LivingSakuraSegment | undefined = segment;
    while (current && !pivotBySegmentId.has(current.id)) {
      current = current.parentId
        ? segmentById.get(current.parentId)
        : undefined;
    }
    if (current) return current;
    return renderSegments[renderSegments.length - 1] ?? segment;
  };

  /**
   * Host-local position for a memory blossom: bark surface + short pedicel.
   * When the botanical host is missing from the visible graph, re-seat at a
   * spur tip on the visible ancestor — never keep the orphan world coordinate.
   */
  const localOnVisibleHost = (
    botanical: MemoryPlacement,
    host: LivingSakuraSegment,
  ): THREE.Vector3 => {
    const hostStart = toVector(host.start);
    const sameHost =
      pivotBySegmentId.has(botanical.segment.id) &&
      botanical.segment.id === host.id;

    if (sameHost) {
      const frame = memoryBranchFrame(host, botanical.amount);
      const radius = livingSakuraRadiusAt(host, botanical.amount);
      const pedicel = radius + (botanical.ordinal < 12 ? 0.014 : 0.018);
      const slot =
        (hashText(`${options.rootSeed}:memory-slot:${botanical.entryId}`) %
          1000) /
          1000 -
        0.5;
      const spin =
        ((hashText(`${options.rootSeed}:memory-spin:${botanical.entryId}`) %
          97) /
          97 -
          0.5) *
        0.02;
      return frame.point
        .clone()
        .sub(hostStart)
        .addScaledVector(frame.tangent, slot * 0.02)
        .addScaledVector(frame.side, spin)
        .addScaledVector(frame.binormal, pedicel);
    }

    const entrySlot =
      (hashText(`${options.rootSeed}:memory-slot:${botanical.entryId}`) % 1000) /
      1000;
    const amount =
      host.role === "trunk" || host.role === "leader"
        ? 0.88 + entrySlot * 0.08
        : 0.8 + entrySlot * 0.16;
    const frame = memoryBranchFrame(host, amount);
    const radius = livingSakuraRadiusAt(host, amount);
    const pedicel = radius + (botanical.ordinal < 12 ? 0.014 : 0.02);
    return frame.point
      .clone()
      .sub(hostStart)
      .addScaledVector(frame.binormal, pedicel);
  };
  // Historical memory blossoms are pivot children (local matrices). A single
  // InstancedMesh under root is still recomposed in updateMemoryTransforms so
  // hit targets stay sibling-of-root while the canopy sways with wood.
  const memoryFlowers = new THREE.InstancedMesh(
    flowerGeometry,
    memoryPetal,
    Math.max(1, historicalMemoryCount),
  );
  memoryFlowers.name = "Historical memory blossoms";
  memoryFlowers.castShadow = true;
  // The invisible hit spheres own taps. The visible blossom must not steal them
  // and turn a click into a camera drag.
  disableRaycast(memoryFlowers);
  const memoryBindings: Array<{
    entryId: string;
    ordinal: number;
    botanicalAddress: string;
    instanceIndex: number;
    segmentId: string;
    pivot: THREE.Group;
    localMatrix: THREE.Matrix4;
    flowerIndex: number | null;
  }> = [];
  for (let index = 0; index < historicalMemoryCount; index += 1) {
    const marker = historicalMarkers[index];
    const memoryRandom = randomFor(`${options.rootSeed}:memory:${marker.entryId}`);
    const placement = activeMemoryPlacements.get(marker.entryId)!;
    const { segment } = placement;
    const rotation = new THREE.Euler(
      (memoryRandom() - 0.5) * 0.35,
      (memoryRandom() - 0.5) * 0.45,
      memoryRandom() * Math.PI * 2,
    );
    const boundHost = resolveVisibleHost(segment);
    const pivotGroup = pivotBySegmentId.get(boundHost.id) ?? root;
    const localPosition = localOnVisibleHost(placement, boundHost);
    const hostRadius = livingSakuraRadiusAt(boundHost, placement.amount);
    const memoryScale = memoryFlowerScaleForHost(marker.ordinal, hostRadius);
    const localMatrix = new THREE.Matrix4().compose(
      localPosition,
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(memoryScale, memoryScale, memoryScale * 1.12),
    );
    // Seed instance matrix in pivot-local space; updateMemoryTransforms
    // rewrites it into root space after composing pivot.matrixWorld.
    memoryFlowers.setMatrixAt(index, localMatrix);
    memoryFlowers.setColorAt(
      index,
      new THREE.Color(memoryRandom() < 0.4 ? "#ffe8ef" : "#fffaf8"),
    );
    memoryBindings.push({
      entryId: marker.entryId,
      ordinal: marker.ordinal,
      botanicalAddress: marker.location.locationKey,
      // Sequential hit index — must match InstancedMesh raycast instanceId.
      instanceIndex: index,
      // Stable botanical host id (complete phenotype) for address continuity.
      segmentId: segment.id,
      pivot: pivotGroup,
      localMatrix,
      flowerIndex: index,
    });
  }
  memoryFlowers.count = historicalMemoryCount;
  memoryFlowers.instanceMatrix.needsUpdate = true;
  if (memoryFlowers.instanceColor) memoryFlowers.instanceColor.needsUpdate = true;
  // Memory blossoms stay raycastable as a secondary path; hit spheres are primary.
  root.add(memoryFlowers);

  const surroundingPlacements: OrganInstancePlacement[] = [];
  // At most 3 companions per historical memory, and 96 placements in the canopy.
  const companionsPerMemory = 3;
  const companionPlacementLimit = 96;
  for (const marker of historicalMarkers) {
    if (surroundingPlacements.length >= companionPlacementLimit) break;
    const development = ledger.byEntryId[marker.entryId];
    const memory = activeMemoryPlacements.get(marker.entryId)!;
    const surroundingRandom = randomFor(
      `${options.rootSeed}:surrounding:${marker.entryId}`,
    );
    const hostSegment =
      pivotBySegmentId.has(memory.segment.id)
        ? memory.segment
        : memory.segment.parentId &&
            pivotBySegmentId.has(memory.segment.parentId)
          ? (segmentById.get(memory.segment.parentId) ?? memory.segment)
          : memory.segment;
    const localBase = pivotBySegmentId.has(hostSegment.id)
      ? worldToSegmentLocal(memory.position, hostSegment)
      : memory.position.clone();
    const companionBudget = Math.min(
      companionsPerMemory,
      development.surrounding.persistentChangeCount,
    );
    for (
      let localIndex = 0;
      localIndex < companionBudget &&
      surroundingPlacements.length < companionPlacementLimit;
      localIndex += 1
    ) {
      const angle =
        (localIndex / development.surrounding.persistentChangeCount) *
          Math.PI *
          2 +
        surroundingRandom() * 0.5;
      const radius =
        marker.ordinal < 12
          ? 0.011 + surroundingRandom() * 0.006
          : 0.016 + surroundingRandom() * 0.008;
      surroundingPlacements.push({
        segmentId: hostSegment.id,
        position: localBase.clone().add(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            0.006 + Math.sin(angle) * radius * 0.25,
            Math.sin(angle) * radius,
          ),
        ),
        rotation: new THREE.Euler(0, 0, angle),
        scale: AMBIENT_FLOWER_BASE_SCALE * (0.55 + surroundingRandom() * 0.28),
        color: (() => {
          const tone = surroundingRandom();
          return new THREE.Color(
            tone < 0.28
              ? "#fff1ef"
              : tone < 0.65
                ? "#fff7f5"
                : "#fffdfb",
          );
        })(),
      });
    }
  }
  commitOrganInstances(
    flowerGeometry,
    palePetal,
    surroundingPlacements,
    pivotBySegmentId,
    root,
    { name: "Memory surrounding blossoms" },
  );

  let newestMemory: THREE.Group | null = null;
  let newestRestPosition: THREE.Vector3 | null = null;
  let ceremonyWoodSegmentId: string | null = null;
  const ceremonyOrganTargets: LivingCeremonyOrganTarget[] = [];
  let ceremonyPathSegmentIds: string[] = [];
  if (newestInput) {
    const newestRandom = randomFor(
      `${options.rootSeed}:memory:${newestInput.entryId}`,
    );
    // Prefer the packed active placement; fall back if newest is outside the
    // active projection (selected-only windows can omit the latest entry).
    const placement =
      activeMemoryPlacements.get(newestInput.entryId) ??
      memoryPosition(
        stableRenderSegments,
        options.rootSeed,
        newestInput.entryId,
        newestInput.ordinal,
      );
    const { segment } = placement;
    newestMemory = new THREE.Group();
    newestMemory.name = "Newest memory blossom";
    const hostSegment = resolveVisibleHost(segment);
    const newestPivot = pivotBySegmentId.get(hostSegment.id) ?? root;
    newestMemory.position.copy(localOnVisibleHost(placement, hostSegment));
    newestRestPosition = newestMemory.position.clone();
    const newestPetal = rosePetal.clone();
    newestPetal.transparent = true;
    const newestFlower = new THREE.Mesh(flowerGeometry, newestPetal);
    newestFlower.rotation.set(0, 0, newestRandom() * Math.PI * 2);
    // Equal-beauty memory on bark + pedicel — never a giant free-float petal.
    const newestHostRadius = livingSakuraRadiusAt(
      hostSegment,
      placement.amount,
    );
    const newestScale = memoryFlowerScaleForHost(
      newestInput.ordinal,
      newestHostRadius,
    );
    // Keep the authored cup. Flattening Z toward 0.55 reads as a disc.
    newestFlower.scale.set(newestScale, newestScale, newestScale * 1.12);
    const newestCenter = new THREE.Mesh(centerGeometry, flowerCenter);
    newestCenter.position.z = 0.028;
    if (journalCount < 12) newestCenter.scale.setScalar(0.42);
    disableRaycast(newestFlower);
    disableRaycast(newestCenter);
    const openingBudMaterial = budMaterial.clone();
    openingBudMaterial.vertexColors = true;
    const openingBud = new THREE.Mesh(budGeometry, openingBudMaterial);
    openingBud.name = "Opening bud";
    openingBud.scale.setScalar(Math.max(0.22, newestScale));
    disableRaycast(openingBud);
    newestMemory.add(newestFlower, newestCenter, openingBud);
    disableRaycast(newestMemory);
    const reveal = clamp(options.revealProgress ?? 1);
    const ceremonyOpen = reveal >= 0.999;
    // Bud reads at full size from the first frame. It hides only once the flower is opaque.
    openingBud.visible = !ceremonyOpen;
    newestCenter.visible = ceremonyOpen;
    newestPetal.opacity = ceremonyOpen ? 1 : 0.001;
    newestPetal.transparent = true;
    newestMemory.scale.setScalar(1);
    newestPivot.add(newestMemory);
    ceremonyOrganTargets.push({
      organId: "newest-memory",
      group: newestMemory,
      fullScale: 1,
    });
    // Parent-first path from trunk → memory host for path-pulse ceremony.
    const pathIds: string[] = [];
    let pathCursor: LivingSakuraSegment | undefined = hostSegment;
    while (pathCursor) {
      pathIds.push(pathCursor.id);
      pathCursor = pathCursor.parentId
        ? segmentById.get(pathCursor.parentId)
        : undefined;
    }
    ceremonyPathSegmentIds = pathIds.reverse();
    ceremonyWoodSegmentId = hostSegment.id;
    // Newest journal petal is always tappable — append as last hit instance.
    memoryBindings.push({
      entryId: newestInput.entryId,
      ordinal: newestInput.ordinal,
      botanicalAddress:
        ledger.byEntryId[newestInput.entryId].memory.location.locationKey,
      instanceIndex: memoryBindings.length,
      segmentId: segment.id,
      pivot: newestPivot,
      localMatrix: new THREE.Matrix4().compose(
        newestMemory.position.clone(),
        newestMemory.quaternion.clone(),
        new THREE.Vector3(1, 1, 1),
      ),
      flowerIndex: null,
    });

    const generosity =
      newestInput.ordinal <= 1
        ? 0
        : ({ 1: 2, 2: 4, 4: 7, 6: 11 } as const)[
            newestInput.privateGrowthUnits
          ];
    // Sibling organ groups on the host pivot (not nested under the petal)
    // so ceremony stagger can scale each independently.
    const memoryLocal = newestMemory.position.clone();
    for (let index = 0; index < generosity; index += 1) {
      const organId = `surround-${index + 1}`;
      const organGroup = new THREE.Group();
      organGroup.name = `Newest surrounding ${index + 1}`;
      const angle = (index / generosity) * Math.PI * 2 + newestRandom();
      // Tight umbel around the memory — surrounding life never orbits into free air.
      const radius =
        (newestInput.ordinal < 12 ? 0.014 : 0.02) + newestRandom() * 0.008;
      const useLeaf = newestInput.privateGrowthUnits === 1;
      const mesh = new THREE.Mesh(
        useLeaf ? leafGeometry : flowerGeometry,
        useLeaf ? leafMaterial : palePetal,
      );
      mesh.position.set(0, 0, 0);
      mesh.rotation.z = angle;
      const organFullScale = Math.min(
        AMBIENT_FLOWER_BASE_SCALE * (0.72 + newestRandom() * 0.35),
        newestScale * 0.78,
      );
      mesh.scale.setScalar(organFullScale);
      disableRaycast(mesh);
      organGroup.add(mesh);
      organGroup.position.copy(memoryLocal).add(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0.006 + Math.sin(angle) * radius * 0.2,
          Math.sin(angle) * radius,
        ),
      );
      organGroup.scale.setScalar(Math.max(0.001, reveal));
      newestPivot.add(organGroup);
      ceremonyOrganTargets.push({
        organId,
        group: organGroup,
        fullScale: 1,
      });
    }
    if (newestInput.ordinal > 1 && newestInput.privateGrowthUnits >= 4) {
      const shoot = createGenerosityShoot({
        units: newestInput.privateGrowthUnits,
        origin: memoryLocal,
        random: newestRandom,
        bark: youthChapter ? youthBark : fineBark,
        geometries: disposableGeometries,
      });
      shoot.group.scale.setScalar(Math.max(0.001, reveal));
      newestPivot.add(shoot.group);
      ceremonyOrganTargets.push({
        organId: "generosity-shoot",
        group: shoot.group,
        fullScale: 1,
      });
    }
  } else if (renderSegments.length > 0) {
    ceremonyPathSegmentIds = [renderSegments[0].id];
    ceremonyWoodSegmentId = renderSegments[0].id;
  }

  // Soft crown underlay stays off — large discs read as grey smudges, not hanami.
  if (false && journalCount >= 96 && ambientFlowerCount >= 12) {
    const underlayRandom = randomFor(`${options.rootSeed}:canopy-underlay`);
    const underlayCount = journalCount >= 192 ? 7 : journalCount >= 96 ? 4 : 3;
    // Hosts are always from the densified living graph (pivots exist only there).
    const crownHosts = renderSegments
      .filter(
        (segment) =>
          segment.role === "primary" ||
          segment.role === "leader" ||
          (journalCount >= 96 && segment.role === "secondary"),
      )
      .filter((segment) => pivotBySegmentId.has(segment.id));
    if (crownHosts.length > 0) {
      const underlayGeometry = new THREE.SphereGeometry(1, 10, 8);
      underlayGeometry.scale(1, 0.42, 1);
      disposableGeometries.add(underlayGeometry);
      for (let index = 0; index < underlayCount; index += 1) {
        const host =
          crownHosts[
            hashText(`${options.rootSeed}:underlay-host:${index}`) %
              crownHosts.length
          ];
        const disc = new THREE.Mesh(underlayGeometry, canopyUnderlayMaterial);
        disc.name = `Canopy haze ${index + 1}`;
        disc.renderOrder = -2;
        const tipLocal = worldToSegmentLocal(toVector(host.end), host);
        disc.position.copy(tipLocal).add(
          new THREE.Vector3(
            (underlayRandom() - 0.5) * 0.35,
            0.08 + underlayRandom() * 0.12,
            (underlayRandom() - 0.5) * 0.3,
          ),
        );
        const radius = 0.55 + underlayRandom() * 0.45;
        disc.scale.setScalar(radius);
        disableRaycast(disc);
        pivotBySegmentId.get(host.id)!.add(disc);
      }
    }
  }

  // Keep sequential instance indices for reliable raycast → entryId mapping.
  memoryBindings.forEach((binding, index) => {
    binding.instanceIndex = index;
  });
  // Unit torus, scaled to the blossom's own lateral scale so the band hugs the petals.
  const focusHug = FLOWER_PETAL_LENGTH * 1.12;
  const focusGeometry = new THREE.TorusGeometry(1, 0.07, 8, 36);
  const focusMaterial = new THREE.MeshBasicMaterial({
    color: "#f0c4b4",
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposableGeometries.add(focusGeometry);
  disposableMaterials.add(focusMaterial);
  const focusRing = new THREE.Mesh(focusGeometry, focusMaterial);
  const focusScale = new THREE.Vector3();
  focusRing.name = "Selected memory blossom focus";
  focusRing.visible = false;
  disableRaycast(focusRing);
  const setSelectedMemory = (entryId: string | null) => {
    const binding = entryId
      ? memoryBindings.find((candidate) => candidate.entryId === entryId)
      : undefined;
    if (!binding) {
      focusRing.visible = false;
      focusRing.removeFromParent();
      return;
    }
    binding.localMatrix.decompose(
      focusRing.position,
      focusRing.quaternion,
      focusScale,
    );
    // Historical instances store the flower scale. The newest blossom stores a
    // unit matrix — read the flower mesh so the band is not a giant torus.
    let blossom = focusScale.x;
    if (binding.flowerIndex === null && newestMemory) {
      const flower = newestMemory.children[0];
      if (flower) blossom = flower.scale.x;
    }
    focusRing.scale.setScalar(Math.max(0.001, blossom) * focusHug);
    focusRing.userData.baseScale = focusRing.scale.x;
    focusRing.userData.baseOpacity = 0.4;
    focusRing.visible = true;
    if (focusRing.parent !== binding.pivot) {
      binding.pivot.add(focusRing);
    }
  };
  setSelectedMemory(options.selectedEntryIds?.[0] ?? null);
  // Generous invisible hit spheres — sized each frame to WCAG finger targets.
  const hitGeometry = new THREE.SphereGeometry(0.5, 10, 8);
  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  });
  disposableGeometries.add(hitGeometry);
  disposableMaterials.add(hitMaterial);
  const memoryHitTargets = new THREE.InstancedMesh(
    hitGeometry,
    hitMaterial,
    Math.max(1, memoryBindings.length),
  );
  memoryHitTargets.name = "Memory blossom hit targets";
  memoryHitTargets.count = memoryBindings.length;
  memoryHitTargets.frustumCulled = false;
  // Draw last so R3F still finds them; ambient organs already have raycast disabled.
  memoryHitTargets.renderOrder = 10;

  const petalPoints = memoryBindings.map((binding) => ({
    entryId: binding.entryId,
    position: new THREE.Vector3(),
  }));
  const rootInverse = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const blossomWorld = new THREE.Matrix4();
  const parentLocalMatrix = new THREE.Matrix4();
  const hitMatrix = new THREE.Matrix4();
  const hitPosition = new THREE.Vector3();
  const hitQuaternion = new THREE.Quaternion();
  const hitScale = new THREE.Vector3();
  const hitDiameter = new THREE.Vector3();
  /**
   * Memory flower localMatrix is pivot-local. Instanced historical blossoms live
   * under `root` (stage-scaled), so each frame we compose:
   *   root-local = inv(root.world) * pivot.world * localMatrix
   * Petal points are world centers: pivot.matrixWorld × localMatrix (not root-local).
   * Hit targets are siblings of `root` under the same parent: include root.scale
   * so hit centers track blossoms while diameter stays true world units.
   */
  const updateMemoryTransforms = (hitDiameterWorld: number) => {
    if (memoryBindings.length === 0) return;
    // Single subtree pass — per-journal ancestor walks hitch the frame.
    root.updateWorldMatrix(true, true);
    rootInverse.copy(root.matrixWorld).invert();
    hitDiameter.set(hitDiameterWorld, hitDiameterWorld, hitDiameterWorld);
    for (let index = 0; index < memoryBindings.length; index += 1) {
      const binding = memoryBindings[index];
      blossomWorld
        .copy(binding.pivot.matrixWorld)
        .multiply(binding.localMatrix);
      petalPoints[index]?.position.setFromMatrixPosition(blossomWorld);
      worldMatrix
        .copy(rootInverse)
        .multiply(binding.pivot.matrixWorld)
        .multiply(binding.localMatrix);
      if (
        binding.flowerIndex !== null &&
        binding.flowerIndex < memoryFlowers.count
      ) {
        memoryFlowers.setMatrixAt(binding.flowerIndex, worldMatrix);
      }
      // Parent-local = root.local * root-local (matches scaled blossom position).
      parentLocalMatrix.copy(root.matrix).multiply(worldMatrix);
      parentLocalMatrix.decompose(hitPosition, hitQuaternion, hitScale);
      hitMatrix.compose(hitPosition, hitQuaternion, hitDiameter);
      if (
        binding.instanceIndex >= 0 &&
        binding.instanceIndex < memoryHitTargets.count
      ) {
        memoryHitTargets.setMatrixAt(binding.instanceIndex, hitMatrix);
      }
    }
    if (memoryFlowers.count > 0) {
      memoryFlowers.instanceMatrix.needsUpdate = true;
    }
    if (memoryHitTargets.count > 0) {
      memoryHitTargets.instanceMatrix.needsUpdate = true;
    }
  };
  updateMemoryTransforms(0.72);

  // Fallen petals: rare, localized, outer ring only — never a pile under the trunk.
  // Appear from established canopy onward; youth keeps a clean ground plane.
  const fallenCount =
    journalCount >= 96
      ? Math.min(
          14,
          3 + Math.floor((journalCount - 96) / 24) +
            Math.floor(Math.log1p(Math.max(0, journalCount - 192)) * 1.4),
        )
      : 0;
  if (fallenCount > 0) {
    const fallen = new THREE.InstancedMesh(flowerGeometry, palePetal, fallenCount);
    const fallenRandom = randomFor(`${options.rootSeed}:fallen:${Math.floor(age)}`);
    for (let index = 0; index < fallenCount; index += 1) {
      const angle = fallenRandom() * Math.PI * 2;
      // Outer gravel ring — keep clear of trunk buttress.
      const radius = 1.65 + fallenRandom() * 2.4;
      setOrganMatrix(
        fallen,
        index,
        new THREE.Vector3(Math.cos(angle) * radius, 0.012, Math.sin(angle) * radius * 0.55),
        new THREE.Euler(-Math.PI / 2, 0, fallenRandom() * Math.PI * 2),
        0.28 + fallenRandom() * 0.18,
      );
    }
    fallen.name = "Fallen petals";
    fallen.instanceMatrix.needsUpdate = true;
    disableRaycast(fallen);
    root.add(fallen);
  }

  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      object.frustumCulled = false;
    }
  });

  const pivotBaseScale = new Map<string, number>();
  for (const pivot of pivots) {
    pivotBaseScale.set(pivot.segmentId, pivot.group.scale.x);
  }
  const woodPivot = ceremonyWoodSegmentId
    ? pivots.find((pivot) => pivot.segmentId === ceremonyWoodSegmentId)
    : undefined;
  const holdNewestAtTip = (settle: number) => {
    if (
      !newestMemory ||
      !newestRestPosition ||
      !woodPivot ||
      newestMemory.parent !== woodPivot.group
    ) {
      return;
    }
    const base = pivotBaseScale.get(woodPivot.segmentId) ?? 1;
    const gx = Math.max(0.001, woodPivot.group.scale.x);
    const gy = Math.max(0.001, woodPivot.group.scale.y);
    const gz = Math.max(0.001, woodPivot.group.scale.z);
    // Cancel the growing pivot so the bud stays at the tip, full size, from frame one.
    newestMemory.position.set(
      (newestRestPosition.x * base) / gx,
      (newestRestPosition.y * base) / gy,
      (newestRestPosition.z * base) / gz,
    );
    newestMemory.scale.set(
      (base * settle) / gx,
      (base * settle) / gy,
      (base * settle) / gz,
    );
  };

  if (woodPivot && clamp(options.revealProgress ?? 1) < 0.999) {
    woodPivot.group.scale.setScalar(
      Math.max(0.001, clamp(options.revealProgress ?? 1)) *
        (pivotBaseScale.get(woodPivot.segmentId) ?? 1),
    );
    holdNewestAtTip(1);
  }

  const applyCeremonySample: LivingSakuraModel["applyCeremonySample"] = (
    sample,
  ) => {
    for (const step of sample.parentPath) {
      // Terminal wood uses woodProgress; skip double-scale on the same pivot.
      if (step.segmentId === ceremonyWoodSegmentId) continue;
      const pivot = pivots.find((item) => item.segmentId === step.segmentId);
      if (!pivot) continue;
      const base = pivotBaseScale.get(step.segmentId) ?? 1;
      // Cinematic path pulse — readable sap-rise without whole-tree throb.
      // ~15% peak emphasis so path→wood reads clearly on a 4.2s ceremony.
      const pulse = 1 + step.emphasis * 0.15 * step.progress;
      pivot.group.scale.setScalar(base * pulse);
      // Soft warm emissive lift on path wood materials (if present).
      pivot.group.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial &&
          child.name.startsWith("Wood ")
        ) {
          const lift = step.emphasis * step.progress * 0.24;
          child.material.emissive.setRGB(0.2 * lift, 0.1 * lift, 0.06 * lift);
          child.material.emissiveIntensity = Math.min(0.7, lift * 1.55);
        }
      });
    }
    if (woodPivot && ceremonyWoodSegmentId) {
      const base = pivotBaseScale.get(ceremonyWoodSegmentId) ?? 1;
      // Grow-from-join: length leads, girth lags (wood^>1) so extension reads as shoot growth.
      const wood = Math.max(0.001, clamp(sample.woodProgress));
      const girth = Math.max(0.001, Math.pow(wood, 1.55));
      woodPivot.group.scale.set(girth * base, wood * base, girth * base);
      woodPivot.group.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial &&
          child.name.startsWith("Wood ")
        ) {
          const lift = (1 - wood) * 0.16 + wood * 0.06;
          child.material.emissive.setRGB(0.18 * lift, 0.09 * lift, 0.05 * lift);
          child.material.emissiveIntensity = Math.min(0.55, lift * 1.4);
        }
      });
    }
    for (const organ of sample.organs) {
      const target = ceremonyOrganTargets.find(
        (item) => item.organId === organ.organId,
      );
      if (!target) continue;
      const settle =
        organ.localSettleOffset !== 0
          ? 1 + organ.localSettleOffset * 0.09
          : 1;
      // Botanical open: ease-in then soft overshoot settle (cinematic bloom).
      const open = clamp(organ.progress);
      const bloom =
        open < 1
          ? open * open * (3 - 2 * open) * (1 + (1 - open) * 0.12)
          : 1;
      if (organ.organId === "newest-memory") {
        // Parent scale follows the wood so the bud is not crushed to a speck.
        holdNewestAtTip(settle);
        const bud = target.group.getObjectByName("Opening bud");
        const flower = target.group.children[0];
        const center = target.group.children[1];
        let opacity = 1;
        if (
          flower instanceof THREE.Mesh &&
          flower.material instanceof THREE.MeshStandardMaterial
        ) {
          opacity = open <= 0.32 ? 0.001 : clamp((open - 0.32) / 0.46);
          flower.material.opacity = opacity;
          flower.material.transparent = opacity < 0.99;
          flower.visible = true;
        }
        if (center) center.visible = opacity > 0.35;
        // Hide the bud only once the flower is opaque.
        if (bud) bud.visible = opacity < 0.98;
        continue;
      }
      target.group.scale.setScalar(
        Math.max(0.001, bloom * target.fullScale * settle),
      );
    }
  };

  return {
    root,
    pivots,
    newestMemory,
    ceremonyPathSegmentIds,
    ceremonyOrganIds: ceremonyOrganTargets.map((organ) => organ.organId),
    ceremonyOrgans: ceremonyOrganTargets,
    ceremonyWoodSegmentId,
    journalCount,
    visibleBranchCount: renderSegments.length,
    memoryBlossomCount: activeMemoryCount,
    historicalMemoryCount: ledger.developments.length,
    activeMemoryEntryIds: activeProjection.activeMarkers.map(
      (marker) => marker.entryId,
    ),
    memoryAddressByEntryId: Object.fromEntries(
      ledger.developments.map((development) => [
        development.memory.entryId,
        development.memory.location.locationKey,
      ]),
    ),
    memoryInstances: memoryBindings.map((binding) => ({
      entryId: binding.entryId,
      ordinal: binding.ordinal,
      botanicalAddress: binding.botanicalAddress,
      instanceIndex: binding.instanceIndex,
      segmentId: binding.segmentId,
    })),
    memoryHitTargets,
    seedKernel,
    hasSeedKernel: seedKernel !== null,
    updateMemoryTransforms,
    applyCeremonySample,
    woodSegments: renderSegments,
    setSelectedMemory,
    petalPoints,
    getMemoryWorldPosition: (entryId, target) => {
      const binding = memoryBindings.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (!binding) return null;
      root.updateWorldMatrix(true, false);
      binding.pivot.updateWorldMatrix(true, false);
      worldMatrix
        .copy(binding.pivot.matrixWorld)
        .multiply(binding.localMatrix);
      return target.setFromMatrixPosition(worldMatrix);
    },
    careCycle:
      journalCount <= 192
        ? 0
        : Math.floor(Math.log2(journalCount - 192)) + 1,
    dispose: () => {
      disposableGeometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
    },
  };
}
