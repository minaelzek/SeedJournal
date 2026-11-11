/**
 * One lifelong wood graph. The sprout stem is the bole forever.
 * Later journals only append children (and may lengthen/thicken the same ids).
 * Lean side comes from resolveLivingSakuraIdentity so the tree never mirrors
 * overnight between chapters.
 *
 * Habit (Somei-yoshino): short aged bole, two unequal rising leaders that
 * arch under gravity, five–seven primaries including one low sweep, lace that
 * stays short so bloom — not pipes — makes the mature cloud.
 */

import { resolveLivingSakuraIdentity } from "./livingTopology";
import type {
  LivingSakuraSegment,
  LivingVec3,
  ProtectedCrownWindow,
  SakuraDepthLayer,
  SakuraSegmentRole,
} from "./livingTopology";

export const LIFELONG_TRUNK_ID = "youth/stem";

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * Math.min(1, Math.max(0, t));
}

function add(a: LivingVec3, b: LivingVec3): LivingVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: LivingVec3, s: number): LivingVec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function lengthOf(a: LivingVec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: LivingVec3): LivingVec3 {
  const len = lengthOf(a);
  return len > 1e-8 ? scale(a, 1 / len) : [0, 1, 0];
}

function sampleCubic(
  start: LivingVec3,
  controlA: LivingVec3,
  controlB: LivingVec3,
  end: LivingVec3,
  t: number,
): LivingVec3 {
  const u = 1 - t;
  return [
    u * u * u * start[0] +
      3 * u * u * t * controlA[0] +
      3 * u * t * t * controlB[0] +
      t * t * t * end[0],
    u * u * u * start[1] +
      3 * u * u * t * controlA[1] +
      3 * u * t * t * controlB[1] +
      t * t * t * end[1],
    u * u * u * start[2] +
      3 * u * u * t * controlA[2] +
      3 * u * t * t * controlB[2] +
      t * t * t * end[2],
  ];
}

function unit(seed: string, salt: string): number {
  let hash = 0x811c9dc5;
  const value = `${seed}|${salt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function orderFor(role: SakuraSegmentRole): LivingSakuraSegment["order"] {
  if (role === "trunk") return 0;
  if (role === "leader") return 1;
  if (role === "primary") return 2;
  if (role === "secondary") return 3;
  return 4;
}

function directionFromAngles(azimuthDeg: number, elevationDeg: number): LivingVec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const horiz = Math.cos(el);
  return normalize([Math.sin(az) * horiz, Math.sin(el), Math.cos(az) * horiz]);
}

function radiusAt(segment: LivingSakuraSegment, t: number): number {
  return lerp(segment.radiusStart, segment.radiusEnd, t);
}

function attachPoint(parent: LivingSakuraSegment, t: number): LivingVec3 {
  return sampleCubic(parent.start, parent.controlA, parent.controlB, parent.end, t);
}

function limb(input: {
  id: string;
  path: string;
  ordinal: number;
  parent: LivingSakuraSegment | null;
  role: SakuraSegmentRole;
  attachmentT: number;
  start: LivingVec3;
  direction: LivingVec3;
  length: number;
  radiusStart: number;
  radiusEnd: number;
  curvature: number;
  droop: number;
  /** 0 = beam; 1 = rise-then-arch (sakura vase). */
  arch: number;
  depthLayer: SakuraDepthLayer;
  signature?: LivingSakuraSegment["signature"];
}): LivingSakuraSegment {
  const direction = normalize(input.direction);
  const rawEnd = add(input.start, scale(direction, input.length));
  const end: LivingVec3 = [
    rawEnd[0],
    rawEnd[1] - input.droop * input.length,
    rawEnd[2],
  ];
  const side = normalize([direction[2], 0, -direction[0]]);
  const down: LivingVec3 = [0, -1, 0];
  const up: LivingVec3 = [0, 1, 0];
  const bend = input.curvature * input.length;
  const sag = input.droop * input.length;
  const lift = input.arch * input.length;
  return {
    id: input.id,
    address: { path: input.path, ordinal: input.ordinal },
    parentId: input.parent?.id ?? null,
    role: input.role,
    order: orderFor(input.role),
    attachmentT: input.attachmentT,
    depthLayer: input.depthLayer,
    signature: input.signature ?? null,
    start: input.start,
    // Mid-high controlB + dropped tip = a living arch, not a shelf.
    controlA: add(
      add(add(input.start, scale(direction, input.length * 0.28)), scale(side, bend)),
      add(scale(down, sag * 0.08), scale(up, lift * 0.22)),
    ),
    controlB: add(
      add(
        add(input.start, scale(direction, input.length * 0.6)),
        scale(side, -bend * 0.22),
      ),
      add(scale(down, sag * 0.18), scale(up, lift * 0.44)),
    ),
    end,
    radiusStart: input.radiusStart,
    radiusEnd: input.radiusEnd,
    terminalLoad: input.role === "tertiary" ? 1 : 2,
  };
}

function childFromParent(
  parent: LivingSakuraSegment,
  input: {
    id: string;
    path: string;
    ordinal: number;
    role: SakuraSegmentRole;
    attachmentT: number;
    azimuthDeg: number;
    elevationDeg: number;
    length: number;
    taper: number;
    curvature: number;
    droop: number;
    arch: number;
    depthLayer: SakuraDepthLayer;
    signature?: LivingSakuraSegment["signature"];
    inherit?: number;
  },
): LivingSakuraSegment {
  const start = attachPoint(parent, input.attachmentT);
  const parentDir = normalize([
    parent.end[0] - parent.start[0],
    parent.end[1] - parent.start[1],
    parent.end[2] - parent.start[2],
  ]);
  const aimed = directionFromAngles(input.azimuthDeg, input.elevationDeg);
  const inherit = input.inherit ?? 0.14;
  const direction = normalize([
    parentDir[0] * inherit + aimed[0] * (1 - inherit),
    parentDir[1] * inherit + aimed[1] * (1 - inherit),
    parentDir[2] * inherit + aimed[2] * (1 - inherit),
  ]);
  const joinRadius = radiusAt(parent, input.attachmentT);
  return limb({
    id: input.id,
    path: input.path,
    ordinal: input.ordinal,
    parent,
    role: input.role,
    attachmentT: input.attachmentT,
    start,
    direction,
    length: input.length,
    radiusStart: joinRadius * input.taper,
    radiusEnd: Math.max(0.012, joinRadius * input.taper * 0.76),
    curvature: input.curvature,
    droop: input.droop,
    arch: input.arch,
    depthLayer: input.depthLayer,
    signature: input.signature,
  });
}

/**
 * Bole only. Crown height comes from rising leaders, never a pole through
 * the canopy. Authored fork lives near 39% of finished tree height.
 */
function trunkHeight(n: number): number {
  if (n < 12) return lerp(0.78, 1.22, (n - 1) / 10);
  if (n < 48) return lerp(1.26, 1.78, (n - 12) / 35);
  if (n < 96) return lerp(1.78, 1.86, (n - 48) / 47);
  if (n < 192) return lerp(1.86, 1.92, (n - 96) / 95);
  return 1.9 + Math.min(0.08, Math.log1p(n - 192) * 0.018);
}

function trunkRadii(n: number): { base: number; tip: number } {
  if (n < 12) {
    const t = (n - 1) / 10;
    return { base: lerp(0.028, 0.048, t), tip: lerp(0.011, 0.024, t) };
  }
  if (n < 48) {
    const t = (n - 12) / 35;
    return { base: lerp(0.052, 0.092, t), tip: lerp(0.028, 0.048, t) };
  }
  if (n < 96) {
    const t = (n - 48) / 47;
    return { base: lerp(0.092, 0.138, t), tip: lerp(0.05, 0.074, t) };
  }
  if (n < 192) {
    const t = (n - 96) / 95;
    return { base: lerp(0.138, 0.21, t), tip: lerp(0.074, 0.112, t) };
  }
  const t = Math.min(1, Math.log1p(n - 192) / 8);
  return { base: lerp(0.21, 0.255, t), tip: lerp(0.112, 0.132, t) };
}

function youthShootCount(n: number): number {
  return Math.min(4, Math.max(1, n));
}

function youthElongation(n: number): number {
  if (n < 12) return 1;
  if (n < 48) return lerp(1, 1.22, (n - 12) / 35);
  if (n < 96) return lerp(1.22, 1.48, (n - 48) / 47);
  return lerp(1.48, 1.62, Math.min(1, (n - 96) / 95));
}

/**
 * Three airy passages in the living crown. Product-scale (bole ~1.8, crown
 * ~3.2) — not the unused authored 8 m lattice.
 */
export function createLifelongProtectedWindows(
  segments: readonly LivingSakuraSegment[],
): ProtectedCrownWindow[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const segment of segments) {
    if (segment.role === "trunk") continue;
    for (const point of [segment.start, segment.controlB, segment.end] as const) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }
  if (!Number.isFinite(minX)) {
    return [
      { id: "crown-window-0", center: [0, 1.6, 0.12], radii: [0.22, 0.2, 0.18], depthLayer: 1 },
      { id: "crown-window-1", center: [-0.45, 1.45, 0.28], radii: [0.18, 0.16, 0.16], depthLayer: 2 },
      { id: "crown-window-2", center: [0.42, 1.52, -0.26], radii: [0.18, 0.16, 0.16], depthLayer: 0 },
    ];
  }
  const width = Math.max(0.9, maxX - minX);
  const height = Math.max(0.7, maxY - minY);
  const cx = (minX + maxX) * 0.5;
  const crownY = minY + height * 0.56;
  const rx = Math.min(0.38, width * 0.11);
  const ry = Math.min(0.34, height * 0.13);
  const rz = Math.min(0.3, Math.max(0.16, (maxZ - minZ) * 0.2));
  return [
    {
      id: "crown-window-0",
      center: [cx, crownY + height * 0.05, 0.12],
      radii: [rx * 1.15, ry * 1.2, rz],
      depthLayer: 1,
    },
    {
      id: "crown-window-1",
      center: [cx - width * 0.26, crownY - height * 0.05, 0.32],
      radii: [rx, ry, rz],
      depthLayer: 2,
    },
    {
      id: "crown-window-2",
      center: [cx + width * 0.24, crownY + height * 0.02, -0.3],
      radii: [rx, ry, rz],
      depthLayer: 0,
    },
  ];
}

/**
 * Append-only living wood for any journal count ≥ 1.
 */
export function buildLifelongSakuraSegments(
  rootSeed: string,
  journalCount: number,
): LivingSakuraSegment[] {
  const n = Math.max(1, Math.floor(journalCount));
  const identity = resolveLivingSakuraIdentity(rootSeed);
  const side = identity.dominantSide;
  const height = trunkHeight(n);
  const { base, tip } = trunkRadii(n);
  const leanX = identity.lean * (height / 3.3);
  const leanZ = (unit(rootSeed, "life|leanZ") - 0.5) * 0.08 * (height / 1.2);

  const start: LivingVec3 = [0, 0.028, 0];
  const end: LivingVec3 = [leanX * 0.55, height, leanZ];
  const trunk = limb({
    id: LIFELONG_TRUNK_ID,
    path: LIFELONG_TRUNK_ID,
    ordinal: 1,
    parent: null,
    role: "trunk",
    attachmentT: 0,
    start,
    direction: normalize([end[0] - start[0], end[1] - start[1], end[2] - start[2]]),
    length: Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]),
    radiusStart: base,
    radiusEnd: tip,
    curvature: n < 12 ? lerp(0.22, 0.08, (n - 1) / 10) : 0.06,
    droop: n < 12 ? 0.03 : 0.008,
    arch: n < 12 ? 0.12 : 0.04,
    depthLayer: 1,
  });

  const segments: LivingSakuraSegment[] = [trunk];

  const shootCount = youthShootCount(Math.min(n, 11));
  const weekOne = Math.min(1, (Math.min(n, 11) - 1) / 6);
  const attachT = [0.78, 0.52, 0.66, 0.4];
  const elongate = youthElongation(n);
  const youthLift = n < 12 ? 0 : lerp(0, 10, Math.min(1, (n - 12) / 84));
  for (let index = 0; index < shootCount; index += 1) {
    const t = attachT[index] ?? 0.62;
    segments.push(
      childFromParent(trunk, {
        id: `youth/shoot/${index + 1}`,
        path: `youth/shoot/${index + 1}`,
        ordinal: index + 2,
        role: "primary",
        attachmentT: t,
        azimuthDeg:
          side * (52 + index * 112) +
          (unit(rootSeed, `youth|shoot|${index}|az`) - 0.5) * 22,
        elevationDeg:
          lerp(12, 22, unit(rootSeed, `youth|shoot|${index}|lift`)) +
          (n < 12 ? lerp(24, 4, (n - 1) / 10) : 0) +
          youthLift,
        length:
          lerp(0.3, 0.46, weekOne) *
          elongate *
          (1 - index * 0.035) *
          (0.94 + unit(rootSeed, `youth|shoot|${index}|len`) * 0.12),
        taper: n < 12 ? 0.7 : 0.68,
        curvature: 0.16,
        droop: n < 12 ? 0.05 : 0.08,
        arch: n < 12 ? 0.22 : 0.32,
        depthLayer: (index % 2 === 0 ? 0 : 2) as SakuraDepthLayer,
      }),
    );
  }

  if (n < 12) return segments;

  const saplingT = Math.min(1, (n - 12) / 35);
  const extraLaterals = 2 + Math.floor(saplingT * 2.2);
  for (let index = 0; index < extraLaterals; index += 1) {
    segments.push(
      childFromParent(trunk, {
        id: `life/lateral/${index + 1}`,
        path: `life/lateral/${index + 1}`,
        ordinal: 10 + index,
        role: "primary",
        attachmentT: lerp(0.28, 0.62, index / Math.max(1, extraLaterals - 1)),
        azimuthDeg:
          -side * (36 + index * 64) +
          (unit(rootSeed, `life|lat|${index}`) - 0.5) * 20,
        elevationDeg: lerp(14, 26, unit(rootSeed, `life|lat|${index}|el`)),
        length: lerp(0.72, 1.08, saplingT) * (1 - index * 0.04),
        taper: 0.52,
        curvature: 0.16,
        droop: 0.07,
        arch: 0.28,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const saplingHosts = segments.filter((segment) => segment.role === "primary");
  const saplingShoots = 4 + Math.floor(saplingT * 4);
  for (let index = 0; index < saplingShoots; index += 1) {
    const host = saplingHosts[index % saplingHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/sapling-shoot/${index + 1}`,
        path: `life/sapling-shoot/${index + 1}`,
        ordinal: 16 + index,
        role: "tertiary",
        attachmentT: lerp(0.58, 0.94, unit(rootSeed, `life|ss|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? side : -side) * (32 + (index % 5) * 26) +
          unit(rootSeed, `life|ss|${index}`) * 16,
        elevationDeg: lerp(4, 22, unit(rootSeed, `life|ss|${index}|el`)),
        length: lerp(0.18, 0.3, saplingT),
        taper: 0.62,
        curvature: 0.2,
        droop: 0.08,
        arch: 0.4,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  if (n < 48) return segments;

  // Vase keeps opening through maturity — same leader ids, longer reach.
  const vaseOpen = Math.min(1, (n - 48) / 47);
  const crownFill = n < 96 ? 0 : Math.min(1, (n - 96) / 95);
  const dominant = childFromParent(trunk, {
    id: "young/leader/dominant",
    path: "young/leader/dominant",
    ordinal: 20,
    role: "leader",
    attachmentT: 0.86,
    azimuthDeg: side * lerp(52, 66, unit(rootSeed, "young|dom|az")),
    elevationDeg: lerp(34, 42, unit(rootSeed, "young|dom|el")),
    length: lerp(1.52, 2.08, vaseOpen) + crownFill * 0.4,
    taper: 0.86,
    curvature: 0.14,
    droop: 0.16,
    arch: 0.96,
    inherit: 0.1,
    depthLayer: 2,
  });
  const subordinate = childFromParent(trunk, {
    id: "young/leader/subordinate",
    path: "young/leader/subordinate",
    ordinal: 21,
    role: "leader",
    attachmentT: 0.7,
    azimuthDeg: -side * lerp(78, 104, unit(rootSeed, "young|sub|az")),
    elevationDeg: lerp(26, 36, unit(rootSeed, "young|sub|el")),
    length: lerp(1.34, 1.88, vaseOpen) + crownFill * 0.34,
    taper: 0.78,
    curvature: 0.18,
    droop: 0.18,
    arch: 0.92,
    inherit: 0.1,
    depthLayer: 0,
  });
  segments.push(dominant, subordinate);

  for (let index = 0; index < 2; index += 1) {
    segments.push(
      childFromParent(trunk, {
        id: `life/shoulder/${index + 1}`,
        path: `life/shoulder/${index + 1}`,
        ordinal: 23 + index,
        role: "primary",
        attachmentT: index === 0 ? 0.46 : 0.58,
        azimuthDeg:
          (index === 0 ? side : -side) *
          lerp(86, 118, unit(rootSeed, `life|sh|${index}|az`)),
        elevationDeg: lerp(18, 28, unit(rootSeed, `life|sh|${index}|el`)),
        length: lerp(1.28, 1.78, vaseOpen) + crownFill * 0.22,
        taper: 0.68,
        curvature: 0.18,
        droop: 0.12,
        arch: 0.42,
        inherit: 0.08,
        depthLayer: (index === 0 ? 0 : 2) as SakuraDepthLayer,
      }),
    );
  }

  const primaryCount = 4 + Math.floor(vaseOpen * 2.2);
  const primaries: LivingSakuraSegment[] = [];
  for (let index = 0; index < primaryCount; index += 1) {
    const host = index % 2 === 0 ? dominant : subordinate;
    const primary = childFromParent(host, {
      id: `life/primary/${index + 1}`,
      path: `life/primary/${index + 1}`,
      ordinal: 30 + index,
      role: "primary",
      attachmentT: lerp(0.32, 0.78, (index + 1) / (primaryCount + 1)),
      azimuthDeg:
        (index % 2 === 0 ? side : -side) * (22 + index * 28) +
        (unit(rootSeed, `life|p|${index}`) - 0.5) * 28,
      elevationDeg: lerp(-6, 26, unit(rootSeed, `life|p|${index}|el`)),
      length: lerp(0.82, 1.18, vaseOpen) * (1 - (index % 3) * 0.05) + crownFill * 0.12,
      taper: 0.58,
      curvature: 0.16 + (index % 3) * 0.04,
      droop: 0.08 + (index % 2) * 0.06,
      arch: 0.22 + (index % 3) * 0.1,
      depthLayer: (index % 3) as SakuraDepthLayer,
    });
    primaries.push(primary);
    segments.push(primary);
  }

  const vFillCount = 3 + Math.floor(vaseOpen * 2);
  for (let index = 0; index < vFillCount; index += 1) {
    const fromDominant = index % 2 === 0;
    const host = fromDominant ? dominant : subordinate;
    segments.push(
      childFromParent(host, {
        id: `life/vfill/${index + 1}`,
        path: `life/vfill/${index + 1}`,
        ordinal: 50 + index,
        role: "secondary",
        attachmentT: lerp(0.28, 0.82, index / Math.max(1, vFillCount - 1)),
        azimuthDeg: fromDominant
          ? -side * lerp(16, 54, index / Math.max(1, vFillCount - 1))
          : side * lerp(14, 50, index / Math.max(1, vFillCount - 1)),
        elevationDeg: lerp(-4, 18, unit(rootSeed, `life|vf|${index}|el`)),
        length: lerp(0.48, 0.78, vaseOpen),
        taper: 0.5,
        curvature: 0.14,
        droop: 0.08,
        arch: 0.22,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const cleftCount = 3 + Math.floor(vaseOpen * 2);
  for (let index = 0; index < cleftCount; index += 1) {
    const fromDominant = index % 2 === 0;
    const host = fromDominant ? dominant : subordinate;
    segments.push(
      childFromParent(host, {
        id: `life/cleft/${index + 1}`,
        path: `life/cleft/${index + 1}`,
        ordinal: 62 + index,
        role: "secondary",
        attachmentT: lerp(0.24, 0.68, index / Math.max(1, cleftCount - 1)),
        azimuthDeg: fromDominant
          ? -side * lerp(42, 78, unit(rootSeed, `life|cl|${index}|az`))
          : side * lerp(40, 74, unit(rootSeed, `life|cl|${index}|az`)),
        elevationDeg: lerp(-2, 16, unit(rootSeed, `life|cl|${index}|el`)),
        length: lerp(0.34, 0.58, vaseOpen),
        taper: 0.52,
        curvature: 0.14,
        droop: 0.08,
        arch: 0.2,
        depthLayer: 1,
      }),
    );
  }

  const youngHosts = segments.filter(
    (segment) =>
      segment.role === "leader" ||
      segment.role === "primary" ||
      segment.id.startsWith("life/vfill/") ||
      segment.id.startsWith("life/cleft/"),
  );
  const secondaryCount = 5 + Math.floor(vaseOpen * 2);
  for (let index = 0; index < secondaryCount; index += 1) {
    const host = youngHosts[index % youngHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/secondary/${index + 1}`,
        path: `life/secondary/${index + 1}`,
        ordinal: 70 + index,
        role: "secondary",
        attachmentT: lerp(0.48, 0.9, unit(rootSeed, `life|s|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? side : -side) * (22 + (index % 6) * 20) +
          unit(rootSeed, `life|s|${index}`) * 14,
        elevationDeg: lerp(-4, 14, unit(rootSeed, `life|s|${index}|el`)),
        length: lerp(0.32, 0.52, vaseOpen),
        taper: 0.54,
        curvature: 0.16,
        droop: 0.1,
        arch: 0.24,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const youngShoots = 6 + Math.floor(vaseOpen * 4);
  const shootHosts = segments.filter(
    (segment) =>
      segment.role === "leader" ||
      segment.role === "primary" ||
      segment.id === "life/sweep",
  );
  for (let index = 0; index < youngShoots; index += 1) {
    const host = shootHosts[index % Math.max(1, shootHosts.length)];
    segments.push(
      childFromParent(host, {
        id: `life/young-shoot/${index + 1}`,
        path: `life/young-shoot/${index + 1}`,
        ordinal: 100 + index,
        role: "tertiary",
        attachmentT: lerp(0.74, 0.96, unit(rootSeed, `life|ys|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? 1 : -1) * (16 + (index % 7) * 24) +
          unit(rootSeed, `life|ys|${index}`) * 12,
        elevationDeg: lerp(-6, 12, unit(rootSeed, `life|ys|${index}|el`)),
        length: lerp(0.16, 0.28, vaseOpen),
        taper: 0.54,
        curvature: 0.22,
        droop: 0.12,
        arch: 0.42,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  if (n < 96) return segments;

  const estT = Math.min(1, (n - 96) / 95);
  segments.push(
    childFromParent(trunk, {
      id: "life/sweep",
      path: "life/sweep",
      ordinal: 22,
      role: "primary",
      attachmentT: 0.32,
      azimuthDeg: -side * 124,
      elevationDeg: 2,
      length: lerp(1.96, 2.48, estT),
      taper: 0.74,
      curvature: 0.24,
      droop: 0.22,
      arch: 0.58,
      inherit: 0.06,
      depthLayer: 1,
      signature: "low-sweeping-bough",
    }),
  );

  // Freeze the established pipe factory: two extra primaries appear at 96
  // and then only lengthen. No hairbrush of new equal sticks.
  const morePrimaries = 2;
  for (let index = 0; index < morePrimaries; index += 1) {
    const host = index % 2 === 0 ? dominant : subordinate;
    segments.push(
      childFromParent(host, {
        id: `life/primary/${primaryCount + index + 1}`,
        path: `life/primary/${primaryCount + index + 1}`,
        ordinal: 38 + index,
        role: "primary",
        attachmentT: lerp(0.28, 0.72, index / Math.max(1, morePrimaries - 1)),
        azimuthDeg: side * (index % 2 === 0 ? 1 : -1) * (26 + index * 18),
        elevationDeg: lerp(-2, 18, unit(rootSeed, `life|ep|${index}|el`)),
        length: lerp(0.7, 0.94, estT),
        taper: 0.62,
        curvature: 0.16,
        droop: 0.1,
        arch: 0.28,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const plateHosts = segments.filter(
    (segment) =>
      segment.role === "leader" ||
      segment.role === "primary" ||
      segment.id.startsWith("life/shoulder/"),
  );
  const plateCount = 3 + Math.floor(estT * 1);
  for (let index = 0; index < plateCount; index += 1) {
    const host = plateHosts[index % plateHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/plate/${index + 1}`,
        path: `life/plate/${index + 1}`,
        ordinal: 160 + index,
        role: "secondary",
        attachmentT: lerp(0.4, 0.84, unit(rootSeed, `life|pl|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? side : -side) * (16 + index * 14) +
          (unit(rootSeed, `life|pl|${index}|az`) - 0.5) * 18,
        elevationDeg: lerp(-4, 12, unit(rootSeed, `life|pl|${index}|el`)),
        length: lerp(0.42, 0.68, estT),
        taper: 0.52,
        curvature: 0.16,
        droop: 0.1,
        arch: 0.24,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const sweep = segments.find((segment) => segment.id === "life/sweep");
  if (sweep) {
    const fanCount = 4 + Math.floor(estT * 1);
    for (let index = 0; index < fanCount; index += 1) {
      segments.push(
        childFromParent(sweep, {
          id: `life/fan/${index + 1}`,
          path: `life/fan/${index + 1}`,
          ordinal: 170 + index,
          role: "secondary",
          attachmentT: lerp(0.28, 0.86, index / Math.max(1, fanCount - 1)),
          azimuthDeg:
            side * lerp(8, 36, unit(rootSeed, `life|fan|${index}|az`)) +
            (index % 2 === 0 ? 0 : 160),
          elevationDeg: lerp(10, 26, unit(rootSeed, `life|fan|${index}|el`)),
          length: lerp(0.38, 0.62, estT),
          taper: 0.54,
          curvature: 0.2,
          droop: 0.1,
          arch: 0.5,
          depthLayer: (index % 3) as SakuraDepthLayer,
        }),
      );
    }
  }

  const veilHosts = segments.filter(
    (segment) =>
      segment.role === "leader" ||
      segment.role === "primary" ||
      segment.id.startsWith("life/cleft/") ||
      segment.id.startsWith("life/vfill/"),
  );
  const veilCount = 5 + Math.floor(estT * 1);

  for (let index = 0; index < 4; index += 1) {
    const host = index % 2 === 0 ? dominant : subordinate;
    segments.push(
      childFromParent(host, {
        id: `life/bridge/${index + 1}`,
        path: `life/bridge/${index + 1}`,
        ordinal: 255 + index,
        role: "secondary",
        attachmentT: lerp(0.2, 0.52, index / 3),
        azimuthDeg:
          (index % 2 === 0 ? -side : side) *
          lerp(64, 108, unit(rootSeed, `life|br|${index}|az`)),
        elevationDeg: lerp(14, 28, unit(rootSeed, `life|br|${index}|el`)),
        length: lerp(0.42, 0.64, estT),
        taper: 0.6,
        curvature: 0.2,
        droop: 0.12,
        arch: 0.48,
        depthLayer: 1,
      }),
    );
  }

  const wrapHosts = segments.filter(
    (segment) =>
      segment.role === "primary" ||
      segment.role === "leader" ||
      segment.id === "life/sweep",
  );
  const wrapCount = 5 + Math.floor(estT * 1);
  for (let index = 0; index < wrapCount; index += 1) {
    const host = wrapHosts[index % wrapHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/wrap/${index + 1}`,
        path: `life/wrap/${index + 1}`,
        ordinal: 270 + index,
        role: "tertiary",
        attachmentT: lerp(0.54, 0.92, unit(rootSeed, `life|wr|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? side : -side) * (18 + (index % 5) * 22) +
          unit(rootSeed, `life|wr|${index}|az`) * 16,
        elevationDeg: lerp(-6, 12, unit(rootSeed, `life|wr|${index}|el`)),
        length: lerp(0.14, 0.24, estT),
        taper: 0.58,
        curvature: 0.24,
        droop: 0.14,
        arch: 0.4,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }
  for (let index = 0; index < veilCount; index += 1) {
    const host = veilHosts[index % veilHosts.length];
    const towardCleft = index % 2 === 0;
    segments.push(
      childFromParent(host, {
        id: `life/veil/${index + 1}`,
        path: `life/veil/${index + 1}`,
        ordinal: 220 + index,
        role: "secondary",
        attachmentT: lerp(0.3, 0.76, unit(rootSeed, `life|veil|${index}|t`)),
        azimuthDeg: towardCleft
          ? -side * lerp(32, 96, unit(rootSeed, `life|veil|${index}|az`))
          : side * lerp(18, 72, unit(rootSeed, `life|veil|${index}|az`)),
        elevationDeg: lerp(-2, 14, unit(rootSeed, `life|veil|${index}|el`)),
        length: lerp(0.28, 0.44, estT),
        taper: 0.52,
        curvature: 0.14,
        droop: 0.08,
        arch: 0.2,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const spurHosts = segments.filter(
    (segment) =>
      segment.role === "primary" ||
      segment.role === "leader" ||
      segment.id === "life/sweep",
  );
  const spurCount = 4 + Math.floor(estT * 1);
  for (let index = 0; index < spurCount; index += 1) {
    const host = spurHosts[index % spurHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/spur/${index + 1}`,
        path: `life/spur/${index + 1}`,
        ordinal: 180 + index,
        role: "tertiary",
        attachmentT: lerp(0.44, 0.8, unit(rootSeed, `life|sp|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? side : -side) * (14 + (index % 4) * 26) +
          unit(rootSeed, `life|sp|${index}|az`) * 14,
        elevationDeg: lerp(-8, 10, unit(rootSeed, `life|sp|${index}|el`)),
        length: lerp(0.16, 0.26, estT),
        taper: 0.58,
        curvature: 0.24,
        droop: 0.16,
        arch: 0.36,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  const laceHosts = segments.filter(
    (segment) =>
      segment.role === "secondary" ||
      segment.role === "primary" ||
      segment.role === "leader",
  );
  const tertiaryCount =
    8 +
    Math.floor(estT * 6) +
    (n >= 192 ? Math.min(6, 2 + Math.floor(Math.log1p(n - 192) * 1.6)) : 0);
  for (let index = 0; index < tertiaryCount; index += 1) {
    const host = laceHosts[index % laceHosts.length];
    segments.push(
      childFromParent(host, {
        id: `life/tertiary/${index + 1}`,
        path: `life/tertiary/${index + 1}`,
        ordinal: 200 + index,
        role: "tertiary",
        attachmentT: lerp(0.6, 0.95, unit(rootSeed, `life|t|${index}|t`)),
        azimuthDeg:
          (index % 2 === 0 ? 1 : -1) * (12 + (index % 8) * 20) +
          unit(rootSeed, `life|t|${index}`) * 10,
        elevationDeg: lerp(-10, 10, unit(rootSeed, `life|t|${index}|el`)),
        length: lerp(0.14, 0.24, estT),
        taper: 0.58,
        curvature: 0.26,
        droop: 0.18,
        arch: 0.38,
        depthLayer: (index % 3) as SakuraDepthLayer,
      }),
    );
  }

  return segments;
}

export function lifelongSegmentIdsAt(journalCount: number): readonly string[] {
  return buildLifelongSakuraSegments("id-probe", journalCount).map(
    (segment) => segment.id,
  );
}
