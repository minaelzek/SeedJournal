import { buildLifelongSakuraSegments } from "./lifelongSakura";
import {
  livingSakuraLifeStageForOrdinal,
  type LifeStageSegmentIntent,
  type LivingSakuraLifeStagePlan,
} from "./lifeStageTopology";
import {
  sampleLivingSakuraSegment,
  tangentLivingSakuraSegment,
  type LivingSakuraSegment,
  type LivingVec3,
  type SakuraDepthLayer,
  type SakuraSegmentRole,
} from "./livingTopology";

const DEPTH: Record<LifeStageSegmentIntent["depthLayer"], SakuraDepthLayer> = {
  rear: 0,
  middle: 1,
  front: 2,
};

const ROLE: Partial<Record<LifeStageSegmentIntent["role"], SakuraSegmentRole>> =
  {
    stem: "trunk",
    trunk: "trunk",
    leader: "leader",
    primary: "primary",
    secondary: "secondary",
    tertiary: "tertiary",
    shoot: "tertiary",
    "renewal-shoot": "tertiary",
  };

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

function cross(a: LivingVec3, b: LivingVec3): LivingVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function directionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
): LivingVec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const horiz = Math.cos(el);
  return normalize([
    Math.sin(az) * horiz,
    Math.sin(el),
    Math.cos(az) * horiz,
  ]);
}

function mapRole(role: LifeStageSegmentIntent["role"]): SakuraSegmentRole | null {
  return ROLE[role] ?? null;
}

function orderFor(role: SakuraSegmentRole): LivingSakuraSegment["order"] {
  if (role === "trunk") return 0;
  if (role === "leader") return 1;
  if (role === "primary") return 2;
  if (role === "secondary") return 3;
  return 4;
}

function parentLength(parent: LivingSakuraSegment): number {
  return Math.max(
    0.12,
    lengthOf([
      parent.end[0] - parent.start[0],
      parent.end[1] - parent.start[1],
      parent.end[2] - parent.start[2],
    ]),
  );
}

function realizeIntent(
  intent: LifeStageSegmentIntent,
  parent: LivingSakuraSegment | null,
  height: number,
  trunkRadius: number,
  taper: number,
): LivingSakuraSegment | null {
  const role = mapRole(intent.role);
  if (!role) return null;

  let start: LivingVec3;
  let direction: LivingVec3;
  let segmentLength: number;
  let radiusStart: number;
  let radiusEnd: number;

  if (!parent) {
    start = [0, 0.03, 0];
    direction = directionFromAngles(intent.azimuthDegrees, intent.elevationDegrees);
    segmentLength = height * Math.max(0.55, intent.relativeLength);
    radiusStart = trunkRadius;
    radiusEnd = trunkRadius * taper;
  } else {
    start = sampleLivingSakuraSegment(parent, intent.attachmentT);
    const parentDir = tangentLivingSakuraSegment(parent, intent.attachmentT);
    const aimed = directionFromAngles(
      intent.azimuthDegrees,
      intent.elevationDegrees,
    );
    direction = normalize([
      parentDir[0] * 0.28 + aimed[0] * 0.72,
      parentDir[1] * 0.28 + aimed[1] * 0.72,
      parentDir[2] * 0.28 + aimed[2] * 0.72,
    ]);
    segmentLength =
      parentLength(parent) * Math.max(0.22, intent.relativeLength);
    const parentRadius = Math.max(
      parent.radiusEnd,
      parent.radiusStart * (1 - intent.attachmentT * 0.55),
    );
    radiusStart = parentRadius * 0.72;
    radiusEnd = Math.max(0.006, radiusStart * taper);
  }

  if (intent.signature === "low-sweeping-bough") {
    direction = normalize([direction[0], Math.min(direction[1], 0.12), direction[2]]);
    segmentLength *= 1.22;
  }

  const end = add(start, scale(direction, segmentLength));
  const dropped: LivingVec3 = [
    end[0],
    end[1] - intent.terminalDroop * segmentLength,
    end[2],
  ];
  const side = normalize(cross(direction, [0, 1, 0]));
  const bend = intent.curvature * segmentLength * 0.35;
  const controlA = add(
    add(start, scale(direction, segmentLength * 0.32)),
    scale(side, bend),
  );
  const controlB = add(
    add(start, scale(direction, segmentLength * 0.68)),
    scale(side, -bend * 0.45),
  );

  return {
    id: intent.id,
    address: { path: intent.continuityKey, ordinal: intent.emergenceOrdinal },
    parentId: parent?.id ?? null,
    role,
    order: orderFor(role),
    attachmentT: intent.attachmentT,
    depthLayer: DEPTH[intent.depthLayer],
    signature: intent.signature,
    start,
    controlA,
    controlB,
    end: dropped,
    radiusStart,
    radiusEnd,
    terminalLoad: role === "tertiary" ? 1 : 2,
  };
}

export function realizeLifeStagePlan(
  plan: LivingSakuraLifeStagePlan,
): LivingSakuraSegment[] {
  const height = plan.contract.proportions.height;
  const trunkRadius =
    (height * plan.contract.proportions.trunkDiameterToHeight) / 2;
  const taper =
    (plan.contract.trunk.taperRatio[0] + plan.contract.trunk.taperRatio[1]) / 2;
  const realized = new Map<string, LivingSakuraSegment>();
  const ordered: LivingSakuraSegment[] = [];

  for (const intent of plan.segments) {
    const parent = intent.parentId ? realized.get(intent.parentId) ?? null : null;
    if (intent.parentId && !parent) continue;
    const segment = realizeIntent(intent, parent, height, trunkRadius, taper);
    if (!segment) continue;
    realized.set(intent.id, segment);
    ordered.push(segment);
  }

  return ordered;
}

export function realizeSakuraAtJournalCount(
  rootSeed: string,
  journalCount: number,
): {
  stage: ReturnType<typeof livingSakuraLifeStageForOrdinal>;
  segments: LivingSakuraSegment[];
} {
  const journalOrdinal = Math.max(0, Math.floor(journalCount));
  const stage = livingSakuraLifeStageForOrdinal(journalOrdinal);
  if (journalOrdinal <= 0) {
    return { stage, segments: [] };
  }
  return {
    stage,
    segments: buildLifelongSakuraSegments(rootSeed, journalOrdinal),
  };
}
