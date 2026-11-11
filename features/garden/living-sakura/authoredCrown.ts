/**
 * Authored-procedural mature Sakura crown foundation.
 *
 * This module intentionally contains no Three.js types. It describes a stable,
 * renderer-independent botanical sculpture: authored macro gestures with only
 * restrained, seed-controlled variation at the finer levels. A renderer may
 * turn the trunk rings into one mesh and the cubic paths into tubes, merged
 * geometry, skinned branches, or instanced low-poly forms.
 */

export type AuthoredCrownVec3 = readonly [number, number, number];
export type AuthoredCrownDepthLayer = "rear" | "middle" | "front";
export type AuthoredCrownRole =
  | "trunk"
  | "root"
  | "leader"
  | "primary"
  | "secondary"
  | "tertiary";

export interface AuthoredTrunkRing {
  id: string;
  heightRatio: number;
  center: AuthoredCrownVec3;
  radiusX: number;
  radiusZ: number;
  rotationRadians: number;
}

export interface AuthoredRootedTrunkProfile {
  treeHeight: number;
  firstForkHeightRatio: number;
  rootSpread: number;
  rings: readonly AuthoredTrunkRing[];
  rootSegmentIds: readonly string[];
}

export interface AuthoredCrownSegment {
  id: string;
  parentId: string | null;
  role: AuthoredCrownRole;
  depthLayer: AuthoredCrownDepthLayer;
  attachmentT: number;
  neighborhoodId: string | null;
  signature: "low-sweeping-bough" | "dominant-leader" | "subordinate-leader" | null;
  start: AuthoredCrownVec3;
  controlA: AuthoredCrownVec3;
  controlB: AuthoredCrownVec3;
  end: AuthoredCrownVec3;
  radiusStart: number;
  radiusEnd: number;
}

export interface AuthoredCrownNeighborhood {
  id: string;
  label: string;
  center: AuthoredCrownVec3;
  radii: AuthoredCrownVec3;
  primarySegmentId: string;
}

export interface AuthoredCrownWindow {
  id: string;
  center: AuthoredCrownVec3;
  radii: AuthoredCrownVec3;
}

export interface AuthoredCrownBounds {
  min: AuthoredCrownVec3;
  max: AuthoredCrownVec3;
}

export interface AuthoredCrownMeasurements {
  bounds: AuthoredCrownBounds;
  width: number;
  height: number;
  depth: number;
  fineWoodWidthRatio: number;
  fineWoodHeightRatio: number;
  fineWoodDepthRatio: number;
  occupiedOctants: readonly string[];
}

export interface AuthoredCrownCounts {
  trunk: 1;
  roots: 5;
  leaders: 2;
  primaries: 7;
  secondaries: 28;
  tertiaries: 84;
}

export interface AuthoredCrownPlan {
  rootSeed: string;
  dominantSide: -1 | 1;
  trunkProfile: AuthoredRootedTrunkProfile;
  segments: readonly AuthoredCrownSegment[];
  neighborhoods: readonly AuthoredCrownNeighborhood[];
  protectedWindows: readonly AuthoredCrownWindow[];
  measurements: AuthoredCrownMeasurements;
  counts: AuthoredCrownCounts;
}

export interface PlanAuthoredCrownInput {
  rootSeed: string;
}

const TREE_HEIGHT = 8;
const CROWN_CENTER: AuthoredCrownVec3 = [0, 5.25, 0];
const AUTHORED_BOUNDS: AuthoredCrownBounds = {
  min: [-4.25, 2.45, -2.95],
  max: [4.25, 7.75, 2.95],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashUnit(value: string): number {
  return stableHash(value) / 4_294_967_296;
}

function signedVariation(seed: string, amplitude: number): number {
  return (hashUnit(seed) * 2 - 1) * amplitude;
}

function validSeed(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("rootSeed must not be empty");
  return normalized;
}

function vec(x: number, y: number, z: number): AuthoredCrownVec3 {
  return [round(x), round(y), round(z)];
}

function add(left: AuthoredCrownVec3, right: AuthoredCrownVec3): AuthoredCrownVec3 {
  return vec(left[0] + right[0], left[1] + right[1], left[2] + right[2]);
}

function subtract(left: AuthoredCrownVec3, right: AuthoredCrownVec3): AuthoredCrownVec3 {
  return vec(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function multiply(value: AuthoredCrownVec3, scalar: number): AuthoredCrownVec3 {
  return vec(value[0] * scalar, value[1] * scalar, value[2] * scalar);
}

function magnitude(value: AuthoredCrownVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: AuthoredCrownVec3): AuthoredCrownVec3 {
  const length = magnitude(value);
  return length > 1e-9 ? multiply(value, 1 / length) : [0, 1, 0];
}

function cross(left: AuthoredCrownVec3, right: AuthoredCrownVec3): AuthoredCrownVec3 {
  return vec(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );
}

function distance(left: AuthoredCrownVec3, right: AuthoredCrownVec3): number {
  return magnitude(subtract(left, right));
}

function depthLayer(z: number): AuthoredCrownDepthLayer {
  if (z < -0.58) return "rear";
  if (z > 0.58) return "front";
  return "middle";
}

export function sampleAuthoredCrownSegment(
  segment: Pick<AuthoredCrownSegment, "start" | "controlA" | "controlB" | "end">,
  amount: number,
): AuthoredCrownVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  return vec(
    inverse ** 3 * segment.start[0] +
      3 * inverse ** 2 * t * segment.controlA[0] +
      3 * inverse * t ** 2 * segment.controlB[0] +
      t ** 3 * segment.end[0],
    inverse ** 3 * segment.start[1] +
      3 * inverse ** 2 * t * segment.controlA[1] +
      3 * inverse * t ** 2 * segment.controlB[1] +
      t ** 3 * segment.end[1],
    inverse ** 3 * segment.start[2] +
      3 * inverse ** 2 * t * segment.controlA[2] +
      3 * inverse * t ** 2 * segment.controlB[2] +
      t ** 3 * segment.end[2],
  );
}

export function tangentAuthoredCrownSegment(
  segment: Pick<AuthoredCrownSegment, "start" | "controlA" | "controlB" | "end">,
  amount: number,
): AuthoredCrownVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  return normalize(vec(
    3 * inverse ** 2 * (segment.controlA[0] - segment.start[0]) +
      6 * inverse * t * (segment.controlB[0] - segment.controlA[0]) +
      3 * t ** 2 * (segment.end[0] - segment.controlB[0]),
    3 * inverse ** 2 * (segment.controlA[1] - segment.start[1]) +
      6 * inverse * t * (segment.controlB[1] - segment.controlA[1]) +
      3 * t ** 2 * (segment.end[1] - segment.controlB[1]),
    3 * inverse ** 2 * (segment.controlA[2] - segment.start[2]) +
      6 * inverse * t * (segment.controlB[2] - segment.controlA[2]) +
      3 * t ** 2 * (segment.end[2] - segment.controlB[2]),
  ));
}

function radiusAt(segment: AuthoredCrownSegment, amount: number): number {
  const t = clamp(amount, 0, 1);
  return segment.radiusStart + (segment.radiusEnd - segment.radiusStart) * t;
}

function makeTrunkProfile(rootSeed: string, dominantSide: -1 | 1): AuthoredRootedTrunkProfile {
  const firstForkHeightRatio = round(0.388 + signedVariation(`${rootSeed}|fork`, 0.008));
  const lean = dominantSide * (0.2 + signedVariation(`${rootSeed}|trunk-lean`, 0.035));
  const depthLean = signedVariation(`${rootSeed}|trunk-depth`, 0.12);
  const heights = [0, 0.018, 0.042, 0.074, 0.115, 0.17, 0.235, 0.3, 0.35, firstForkHeightRatio];
  const radiiX = [0.78, 0.72, 0.64, 0.56, 0.49, 0.42, 0.35, 0.29, 0.245, 0.215];
  const radiiZ = [0.66, 0.63, 0.58, 0.52, 0.46, 0.4, 0.34, 0.285, 0.24, 0.205];
  const rings = heights.map((heightRatio, index): AuthoredTrunkRing => {
    const t = heightRatio / firstForkHeightRatio;
    const eased = t * t * (3 - 2 * t);
    return {
      id: `authored/trunk-ring/${index.toString().padStart(2, "0")}`,
      heightRatio,
      center: vec(
        lean * eased + Math.sin(t * Math.PI * 1.35) * 0.07 * dominantSide,
        heightRatio * TREE_HEIGHT,
        depthLean * Math.sin(t * Math.PI) + Math.sin(t * Math.PI * 1.8) * 0.035,
      ),
      radiusX: radiiX[index],
      radiusZ: radiiZ[index],
      rotationRadians: round(
        dominantSide * (index / (heights.length - 1)) * 0.34 +
          signedVariation(`${rootSeed}|trunk-ring|${index}`, 0.025),
      ),
    };
  });
  return {
    treeHeight: TREE_HEIGHT,
    firstForkHeightRatio,
    rootSpread: round(TREE_HEIGHT * 0.36),
    rings,
    rootSegmentIds: Array.from({ length: 5 }, (_, index) =>
      `authored/root/${index.toString().padStart(2, "0")}`),
  };
}

function makeTrunk(profile: AuthoredRootedTrunkProfile): AuthoredCrownSegment {
  const rings = profile.rings;
  return {
    id: "authored/trunk",
    parentId: null,
    role: "trunk",
    depthLayer: "middle",
    attachmentT: 0,
    neighborhoodId: null,
    signature: null,
    start: rings[0].center,
    controlA: rings[4].center,
    controlB: rings[7].center,
    end: rings[rings.length - 1].center,
    radiusStart: rings[0].radiusX,
    radiusEnd: rings[rings.length - 1].radiusX,
  };
}

interface ChildInput {
  id: string;
  parent: AuthoredCrownSegment;
  role: Exclude<AuthoredCrownRole, "trunk">;
  attachmentT: number;
  end: AuthoredCrownVec3;
  neighborhoodId?: string;
  signature?: AuthoredCrownSegment["signature"];
  startScale?: number;
  terminalScale?: number;
  arrivalLift?: number;
}

function makeChild(input: ChildInput): AuthoredCrownSegment {
  const start = sampleAuthoredCrownSegment(input.parent, input.attachmentT);
  const inherited = tangentAuthoredCrownSegment(input.parent, input.attachmentT);
  const direct = normalize(subtract(input.end, start));
  const length = distance(start, input.end);
  const initialHandle = input.role === "root" ? 0.16 : input.role === "leader" ? 0.29 : 0.23;
  const arrival = normalize(add(direct, [0, input.arrivalLift ?? 0.1, 0]));
  const roleScale = input.startScale ?? {
    root: 0.54,
    leader: 0.61,
    primary: 0.49,
    secondary: 0.39,
    tertiary: 0.32,
  }[input.role];
  const terminalScale = input.terminalScale ?? {
    root: 0.13,
    leader: 0.24,
    primary: 0.2,
    secondary: 0.16,
    tertiary: 0.12,
  }[input.role];
  const parentRadius = radiusAt(input.parent, input.attachmentT);
  const radiusStart = parentRadius * roleScale;
  return {
    id: input.id,
    parentId: input.parent.id,
    role: input.role,
    depthLayer: depthLayer(input.end[2]),
    attachmentT: round(input.attachmentT),
    neighborhoodId: input.neighborhoodId ?? null,
    signature: input.signature ?? null,
    start,
    // The first derivative is collinear with the parent tangent. This gives
    // renderers a parent-continuous junction rather than a pasted-on antler.
    controlA: add(start, multiply(inherited, length * initialHandle)),
    controlB: add(input.end, multiply(arrival, -length * 0.28)),
    end: input.end,
    radiusStart: round(radiusStart),
    radiusEnd: round(Math.max(0.000001, radiusStart * terminalScale)),
  };
}

function makeRootSegments(
  trunk: AuthoredCrownSegment,
  profile: AuthoredRootedTrunkProfile,
  rootSeed: string,
  dominantSide: -1 | 1,
): AuthoredCrownSegment[] {
  const authoredRoots = [
    { angle: -2.82, length: 0.88, attachment: 0.055 },
    { angle: -1.62, length: 0.96, attachment: 0.025 },
    { angle: -0.42, length: 1, attachment: 0.075 },
    { angle: 0.72, length: 0.84, attachment: 0.035 },
    { angle: 2.14, length: 0.76, attachment: 0.065 },
  ] as const;
  return authoredRoots.map((root, index) => {
    const angle = root.angle * dominantSide + signedVariation(`${rootSeed}|root-angle|${index}`, 0.09);
    const length = profile.rootSpread * root.length;
    const end = vec(
      Math.cos(angle) * length,
      0.018 + (index % 2) * 0.012,
      Math.sin(angle) * length * 0.66,
    );
    const segment = makeChild({
      id: profile.rootSegmentIds[index],
      parent: trunk,
      role: "root",
      attachmentT: root.attachment,
      end,
      arrivalLift: -0.04,
      startScale: index === 2 ? 0.62 : 0.5 - index * 0.018,
      terminalScale: 0.08,
    });
    const radial = normalize([end[0], 0, end[2]]);
    segment.controlA = add(segment.start, vec(radial[0] * length * 0.28, 0.08, radial[2] * length * 0.28));
    segment.controlB = add(end, vec(-radial[0] * length * 0.34, 0.06, -radial[2] * length * 0.34));
    return segment;
  });
}

interface PrimaryArchetype {
  id: string;
  label: string;
  parent: "trunk" | "dominant" | "subordinate";
  attachmentT: number;
  target: AuthoredCrownVec3;
  radii: AuthoredCrownVec3;
  signature?: "low-sweeping-bough";
}

const PRIMARY_ARCHETYPES: readonly PrimaryArchetype[] = [
  {
    id: "low-right-front",
    label: "low embracing gesture",
    parent: "trunk",
    attachmentT: 0.55,
    target: [3.72, 3.22, 1.58],
    radii: [1.18, 0.78, 0.96],
    signature: "low-sweeping-bough",
  },
  {
    id: "low-left-rear",
    label: "low counter-mass",
    parent: "trunk",
    attachmentT: 0.78,
    target: [-3.72, 3.72, -1.42],
    radii: [1.12, 0.82, 0.9],
  },
  {
    id: "mid-left-front",
    label: "broad flowering shelf",
    parent: "subordinate",
    attachmentT: 0.43,
    target: [-4.02, 4.72, 1.82],
    radii: [1.08, 0.9, 0.96],
  },
  {
    id: "mid-right-rear",
    label: "receding balance bough",
    parent: "dominant",
    attachmentT: 0.42,
    target: [3.75, 4.88, -1.92],
    radii: [1.04, 0.86, 1.0],
  },
  {
    id: "upper-left-rear",
    label: "ascending left crown",
    parent: "subordinate",
    attachmentT: 0.68,
    target: [-3.32, 6.45, -1.68],
    radii: [1.02, 0.94, 0.98],
  },
  {
    id: "upper-right-front",
    label: "dominant blossom crown",
    parent: "dominant",
    attachmentT: 0.7,
    target: [2.92, 7.25, 1.78],
    radii: [1.08, 0.8, 0.94],
  },
  {
    id: "upper-right-rear",
    label: "rear crown counterpoint",
    parent: "dominant",
    attachmentT: 0.82,
    target: [3.78, 6.35, -1.86],
    radii: [0.98, 0.82, 0.96],
  },
] as const;

function reflected(point: AuthoredCrownVec3, dominantSide: -1 | 1): AuthoredCrownVec3 {
  return vec(point[0] * dominantSide, point[1], point[2] * dominantSide);
}

function perturbedTarget(
  point: AuthoredCrownVec3,
  rootSeed: string,
  identity: string,
): AuthoredCrownVec3 {
  return vec(
    clamp(point[0] + signedVariation(`${rootSeed}|${identity}|x`, 0.12), AUTHORED_BOUNDS.min[0], AUTHORED_BOUNDS.max[0]),
    clamp(point[1] + signedVariation(`${rootSeed}|${identity}|y`, 0.08), AUTHORED_BOUNDS.min[1], AUTHORED_BOUNDS.max[1]),
    clamp(point[2] + signedVariation(`${rootSeed}|${identity}|z`, 0.14), AUTHORED_BOUNDS.min[2], AUTHORED_BOUNDS.max[2]),
  );
}

function makeLeaders(
  trunk: AuthoredCrownSegment,
  rootSeed: string,
  dominantSide: -1 | 1,
): readonly [AuthoredCrownSegment, AuthoredCrownSegment] {
  const dominant = makeChild({
    id: "authored/leader/dominant",
    parent: trunk,
    role: "leader",
    attachmentT: 0.76,
    end: perturbedTarget(reflected([1.45, 7.62, 0.68], dominantSide), rootSeed, "dominant-leader"),
    signature: "dominant-leader",
    startScale: 0.64,
    terminalScale: 0.2,
  });
  const subordinate = makeChild({
    id: "authored/leader/subordinate",
    parent: trunk,
    role: "leader",
    attachmentT: 0.93,
    end: perturbedTarget(reflected([-1.62, 6.78, -0.88], dominantSide), rootSeed, "subordinate-leader"),
    signature: "subordinate-leader",
    startScale: 0.5,
    terminalScale: 0.19,
  });
  return [dominant, subordinate];
}

const SECONDARY_GESTURES: readonly AuthoredCrownVec3[] = [
  [0.86, 0.36, 0.58],
  [0.62, -0.12, -0.84],
  [-0.3, 0.62, 0.96],
  [-0.56, 0.34, -0.64],
] as const;

function makeSecondaries(
  primary: AuthoredCrownSegment,
  neighborhood: AuthoredCrownNeighborhood,
  rootSeed: string,
): AuthoredCrownSegment[] {
  const radial = normalize(subtract(neighborhood.center, CROWN_CENTER));
  const lateral = normalize(cross([0, 1, 0], radial));
  const attachments = [0.34, 0.5, 0.66, 0.81] as const;
  return SECONDARY_GESTURES.map((gesture, index) => {
    const start = sampleAuthoredCrownSegment(primary, attachments[index]);
    const identity = `${neighborhood.id}|secondary|${index}`;
    const target = add(start, add(
      multiply(radial, 0.72 + gesture[0] * 0.54),
      add(
        multiply(lateral, gesture[2] * 0.82),
        vec(
          signedVariation(`${rootSeed}|${identity}|x`, 0.08),
          0.36 + gesture[1] * 0.72 + signedVariation(`${rootSeed}|${identity}|y`, 0.06),
          signedVariation(`${rootSeed}|${identity}|z`, 0.1),
        ),
      ),
    ));
    const bounded = vec(
      clamp(target[0], AUTHORED_BOUNDS.min[0], AUTHORED_BOUNDS.max[0]),
      clamp(target[1], AUTHORED_BOUNDS.min[1], AUTHORED_BOUNDS.max[1]),
      clamp(target[2], AUTHORED_BOUNDS.min[2], AUTHORED_BOUNDS.max[2]),
    );
    return makeChild({
      id: `authored/secondary/${neighborhood.id}/${index.toString().padStart(2, "0")}`,
      parent: primary,
      role: "secondary",
      attachmentT: attachments[index],
      end: bounded,
      neighborhoodId: neighborhood.id,
      startScale: 0.38 - index * 0.012,
      terminalScale: 0.15,
    });
  });
}

const TERTIARY_GESTURES: readonly AuthoredCrownVec3[] = [
  [0.46, 0.34, 0.58],
  [0.3, 0.58, -0.48],
  [-0.2, 0.44, 0.74],
] as const;

function makeTertiaries(
  secondary: AuthoredCrownSegment,
  neighborhood: AuthoredCrownNeighborhood,
  rootSeed: string,
  secondaryIndex: number,
): AuthoredCrownSegment[] {
  const radial = normalize(subtract(neighborhood.center, CROWN_CENTER));
  const lateral = normalize(cross([0, 1, 0], radial));
  const attachments = [0.44, 0.64, 0.82] as const;
  return TERTIARY_GESTURES.map((gesture, index) => {
    const start = sampleAuthoredCrownSegment(secondary, attachments[index]);
    const alternating = (secondaryIndex + index) % 2 === 0 ? 1 : -1;
    const identity = `${neighborhood.id}|tertiary|${secondaryIndex}|${index}`;
    const target = add(start, add(
      multiply(radial, gesture[0] * 0.54),
      add(
        multiply(lateral, gesture[2] * alternating * 0.55),
        vec(
          signedVariation(`${rootSeed}|${identity}|x`, 0.045),
          gesture[1] * 0.5 + signedVariation(`${rootSeed}|${identity}|y`, 0.035),
          signedVariation(`${rootSeed}|${identity}|z`, 0.055),
        ),
      ),
    ));
    return makeChild({
      id: `authored/tertiary/${neighborhood.id}/${secondaryIndex.toString().padStart(2, "0")}/${index.toString().padStart(2, "0")}`,
      parent: secondary,
      role: "tertiary",
      attachmentT: attachments[index],
      end: vec(
        clamp(target[0], AUTHORED_BOUNDS.min[0], AUTHORED_BOUNDS.max[0]),
        clamp(target[1], AUTHORED_BOUNDS.min[1], AUTHORED_BOUNDS.max[1]),
        clamp(target[2], AUTHORED_BOUNDS.min[2], AUTHORED_BOUNDS.max[2]),
      ),
      neighborhoodId: neighborhood.id,
      startScale: 0.31 - index * 0.012,
      terminalScale: 0.11,
    });
  });
}

function ellipsoidValue(
  point: AuthoredCrownVec3,
  center: AuthoredCrownVec3,
  radii: AuthoredCrownVec3,
): number {
  return (
    ((point[0] - center[0]) / radii[0]) ** 2 +
    ((point[1] - center[1]) / radii[1]) ** 2 +
    ((point[2] - center[2]) / radii[2]) ** 2
  );
}

function makeProtectedWindows(segments: readonly AuthoredCrownSegment[]): AuthoredCrownWindow[] {
  const woodyCrown = segments.filter((segment) =>
    segment.role === "leader" || segment.role === "primary" ||
    segment.role === "secondary" || segment.role === "tertiary");
  const baseRadii: AuthoredCrownVec3 = [0.56, 0.45, 0.48];
  const candidates: Array<{ center: AuthoredCrownVec3; clearance: number }> = [];
  for (const x of [-2.6, -1.7, -0.8, 0.2, 1.1, 2, 2.9]) {
    for (const y of [3.75, 4.55, 5.35, 6.15]) {
      for (const z of [-0.88, 0, 0.88]) {
        const center = vec(x, y, z);
        let clearance = Number.POSITIVE_INFINITY;
        for (const segment of woodyCrown) {
          for (let sample = 0; sample <= 20; sample += 1) {
            clearance = Math.min(
              clearance,
              ellipsoidValue(sampleAuthoredCrownSegment(segment, sample / 20), center, baseRadii),
            );
          }
        }
        candidates.push({ center, clearance });
      }
    }
  }
  candidates.sort((left, right) => right.clearance - left.clearance);
  const windows: AuthoredCrownWindow[] = [];
  for (const candidate of candidates) {
    if (windows.some((window) => distance(window.center, candidate.center) < 1.45)) continue;
    const scale = clamp(Math.sqrt(candidate.clearance) * 0.78, 0.56, 1);
    windows.push({
      id: `authored/crown-window/${windows.length + 1}`,
      center: candidate.center,
      radii: vec(baseRadii[0] * scale, baseRadii[1] * scale, baseRadii[2] * scale),
    });
    if (windows.length === 3) break;
  }
  return windows;
}

function sampledBounds(segments: readonly AuthoredCrownSegment[]): AuthoredCrownBounds {
  const points: AuthoredCrownVec3[] = [];
  for (const segment of segments) {
    for (let index = 0; index <= 12; index += 1) {
      points.push(sampleAuthoredCrownSegment(segment, index / 12));
    }
  }
  return {
    min: vec(
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.min(...points.map((point) => point[2])),
    ),
    max: vec(
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[2])),
    ),
  };
}

function octantKey(point: AuthoredCrownVec3): string {
  return `${point[0] >= CROWN_CENTER[0] ? "+x" : "-x"}/${point[1] >= CROWN_CENTER[1] ? "+y" : "-y"}/${point[2] >= CROWN_CENTER[2] ? "+z" : "-z"}`;
}

export function measureAuthoredCrown(
  segments: readonly AuthoredCrownSegment[],
): AuthoredCrownMeasurements {
  const crownWood = segments.filter((segment) => segment.role !== "trunk" && segment.role !== "root");
  const fineWood = segments.filter((segment) => segment.role === "secondary" || segment.role === "tertiary");
  const bounds = sampledBounds(crownWood);
  const fineBounds = sampledBounds(fineWood);
  const width = bounds.max[0] - bounds.min[0];
  const height = bounds.max[1] - bounds.min[1];
  const depth = bounds.max[2] - bounds.min[2];
  const occupiedOctants = Array.from(new Set(
    fineWood.flatMap((segment) => [segment.controlB, segment.end]).map(octantKey),
  )).sort();
  return {
    bounds,
    width: round(width),
    height: round(height),
    depth: round(depth),
    fineWoodWidthRatio: round((fineBounds.max[0] - fineBounds.min[0]) / width),
    fineWoodHeightRatio: round((fineBounds.max[1] - fineBounds.min[1]) / height),
    fineWoodDepthRatio: round((fineBounds.max[2] - fineBounds.min[2]) / depth),
    occupiedOctants,
  };
}

export function planAuthoredCrown(input: PlanAuthoredCrownInput): AuthoredCrownPlan {
  const rootSeed = validSeed(input.rootSeed);
  const dominantSide: -1 | 1 = hashUnit(`${rootSeed}|dominant-side`) < 0.5 ? -1 : 1;
  const trunkProfile = makeTrunkProfile(rootSeed, dominantSide);
  const trunk = makeTrunk(trunkProfile);
  const roots = makeRootSegments(trunk, trunkProfile, rootSeed, dominantSide);
  const [dominantLeader, subordinateLeader] = makeLeaders(trunk, rootSeed, dominantSide);
  const segments: AuthoredCrownSegment[] = [trunk, ...roots, dominantLeader, subordinateLeader];
  const parentByKind = {
    trunk,
    dominant: dominantLeader,
    subordinate: subordinateLeader,
  } as const;
  const neighborhoods: AuthoredCrownNeighborhood[] = [];

  for (let index = 0; index < PRIMARY_ARCHETYPES.length; index += 1) {
    const archetype = PRIMARY_ARCHETYPES[index];
    const neighborhoodId = `authored/neighborhood/${archetype.id}`;
    const center = perturbedTarget(reflected(archetype.target, dominantSide), rootSeed, archetype.id);
    const primary = makeChild({
      id: `authored/primary/${index.toString().padStart(2, "0")}-${archetype.id}`,
      parent: parentByKind[archetype.parent],
      role: "primary",
      attachmentT: archetype.attachmentT,
      end: center,
      neighborhoodId,
      signature: archetype.signature ?? null,
      startScale: index < 2 ? 0.53 : 0.46,
      terminalScale: 0.19,
      arrivalLift: archetype.signature ? 0.03 : 0.12,
    });
    if (archetype.signature) {
      const inherited = tangentAuthoredCrownSegment(primary, 0);
      const length = distance(primary.start, primary.end);
      primary.controlA = add(primary.start, multiply(inherited, length * 0.2));
      primary.controlB = add(primary.end, vec(-dominantSide * 0.78, -0.28, -0.18 * dominantSide));
    }
    const neighborhood: AuthoredCrownNeighborhood = {
      id: neighborhoodId,
      label: archetype.label,
      center,
      radii: archetype.radii,
      primarySegmentId: primary.id,
    };
    neighborhoods.push(neighborhood);
    segments.push(primary);

    const secondaries = makeSecondaries(primary, neighborhood, rootSeed);
    segments.push(...secondaries);
    for (let secondaryIndex = 0; secondaryIndex < secondaries.length; secondaryIndex += 1) {
      segments.push(...makeTertiaries(
        secondaries[secondaryIndex],
        neighborhood,
        rootSeed,
        secondaryIndex,
      ));
    }
  }

  return {
    rootSeed,
    dominantSide,
    trunkProfile,
    segments,
    neighborhoods,
    protectedWindows: makeProtectedWindows(segments),
    measurements: measureAuthoredCrown(segments),
    counts: {
      trunk: 1,
      roots: 5,
      leaders: 2,
      primaries: 7,
      secondaries: 28,
      tertiaries: 84,
    },
  };
}
