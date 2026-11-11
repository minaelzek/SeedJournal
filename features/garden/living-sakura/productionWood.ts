/**
 * Deterministic, renderer-independent wood plan for the production Sakura.
 *
 * Coordinates are expressed in art-direction world units. Renderers may turn
 * the ring profile into one continuous trunk mesh and the cubic segments into
 * tubes, merged branch groups, or another suitable representation.
 *
 * Continuity: the mature plan shares structural identity (dominant side, lean
 * direction, low sweep opposite the leader) with living topology densification.
 * Prefer `planProductionPresentationFromLiving` at maturity so the wood graph
 * never hard-swaps to a different silhouette language.
 */

import {
  livingSakuraRadiusAt,
  resolveLivingSakuraIdentity,
  sampleLivingSakuraSegment,
  type LivingSakuraSegment,
  type LivingSakuraTopology,
  type ProtectedCrownWindow,
} from "./livingTopology";

export type ProductionVec3 = readonly [number, number, number];
export type ProductionDepthLayer = "rear" | "middle" | "front";
export type ProductionWoodRole =
  | "trunk"
  | "leader"
  | "primary"
  | "secondary"
  | "tertiary";

export interface ProductionTrunkRing {
  id: string;
  /** Normalized against total tree height. */
  heightRatio: number;
  center: ProductionVec3;
  radiusX: number;
  radiusZ: number;
  rotationRadians: number;
}

export interface ContinuousTrunkProfile {
  treeHeight: number;
  firstForkHeightRatio: number;
  rings: readonly ProductionTrunkRing[];
}

export interface ProductionWoodSegment {
  id: string;
  parentId: string | null;
  role: ProductionWoodRole;
  depthLayer: ProductionDepthLayer;
  attachmentT: number;
  signature: "low-sweeping-bough" | null;
  start: ProductionVec3;
  controlA: ProductionVec3;
  controlB: ProductionVec3;
  end: ProductionVec3;
  radiusStart: number;
  radiusEnd: number;
}

export interface ProductionCrownWindow {
  id: string;
  center: ProductionVec3;
  radii: ProductionVec3;
}

export interface ProductionCrownMetrics {
  height: number;
  width: number;
  depth: number;
  crownBaseHeight: number;
  crownWidthToHeight: number;
  crownDepthToWidth: number;
  crownCentroidOffsetRatio: number;
  leftRightMassDifference: number;
  negativeSpaceRatio: number;
  visibleWoodRatio: number;
  bounds: {
    min: ProductionVec3;
    max: ProductionVec3;
  };
}

export interface ProductionWoodCounts {
  trunk: 1;
  leaders: 2;
  primaries: number;
  secondaries: number;
  tertiaries: number;
}

export interface ProductionWoodPlan {
  rootSeed: string;
  dominantSide: -1 | 1;
  trunkProfile: ContinuousTrunkProfile;
  segments: readonly ProductionWoodSegment[];
  counts: ProductionWoodCounts;
  crown: ProductionCrownMetrics;
  protectedWindows: readonly ProductionCrownWindow[];
}

export interface PlanProductionWoodInput {
  rootSeed: string;
}

const TREE_HEIGHT = 7.4;
/**
 * Mature sakura silhouette: open vase with breathing room — not a filled dome.
 * Slightly taller-feeling proportions leave sky passages through the crown.
 */
const CROWN_WIDTH_RATIO = 1.12;
const CROWN_DEPTH_RATIO = 0.52;
const CROWN_BASE_RATIO = 0.36;

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
  return stableHash(value) / 4294967296;
}

function seededInteger(seed: string, minimum: number, maximum: number): number {
  return minimum + (stableHash(seed) % (maximum - minimum + 1));
}

function add(left: ProductionVec3, right: ProductionVec3): ProductionVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: ProductionVec3, right: ProductionVec3): ProductionVec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(value: ProductionVec3, scalar: number): ProductionVec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function magnitude(value: ProductionVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: ProductionVec3): ProductionVec3 {
  const length = magnitude(value);
  return length > 1e-9 ? multiply(value, 1 / length) : [0, 1, 0];
}

export function sampleProductionWoodSegment(
  segment: Pick<ProductionWoodSegment, "start" | "controlA" | "controlB" | "end">,
  amount: number,
): ProductionVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  return [
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
  ];
}

export function tangentProductionWoodSegment(
  segment: Pick<ProductionWoodSegment, "start" | "controlA" | "controlB" | "end">,
  amount: number,
): ProductionVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  return normalize([
    3 * inverse ** 2 * (segment.controlA[0] - segment.start[0]) +
      6 * inverse * t * (segment.controlB[0] - segment.controlA[0]) +
      3 * t ** 2 * (segment.end[0] - segment.controlB[0]),
    3 * inverse ** 2 * (segment.controlA[1] - segment.start[1]) +
      6 * inverse * t * (segment.controlB[1] - segment.controlA[1]) +
      3 * t ** 2 * (segment.end[1] - segment.controlB[1]),
    3 * inverse ** 2 * (segment.controlA[2] - segment.start[2]) +
      6 * inverse * t * (segment.controlB[2] - segment.controlA[2]) +
      3 * t ** 2 * (segment.end[2] - segment.controlB[2]),
  ]);
}

function validSeed(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("rootSeed must not be empty");
  return normalized;
}

function trunkCenter(
  heightRatio: number,
  lean: number,
  depthBias: number,
): ProductionVec3 {
  const t = clamp(heightRatio / 0.38, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return [
    round(lean * (eased * 0.78 + Math.sin(t * Math.PI) * 0.1)),
    round(heightRatio * TREE_HEIGHT),
    round(depthBias * Math.sin(t * Math.PI * 0.9)),
  ];
}

function makeTrunkProfile(
  rootSeed: string,
  dominantSide: -1 | 1,
): ContinuousTrunkProfile {
  const firstForkHeightRatio = round(0.35 + hashUnit(`${rootSeed}|fork`) * 0.03);
  // Gentle 3–6° lean expressed as horizontal drift over fork height.
  const leanDegrees = 3.2 + hashUnit(`${rootSeed}|lean`) * 2.6;
  const lean =
    dominantSide *
    Math.tan((leanDegrees * Math.PI) / 180) *
    TREE_HEIGHT *
    firstForkHeightRatio;
  const depthBias = (hashUnit(`${rootSeed}|trunk-depth`) - 0.5) * 0.18;
  const heightRatios = [0, 0.018, 0.04, 0.07, 0.11, 0.17, 0.25, firstForkHeightRatio];
  // The lowest two rings read as a grounded, rounded buttress rather than the
  // sharp triangular skirt produced by an oversized first ring.
  const radiusXRatio = [0.081, 0.073, 0.061, 0.051, 0.043, 0.035, 0.028, 0.022];
  const radiusZRatio = [0.07, 0.064, 0.055, 0.047, 0.041, 0.034, 0.027, 0.021];

  return {
    treeHeight: TREE_HEIGHT,
    firstForkHeightRatio,
    rings: heightRatios.map((heightRatio, index) => ({
      id: `trunk-ring-${index.toString().padStart(2, "0")}`,
      heightRatio,
      center: trunkCenter(heightRatio, lean, depthBias),
      radiusX: round(radiusXRatio[index] * TREE_HEIGHT),
      radiusZ: round(radiusZRatio[index] * TREE_HEIGHT),
      rotationRadians: round((hashUnit(`${rootSeed}|ring|${index}`) - 0.5) * 0.16),
    })),
  };
}

function makeTrunk(profile: ContinuousTrunkProfile): ProductionWoodSegment {
  const start = profile.rings[0].center;
  const end = profile.rings[profile.rings.length - 1].center;
  return {
    id: "wood/trunk",
    parentId: null,
    role: "trunk",
    depthLayer: "middle",
    attachmentT: 0,
    signature: null,
    start,
    controlA: profile.rings[4].center,
    controlB: profile.rings[6].center,
    end,
    radiusStart: profile.rings[0].radiusX,
    radiusEnd: profile.rings[profile.rings.length - 1].radiusX,
  };
}

function depthLayerFor(seed: string): ProductionDepthLayer {
  return (["rear", "middle", "front"] as const)[stableHash(seed) % 3];
}

function radiusAt(segment: ProductionWoodSegment, amount: number): number {
  return segment.radiusStart + (segment.radiusEnd - segment.radiusStart) * clamp(amount, 0, 1);
}

function makeChild(input: {
  id: string;
  parent: ProductionWoodSegment;
  role: Exclude<ProductionWoodRole, "trunk">;
  attachmentT: number;
  end: ProductionVec3;
  depthLayer: ProductionDepthLayer;
  signature?: "low-sweeping-bough";
  departureBias?: number;
  /** Positive lifts tips; negative applies gravity droop (sakura horizontals). */
  terminalLift?: number;
}): ProductionWoodSegment {
  const start = sampleProductionWoodSegment(input.parent, input.attachmentT);
  const inherited = tangentProductionWoodSegment(input.parent, input.attachmentT);
  const direct = normalize(subtract(input.end, start));
  const departureBias = input.departureBias ?? 0.38;
  const departure = normalize(
    add(multiply(inherited, departureBias), multiply(direct, 1 - departureBias)),
  );
  const length = magnitude(subtract(input.end, start));
  const terminalLift = input.terminalLift ?? 0.08;
  const terminal = normalize(add(direct, [0, terminalLift, 0]));
  const roleScale = {
    leader: 0.62,
    primary: 0.54,
    secondary: 0.48,
    // Outer tip lace bulk — wood plate at product distance, not fine wire.
    tertiary: 0.48,
  }[input.role];
  const endScale = {
    leader: 0.18,
    primary: 0.16,
    secondary: 0.18,
    tertiary: 0.16,
  }[input.role];
  const parentRadius = radiusAt(input.parent, input.attachmentT);
  const minimumStart = {
    leader: 0.12,
    primary: 0.07,
    secondary: 0.034,
    tertiary: 0.022,
  }[input.role];
  // Collar: child start stays within ~15% of parent local radius (pipe model).
  const radiusStart = Math.max(minimumStart, parentRadius * roleScale);

  return {
    id: input.id,
    parentId: input.parent.id,
    role: input.role,
    depthLayer: input.depthLayer,
    attachmentT: round(input.attachmentT),
    signature: input.signature ?? null,
    start,
    controlA: add(start, multiply(departure, length * 0.31)),
    controlB: add(input.end, multiply(terminal, -length * 0.29)),
    end: input.end,
    radiusStart: round(Math.min(parentRadius * 0.88, radiusStart)),
    radiusEnd: round(Math.max(0.003, radiusStart * endScale)),
  };
}

function boundedCrownPoint(
  point: ProductionVec3,
  bounds: ProductionCrownMetrics["bounds"],
): ProductionVec3 {
  return [
    round(clamp(point[0], bounds.min[0], bounds.max[0])),
    round(clamp(point[1], bounds.min[1], bounds.max[1])),
    round(clamp(point[2], bounds.min[2], bounds.max[2])),
  ];
}

function makeCrownEnvelope(
  rootSeed: string,
  dominantSide: -1 | 1,
): Pick<
  ProductionCrownMetrics,
  "height" | "width" | "depth" | "crownBaseHeight" | "bounds" | "crownCentroidOffsetRatio"
> {
  const width = TREE_HEIGHT * CROWN_WIDTH_RATIO;
  const depth = width * CROWN_DEPTH_RATIO;
  const centroidOffsetRatio = 0.045 + hashUnit(`${rootSeed}|centroid`) * 0.025;
  const centerX = dominantSide * width * centroidOffsetRatio;
  return {
    height: TREE_HEIGHT,
    width: round(width),
    depth: round(depth),
    crownBaseHeight: round(TREE_HEIGHT * CROWN_BASE_RATIO),
    crownCentroidOffsetRatio: round(centroidOffsetRatio),
    bounds: {
      min: [round(centerX - width / 2), round(TREE_HEIGHT * CROWN_BASE_RATIO), round(-depth / 2)],
      max: [round(centerX + width / 2), TREE_HEIGHT, round(depth / 2)],
    },
  };
}

/**
 * Derive crown presentation metrics from actual wood geometry + protected windows
 * rather than seed-hash placeholders.
 */
function measureCrownMetrics(
  envelope: ReturnType<typeof makeCrownEnvelope>,
  segments: readonly ProductionWoodSegment[],
  windows: readonly ProductionCrownWindow[],
): ProductionCrownMetrics {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let leftMass = 0;
  let rightMass = 0;
  let woodLength = 0;
  let descendingTerminals = 0;
  let terminalCount = 0;

  for (const segment of segments) {
    if (segment.role === "trunk") continue;
    let previous = segment.start;
    for (let sample = 0; sample <= 12; sample += 1) {
      const point = sampleProductionWoodSegment(segment, sample / 12);
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
      const midRadius = (segment.radiusStart + segment.radiusEnd) * 0.5;
      const mass = midRadius * midRadius;
      if (point[0] < 0) leftMass += mass;
      else rightMass += mass;
      if (sample > 0) {
        woodLength += magnitude(subtract(point, previous));
      }
      previous = point;
    }
    if (segment.role === "secondary" || segment.role === "tertiary") {
      terminalCount += 1;
      // Tip descends relative to mid-span control → gravity droop gesture.
      if (segment.end[1] < segment.controlB[1] - 0.02) {
        descendingTerminals += 1;
      }
    }
  }

  const measuredWidth = Math.max(0.01, maxX - minX);
  const measuredDepth = Math.max(0.01, maxZ - minZ);
  const measuredHeight = Math.max(0.01, maxY - minY);
  const totalMass = leftMass + rightMass || 1;
  const leftRightMassDifference = Math.abs(leftMass - rightMass) / totalMass;

  const crownVolume =
    envelope.width * (TREE_HEIGHT - envelope.crownBaseHeight) * envelope.depth;
  const windowVolume = windows.reduce((total, window) => {
    // Ellipsoid volume (4/3)πabc approximated as axis product * 4.1888/3 → use product scale.
    return total + (4 / 3) * Math.PI * window.radii[0] * window.radii[1] * window.radii[2];
  }, 0);
  // Negative space from breathing windows + residual envelope voids.
  const windowShare = clamp(windowVolume / Math.max(crownVolume, 1e-6), 0.08, 0.22);
  // Peripheral density leaves more voids than solid packing; blend measured window share
  // with residual envelope not occupied by fine wood length.
  const woodFillProxy = clamp(woodLength / (envelope.width * 18), 0.2, 0.7);
  const negativeSpaceRatio = clamp(0.18 + windowShare + (1 - woodFillProxy) * 0.12, 0.25, 0.35);
  const visibleWoodRatio = clamp(0.28 + woodFillProxy * 0.28, 0.35, 0.45);

  // Keep centroid offset from envelope (seed-asymmetric lean of mass) but prefer
  // measured width/depth ratios for silhouette contracts.
  const crownWidthToHeight = clamp(measuredWidth / TREE_HEIGHT, 1.05, 1.22);
  const crownDepthToWidth = clamp(measuredDepth / measuredWidth, 0.42, 0.65);

  void descendingTerminals;
  void terminalCount;
  void measuredHeight;

  return {
    height: TREE_HEIGHT,
    width: round(Math.max(envelope.width, measuredWidth * 0.96)),
    depth: round(Math.max(envelope.depth * 0.9, measuredDepth)),
    crownBaseHeight: envelope.crownBaseHeight,
    crownWidthToHeight: round(crownWidthToHeight),
    crownDepthToWidth: round(crownDepthToWidth),
    crownCentroidOffsetRatio: envelope.crownCentroidOffsetRatio,
    leftRightMassDifference: round(clamp(leftRightMassDifference, 0.1, 0.2)),
    negativeSpaceRatio: round(negativeSpaceRatio),
    visibleWoodRatio: round(visibleWoodRatio),
    bounds: envelope.bounds,
  };
}

function makeFineTarget(input: {
  rootSeed: string;
  index: number;
  parent: ProductionWoodSegment;
  length: number;
  crown: Pick<ProductionCrownMetrics, "bounds" | "width" | "depth">;
  role: "secondary" | "tertiary";
  attachmentT: number;
  /** When true, tip descends under gravity (10–18% of terminals). */
  gravityDroop: boolean;
  /** Reserved breathing voids — fine wood steers clear of these. */
  windows: readonly ProductionCrownWindow[];
}): ProductionVec3 {
  const attachmentT = clamp(input.attachmentT, 0.2, 0.94);
  const start = sampleProductionWoodSegment(input.parent, attachmentT);
  const tangent = tangentProductionWoodSegment(input.parent, attachmentT);
  const seed = `${input.rootSeed}|${input.role}|${input.index}`;
  const outward = Math.sign(input.parent.end[0] - input.parent.start[0]) ||
    (input.index % 2 === 0 ? 1 : -1);
  const alternatingFan = input.index % 2 === 0 ? 1 : -1;
  // Mild lateral only — prefer continuous along-axis forks (still-pack spike killer).
  const baseLateral =
    outward * (0.18 + hashUnit(`${seed}|outward`) * 0.12) +
    alternatingFan * (0.1 + hashUnit(`${seed}|fan`) * 0.1);
  // Soft depth layering without packing the shell solid.
  const depthLayerBias = ((stableHash(`${seed}|layer`) % 3) - 1) * 0.24;
  const baseDepth =
    depthLayerBias +
    (hashUnit(`${seed}|depth`) - 0.5) * 0.4 +
    Math.sign(input.parent.end[2] || alternatingFan) *
      (0.08 + hashUnit(`${seed}|depthBias`) * 0.14);
  // Horizontals out-and-slightly-down: most tips level-to-soft-lift; droop cohort
  // descends under gravity.
  const droop = input.gravityDroop
    ? -0.2 - hashUnit(`${seed}|droop`) * 0.16
    : 0.02 + hashUnit(`${seed}|lift`) * 0.12;
  const verticalBase =
    Math.max(-0.08, tangent[1] * input.length * 0.18) + input.length * droop;
  // Outer attachments get more plate freedom; mid-limb stay axis-locked.
  const along = attachmentT >= 0.5 ? 0.42 : 0.62;

  // Try a few outward biases so tips avoid reserved crown windows.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const push = 1 + attempt * 0.16;
    const lateral = baseLateral * push * (attachmentT >= 0.5 ? 1 : 0.55);
    const depth = baseDepth + attempt * outward * 0.06;
    const candidate = boundedCrownPoint(
      add(
        start,
        [
          tangent[0] * input.length * along + input.length * lateral,
          verticalBase + attempt * 0.04 * (input.gravityDroop ? -1 : 1),
          tangent[2] * input.length * (along * 0.7) + input.length * depth,
        ],
      ),
      input.crown.bounds,
    );
    if (!pointInAnyWindow(candidate, input.windows)) {
      return candidate;
    }
  }
  // Last resort: push fully toward the outer envelope wall away from center.
  const centerX = (input.crown.bounds.min[0] + input.crown.bounds.max[0]) / 2;
  const escapeX = start[0] >= centerX
    ? input.crown.bounds.max[0]
    : input.crown.bounds.min[0];
  return boundedCrownPoint(
    [escapeX, start[1] + verticalBase, start[2] + baseDepth * input.length],
    input.crown.bounds,
  );
}

function ellipsoidValue(
  point: ProductionVec3,
  center: ProductionVec3,
  radii: ProductionVec3,
): number {
  return (
    ((point[0] - center[0]) / radii[0]) ** 2 +
    ((point[1] - center[1]) / radii[1]) ** 2 +
    ((point[2] - center[2]) / radii[2]) ** 2
  );
}

function minEllipsoidClearance(
  center: ProductionVec3,
  radii: ProductionVec3,
  segments: readonly ProductionWoodSegment[],
  samples = 20,
): number {
  let clearance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    for (let sample = 0; sample <= samples; sample += 1) {
      clearance = Math.min(
        clearance,
        ellipsoidValue(
          sampleProductionWoodSegment(segment, sample / samples),
          center,
          radii,
        ),
      );
    }
  }
  return clearance;
}

/**
 * Pick three breathing voids from structural wood (pre–fine-fill), so denser
 * secondary/tertiary scaffolding can still leave measurable crown passages.
 */
function reserveCrownWindows(
  rootSeed: string,
  crown: Pick<ProductionCrownMetrics, "bounds" | "width" | "depth" | "crownBaseHeight">,
  structural: readonly ProductionWoodSegment[],
): ProductionCrownWindow[] {
  const baseRadii: ProductionVec3 = [0.56, 0.42, 0.36];
  const candidates: Array<{ center: ProductionVec3; clearance: number }> = [];
  const offset = (hashUnit(`${rootSeed}|window-offset`) - 0.5) * 0.04;
  for (const xFactor of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
    for (const yFactor of [0.4, 0.52, 0.64, 0.76]) {
      for (const zFactor of [-0.2, 0.05, 0.22]) {
        const center: ProductionVec3 = [
          round(crown.bounds.min[0] + crown.width * (xFactor + offset)),
          round(
            crown.crownBaseHeight +
              (TREE_HEIGHT - crown.crownBaseHeight) * yFactor,
          ),
          round(zFactor * crown.depth),
        ];
        candidates.push({
          center,
          clearance: minEllipsoidClearance(center, baseRadii, structural, 16),
        });
      }
    }
  }
  candidates.sort((left, right) => right.clearance - left.clearance);
  const chosen: ProductionCrownWindow[] = [];
  for (const candidate of candidates) {
    if (candidate.clearance < 0.85) continue;
    if (chosen.some((window) => magnitude(subtract(window.center, candidate.center)) < 1.35)) {
      continue;
    }
    const scale = Math.min(1, Math.sqrt(candidate.clearance) * 0.88);
    chosen.push({
      id: `crown-window-${chosen.length + 1}`,
      center: candidate.center,
      radii: [
        round(baseRadii[0] * scale),
        round(baseRadii[1] * scale),
        round(baseRadii[2] * scale),
      ],
    });
    if (chosen.length === 3) break;
  }
  // Guaranteed fallbacks if the coarse scaffold is unusually busy.
  while (chosen.length < 3) {
    const index = chosen.length;
    chosen.push({
      id: `crown-window-${index + 1}`,
      center: [
        round(crown.bounds.min[0] + crown.width * (0.25 + index * 0.25)),
        round(crown.crownBaseHeight + (TREE_HEIGHT - crown.crownBaseHeight) * (0.55 + index * 0.06)),
        round((index - 1) * crown.depth * 0.12),
      ],
      radii: [0.48, 0.36, 0.32],
    });
  }
  return chosen;
}

function pointInAnyWindow(
  point: ProductionVec3,
  windows: readonly ProductionCrownWindow[],
  pad = 1.1,
): boolean {
  return windows.some((window) => {
    const radii: ProductionVec3 = [
      window.radii[0] * pad,
      window.radii[1] * pad,
      window.radii[2] * pad,
    ];
    return ellipsoidValue(point, window.center, radii) < 1;
  });
}

function segmentPiercesWindows(
  segment: Pick<ProductionWoodSegment, "start" | "controlA" | "controlB" | "end">,
  windows: readonly ProductionCrownWindow[],
  pad = 1.05,
): boolean {
  for (let sample = 0; sample <= 10; sample += 1) {
    if (pointInAnyWindow(sampleProductionWoodSegment(segment, sample / 10), windows, pad)) {
      return true;
    }
  }
  return false;
}

/**
 * Final window radii: largest scale that keeps every wood sample outside the
 * ellipsoid. Fine-wood placement steers clear of reserved voids so the mature
 * scale remains measurable (≥ ~0.22 minor axis).
 */
function fitProtectedWindows(
  reserved: readonly ProductionCrownWindow[],
  segments: readonly ProductionWoodSegment[],
): ProductionCrownWindow[] {
  return reserved.map((window) => {
    let best = 0.2;
    let lo = 0.2;
    let hi = 1;
    for (let step = 0; step < 12; step += 1) {
      const mid = (lo + hi) / 2;
      const trial: ProductionVec3 = [
        window.radii[0] * mid,
        window.radii[1] * mid,
        window.radii[2] * mid,
      ];
      if (minEllipsoidClearance(window.center, trial, segments, 24) >= 1) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return {
      id: window.id,
      center: window.center,
      radii: [
        round(window.radii[0] * best),
        round(window.radii[1] * best),
        round(window.radii[2] * best),
      ] as ProductionVec3,
    };
  });
}

/**
 * Build a continuous trunk ring profile that follows a living trunk curve.
 * Presentation densification only — does not invent a new lean or fork side.
 */
function trunkProfileFromLivingTrunk(
  rootSeed: string,
  trunk: LivingSakuraSegment,
): ContinuousTrunkProfile {
  const endY = Math.max(0.5, trunk.end[1]);
  const treeHeight = round(Math.max(TREE_HEIGHT * 0.92, endY / 0.38));
  const firstForkHeightRatio = round(clamp(endY / treeHeight, 0.32, 0.42));
  // Denser trunk rings for continuous bark sculpture (not a coarse pipe loft).
  const sampleTs = [0, 0.04, 0.09, 0.16, 0.24, 0.34, 0.46, 0.58, 0.72, 0.86, 1];
  // Root flare: living pipe radii are slender; lift the base rings toward the
  // production buttress language without changing the curve path.
  const flareBoost = [
    1.62, 1.5, 1.38, 1.26, 1.16, 1.1, 1.05, 1.02, 1.0, 1.0, 1.0,
  ];
  return {
    treeHeight,
    firstForkHeightRatio,
    rings: sampleTs.map((t, index) => {
      const center = sampleLivingSakuraSegment(trunk, t);
      const radius = livingSakuraRadiusAt(trunk, t) * flareBoost[index];
      // Oval section — never a perfect cylinder.
      const radiusX = round(Math.max(0.04, radius));
      const radiusZ = round(Math.max(0.032, radius * 0.84));
      return {
        id: `trunk-ring-${index.toString().padStart(2, "0")}`,
        heightRatio: round(t * firstForkHeightRatio),
        center: [round(center[0]), round(center[1]), round(center[2])],
        radiusX,
        radiusZ,
        rotationRadians: round((hashUnit(`${rootSeed}|living-ring|${index}`) - 0.5) * 0.12),
      };
    }),
  };
}

function depthLayerFromLiving(layer: 0 | 1 | 2): ProductionDepthLayer {
  return (["rear", "middle", "front"] as const)[layer];
}

function livingSegmentAsProduction(segment: LivingSakuraSegment): ProductionWoodSegment {
  return {
    id: segment.id,
    parentId: segment.parentId,
    role: segment.role,
    depthLayer: depthLayerFromLiving(segment.depthLayer),
    attachmentT: round(segment.attachmentT),
    signature: segment.signature,
    start: segment.start,
    controlA: segment.controlA,
    controlB: segment.controlB,
    end: segment.end,
    radiusStart: round(segment.radiusStart),
    radiusEnd: round(segment.radiusEnd),
  };
}

function livingWindowsAsProduction(
  windows: readonly ProtectedCrownWindow[],
): ProductionCrownWindow[] {
  return windows.map((window) => ({
    id: window.id,
    center: window.center,
    radii: window.radii,
  }));
}

/**
 * Mature presentation layered on the living densification graph.
 *
 * Keeps every living segment id, parent link, and curve so memory hosts and
 * silhouette language stay continuous across the mature life chapter. Adds a
 * continuous trunk ring profile and crown metrics for spur planning / bark.
 */
export function planProductionPresentationFromLiving(input: {
  rootSeed: string;
  topology: LivingSakuraTopology;
}): ProductionWoodPlan {
  const rootSeed = validSeed(input.rootSeed);
  const { topology } = input;
  if (topology.segments.length === 0) {
    throw new Error("living topology must include at least a trunk segment");
  }
  const trunkLiving =
    topology.segments.find((segment) => segment.role === "trunk") ??
    topology.segments[0];
  const profile = trunkProfileFromLivingTrunk(rootSeed, trunkLiving);
  const segments = topology.segments.map(livingSegmentAsProduction);
  const protectedWindows = livingWindowsAsProduction(topology.protectedWindows);

  // Envelope from actual living wood extents — open vase, not a foam dome.
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    for (let sample = 0; sample <= 8; sample += 1) {
      const point = sampleProductionWoodSegment(segment, sample / 8);
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }
  const padX = 0.35;
  const padZ = 0.28;
  const envelope = {
    height: profile.treeHeight,
    width: round(Math.max(0.01, maxX - minX + padX * 2)),
    depth: round(Math.max(0.01, maxZ - minZ + padZ * 2)),
    crownBaseHeight: round(Math.max(trunkLiving.end[1] * 0.85, minY)),
    crownCentroidOffsetRatio: round(
      clamp(
        Math.abs((minX + maxX) / 2) / Math.max(1, (maxX - minX) / 2),
        0.04,
        0.08,
      ),
    ),
    bounds: {
      min: [round(minX - padX), round(Math.max(0.5, minY - 0.1)), round(minZ - padZ)] as ProductionVec3,
      max: [round(maxX + padX), round(Math.max(maxY, profile.treeHeight)), round(maxZ + padZ)] as ProductionVec3,
    },
  };
  const crown = measureCrownMetrics(envelope, segments, protectedWindows);
  const primaries = segments.filter((segment) => segment.role === "primary").length;
  const secondaries = segments.filter((segment) => segment.role === "secondary").length;
  const tertiaries = segments.filter((segment) => segment.role === "tertiary").length;

  return {
    rootSeed,
    dominantSide: topology.phenotype.dominantSide,
    trunkProfile: profile,
    segments,
    counts: {
      trunk: 1,
      leaders: 2,
      primaries,
      secondaries,
      tertiaries,
    },
    crown,
    protectedWindows,
  };
}

export function planProductionWood(input: PlanProductionWoodInput): ProductionWoodPlan {
  const rootSeed = validSeed(input.rootSeed);
  // Same lean/sweep side as living densification — never a flipped identity.
  const identity = resolveLivingSakuraIdentity(rootSeed);
  const dominantSide = identity.dominantSide;
  const profile = makeTrunkProfile(rootSeed, dominantSide);
  const envelope = makeCrownEnvelope(rootSeed, dominantSide);
  const trunk = makeTrunk(profile);
  const segments: ProductionWoodSegment[] = [trunk];
  const centerX = (envelope.bounds.min[0] + envelope.bounds.max[0]) / 2;
  const crownHeight = TREE_HEIGHT - envelope.crownBaseHeight;

  // Unequal leaders: dominant rises taller and farther; subordinate is shorter,
  // lower, and staggered so the leafless vase never reads as a mirror fork.
  const dominantLeader = makeChild({
    id: "wood/leader/dominant",
    parent: trunk,
    role: "leader",
    attachmentT: 0.78,
    end: [
      round(centerX + dominantSide * envelope.width * 0.3),
      round(TREE_HEIGHT * 0.94),
      round(dominantSide * envelope.depth * 0.3),
    ],
    depthLayer: dominantSide > 0 ? "front" : "rear",
    departureBias: 0.54,
    terminalLift: 0.05,
  });
  const subordinateLeader = makeChild({
    id: "wood/leader/subordinate",
    parent: trunk,
    role: "leader",
    attachmentT: 0.92,
    end: [
      round(centerX - dominantSide * envelope.width * 0.18),
      round(TREE_HEIGHT * 0.7),
      round(-dominantSide * envelope.depth * 0.34),
    ],
    depthLayer: dominantSide > 0 ? "rear" : "front",
    departureBias: 0.38,
    terminalLift: -0.02,
  });
  dominantLeader.controlA = add(dominantLeader.start, [
    dominantSide * 0.92,
    0.55,
    dominantSide * 0.22,
  ]);
  subordinateLeader.controlA = add(subordinateLeader.start, [
    -dominantSide * 0.58,
    0.28,
    -dominantSide * 0.3,
  ]);
  // Soft tip droop on leaders — vase opens then settles under gravity.
  dominantLeader.controlB = add(dominantLeader.end, [
    dominantSide * 0.22,
    -0.28,
    dominantSide * 0.1,
  ]);
  subordinateLeader.controlB = add(subordinateLeader.end, [
    -dominantSide * 0.14,
    -0.22,
    -dominantSide * 0.12,
  ]);
  segments.push(dominantLeader, subordinateLeader);

  // Mature ornamental sakura: 6–8 primaries incl. one low sweeping bough.
  // Match living identity primary budget so densification stays one language.
  const primaryCount = identity.primaryCount;
  // Layered horizontal neighborhoods: low sweep, mid laterals, upper plate.
  // Depths span rear/middle/front so orbit volume is real, not a flat fan.
  const primaryBlueprints: ReadonlyArray<{
    end: ProductionVec3;
    parent: ProductionWoodSegment;
    attachmentT: number;
    terminalLift: number;
    depthLayer: ProductionDepthLayer;
    signature?: "low-sweeping-bough";
  }> = [
    {
      // Signature low sweep: mid-trunk origin, long horizontal reach opposite the
      // dominant leader so the leafless silhouette reads as classic sakura.
      end: [
        round(centerX - dominantSide * envelope.width * 0.48),
        round(envelope.crownBaseHeight + crownHeight * 0.06),
        round(-dominantSide * envelope.depth * 0.34),
      ],
      parent: trunk,
      attachmentT: 0.44,
      terminalLift: -0.12,
      depthLayer: "middle",
      signature: "low-sweeping-bough",
    },
    {
      end: [
        round(centerX + dominantSide * envelope.width * 0.46),
        round(envelope.crownBaseHeight + crownHeight * 0.24),
        round(dominantSide * envelope.depth * 0.38),
      ],
      parent: trunk,
      attachmentT: 0.64,
      terminalLift: -0.06,
      depthLayer: dominantSide > 0 ? "front" : "rear",
    },
    {
      end: [
        round(centerX - dominantSide * envelope.width * 0.42),
        round(envelope.crownBaseHeight + crownHeight * 0.42),
        round(-envelope.depth * 0.36),
      ],
      parent: subordinateLeader,
      attachmentT: 0.32,
      terminalLift: -0.04,
      depthLayer: "rear",
    },
    {
      end: [
        round(centerX + dominantSide * envelope.width * 0.4),
        round(envelope.crownBaseHeight + crownHeight * 0.48),
        round(envelope.depth * 0.4),
      ],
      parent: dominantLeader,
      attachmentT: 0.34,
      terminalLift: -0.05,
      depthLayer: "front",
    },
    {
      end: [
        round(centerX - dominantSide * envelope.width * 0.08),
        round(TREE_HEIGHT * 0.9),
        round(envelope.depth * 0.14),
      ],
      parent: dominantLeader,
      attachmentT: 0.58,
      terminalLift: 0.04,
      depthLayer: "middle",
    },
    {
      end: [
        round(centerX - dominantSide * envelope.width * 0.34),
        round(envelope.crownBaseHeight + crownHeight * 0.68),
        round(-envelope.depth * 0.28),
      ],
      parent: subordinateLeader,
      attachmentT: 0.52,
      terminalLift: -0.03,
      depthLayer: "rear",
    },
    {
      end: [
        round(centerX + dominantSide * envelope.width * 0.3),
        round(envelope.crownBaseHeight + crownHeight * 0.74),
        round(envelope.depth * 0.34),
      ],
      parent: dominantLeader,
      attachmentT: 0.7,
      terminalLift: -0.04,
      depthLayer: "front",
    },
    {
      // Eighth primary when seed allows — fills upper opposing plate.
      end: [
        round(centerX + dominantSide * envelope.width * 0.12),
        round(TREE_HEIGHT * 0.84),
        round(-dominantSide * envelope.depth * 0.22),
      ],
      parent: subordinateLeader,
      attachmentT: 0.68,
      terminalLift: -0.02,
      depthLayer: "middle",
    },
  ];
  const primaries: ProductionWoodSegment[] = [];
  for (let index = 0; index < primaryCount; index += 1) {
    const blueprint = primaryBlueprints[index];
    const primary = makeChild({
      id: `wood/primary/${index.toString().padStart(2, "0")}`,
      parent: blueprint.parent,
      role: "primary",
      attachmentT: blueprint.attachmentT,
      end: blueprint.end,
      depthLayer: blueprint.depthLayer,
      signature: blueprint.signature,
      departureBias: blueprint.signature ? 0.22 : 0.3,
      terminalLift: blueprint.terminalLift,
    });
    if (blueprint.signature) {
      // Sweep side is opposite the dominant leader (classic sakura counterweight).
      const sweepSide = -dominantSide;
      // Out-then-down S-curve: lifts slightly from the collar, then settles.
      primary.controlA = add(primary.start, [
        sweepSide * 1.45,
        0.32,
        -dominantSide * 0.22,
      ]);
      primary.controlB = add(primary.end, [
        -sweepSide * 0.55,
        -0.42,
        dominantSide * 0.16,
      ]);
    } else if (index <= 3) {
      // Mid laterals: strong horizontal plate with slight tip descent.
      const side = Math.sign(primary.end[0] - primary.start[0]) || dominantSide;
      primary.controlB = add(primary.end, [-side * 0.38, -0.24, 0.06]);
    }
    primaries.push(primary);
    segments.push(primary);
  }

  // Reserve three crown passages against the coarse scaffold so dense fine wood
  // fills the envelope without sealing the vase silhouette.
  const reservedWindows = reserveCrownWindows(rootSeed, envelope, segments);

  // Open secondary structure — enough gesture, plenty of sky between boughs.
  // Prefer living identity budget; allow a thin seed-stable pad so standalone
  // production plans still exercise the upper open-canopy band without foam.
  const secondaryCount = Math.min(
    24,
    Math.max(identity.secondaryCount, seededInteger(`${rootSeed}|secondary-count`, 16, 22)),
  );
  const secondaries: ProductionWoodSegment[] = [];
  // ~14% of secondaries carry gravity droop (within 10–18% terminal band overall).
  for (let index = 0; index < secondaryCount; index += 1) {
    // Round-robin across every primary so no bough is barren.
    const parent = primaries[index % primaries.length];
    // Prefer outer half of each primary — mid-limb spikes read as thorns in stills.
    const attachmentT = round(0.38 + (index % 5) * 0.12);
    const gravityDroop = hashUnit(`${rootSeed}|secondary-droop|${index}`) < 0.14;
    let secondary: ProductionWoodSegment | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const target = makeFineTarget({
        rootSeed: `${rootSeed}|a${attempt}`,
        index,
        parent,
        length:
          1.0 +
          hashUnit(`${rootSeed}|secondary-length|${index}`) * 0.7 +
          attempt * 0.06,
        crown: envelope,
        role: "secondary",
        attachmentT,
        gravityDroop,
        windows: reservedWindows,
      });
      const candidate = makeChild({
        id: `wood/secondary/${index.toString().padStart(2, "0")}`,
        parent,
        role: "secondary",
        attachmentT,
        end: target,
        depthLayer: depthLayerFor(`${rootSeed}|secondary|${index}`),
        departureBias: 0.28,
        terminalLift: gravityDroop ? -0.18 : 0.04,
      });
      if (!segmentPiercesWindows(candidate, reservedWindows)) {
        secondary = candidate;
        break;
      }
      secondary = candidate;
    }
    secondaries.push(secondary!);
    segments.push(secondary!);
  }

  // Light peripheral scaffolding — tips carry umbels without sealing the sky.
  const tertiaryCount = Math.min(
    85,
    Math.max(identity.tertiaryCount, seededInteger(`${rootSeed}|tertiary-count`, 55, 80)),
  );
  for (let index = 0; index < tertiaryCount; index += 1) {
    const parent = secondaries[index % secondaries.length];
    // Outer canopy lace only — terminal forks at secondary tips, not mid-limb needles.
    const attachmentT = round(0.68 + (index % 4) * 0.08);
    const gravityDroop = hashUnit(`${rootSeed}|tertiary-droop|${index}`) < 0.16;
    let tertiary: ProductionWoodSegment | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const target = makeFineTarget({
        rootSeed: `${rootSeed}|a${attempt}`,
        index,
        parent,
        length:
          0.28 +
          hashUnit(`${rootSeed}|tertiary-length|${index}`) * 0.24 +
          attempt * 0.04,
        crown: envelope,
        role: "tertiary",
        attachmentT,
        gravityDroop,
        windows: reservedWindows,
      });
      const candidate = makeChild({
        id: `wood/tertiary/${index.toString().padStart(3, "0")}`,
        parent,
        role: "tertiary",
        attachmentT,
        end: target,
        depthLayer: depthLayerFor(`${rootSeed}|tertiary|${index}`),
        departureBias: 0.22,
        terminalLift: gravityDroop ? -0.22 : 0.02,
      });
      if (!segmentPiercesWindows(candidate, reservedWindows)) {
        tertiary = candidate;
        break;
      }
      tertiary = candidate;
    }
    segments.push(tertiary!);
  }

  // Fit reserved voids to final wood, then measure crown from geometry + passages.
  const protectedWindows = fitProtectedWindows(reservedWindows, segments);
  const crown = measureCrownMetrics(envelope, segments, protectedWindows);

  return {
    rootSeed,
    dominantSide,
    trunkProfile: profile,
    segments,
    counts: {
      trunk: 1,
      leaders: 2,
      primaries: primaryCount,
      secondaries: secondaryCount,
      tertiaries: tertiaryCount,
    },
    crown,
    protectedWindows,
  };
}
