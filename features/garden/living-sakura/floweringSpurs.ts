import {
  sampleProductionWoodSegment,
  tangentProductionWoodSegment,
  type ProductionVec3,
  type ProductionWoodPlan,
  type ProductionWoodRole,
  type ProductionWoodSegment,
} from "./productionWood";

/** Branch-local flowering recipes. No Three.js objects are created here. */

export interface FloweringFrame {
  tangent: ProductionVec3;
  normal: ProductionVec3;
  binormal: ProductionVec3;
}

export interface SpurFlowerRecipe {
  id: string;
  localCenter: ProductionVec3;
  scale: number;
  petalCount: 5;
  cupDepth: number;
  radialOffsetDegrees: number;
  tiltDegrees: number;
}

export interface SpurBudRecipe {
  id: string;
  localCenter: ProductionVec3;
  scale: number;
  opening: number;
}

/** Partially open blossom — readable as half-open, not closed bud or full flower. */
export interface SpurHalfOpenRecipe {
  id: string;
  localCenter: ProductionVec3;
  scale: number;
  /** 0.4–0.75: petal flare amount for half-open morph. */
  opening: number;
  tiltDegrees: number;
}

export interface SpurPedicelRecipe {
  id: string;
  localStart: ProductionVec3;
  localEnd: ProductionVec3;
  radius: number;
  organId: string;
}

export interface FloweringClusterRecipe {
  flowers: readonly SpurFlowerRecipe[];
  buds: readonly SpurBudRecipe[];
  halfOpen: readonly SpurHalfOpenRecipe[];
  pedicels: readonly SpurPedicelRecipe[];
}

export interface FloweringSpurSite {
  id: string;
  segmentId: string;
  attachmentT: number;
  worldAnchor: ProductionVec3;
  frame: FloweringFrame;
  active: boolean;
  cluster: FloweringClusterRecipe | null;
}

export interface FloweringSpurPlan {
  rootSeed: string;
  potentialSiteCount: number;
  activeSiteCount: number;
  activeRatio: number;
  sites: readonly FloweringSpurSite[];
}

export interface PlanFloweringSpursInput {
  rootSeed: string;
  wood: ProductionWoodPlan;
  /** Optional art-directed override; production bounds remain 128–220. */
  potentialSiteCount?: number;
}

type CrownNeighborhood = "lower-left" | "lower-right" | "upper-left" | "upper-right";

interface FloweringCandidate {
  segment: ProductionWoodSegment;
  attachmentT: number;
  worldAnchor: ProductionVec3;
  neighborhood: CrownNeighborhood;
  /** Primary-bough lineage id for coverage guarantees. */
  primaryLineage: string;
  /** Higher prefers short flowering wood tips on the outer crown shell. */
  botanicalScore: number;
}

const CROWN_NEIGHBORHOODS: readonly CrownNeighborhood[] = [
  "lower-left",
  "lower-right",
  "upper-left",
  "upper-right",
];

/**
 * Sakura blossoms sit on short flowering wood near segment tips, not mid-bough.
 * Strong distal bias: tertiary spurs densest at the tip, primaries/leaders only
 * at the outer shell so structural boughs stay readable between umbels.
 */
const ATTACHMENT_BY_ROLE: Readonly<Record<Exclude<ProductionWoodRole, "trunk">, readonly number[]>> = {
  tertiary: [0.78, 0.84, 0.9, 0.95, 0.98],
  secondary: [0.74, 0.82, 0.9, 0.96],
  primary: [0.72, 0.84, 0.92, 0.98],
  leader: [0.7, 0.82, 0.9, 0.96, 0.99],
};

const ROLE_WEIGHT: Readonly<Record<Exclude<ProductionWoodRole, "trunk">, number>> = {
  tertiary: 1,
  secondary: 0.78,
  primary: 0.62,
  leader: 0.7,
};

/** Open hanami canopy: fewer sites, more sky and wood between umbels. */
const SITE_COUNT_MIN = 72;
const SITE_COUNT_MAX = 140;

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

function add(left: ProductionVec3, right: ProductionVec3): ProductionVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
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

function cross(left: ProductionVec3, right: ProductionVec3): ProductionVec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function distanceSquared(left: ProductionVec3, right: ProductionVec3): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return dx * dx + dy * dy + dz * dz;
}

function frameFor(segment: ProductionWoodSegment, attachmentT: number): FloweringFrame {
  const tangent = tangentProductionWoodSegment(segment, attachmentT);
  const reference: ProductionVec3 = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const normal = normalize(cross(reference, tangent));
  return {
    tangent,
    normal,
    binormal: normalize(cross(tangent, normal)),
  };
}

function localPoint(
  frame: FloweringFrame,
  along: number,
  radial: number,
  angle: number,
): ProductionVec3 {
  return add(
    multiply(frame.tangent, along),
    add(
      multiply(frame.normal, Math.cos(angle) * radial),
      multiply(frame.binormal, Math.sin(angle) * radial),
    ),
  );
}

function clusterFor(seed: string, frame: FloweringFrame): FloweringClusterRecipe {
  // Compact umbels (2–4 open) with short pedicels and air between clusters.
  const flowerCount = 2 + (stableHash(`${seed}|flowers`) % 3); // 2–4
  const budCount = 1 + (stableHash(`${seed}|buds`) % 2); // 1–2
  const halfOpenCount = stableHash(`${seed}|half-open`) % 2; // 0–1
  const pedicelCount = 1;
  const flowers: SpurFlowerRecipe[] = [];
  const buds: SpurBudRecipe[] = [];
  const halfOpen: SpurHalfOpenRecipe[] = [];

  for (let index = 0; index < flowerCount; index += 1) {
    const angle = (index / flowerCount) * Math.PI * 2 + (hashUnit(`${seed}|flower-angle|${index}`) - 0.5) * 0.2;
    flowers.push({
      id: `${seed}/flower/${index}`,
      // Open umbel on the outer shell — a tuft, not a single bead on the bark.
      localCenter: localPoint(
        frame,
        0.036 + hashUnit(`${seed}|flower-along|${index}`) * 0.04,
        0.034 + hashUnit(`${seed}|flower-radius|${index}`) * 0.028,
        angle,
      ).map(round) as unknown as ProductionVec3,
      scale: round(1.22 + hashUnit(`${seed}|flower-scale|${index}`) * 0.2),
      petalCount: 5,
      cupDepth: round(0.1 + hashUnit(`${seed}|flower-cup|${index}`) * 0.1),
      radialOffsetDegrees: round((hashUnit(`${seed}|flower-radial|${index}`) - 0.5) * 12),
      tiltDegrees: round((hashUnit(`${seed}|flower-tilt|${index}`) - 0.5) * 18),
    });
  }

  for (let index = 0; index < budCount; index += 1) {
    const angle = ((index + 0.5) / budCount) * Math.PI * 2 + hashUnit(`${seed}|bud-angle|${index}`) * 0.3;
    buds.push({
      id: `${seed}/bud/${index}`,
      localCenter: localPoint(
        frame,
        0.024 + hashUnit(`${seed}|bud-along|${index}`) * 0.032,
        0.028 + hashUnit(`${seed}|bud-radius|${index}`) * 0.024,
        angle,
      ).map(round) as unknown as ProductionVec3,
      scale: round(0.34 + hashUnit(`${seed}|bud-scale|${index}`) * 0.1),
      opening: round(hashUnit(`${seed}|bud-opening|${index}`) * 0.32),
    });
  }

  for (let index = 0; index < halfOpenCount; index += 1) {
    const angle =
      ((index + 0.33) / Math.max(1, halfOpenCount)) * Math.PI * 2 +
      hashUnit(`${seed}|half-angle|${index}`) * 0.35;
    halfOpen.push({
      id: `${seed}/half-open/${index}`,
      localCenter: localPoint(
        frame,
        0.028 + hashUnit(`${seed}|half-along|${index}`) * 0.036,
        0.03 + hashUnit(`${seed}|half-radius|${index}`) * 0.026,
        angle,
      ).map(round) as unknown as ProductionVec3,
      scale: round(0.74 + hashUnit(`${seed}|half-scale|${index}`) * 0.16),
      opening: round(0.42 + hashUnit(`${seed}|half-opening|${index}`) * 0.3),
      tiltDegrees: round((hashUnit(`${seed}|half-tilt|${index}`) - 0.5) * 20),
    });
  }

  const organs = [...flowers, ...buds, ...halfOpen];
  const pedicels: SpurPedicelRecipe[] = [];
  for (let index = 0; index < pedicelCount; index += 1) {
    const organ = organs[(stableHash(`${seed}|pedicel-organ|${index}`) + index) % organs.length];
    pedicels.push({
      id: `${seed}/pedicel/${index}`,
      localStart: [0, 0, 0],
      localEnd: organ.localCenter,
      // Fine green-wood stem — short and thin under each umbel organ.
      radius: round(0.005 + hashUnit(`${seed}|pedicel-radius|${index}`) * 0.0025),
      organId: organ.id,
    });
  }

  return { flowers, buds, halfOpen, pedicels };
}

function insideProtectedWindow(point: ProductionVec3, wood: ProductionWoodPlan): boolean {
  return wood.protectedWindows.some((window) => {
    const value =
      ((point[0] - window.center[0]) / window.radii[0]) ** 2 +
      ((point[1] - window.center[1]) / window.radii[1]) ** 2 +
      ((point[2] - window.center[2]) / window.radii[2]) ** 2;
    return value <= 1;
  });
}

function validSiteCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < SITE_COUNT_MIN || value > SITE_COUNT_MAX) {
    throw new Error(
      `potentialSiteCount must be an integer from ${SITE_COUNT_MIN} to ${SITE_COUNT_MAX}`,
    );
  }
  return value;
}

function crownNeighborhood(point: ProductionVec3, wood: ProductionWoodPlan): CrownNeighborhood {
  const centerX = (wood.crown.bounds.min[0] + wood.crown.bounds.max[0]) / 2;
  const centerY = (wood.crown.crownBaseHeight + wood.crown.bounds.max[1]) / 2;
  const horizontal = point[0] < centerX ? "left" : "right";
  const vertical = point[1] < centerY ? "lower" : "upper";
  return `${vertical}-${horizontal}` as CrownNeighborhood;
}

function crownCenter(wood: ProductionWoodPlan): ProductionVec3 {
  return [
    (wood.crown.bounds.min[0] + wood.crown.bounds.max[0]) / 2,
    (wood.crown.crownBaseHeight + wood.crown.bounds.max[1]) / 2,
    (wood.crown.bounds.min[2] + wood.crown.bounds.max[2]) / 2,
  ];
}

function crownRadialExtent(wood: ProductionWoodPlan): number {
  const halfWidth = (wood.crown.bounds.max[0] - wood.crown.bounds.min[0]) / 2;
  const halfDepth = (wood.crown.bounds.max[2] - wood.crown.bounds.min[2]) / 2;
  const halfHeight = (wood.crown.bounds.max[1] - wood.crown.crownBaseHeight) / 2;
  return Math.max(0.5, Math.hypot(halfWidth, halfHeight * 0.55, halfDepth));
}

/** Walk parent chain to the primary (or leader if primary missing) for coverage. */
function primaryLineageOf(
  segment: ProductionWoodSegment,
  byId: ReadonlyMap<string, ProductionWoodSegment>,
): string {
  let current: ProductionWoodSegment | undefined = segment;
  while (current) {
    if (current.role === "primary") return current.id;
    if (current.role === "leader") return current.id;
    if (current.role === "trunk" || !current.parentId) return current.id;
    current = byId.get(current.parentId);
  }
  return segment.id;
}

function botanicalScoreFor(
  segment: ProductionWoodSegment,
  attachmentT: number,
  worldAnchor: ProductionVec3,
  wood: ProductionWoodPlan,
  center: ProductionVec3,
  radialExtent: number,
): number {
  if (segment.role === "trunk") return 0;
  const roleWeight = ROLE_WEIGHT[segment.role];
  // Strong distal preference — flowering wood tips carry umbels, not mid-bough foam.
  const tipScore = 0.18 + attachmentT * 0.82;
  const radial =
    Math.hypot(
      worldAnchor[0] - center[0],
      (worldAnchor[1] - center[1]) * 0.55,
      worldAnchor[2] - center[2],
    ) / radialExtent;
  // Outer crown shell scores highest. Interior crotch wood stays eligible but loses.
  const peripheryScore = 0.12 + Math.min(1, radial) * 0.88;
  const signatureScore =
    segment.signature === "low-sweeping-bough" ? 1.7 : 1;
  const leaderScore = segment.role === "leader" ? 1.35 : 1;
  return roleWeight * tipScore * peripheryScore * signatureScore * leaderScore;
}

function floweringCandidates(
  rootSeed: string,
  hosts: readonly ProductionWoodSegment[],
  wood: ProductionWoodPlan,
): ReadonlyMap<CrownNeighborhood, readonly FloweringCandidate[]> {
  const byId = new Map(wood.segments.map((segment) => [segment.id, segment]));
  const center = crownCenter(wood);
  const radialExtent = crownRadialExtent(wood);
  const buckets = new Map<CrownNeighborhood, FloweringCandidate[]>(
    CROWN_NEIGHBORHOODS.map((neighborhood) => [neighborhood, []]),
  );

  for (const segment of [...hosts].sort((left, right) => left.id.localeCompare(right.id))) {
    if (segment.role === "trunk") continue;
    const levels = ATTACHMENT_BY_ROLE[segment.role];
    for (const attachmentT of levels) {
      const worldAnchor = sampleProductionWoodSegment(segment, attachmentT);
      if (insideProtectedWindow(worldAnchor, wood)) continue;
      const neighborhood = crownNeighborhood(worldAnchor, wood);
      const score = botanicalScoreFor(
        segment,
        attachmentT,
        worldAnchor,
        wood,
        center,
        radialExtent,
      );
      buckets.get(neighborhood)!.push({
        segment,
        attachmentT,
        worldAnchor,
        neighborhood,
        primaryLineage: primaryLineageOf(segment, byId),
        botanicalScore: score,
      });
    }
  }

  let totalCandidates = 0;
  for (const neighborhood of CROWN_NEIGHBORHOODS) {
    const candidates = buckets.get(neighborhood)!;
    totalCandidates += candidates.length;
    // Rank: botanical preference first, then deterministic hash for ties.
    // Empty neighborhoods are allowed on open vases; selection rebalances later.
    candidates.sort((left, right) => {
      const scoreDifference = right.botanicalScore - left.botanicalScore;
      if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
      const leftRank = stableHash(
        `${rootSeed}|candidate|${left.segment.id}|${left.attachmentT}`,
      );
      const rightRank = stableHash(
        `${rootSeed}|candidate|${right.segment.id}|${right.attachmentT}`,
      );
      return leftRank - rightRank || left.segment.id.localeCompare(right.segment.id) || left.attachmentT - right.attachmentT;
    });
  }
  if (totalCandidates === 0) {
    throw new Error("wood plan must provide at least one flowering host");
  }

  return buckets;
}

/**
 * Greedy occupancy packing: pick highest-ranked candidates that stay at least
 * minSeparation apart so the canopy reads lush but breathing (not solid foam).
 */
function packWithOccupancy(
  ranked: readonly FloweringCandidate[],
  count: number,
  minSeparation: number,
): FloweringCandidate[] {
  const selected: FloweringCandidate[] = [];
  const minSeparationSq = minSeparation * minSeparation;
  for (const candidate of ranked) {
    if (selected.length >= count) break;
    const tooClose = selected.some(
      (other) => distanceSquared(candidate.worldAnchor, other.worldAnchor) < minSeparationSq,
    );
    if (tooClose) continue;
    selected.push(candidate);
  }
  // Soft fill only to 80% of min separation — never pack without spacing.
  if (selected.length < count) {
    const relaxedSq = minSeparationSq * 0.64;
    for (const candidate of ranked) {
      if (selected.length >= count) break;
      if (selected.includes(candidate)) continue;
      const tooClose = selected.some(
        (other) => distanceSquared(candidate.worldAnchor, other.worldAnchor) < relaxedSq,
      );
      if (tooClose) continue;
      selected.push(candidate);
    }
  }
  return selected;
}

function selectPotentialSites(
  rootSeed: string,
  candidates: ReadonlyMap<CrownNeighborhood, readonly FloweringCandidate[]>,
  potentialSiteCount: number,
  wood: ProductionWoodPlan,
): FloweringCandidate[] {
  const radialExtent = crownRadialExtent(wood);
  // Airy spacing: wider gaps between umbels so sky and wood stay readable.
  const densityScale = Math.sqrt(110 / Math.max(potentialSiteCount, 1));
  const minSeparation = radialExtent * 0.055 * densityScale;

  const neighborhoodOffset = stableHash(`${rootSeed}|neighborhood-offset`) % CROWN_NEIGHBORHOODS.length;
  // Fair base quota per quadrant; remainder by deterministic neighborhood order.
  const baseQuota = Math.floor(potentialSiteCount / 4);
  const remainder = potentialSiteCount % 4;
  const remainderOrder = [...CROWN_NEIGHBORHOODS].sort((left, right) => {
    const difference =
      stableHash(`${rootSeed}|site-neighborhood|${left}`) -
      stableHash(`${rootSeed}|site-neighborhood|${right}`);
    return difference || left.localeCompare(right);
  });
  const quota = new Map<CrownNeighborhood, number>(
    CROWN_NEIGHBORHOODS.map((neighborhood) => [neighborhood, baseQuota]),
  );
  for (let index = 0; index < remainder; index += 1) {
    const neighborhood = remainderOrder[index];
    quota.set(neighborhood, quota.get(neighborhood)! + 1);
  }

  const selected: FloweringCandidate[] = [];
  const used = new Set<FloweringCandidate>();

  // Pass 1: balanced pack per neighborhood (outer shell / tip preference already ranked).
  for (let step = 0; step < CROWN_NEIGHBORHOODS.length; step += 1) {
    const neighborhood = CROWN_NEIGHBORHOODS[(step + neighborhoodOffset) % CROWN_NEIGHBORHOODS.length];
    const bucket = candidates.get(neighborhood)!;
    const packed = packWithOccupancy(bucket, quota.get(neighborhood)!, minSeparation);
    for (const candidate of packed) {
      if (used.has(candidate)) continue;
      used.add(candidate);
      selected.push(candidate);
    }
  }

  // Pass 2: primary-lineage coverage — no empty primary boughs.
  const lineageCounts = new Map<string, number>();
  for (const candidate of selected) {
    lineageCounts.set(
      candidate.primaryLineage,
      (lineageCounts.get(candidate.primaryLineage) ?? 0) + 1,
    );
  }
  const allLineages = new Set<string>();
  for (const neighborhood of CROWN_NEIGHBORHOODS) {
    for (const candidate of candidates.get(neighborhood)!) {
      allLineages.add(candidate.primaryLineage);
    }
  }
  const underCovered = [...allLineages].filter((lineage) => (lineageCounts.get(lineage) ?? 0) < 2);
  if (underCovered.length > 0) {
    const pool = CROWN_NEIGHBORHOODS.flatMap((neighborhood) => [...candidates.get(neighborhood)!]);
    pool.sort((left, right) => {
      const scoreDifference = right.botanicalScore - left.botanicalScore;
      if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
      const leftRank = stableHash(`${rootSeed}|coverage|${left.segment.id}|${left.attachmentT}`);
      const rightRank = stableHash(`${rootSeed}|coverage|${right.segment.id}|${right.attachmentT}`);
      return leftRank - rightRank;
    });
    for (const lineage of underCovered.sort((a, b) => a.localeCompare(b))) {
      const need = 2 - (lineageCounts.get(lineage) ?? 0);
      let added = 0;
      for (const candidate of pool) {
        if (added >= need) break;
        if (candidate.primaryLineage !== lineage || used.has(candidate)) continue;
        // Prefer swapping a lower-scored same-neighborhood site when at budget.
        if (selected.length >= potentialSiteCount) {
          const victimIndex = selected.findIndex(
            (site) =>
              site.neighborhood === candidate.neighborhood &&
              (lineageCounts.get(site.primaryLineage) ?? 0) > 2 &&
              site.botanicalScore < candidate.botanicalScore,
          );
          if (victimIndex < 0) continue;
          const victim = selected[victimIndex];
          used.delete(victim);
          lineageCounts.set(
            victim.primaryLineage,
            (lineageCounts.get(victim.primaryLineage) ?? 1) - 1,
          );
          selected[victimIndex] = candidate;
        } else {
          selected.push(candidate);
        }
        used.add(candidate);
        lineageCounts.set(lineage, (lineageCounts.get(lineage) ?? 0) + 1);
        added += 1;
      }
    }
  }

  // Pass 2b: the vase silhouette must carry bloom — sweep + both leaders.
  const structuralNeed: Array<{ match: (id: string, signature: ProductionWoodSegment["signature"]) => boolean; need: number }> = [
    {
      match: (_id, signature) => signature === "low-sweeping-bough",
      need: 4,
    },
    {
      match: (id) => id.includes("leader/dominant"),
      need: 3,
    },
    {
      match: (id) => id.includes("leader/subordinate"),
      need: 3,
    },
  ];
  {
    const pool = CROWN_NEIGHBORHOODS.flatMap((neighborhood) => [
      ...candidates.get(neighborhood)!,
    ]);
    pool.sort((left, right) => {
      const scoreDifference = right.botanicalScore - left.botanicalScore;
      if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
      return left.segment.id.localeCompare(right.segment.id);
    });
    for (const rule of structuralNeed) {
      const held = selected.filter((site) =>
        rule.match(site.segment.id, site.segment.signature),
      ).length;
      let added = 0;
      for (const candidate of pool) {
        if (held + added >= rule.need) break;
        if (used.has(candidate)) continue;
        if (!rule.match(candidate.segment.id, candidate.segment.signature)) {
          continue;
        }
        if (selected.length >= potentialSiteCount) {
          const victimIndex = selected.findIndex(
            (site) =>
              !structuralNeed.some((other) =>
                other.match(site.segment.id, site.segment.signature),
              ) && site.botanicalScore < candidate.botanicalScore,
          );
          if (victimIndex < 0) continue;
          const victim = selected[victimIndex];
          used.delete(victim);
          selected[victimIndex] = candidate;
        } else {
          selected.push(candidate);
        }
        used.add(candidate);
        added += 1;
      }
    }
  }

  // Pass 3: top-up preferring under-filled neighborhoods so L/R/U/D stay balanced.
  if (selected.length < potentialSiteCount) {
    const countByNeighborhood = new Map<CrownNeighborhood, number>(
      CROWN_NEIGHBORHOODS.map((neighborhood) => [neighborhood, 0]),
    );
    for (const site of selected) {
      countByNeighborhood.set(
        site.neighborhood,
        (countByNeighborhood.get(site.neighborhood) ?? 0) + 1,
      );
    }
    while (selected.length < potentialSiteCount) {
      const neediest = [...CROWN_NEIGHBORHOODS].sort((left, right) => {
        const countDifference =
          (countByNeighborhood.get(left) ?? 0) - (countByNeighborhood.get(right) ?? 0);
        if (countDifference !== 0) return countDifference;
        return (
          stableHash(`${rootSeed}|topup-need|${left}`) -
          stableHash(`${rootSeed}|topup-need|${right}`)
        );
      })[0];
      const pool = candidates
        .get(neediest)!
        .filter((candidate) => !used.has(candidate))
        .sort((left, right) => {
          const scoreDifference = right.botanicalScore - left.botanicalScore;
          if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
          return (
            stableHash(`${rootSeed}|topup|${left.segment.id}|${left.attachmentT}`) -
            stableHash(`${rootSeed}|topup|${right.segment.id}|${right.attachmentT}`)
          );
        });
      const next = packWithOccupancy(pool, 1, minSeparation * 0.8)[0];
      if (!next) {
        // Exhausted this neighborhood — fall back to any remaining tip.
        const any = CROWN_NEIGHBORHOODS.flatMap((neighborhood) =>
          candidates.get(neighborhood)!.filter((candidate) => !used.has(candidate)),
        ).sort((left, right) => right.botanicalScore - left.botanicalScore)[0];
        if (!any) break;
        used.add(any);
        selected.push(any);
        countByNeighborhood.set(
          any.neighborhood,
          (countByNeighborhood.get(any.neighborhood) ?? 0) + 1,
        );
        continue;
      }
      used.add(next);
      selected.push(next);
      countByNeighborhood.set(
        next.neighborhood,
        (countByNeighborhood.get(next.neighborhood) ?? 0) + 1,
      );
    }
  }

  // Pass 4: rebalance world-space left/right so a low sweep does not steal the whole canopy.
  const centerX =
    selected.reduce((sum, site) => sum + site.worldAnchor[0], 0) /
    Math.max(1, selected.length);
  let leftSites = selected.filter((site) => site.worldAnchor[0] < centerX);
  let rightSites = selected.filter((site) => site.worldAnchor[0] >= centerX);
  const targetHalf = Math.floor(potentialSiteCount / 2);
  const swapPool = CROWN_NEIGHBORHOODS.flatMap((neighborhood) =>
    candidates.get(neighborhood)!.filter((candidate) => !used.has(candidate)),
  ).sort((a, b) => b.botanicalScore - a.botanicalScore);

  const rebalance = (
    heavy: FloweringCandidate[],
    light: FloweringCandidate[],
    preferSide: "left" | "right",
  ) => {
    while (heavy.length > targetHalf + 2 && light.length < targetHalf - 2) {
      const victim = heavy.sort((a, b) => a.botanicalScore - b.botanicalScore)[0];
      if (!victim) break;
      const replacement = swapPool.find((candidate) =>
        preferSide === "left"
          ? candidate.worldAnchor[0] < centerX
          : candidate.worldAnchor[0] >= centerX,
      );
      if (!replacement) break;
      const index = selected.indexOf(victim);
      if (index < 0) break;
      used.delete(victim);
      used.add(replacement);
      selected[index] = replacement;
      swapPool.splice(swapPool.indexOf(replacement), 1);
      leftSites = selected.filter((site) => site.worldAnchor[0] < centerX);
      rightSites = selected.filter((site) => site.worldAnchor[0] >= centerX);
      heavy.length = 0;
      light.length = 0;
      heavy.push(
        ...(preferSide === "right" ? leftSites : rightSites),
      );
      light.push(
        ...(preferSide === "right" ? rightSites : leftSites),
      );
    }
  };
  if (leftSites.length > rightSites.length) {
    rebalance(leftSites, rightSites, "right");
  } else if (rightSites.length > leftSites.length) {
    rebalance(rightSites, leftSites, "left");
  }

  // Stable order for site ids: neighborhood round-robin then botanical score.
  selected.sort((left, right) => {
    const leftNeighborhood = CROWN_NEIGHBORHOODS.indexOf(left.neighborhood);
    const rightNeighborhood = CROWN_NEIGHBORHOODS.indexOf(right.neighborhood);
    const rotatedLeft = (leftNeighborhood - neighborhoodOffset + 4) % 4;
    const rotatedRight = (rightNeighborhood - neighborhoodOffset + 4) % 4;
    if (rotatedLeft !== rotatedRight) return rotatedLeft - rotatedRight;
    const scoreDifference = right.botanicalScore - left.botanicalScore;
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
    return (
      left.segment.id.localeCompare(right.segment.id) ||
      left.attachmentT - right.attachmentT
    );
  });

  return selected.slice(0, potentialSiteCount);
}

function activeSiteIndices(
  rootSeed: string,
  siteNeighborhoods: readonly CrownNeighborhood[],
  activeSiteCount: number,
): ReadonlySet<number> {
  const indicesByNeighborhood = new Map<CrownNeighborhood, number[]>(
    CROWN_NEIGHBORHOODS.map((neighborhood) => [neighborhood, []]),
  );
  siteNeighborhoods.forEach((neighborhood, index) => {
    indicesByNeighborhood.get(neighborhood)!.push(index);
  });

  const remainderOrder = [...CROWN_NEIGHBORHOODS].sort((left, right) => {
    const difference = stableHash(`${rootSeed}|active-neighborhood|${left}`) -
      stableHash(`${rootSeed}|active-neighborhood|${right}`);
    return difference || left.localeCompare(right);
  });
  const quota = new Map<CrownNeighborhood, number>(
    CROWN_NEIGHBORHOODS.map((neighborhood) => [neighborhood, Math.floor(activeSiteCount / 4)]),
  );
  for (let index = 0; index < activeSiteCount % 4; index += 1) {
    const neighborhood = remainderOrder[index];
    quota.set(neighborhood, quota.get(neighborhood)! + 1);
  }

  const activeIndices = new Set<number>();
  for (const neighborhood of CROWN_NEIGHBORHOODS) {
    const ranked = indicesByNeighborhood.get(neighborhood)!.sort((left, right) => {
      const difference = stableHash(`${rootSeed}|active|${left}`) - stableHash(`${rootSeed}|active|${right}`);
      return difference || left - right;
    });
    ranked.slice(0, quota.get(neighborhood)).forEach((index) => activeIndices.add(index));
  }
  // Backfill if a sparse neighborhood could not meet its quota (keep target density).
  if (activeIndices.size < activeSiteCount) {
    const remaining = siteNeighborhoods
      .map((_, index) => index)
      .filter((index) => !activeIndices.has(index))
      .sort((left, right) => {
        const difference =
          stableHash(`${rootSeed}|active-fill|${left}`) -
          stableHash(`${rootSeed}|active-fill|${right}`);
        return difference || left - right;
      });
    for (const index of remaining) {
      if (activeIndices.size >= activeSiteCount) break;
      activeIndices.add(index);
    }
  }
  return activeIndices;
}

export function planFloweringSpurs(input: PlanFloweringSpursInput): FloweringSpurPlan {
  const rootSeed = input.rootSeed.trim();
  if (!rootSeed) throw new Error("rootSeed must not be empty");
  const potentialSiteCount = validSiteCount(
    input.potentialSiteCount ?? SITE_COUNT_MIN + (stableHash(`${rootSeed}|site-count`) % (SITE_COUNT_MAX - SITE_COUNT_MIN + 1)),
  );
  // Peak bloom occupies ~42–55% of sites — deliberately airy, not filled foam.
  const activeRatioTarget = 0.42 + hashUnit(`${rootSeed}|active-ratio`) * 0.13;
  const activeSiteCount = Math.max(
    1,
    Math.min(
      potentialSiteCount,
      Math.round(potentialSiteCount * activeRatioTarget),
    ),
  );
  const hosts = input.wood.segments.filter((segment) => segment.role !== "trunk");
  if (hosts.length === 0) {
    throw new Error("wood plan must contain non-trunk flowering hosts");
  }

  const candidates = floweringCandidates(rootSeed, hosts, input.wood);
  const selectedCandidates = selectPotentialSites(
    rootSeed,
    candidates,
    potentialSiteCount,
    input.wood,
  );
  if (selectedCandidates.length < potentialSiteCount) {
    throw new Error(
      `insufficient flowering candidates: need ${potentialSiteCount}, got ${selectedCandidates.length}`,
    );
  }

  const activeIndices = activeSiteIndices(
    rootSeed,
    selectedCandidates.map((candidate) => candidate.neighborhood),
    activeSiteCount,
  );

  const sites: FloweringSpurSite[] = [];
  for (let index = 0; index < potentialSiteCount; index += 1) {
    const { segment: host, attachmentT, worldAnchor } = selectedCandidates[index];
    const id = `flowering-spur/${index.toString().padStart(3, "0")}`;
    const frame = frameFor(host, attachmentT);
    const active = activeIndices.has(index);
    sites.push({
      id,
      segmentId: host.id,
      attachmentT: round(attachmentT),
      worldAnchor: worldAnchor.map(round) as unknown as ProductionVec3,
      frame,
      active,
      cluster: active ? clusterFor(`${rootSeed}|${id}`, frame) : null,
    });
  }

  const actualActiveCount = sites.filter((site) => site.active).length;
  return {
    rootSeed,
    potentialSiteCount,
    activeSiteCount: actualActiveCount,
    activeRatio: round(actualActiveCount / potentialSiteCount),
    sites,
  };
}
