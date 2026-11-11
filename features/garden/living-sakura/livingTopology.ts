/**
 * Renderer-independent, append-stable botanical foundation for the living
 * Sakura. The complete phenotype is derived from `rootSeed`; event history
 * only reveals a parent-first prefix. Once the explicit botanical budget is
 * full, later events accumulate as care metadata instead of adding geometry.
 */

export type LivingVec3 = readonly [number, number, number];
export type SakuraDepthLayer = 0 | 1 | 2;
export type SakuraSegmentRole =
  | "trunk"
  | "leader"
  | "primary"
  | "secondary"
  | "tertiary";

export interface BotanicalAddress {
  /** Stable, human-readable path within this tree's botanical graph. */
  path: string;
  /** Parent-first ordinal; also the first event at which this segment appears. */
  ordinal: number;
}

export interface LivingSakuraSegment {
  id: string;
  address: BotanicalAddress;
  parentId: string | null;
  role: SakuraSegmentRole;
  order: 0 | 1 | 2 | 3 | 4;
  attachmentT: number;
  depthLayer: SakuraDepthLayer;
  signature: "low-sweeping-bough" | null;
  start: LivingVec3;
  controlA: LivingVec3;
  controlB: LivingVec3;
  end: LivingVec3;
  radiusStart: number;
  radiusEnd: number;
  /** Number of explicit terminal paths supported by this segment. */
  terminalLoad: number;
}

export interface ProtectedCrownWindow {
  id: string;
  center: LivingVec3;
  radii: LivingVec3;
  depthLayer: SakuraDepthLayer;
}

export interface LivingSakuraPhenotype {
  lean: number;
  dominantSide: -1 | 1;
  primaryCount: number;
  secondaryCount: number;
  tertiaryCount: number;
  dominantLeaderId: string;
  subordinateLeaderId: string;
}

/**
 * Seed-only structural identity shared by every life chapter.
 * Production presentation densifies this same language — it must never flip
 * lean side, primary budget, or low-sweep counterweight relative to growth.
 */
export interface LivingSakuraIdentity {
  dominantSide: -1 | 1;
  /** Trunk lean in degrees (3.2–5.8). */
  leanDegrees: number;
  /** Horizontal fork offset derived from leanDegrees (~3.3 m rise). */
  lean: number;
  primaryCount: number;
  secondaryCount: number;
  tertiaryCount: number;
  depthSalt: number;
}

export interface LivingSakuraCareAggregate {
  cumulativeEvents: number;
  explicitEvents: number;
  compactedEvents: number;
  /** Unbounded logarithmic age signal for future bark/ring presentation. */
  ageRings: number;
  /** Monotonic, non-saturating care signal; never a geometry count. */
  cumulativeCare: number;
}

export interface LivingSakuraTopology {
  rootSeed: string;
  phenotype: LivingSakuraPhenotype;
  cumulativeEventCount: number;
  explicitCapacity: number;
  segments: readonly LivingSakuraSegment[];
  protectedWindows: readonly ProtectedCrownWindow[];
  care: LivingSakuraCareAggregate;
}

interface MutableSegment
  extends Omit<
    LivingSakuraSegment,
    "address" | "radiusStart" | "radiusEnd" | "terminalLoad"
  > {
  addressPath: string;
  radiusStart: number;
  radiusEnd: number;
  terminalLoad: number;
}

const PIPE_EXPONENT = 2.3;
/** Three orbit depth layers — rear / middle / front crown plates. */
const DEPTH_Z: Record<SakuraDepthLayer, number> = {
  0: -1.85,
  1: 0,
  2: 1.85,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashText(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function add(left: LivingVec3, right: LivingVec3): LivingVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: LivingVec3, right: LivingVec3): LivingVec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(value: LivingVec3, scalar: number): LivingVec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function magnitude(value: LivingVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: LivingVec3): LivingVec3 {
  const length = magnitude(value);
  return length > 1e-9 ? multiply(value, 1 / length) : [0, 1, 0];
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export function sampleLivingSakuraSegment(
  segment: Pick<
    LivingSakuraSegment,
    "start" | "controlA" | "controlB" | "end"
  >,
  amount: number,
): LivingVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return [
    segment.start[0] * a + segment.controlA[0] * b + segment.controlB[0] * c + segment.end[0] * d,
    segment.start[1] * a + segment.controlA[1] * b + segment.controlB[1] * c + segment.end[1] * d,
    segment.start[2] * a + segment.controlA[2] * b + segment.controlB[2] * c + segment.end[2] * d,
  ];
}

export function tangentLivingSakuraSegment(
  segment: Pick<
    LivingSakuraSegment,
    "start" | "controlA" | "controlB" | "end"
  >,
  amount: number,
): LivingVec3 {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  return normalize([
    3 * inverse * inverse * (segment.controlA[0] - segment.start[0]) +
      6 * inverse * t * (segment.controlB[0] - segment.controlA[0]) +
      3 * t * t * (segment.end[0] - segment.controlB[0]),
    3 * inverse * inverse * (segment.controlA[1] - segment.start[1]) +
      6 * inverse * t * (segment.controlB[1] - segment.controlA[1]) +
      3 * t * t * (segment.end[1] - segment.controlB[1]),
    3 * inverse * inverse * (segment.controlA[2] - segment.start[2]) +
      6 * inverse * t * (segment.controlB[2] - segment.controlA[2]) +
      3 * t * t * (segment.end[2] - segment.controlB[2]),
  ]);
}

/**
 * Distance from a world point to the nearest sampled point on living wood.
 * Used to prove blossoms sit on bark, not in free air.
 */
export function distanceToLivingWood(
  point: LivingVec3,
  segments: readonly Pick<
    LivingSakuraSegment,
    "start" | "controlA" | "controlB" | "end" | "radiusStart" | "radiusEnd"
  >[],
  samples = 24,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    for (let index = 0; index <= samples; index += 1) {
      const amount = index / samples;
      const onWood = sampleLivingSakuraSegment(segment, amount);
      const radius = livingSakuraRadiusAt(segment, amount);
      const distance =
        Math.hypot(
          point[0] - onWood[0],
          point[1] - onWood[1],
          point[2] - onWood[2],
        ) - radius;
      if (distance < nearest) nearest = distance;
    }
  }
  return nearest;
}

/** Pipe-area interpolation prevents pinched mid-sections during rendering. */
export function livingSakuraRadiusAt(
  segment: Pick<LivingSakuraSegment, "radiusStart" | "radiusEnd">,
  amount: number,
): number {
  const t = clamp(amount, 0, 1);
  return Math.pow(
    lerp(
      Math.pow(segment.radiusStart, PIPE_EXPONENT),
      Math.pow(segment.radiusEnd, PIPE_EXPONENT),
      t,
    ),
    1 / PIPE_EXPONENT,
  );
}

function depthFor(index: number, salt: number): SakuraDepthLayer {
  return ((index + salt) % 3) as SakuraDepthLayer;
}

function makeSegment(input: {
  id: string;
  addressPath: string;
  parent: MutableSegment | null;
  role: SakuraSegmentRole;
  order: 0 | 1 | 2 | 3 | 4;
  attachmentT: number;
  depthLayer: SakuraDepthLayer;
  signature?: "low-sweeping-bough";
  end: LivingVec3;
  startTangent?: LivingVec3;
  curveBias?: number;
  arrivalLift?: number;
}): MutableSegment {
  const start = input.parent
    ? sampleLivingSakuraSegment(input.parent, input.attachmentT)
    : ([0, 0, 0] as LivingVec3);
  const direction = normalize(subtract(input.end, start));
  const length = Math.max(0.1, magnitude(subtract(input.end, start)));
  const inheritedTangent = input.parent
    ? tangentLivingSakuraSegment(input.parent, input.attachmentT)
    : input.startTangent ?? direction;
  const curveBias = input.curveBias ?? 0.38;
  const departure = normalize(
    add(multiply(inheritedTangent, curveBias), multiply(direction, 1 - curveBias)),
  );
  const arrival = normalize(
    add(multiply(direction, 0.86), [0, input.arrivalLift ?? 0.14, 0]),
  );

  return {
    id: input.id,
    addressPath: input.addressPath,
    parentId: input.parent?.id ?? null,
    role: input.role,
    order: input.order,
    attachmentT: input.parent ? input.attachmentT : 0,
    depthLayer: input.depthLayer,
    signature: input.signature ?? null,
    start,
    controlA: add(start, multiply(departure, length * 0.3)),
    controlB: add(input.end, multiply(arrival, -length * 0.32)),
    end: input.end,
    radiusStart: 0,
    radiusEnd: 0,
    terminalLoad: 1,
  };
}

function boundedPoint(value: LivingVec3): LivingVec3 {
  return [
    clamp(value[0], -6.4, 6.4),
    clamp(value[1], 1.2, 7.85),
    clamp(value[2], -3.8, 3.8),
  ];
}

function pointEntersWindow(
  point: LivingVec3,
  window: ProtectedCrownWindow,
  pad = 1,
): boolean {
  return (
    ((point[0] - window.center[0]) / window.radii[0]) ** 2 +
      ((point[1] - window.center[1]) / window.radii[1]) ** 2 +
      ((point[2] - window.center[2]) / window.radii[2]) ** 2 <=
    pad
  );
}

function curveEntersWindows(
  segment: Pick<MutableSegment, "start" | "controlA" | "controlB" | "end">,
  windows: readonly ProtectedCrownWindow[],
): boolean {
  if (windows.length === 0) return false;
  for (let index = 0; index <= 20; index += 1) {
    const point = sampleLivingSakuraSegment(segment, index / 20);
    if (windows.some((window) => pointEntersWindow(point, window, 1.06))) {
      return true;
    }
  }
  return false;
}

/** Push a tip out of a reserved void so flowering wood cannot seal the window. */
function ejectFromWindows(
  point: LivingVec3,
  windows: readonly ProtectedCrownWindow[],
): LivingVec3 {
  let result = point;
  for (const window of windows) {
    if (!pointEntersWindow(result, window, 1.1)) continue;
    const nx = (result[0] - window.center[0]) / window.radii[0];
    const ny = (result[1] - window.center[1]) / window.radii[1];
    const nz = (result[2] - window.center[2]) / window.radii[2];
    const mag = Math.hypot(nx, ny, nz) || 1;
    const scale = 1.16 / mag;
    result = boundedPoint([
      window.center[0] + nx * scale * window.radii[0],
      window.center[1] + ny * scale * window.radii[1],
      window.center[2] + nz * scale * window.radii[2],
    ]);
  }
  return result;
}

/** Keep flowering twigs in the 0.8–1.4 m band after world clamps. */
function realizeReach(
  start: LivingVec3,
  desired: LivingVec3,
  minReach: number,
  maxReach: number,
): LivingVec3 {
  let end = boundedPoint(desired);
  let delta = subtract(end, start);
  let mag = magnitude(delta);
  if (mag > maxReach && mag > 1e-9) {
    end = boundedPoint(add(start, multiply(normalize(delta), maxReach)));
    delta = subtract(end, start);
    mag = magnitude(delta);
  }
  if (mag + 1e-6 >= minReach) return end;
  const fallback = mag > 1e-9 ? normalize(delta) : normalize(subtract(desired, start));
  end = boundedPoint(add(start, multiply(fallback, minReach)));
  mag = magnitude(subtract(end, start));
  if (mag + 1e-6 >= minReach) return end;
  const xz = normalize([
    fallback[0] || desired[0] - start[0] || 0.45,
    0,
    fallback[2] || 0.22,
  ]);
  return boundedPoint(add(start, [xz[0] * minReach, 0, xz[2] * minReach]));
}

/**
 * Deterministic structural identity for one rootSeed.
 * Consumed by living densification and mature production presentation so the
 * tree never becomes a "different tree" across life chapters.
 */
export function resolveLivingSakuraIdentity(rootSeed: string): LivingSakuraIdentity {
  const seed = rootSeed.trim() || "seed-journal-sakura";
  const random = seededRandom(`living-sakura:${seed}`);
  const dominantSide: -1 | 1 = random() < 0.5 ? -1 : 1;
  // Gentle 3–6° lean expressed as horizontal offset at fork (~3.3 m).
  const leanDegrees = 3.2 + random() * 2.6;
  const lean = dominantSide * Math.tan((leanDegrees * Math.PI) / 180) * 3.3;
  // 6–8 primaries incl. low sweep — progressive densification of one language.
  const primaryCount = 6 + Math.floor(random() * 3);
  // Open structure — readable wood with sky between gestures (never foam-fill).
  // Bias high so mature/mid structure stills keep secondary plate density.
  const secondaryCount = 21 + Math.floor(random() * 6); // 21–26
  // Design band 50–90; bias high so mature structure stills keep tertiary lace plate.
  const tertiaryCount = 82 + Math.floor(random() * 20); // 82–101
  const depthSalt = Math.floor(random() * 3);
  return {
    dominantSide,
    leanDegrees,
    lean,
    primaryCount,
    secondaryCount,
    tertiaryCount,
    depthSalt,
  };
}

function createSkeleton(rootSeed: string): {
  phenotype: LivingSakuraPhenotype;
  segments: MutableSegment[];
  reservedWindows: ProtectedCrownWindow[];
} {
  const identity = resolveLivingSakuraIdentity(rootSeed);
  const {
    dominantSide,
    lean,
    primaryCount,
    secondaryCount,
    tertiaryCount,
    depthSalt,
  } = identity;
  // Residual RNG for per-segment placement (identity stream already consumed).
  const random = seededRandom(`living-sakura:${rootSeed}`);
  // Burn the identity draws so placement variance stays byte-stable with prior
  // skeletons (same stream order as the pre-extracted identity block).
  random(); // dominantSide
  random(); // leanDegrees
  random(); // primaryCount
  random(); // secondaryCount
  random(); // tertiaryCount
  random(); // depthSalt
  const segments: MutableSegment[] = [];

  const trunk = makeSegment({
    id: "trunk",
    addressPath: "T",
    parent: null,
    role: "trunk",
    order: 0,
    attachmentT: 0,
    depthLayer: 1,
    end: [lean, 3.28 + random() * 0.2, (random() - 0.5) * 0.14],
    startTangent: [lean * 0.11, 1, 0.015],
    curveBias: 0.58,
  });
  trunk.controlA = [-lean * 0.42, 0.92, 0.08];
  trunk.controlB = [lean * 0.18, 2.42, -0.07];
  segments.push(trunk);

  // Unequal leaders: dominant taller / farther; subordinate shorter, lower, staggered.
  const dominantLeader = makeSegment({
    id: "leader-dominant",
    addressPath: "T/L.d",
    parent: trunk,
    role: "leader",
    order: 1,
    attachmentT: 0.74,
    depthLayer: depthFor(0, depthSalt),
    end: boundedPoint([
      lean + dominantSide * (1.72 + random() * 0.3),
      6.48 + random() * 0.26,
      DEPTH_Z[depthFor(0, depthSalt)] * 0.64,
    ]),
    curveBias: 0.55,
    arrivalLift: 0.03,
  });
  const subordinateLeader = makeSegment({
    id: "leader-subordinate",
    addressPath: "T/L.s",
    parent: trunk,
    role: "leader",
    order: 1,
    attachmentT: 0.88,
    depthLayer: depthFor(1, depthSalt),
    end: boundedPoint([
      lean - dominantSide * (1.02 + random() * 0.24),
      5.18 + random() * 0.22,
      DEPTH_Z[depthFor(1, depthSalt)] * 0.52,
    ]),
    curveBias: 0.42,
    arrivalLift: -0.04,
  });
  dominantLeader.controlA = add(dominantLeader.start, [dominantSide * 0.38, 0.92, -0.12]);
  // Vase opens then tips settle slightly under gravity.
  dominantLeader.controlB = add(dominantLeader.end, [-dominantSide * 0.32, -0.62, 0.16]);
  subordinateLeader.controlA = add(subordinateLeader.start, [-dominantSide * 0.26, 0.52, 0.12]);
  subordinateLeader.controlB = add(subordinateLeader.end, [dominantSide * 0.2, -0.42, -0.14]);
  segments.push(dominantLeader, subordinateLeader);

  const primaries: MutableSegment[] = [];
  const sweepLayer = depthFor(2, depthSalt);
  // Counterweight to the dominant leader: long low arc opposite the lean side.
  const sweepingBough = makeSegment({
    id: "primary-sweeping",
    addressPath: "T/P.sweep",
    parent: trunk,
    role: "primary",
    order: 2,
    attachmentT: 0.3 + random() * 0.06,
    depthLayer: sweepLayer,
    signature: "low-sweeping-bough",
    // Signature counterweight: longer, lower plate so stills read unmistakably sakura.
    end: boundedPoint([
      -dominantSide * (4.05 + random() * 0.22),
      1.58 + random() * 0.18,
      DEPTH_Z[sweepLayer] * 0.78,
    ]),
    curveBias: 0.16,
    arrivalLift: -0.38,
  });
  // Lift from collar, then long horizontal plate — elegant S-curve, not a stick.
  sweepingBough.controlA = add(sweepingBough.start, [
    -dominantSide * 1.48,
    0.52,
    DEPTH_Z[sweepLayer] * 0.14,
  ]);
  // Out-and-down tip: classic low sakura sweep under gravity.
  sweepingBough.controlB = add(sweepingBough.end, [
    dominantSide * 0.82,
    -0.34,
    -DEPTH_Z[sweepLayer] * 0.12,
  ]);
  primaries.push(sweepingBough);
  segments.push(sweepingBough);

  for (let index = 1; index < primaryCount; index += 1) {
    const useDominant = index % 2 === 0;
    const parent =
      index === 1
        ? trunk
        : useDominant
          ? dominantLeader
          : subordinateLeader;
    const layer = depthFor(index + 2, depthSalt);
    const side =
      index === 1
        ? dominantSide
        : useDominant
          ? dominantSide
          : -dominantSide;
    const parentAmount = index === 1 ? 0.52 : 0.36 + ((index * 0.15) % 0.52);
    // Layered horizontal bands: mid laterals then upper plate (not antler stack).
    const verticalBand =
      index === 1
        ? 3.2 + random() * 0.22
        : index <= 3
          ? 4.15 + index * 0.28
          : 5.1 + (index - 3) * 0.32;
    // Keep opposite-side primaries shorter so the low sweep owns the mass imbalance.
    // Short majors — tip plates finish the silhouette (no long plastic cones).
    const reachMass = side === dominantSide ? 1.0 : 0.7;
    const horizontalReach = 1.85 + random() * 0.55;
    const primary = makeSegment({
      id: `primary-${index}`,
      addressPath: `${parent.addressPath}/P.${String(index).padStart(2, "0")}`,
      parent,
      role: "primary",
      order: 2,
      attachmentT: clamp(parentAmount, 0.26, 0.84),
      depthLayer: layer,
      end: boundedPoint([
        side * horizontalReach * reachMass + lean * 0.22,
        verticalBand + random() * 0.22,
        DEPTH_Z[layer] * (0.78 + random() * 0.32),
      ]),
      curveBias: 0.32 + random() * 0.1,
      // Most primaries end slightly descending — layered horizontals.
      arrivalLift: index <= 4 ? -0.12 - random() * 0.08 : -0.02 - random() * 0.06,
    });
    if (index <= 3) {
      primary.controlB = add(primary.end, [-side * 0.28, -0.24, DEPTH_Z[layer] * 0.04]);
    }
    primaries.push(primary);
    segments.push(primary);
  }

  const secondaries: MutableSegment[] = [];
  // Weight signature low-sweep first, but keep every primary/leader dressed.
  const secondaryParents = [
    sweepingBough,
    dominantLeader,
    subordinateLeader,
    ...primaries.filter((primary) => primary.id !== sweepingBough.id),
  ];
  const secondaryPerParent = new Array(secondaryParents.length).fill(0);
  for (let index = 0; index < secondaryCount; index += 1) {
    // ~36% on low-sweep for signature plate; rest round-robin so no bare spikes.
    const parentIndex =
      index % 5 === 0 || index % 5 === 2
        ? 0
        : 1 + (index % Math.max(1, secondaryParents.length - 1));
    const parent = secondaryParents[parentIndex];
    const localIndex = secondaryPerParent[parentIndex]++;
    const layer = depthFor(index + depthSalt, parentIndex);
    const onSweep = parent.signature === "low-sweeping-bough";
    // Prefer outer half of each limb — mid-trunk spikes read as thorns in stills.
    const tipBias = localIndex > 0 ? 0.12 + localIndex * 0.055 : 0.04;
    const attachmentT = clamp(
      (parent.role === "leader" ? 0.52 : onSweep ? 0.36 : 0.38) +
        localIndex * (parent.role === "leader" ? 0.12 : onSweep ? 0.1 : 0.11) +
        tipBias +
        ((hashText(`${rootSeed}:s:${index}`) % 11) - 5) * 0.005,
      0.34,
      0.94,
    );
    const start = sampleLivingSakuraSegment(parent, attachmentT);
    const tangent = tangentLivingSakuraSegment(parent, attachmentT);
    const outward = Math.sign(parent.end[0] - parent.start[0]) ||
      (parentIndex % 2 === 0 ? 1 : -1);
    const fanSide = localIndex % 2 === 0 ? 1 : -1;
    const crownMass = outward === dominantSide ? 1.22 : 0.88;
    // Outer canopy gets longer forks; inner attachments stay short & axis-locked.
    const outer = attachmentT >= 0.55 ? 1 : 0.62;
    const length =
      ((onSweep ? 0.9 : 0.82) + random() * (onSweep ? 0.52 : 0.48)) * outer;
    // ~14% of secondaries droop under gravity (part of 10–18% terminal band).
    const gravityDroop = random() < (onSweep ? 0.22 : 0.14);
    const terminalDroop = gravityDroop
      ? -0.2 - random() * 0.14
      : 0.02 + random() * 0.08;
    // Inner secondaries stay almost pure along-axis (absorb spike language).
    const along = attachmentT >= 0.55 ? 0.55 : 0.72;
    const lateral = attachmentT >= 0.55 ? 0.1 : 0.05;
    const target = boundedPoint(
      add(
        start,
        [
          tangent[0] * length * along +
            outward * length * (0.22 + random() * 0.14) * crownMass +
            fanSide * length * lateral * crownMass,
          Math.max(-0.05, tangent[1] * length * 0.22) + length * terminalDroop,
          tangent[2] * length * (along * 0.55) +
            DEPTH_Z[layer] * (0.3 + random() * 0.18),
        ],
      ),
    );
    const secondary = makeSegment({
      id: `secondary-${index}`,
      addressPath: `${parent.addressPath}/S.${String(localIndex).padStart(2, "0")}`,
      parent,
      role: "secondary",
      order: 3,
      attachmentT,
      depthLayer: layer,
      end: target,
      // High curve bias → continuous limb forks, not radial sticks.
      curveBias: attachmentT >= 0.55 ? 0.55 : 0.68,
      arrivalLift: gravityDroop ? -0.18 : 0.03,
    });
    secondaries.push(secondary);
    segments.push(secondary);
  }

  // Outer canopy lace ONLY as short terminal forks at secondary tips.
  // Mid-limb lace reads as needles/spikes in structure stills — banned.
  // Prefer low-sweep secondaries + outer-attached secondaries for plate density.
  const outerSecondaries = secondaries
    .map((secondary, secondaryIndex) => ({ secondary, secondaryIndex }))
    .sort((left, right) => {
      const leftSweep = left.secondary.parentId === sweepingBough.id ? 0 : 1;
      const rightSweep = right.secondary.parentId === sweepingBough.id ? 0 : 1;
      // Outer attachment first, then low-sweep plate, then index.
      const leftOuter = left.secondary.attachmentT >= 0.5 ? 0 : 1;
      const rightOuter = right.secondary.attachmentT >= 0.5 ? 0 : 1;
      return (
        leftSweep - rightSweep ||
        leftOuter - rightOuter ||
        right.secondary.attachmentT - left.secondary.attachmentT ||
        left.secondaryIndex - right.secondaryIndex
      );
    });
  // Only lace parents that are already outer (or on low-sweep) — no mid-limb needles.
  const laceParents = outerSecondaries.filter(
    ({ secondary }) =>
      secondary.parentId === sweepingBough.id || secondary.attachmentT >= 0.48,
  );
  const laceParentPool =
    laceParents.length > 0 ? laceParents : outerSecondaries.slice(0, Math.max(4, Math.floor(secondaryCount * 0.6)));
  const tertiaryPerLaceParent = new Array(laceParentPool.length).fill(0);
  for (let index = 0; index < tertiaryCount; index += 1) {
    const poolIndex = index % laceParentPool.length;
    const { secondary: parent, secondaryIndex } = laceParentPool[poolIndex];
    const localIndex = tertiaryPerLaceParent[poolIndex]++;
    const layer = depthFor(index + secondaryIndex, depthSalt);
    const onSweepPlate = parent.parentId === sweepingBough.id;
    // Distal third — then reach into the crown volume, not hug the parent.
    const attachmentT = clamp(
      0.72 + localIndex * 0.06 + random() * 0.04,
      0.7,
      0.97,
    );
    const start = sampleLivingSakuraSegment(parent, attachmentT);
    const tangent = tangentLivingSakuraSegment(parent, attachmentT);
    const outward = Math.sign(parent.end[0] - parent.start[0]) ||
      (secondaryIndex % 2 === 0 ? 1 : -1);
    const fanSide = localIndex % 2 === 0 ? 1 : -1;
    const crownMass = outward === dominantSide ? 1.18 : 0.96;
    // Long enough to leave the bough and hold an umbel in open air.
    const length =
      (onSweepPlate ? 0.62 : 0.85) + random() * (onSweepPlate ? 0.28 : 0.4);
    const gravityDroop = random() < (onSweepPlate ? 0.34 : 0.2);
    const terminalDroop = gravityDroop
      ? -0.12 - random() * 0.08
      : 0.14 + random() * 0.12;
    const along = 0.48 + random() * 0.16;
    const lateral = 0.32 + random() * 0.2;
    const target = boundedPoint(
      add(
        start,
        [
          tangent[0] * length * along +
            outward * length * 0.18 * crownMass +
            fanSide * length * lateral * crownMass,
          tangent[1] * length * 0.42 + length * terminalDroop,
          tangent[2] * length * (along * 0.5) +
            DEPTH_Z[layer] * (0.28 + random() * 0.22),
        ],
      ),
    );
    segments.push(
      makeSegment({
        id: `tertiary-${index}`,
        addressPath: `${parent.addressPath}/T.${String(localIndex).padStart(2, "0")}`,
        parent,
        role: "tertiary",
        order: 4,
        attachmentT,
        depthLayer: layer,
        end: target,
        // Inherit tip direction — continuous terminal fork, not mid-limb spike.
        curveBias: 0.68,
        arrivalLift: gravityDroop ? -0.16 : 0.01,
      }),
    );
  }

  // Terminal forks: continuous short thick Y-forks at major + outer secondary tips.
  // Dense outer canopy plate — never mid-limb needles or fine wire (still-pack bar).
  const tipHostSeen = new Set<string>();
  const majorTipHosts = [
    dominantLeader,
    subordinateLeader,
    sweepingBough,
    ...primaries,
  ].filter((host) => {
    if (tipHostSeen.has(host.id)) return false;
    tipHostSeen.add(host.id);
    return true;
  });
  // Outer secondaries also get tip forks so canopy plate densifies at the rim.
  const outerSecondaryHosts = secondaries.filter(
    (secondary) =>
      secondary.attachmentT >= 0.55 ||
      secondary.parentId === sweepingBough.id ||
      secondary.parentId === dominantLeader.id ||
      secondary.parentId === subordinateLeader.id,
  );
  const tipHosts: Array<{ host: MutableSegment; major: boolean }> = [
    ...majorTipHosts.map((host) => ({ host, major: true })),
    ...outerSecondaryHosts.map((host) => ({ host, major: false })),
  ];
  tipHosts.forEach(({ host, major }, hostIndex) => {
    // Majors get denser plate; outer secondaries get 2 short forks each.
    const forkCount = major
      ? host.signature || host.role === "leader"
        ? 5
        : 4
      : 2;
    for (let tip = 0; tip < forkCount; tip += 1) {
      // Near true tip so the fork continues the limb, not a mid-limb thorn.
      const attachmentT = clamp(
        (major ? 0.84 : 0.78) + tip * (major ? 0.028 : 0.06),
        major ? 0.82 : 0.74,
        0.97,
      );
      const start = sampleLivingSakuraSegment(host, attachmentT);
      const tangent = tangentLivingSakuraSegment(host, attachmentT);
      const outward = Math.sign(host.end[0] - host.start[0]) || dominantSide;
      const fanSide = tip % 2 === 0 ? 1 : -1;
      // Soft fork — mostly along parent axis, mild lateral for plate fill.
      const along = major ? 0.7 + tip * 0.02 : 0.64;
      const lateral = major ? 0.18 + tip * 0.035 : 0.22;
      // Short thick forks densify canopy tips without long stick / wire language.
      const length =
        (major
          ? host.signature
            ? 0.88
            : 0.74
          : 0.56) +
        ((hashText(`${rootSeed}:tip:${host.id}:${tip}`) % 100) / 100) *
          (major ? 0.34 : 0.26);
      const layer = depthFor(hostIndex + tip + 3, depthSalt);
      const target = boundedPoint(
        add(start, [
          tangent[0] * length * along +
            outward * length * 0.09 +
            fanSide * length * lateral,
          Math.max(
            -0.05,
            tangent[1] * length * 0.55 + length * (0.16 - tip * 0.02),
          ),
          tangent[2] * length * along * 0.62 +
            DEPTH_Z[layer] * 0.12 +
            fanSide * 0.04,
        ]),
      );
      const tipRole = major ? "secondary" : "tertiary";
      const tipSecondary = makeSegment({
        id: major
          ? `secondary-tip-${host.id}-${tip}`
          : `tertiary-tip-outer-${host.id}-${tip}`,
        addressPath: `${host.addressPath}/ST.${String(tip).padStart(2, "0")}`,
        parent: host,
        role: tipRole,
        order: major ? 3 : 4,
        attachmentT,
        depthLayer: layer,
        end: target,
        // High curve bias inherits parent direction → continuous wood, not thorn.
        curveBias: 0.8,
        arrivalLift: -0.07 - tip * 0.015,
      });
      if (major) secondaries.push(tipSecondary);
      segments.push(tipSecondary);
      // Lace twigs only on major tip forks (outer secondary forks are already lace).
      if (!major) continue;
      for (let lace = 0; lace < 3; lace += 1) {
        const laceSide =
          lace === 0 ? fanSide : lace === 1 ? -fanSide * 0.65 : fanSide * 0.25;
        const laceT = 0.55 + lace * 0.14;
        const laceStart = sampleLivingSakuraSegment(tipSecondary, laceT);
        const laceTangent = tangentLivingSakuraSegment(tipSecondary, laceT);
        const laceLen =
          0.42 +
          ((hashText(`${rootSeed}:tipt:${host.id}:${tip}:${lace}`) % 100) / 100) *
            0.22;
        const laceEnd = boundedPoint(
          add(laceStart, [
            // Continuous terminal along fork — thick outer lace plate, not wire.
            laceTangent[0] * laceLen * 0.6 + laceSide * laceLen * 0.3,
            laceTangent[1] * laceLen * 0.3 - laceLen * 0.05,
            laceTangent[2] * laceLen * 0.35 + DEPTH_Z[layer] * 0.07,
          ]),
        );
        segments.push(
          makeSegment({
            id: `tertiary-tip-${host.id}-${tip}-${lace}`,
            addressPath: `${tipSecondary.addressPath}/TT.${String(lace).padStart(2, "0")}`,
            parent: tipSecondary,
            role: "tertiary",
            order: 4,
            attachmentT: laceT,
            depthLayer: layer,
            end: laceEnd,
            curveBias: 0.74,
            arrivalLift: -0.08,
          }),
        );
      }
    }
  });

  // Append-only flowering laterals that occupy the empty air between leaders.
  const vMid: LivingVec3 = [
    (dominantLeader.end[0] + subordinateLeader.end[0]) * 0.5,
    (dominantLeader.end[1] + subordinateLeader.end[1]) * 0.5 + 0.32,
    (dominantLeader.end[2] + subordinateLeader.end[2]) * 0.5,
  ];
  for (let index = 0; index < 8; index += 1) {
    const host = index % 2 === 0 ? dominantLeader : subordinateLeader;
    const attachmentT = 0.36 + (Math.floor(index / 2) % 4) * 0.14;
    const fan = ((index % 4) - 1.5) * 0.38;
    const end = boundedPoint([
      vMid[0] +
        fan * 0.5 +
        (index % 2 === 0 ? -dominantSide : dominantSide) * 0.14,
      vMid[1] + fan * 0.2 + (Math.floor(index / 2) - 1.15) * 0.26,
      vMid[2] + DEPTH_Z[depthFor(index, depthSalt)] * 0.2,
    ]);
    const filler = makeSegment({
      id: `vfill-${index}`,
      addressPath: `${host.addressPath}/VF.${String(index).padStart(2, "0")}`,
      parent: host,
      role: "secondary",
      order: 3,
      attachmentT,
      depthLayer: depthFor(index, depthSalt),
      end,
      curveBias: 0.48,
      arrivalLift: 0.02,
    });
    segments.push(filler);
    for (let twig = 0; twig < 2; twig += 1) {
      const twigT = 0.62 + twig * 0.18;
      const twigStart = sampleLivingSakuraSegment(filler, twigT);
      segments.push(
        makeSegment({
          id: `vfill-twig-${index}-${twig}`,
          addressPath: `${filler.addressPath}/VT.${String(twig).padStart(2, "0")}`,
          parent: filler,
          role: "tertiary",
          order: 4,
          attachmentT: twigT,
          depthLayer: depthFor(index + twig, depthSalt),
          end: boundedPoint([
            twigStart[0] +
              (vMid[0] - twigStart[0]) * 0.38 +
              (twig === 0 ? 0.16 : -0.13),
            twigStart[1] + 0.14 + twig * 0.07,
            twigStart[2] + DEPTH_Z[depthFor(index + twig, depthSalt)] * 0.08,
          ]),
          curveBias: 0.7,
          arrivalLift: 0.01,
        }),
      );
    }
  }

  return {
    phenotype: {
      lean,
      dominantSide,
      primaryCount,
      secondaryCount,
      tertiaryCount,
      dominantLeaderId: dominantLeader.id,
      subordinateLeaderId: subordinateLeader.id,
    },
    segments,
    reservedWindows: [],
  };
}

function applyPipeTaper(segments: MutableSegment[]): void {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const children = new Map<string, MutableSegment[]>();
  segments.forEach((segment) => {
    if (!segment.parentId) return;
    const collection = children.get(segment.parentId) ?? [];
    collection.push(segment);
    children.set(segment.parentId, collection);
  });

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    segment.terminalLoad = 1 +
      (children.get(segment.id) ?? []).reduce(
        (total, child) => total + child.terminalLoad,
        0,
      );
  }

  const trunk = segments[0];
  trunk.radiusStart = 0.4;
  trunk.radiusEnd = 0.205;
  const roleScale: Record<Exclude<SakuraSegmentRole, "trunk">, number> = {
    leader: 0.7,
    primary: 0.56,
    secondary: 0.5,
    // Outer tip lace must read as wood plate at product distance, not fine wire.
    tertiary: 0.44,
  };
  // Fuller ends so majors/secondaries/lace never read as stick tips or wire.
  const roleTaper: Record<Exclude<SakuraSegmentRole, "trunk">, number> = {
    leader: 0.5,
    primary: 0.48,
    secondary: 0.46,
    tertiary: 0.42,
  };
  const roleMinimumStart: Record<Exclude<SakuraSegmentRole, "trunk">, number> = {
    leader: 0.084,
    primary: 0.062,
    // Tip forks need bulk so they read as wood, not thorns.
    secondary: 0.038,
    // Terminal lace plate — thick enough for still-pack wood language.
    tertiary: 0.022,
  };
  const roleMinimumEnd: Record<Exclude<SakuraSegmentRole, "trunk">, number> = {
    leader: 0.036,
    primary: 0.028,
    secondary: 0.018,
    tertiary: 0.011,
  };

  for (const segment of segments.slice(1)) {
    const parent = byId.get(segment.parentId!);
    if (!parent) throw new Error(`Missing botanical parent ${segment.parentId}.`);
    const parentRadius = livingSakuraRadiusAt(parent, segment.attachmentT);
    const loadInfluence = clamp(Math.log2(segment.terminalLoad + 1) * 0.022, 0, 0.075);
    // Signature low-sweep needs extra bulk so it reads as counterweight, not a thin stick.
    const signatureInfluence = segment.signature ? 0.06 : 0;
    // Outer tip forks + all tertiary lace get forced bulk (wood plate, not fine wire).
    const isTipFork =
      segment.id.startsWith("secondary-tip-") ||
      segment.id.startsWith("tertiary-tip-");
    // All tertiary lace is terminal-only now — treat as tip-plate bulk.
    const isOuterLace = segment.role === "tertiary" || isTipFork;
    const tipPlateBoost = isTipFork
      ? segment.role === "secondary"
        ? 0.16
        : 0.12
      : segment.role === "tertiary"
        ? 0.1
        : 0;
    const scale = Math.min(
      0.92,
      roleScale[segment.role as Exclude<SakuraSegmentRole, "trunk">] +
        loadInfluence +
        signatureInfluence +
        tipPlateBoost,
    );
    const role = segment.role as Exclude<SakuraSegmentRole, "trunk">;
    // True parent girth at join — pipe model never invents thicker-than-parent collars.
    const trueParentR = Math.max(parentRadius, 1e-5);
    const minStart = isTipFork
      ? role === "secondary"
        ? 0.052
        : 0.032
      : role === "tertiary"
        ? 0.028
        : roleMinimumStart[role];
    const minEnd = isTipFork
      ? role === "secondary"
        ? 0.028
        : 0.016
      : role === "tertiary"
        ? 0.014
        : roleMinimumEnd[role];
    const taper = isOuterLace
      ? role === "secondary"
        ? 0.58
        : 0.5
      : roleTaper[role];
    // Prefer bulk floors when parent is thick enough; always stay under parent (pipe).
    const hardCap = trueParentR * 0.92;
    const desiredStart = Math.max(
      Math.min(minStart, hardCap * 0.98),
      trueParentR * scale,
    );
    segment.radiusStart = Math.min(hardCap, desiredStart);
    segment.radiusEnd = Math.max(
      Math.min(minEnd, segment.radiusStart * 0.9),
      Math.min(segment.radiusStart * 0.95, segment.radiusStart * taper),
    );
    // Hard guarantee: continuous taper, never radiusStart <= radiusEnd.
    if (segment.radiusStart <= segment.radiusEnd) {
      segment.radiusEnd = segment.radiusStart * 0.82;
    }
  }
}

function distance(left: LivingVec3, right: LivingVec3): number {
  return magnitude(subtract(left, right));
}

function clearanceAt(center: LivingVec3, segments: readonly MutableSegment[]): number {
  let clearance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    for (let sample = 0; sample <= 16; sample += 1) {
      const amount = sample / 16;
      clearance = Math.min(
        clearance,
        distance(center, sampleLivingSakuraSegment(segment, amount)) -
          livingSakuraRadiusAt(segment, amount),
      );
    }
  }
  return clearance;
}

function createProtectedWindows(
  rootSeed: string,
  segments: readonly MutableSegment[],
  preferred: readonly ProtectedCrownWindow[] = [],
): ProtectedCrownWindow[] {
  if (preferred.length >= 3) {
    const reusable = preferred.filter((window) => {
      for (const segment of segments) {
        for (let index = 0; index <= 20; index += 1) {
          const point = sampleLivingSakuraSegment(segment, index / 20);
          if (pointEntersWindow(point, window, 1)) return false;
        }
      }
      return true;
    });
    if (reusable.length >= 3) return reusable.slice(0, 3);
  }
  const offset = ((hashText(`windows:${rootSeed}`) % 9) - 4) * 0.035;
  const candidates: Array<{
    center: LivingVec3;
    depthLayer: SakuraDepthLayer;
    clearance: number;
  }> = [];
  // Wider candidate lattice so denser terminal fill still leaves three passages.
  const xs = [-3.1, -2.4, -1.7, -1.0, -0.3, 0.3, 1.0, 1.7, 2.4, 3.1];
  const ys = [3.5, 4.05, 4.6, 5.15, 5.7, 6.25, 6.7];
  const layers: SakuraDepthLayer[] = [1, 0, 2];
  // Prefer clearance against structural wood so peripheral twigs don't erase voids.
  const structural = segments.filter(
    (segment) =>
      segment.role === "trunk" ||
      segment.role === "leader" ||
      segment.role === "primary" ||
      segment.role === "secondary",
  );
  for (const [layerIndex, layer] of layers.entries()) {
    for (const x of xs) {
      for (const y of ys) {
        const center: LivingVec3 = [
          x + offset,
          y,
          DEPTH_Z[layer] * (layerIndex === 0 ? 0.06 : 0.34),
        ];
        candidates.push({
          center,
          depthLayer: layer,
          clearance: clearanceAt(center, structural),
        });
      }
    }
  }
  candidates.sort((left, right) => right.clearance - left.clearance);

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (candidate.clearance < 0.3) continue;
    if (selected.some((window) => distance(window.center, candidate.center) < 1.45)) {
      continue;
    }
    // Confirm full wood set still leaves a usable void (radius must stay ≤ clearance).
    const fullClearance = clearanceAt(candidate.center, segments);
    if (fullClearance < 0.24) continue;
    selected.push({ ...candidate, clearance: fullClearance });
    if (selected.length === 3) break;
  }
  if (selected.length < 3) {
    // Second pass with relaxed spacing before failing the phenotype.
    for (const candidate of candidates) {
      if (candidate.clearance < 0.24) continue;
      if (selected.some((window) => distance(window.center, candidate.center) < 1.15)) {
        continue;
      }
      const fullClearance = clearanceAt(candidate.center, segments);
      if (fullClearance < 0.22) continue;
      selected.push({ ...candidate, clearance: fullClearance });
      if (selected.length === 3) break;
    }
  }
  if (selected.length < 3) {
    throw new Error("Unable to preserve three crown windows for this phenotype.");
  }

  return selected.map((window, index) => {
    // Keep ellipsoid inside the free sphere so no wood sample enters the void.
    const radius = clamp(window.clearance * 0.82, 0.2, 0.5);
    return {
      id: `crown-window-${index}`,
      center: window.center,
      radii: [radius, radius * 0.82, radius * 0.88],
      depthLayer: window.depthLayer,
    };
  });
}

function freezeSegment(
  segment: MutableSegment,
  ordinal: number,
): LivingSakuraSegment {
  return {
    id: segment.id,
    address: { path: segment.addressPath, ordinal },
    parentId: segment.parentId,
    role: segment.role,
    order: segment.order,
    attachmentT: segment.attachmentT,
    depthLayer: segment.depthLayer,
    signature: segment.signature,
    start: segment.start,
    controlA: segment.controlA,
    controlB: segment.controlB,
    end: segment.end,
    radiusStart: segment.radiusStart,
    radiusEnd: segment.radiusEnd,
    terminalLoad: segment.terminalLoad,
  };
}

/**
 * Builds the deterministic explicit projection for an unbounded event history.
 * Existing segment values never change as `cumulativeEventCount` increases.
 */
export function buildLivingSakuraTopology(input: {
  rootSeed: string;
  cumulativeEventCount: number;
}): LivingSakuraTopology {
  const rootSeed = input.rootSeed.trim() || "seed-journal-sakura";
  const cumulativeEventCount = Math.max(
    0,
    Math.floor(Number.isFinite(input.cumulativeEventCount) ? input.cumulativeEventCount : 0),
  );
  const skeleton = createSkeleton(rootSeed);
  applyPipeTaper(skeleton.segments);
  const complete = skeleton.segments.map((segment, index) =>
    freezeSegment(segment, index + 1),
  );
  const explicitCapacity = complete.length;
  const explicitEvents = Math.min(cumulativeEventCount, explicitCapacity);
  const compactedEvents = Math.max(0, cumulativeEventCount - explicitCapacity);

  return {
    rootSeed,
    phenotype: skeleton.phenotype,
    cumulativeEventCount,
    explicitCapacity,
    segments: complete.slice(0, explicitEvents),
    protectedWindows: createProtectedWindows(rootSeed, skeleton.segments),
    care: {
      cumulativeEvents: cumulativeEventCount,
      explicitEvents,
      compactedEvents,
      ageRings: compactedEvents === 0 ? 0 : Math.floor(Math.log2(compactedEvents)) + 1,
      cumulativeCare: Math.log1p(cumulativeEventCount),
    },
  };
}
