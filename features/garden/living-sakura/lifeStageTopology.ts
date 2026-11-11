import { botanicalMemoryAnchorKey } from "../../growth/livingDevelopment";

/**
 * Pure life-stage planning for Living Sakura.
 *
 * This module deliberately describes botanical intent rather than geometry.
 * Renderers may translate a segment intent into curves, meshes, sprites, or
 * another representation without changing stage or memory identity.
 */

export type LivingSakuraLifeStage =
  | "seed"
  | "sprout"
  | "sapling"
  | "young"
  | "established"
  | "mature"
  | "enduring";

export type LifeStageSegmentRole =
  | "seed"
  | "radicle"
  | "root-thread"
  | "stem"
  | "trunk"
  | "leader"
  | "primary"
  | "secondary"
  | "tertiary"
  | "shoot"
  | "renewal-shoot";

export type CrownHabit =
  | "none"
  | "single-shoot"
  | "narrow-juvenile"
  | "open-vase"
  | "asymmetric-spreading"
  | "broad-layered"
  | "renewing-layered";

export interface LifeStageProportions {
  /** Art-direction units, not world-space units. */
  height: number;
  crownWidthToHeight: number;
  crownDepthToWidth: number;
  trunkDiameterToHeight: number;
  rootFlareToHeight: number;
  crownBaseHeightRatio: number;
  crownCentroidOffsetRatio: number;
}

export interface LifeStageRoleContract {
  role: LifeStageSegmentRole;
  minimum: number;
  /** `null` means the role can continue developing without a life-stage cap. */
  maximum: number | null;
  progression: "fixed" | "stage-progress" | "enduring-cycle";
  /** Present only for unbounded enduring roles. */
  growthIntervalJournals?: number;
}

export interface LifeStageTrunkContract {
  form:
    | "dormant-kernel"
    | "tender-stem"
    | "single-whip"
    | "forking-whip"
    | "young-barked-axis"
    | "settled-sakura-axis"
    | "aged-renewing-axis";
  leanDegrees: readonly [number, number];
  taperRatio: readonly [number, number];
  firstWoodHeightRatio: readonly [number, number] | null;
  barkAge: "none" | "green" | "smooth" | "banded" | "settled" | "aged";
}

export interface LifeStageForkContract {
  architecture:
    | "none"
    | "terminal-bud"
    | "single-lateral"
    | "unequal-young-fork"
    | "two-leader-vase"
    | "settled-two-leader-vase"
    | "renewal-over-mature-frame";
  leaderCount: readonly [number, number];
  firstForkHeightRatio: readonly [number, number] | null;
  maximumMajorChildrenPerJunction: number;
  parentChildAreaTolerance: number;
}

export interface LifeStageCrownContract {
  habit: CrownHabit;
  depthLayers: 0 | 1 | 2 | 3;
  protectedWindowCount: number;
  negativeSpaceRatio: readonly [number, number];
  visibleWoodRatio: readonly [number, number];
  leftRightMassDifference: readonly [number, number];
  signatureLowBough: boolean;
}

export interface LivingSakuraLifeStageContract {
  stage: LivingSakuraLifeStage;
  blueprintId: string;
  ordinalRange: readonly [number, number | null];
  proportions: LifeStageProportions;
  roles: readonly LifeStageRoleContract[];
  trunk: LifeStageTrunkContract;
  fork: LifeStageForkContract;
  crown: LifeStageCrownContract;
}

export interface LifeStagePhenotype {
  dominantSide: -1 | 1;
  leanBias: number;
  radialPhaseDegrees: number;
  crownBias: number;
}

export interface LifeStageSegmentIntent {
  /** Stable within a life-stage blueprint and independent of current count. */
  id: string;
  /** Stable semantic lineage a renderer can use while morphing stages. */
  continuityKey: string;
  parentId: string | null;
  role: LifeStageSegmentRole;
  roleOrdinal: number;
  emergenceOrdinal: number;
  attachmentT: number;
  azimuthDegrees: number;
  elevationDegrees: number;
  relativeLength: number;
  curvature: number;
  terminalDroop: number;
  depthLayer: "rear" | "middle" | "front";
  signature: "low-sweeping-bough" | null;
}

export interface LifeStageMemoryIdentity {
  entryId: string;
  anchorKey: string;
}

export interface LivingSakuraLifeStagePlan {
  rootSeed: string;
  journalOrdinal: number;
  stage: LivingSakuraLifeStage;
  stageProgress: number;
  contract: LivingSakuraLifeStageContract;
  phenotype: LifeStagePhenotype;
  targetCounts: Readonly<Partial<Record<LifeStageSegmentRole, number>>>;
  segments: readonly LifeStageSegmentIntent[];
  currentMemoryIdentity: LifeStageMemoryIdentity | null;
}

export interface PlanLivingSakuraLifeStageInput {
  rootSeed: string;
  /** Zero is the pre-journal seed; completed journals use one-based ordinals. */
  journalOrdinal: number;
  /** Optional stable ID of the journal represented by this plan. */
  entryId?: string | null;
}

const CONTRACTS: Readonly<Record<LivingSakuraLifeStage, LivingSakuraLifeStageContract>> = {
  seed: {
    stage: "seed",
    blueprintId: "dormant-seed-v1",
    ordinalRange: [0, 0],
    proportions: {
      height: 0.18,
      crownWidthToHeight: 0,
      crownDepthToWidth: 0,
      trunkDiameterToHeight: 0,
      rootFlareToHeight: 0,
      crownBaseHeightRatio: 1,
      crownCentroidOffsetRatio: 0,
    },
    roles: [
      { role: "seed", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "radicle", minimum: 1, maximum: 1, progression: "fixed" },
    ],
    trunk: {
      form: "dormant-kernel",
      leanDegrees: [0, 0],
      taperRatio: [1, 1],
      firstWoodHeightRatio: null,
      barkAge: "none",
    },
    fork: {
      architecture: "none",
      leaderCount: [0, 0],
      firstForkHeightRatio: null,
      maximumMajorChildrenPerJunction: 1,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "none",
      depthLayers: 0,
      protectedWindowCount: 0,
      negativeSpaceRatio: [1, 1],
      visibleWoodRatio: [0, 0],
      leftRightMassDifference: [0, 0],
      signatureLowBough: false,
    },
  },
  sprout: {
    stage: "sprout",
    blueprintId: "emerging-sprout-v1",
    ordinalRange: [1, 11],
    proportions: {
      height: 0.8,
      crownWidthToHeight: 0.18,
      crownDepthToWidth: 0.3,
      trunkDiameterToHeight: 0.026,
      rootFlareToHeight: 0.05,
      crownBaseHeightRatio: 0.72,
      crownCentroidOffsetRatio: 0.02,
    },
    roles: [
      { role: "radicle", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "root-thread", minimum: 1, maximum: 3, progression: "stage-progress" },
      { role: "stem", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "shoot", minimum: 1, maximum: 4, progression: "stage-progress" },
    ],
    trunk: {
      form: "tender-stem",
      leanDegrees: [1, 3],
      taperRatio: [0.72, 0.82],
      firstWoodHeightRatio: null,
      barkAge: "green",
    },
    fork: {
      architecture: "terminal-bud",
      leaderCount: [0, 0],
      firstForkHeightRatio: null,
      maximumMajorChildrenPerJunction: 1,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "single-shoot",
      depthLayers: 1,
      protectedWindowCount: 0,
      negativeSpaceRatio: [0.82, 0.92],
      visibleWoodRatio: [0.72, 0.88],
      leftRightMassDifference: [0.04, 0.12],
      signatureLowBough: false,
    },
  },
  sapling: {
    stage: "sapling",
    blueprintId: "supple-sapling-v1",
    ordinalRange: [12, 47],
    proportions: {
      height: 2.35,
      crownWidthToHeight: 0.34,
      crownDepthToWidth: 0.32,
      trunkDiameterToHeight: 0.035,
      rootFlareToHeight: 0.075,
      crownBaseHeightRatio: 0.58,
      crownCentroidOffsetRatio: 0.035,
    },
    roles: [
      { role: "root-thread", minimum: 2, maximum: 4, progression: "stage-progress" },
      { role: "trunk", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "primary", minimum: 1, maximum: 3, progression: "stage-progress" },
      { role: "shoot", minimum: 2, maximum: 7, progression: "stage-progress" },
    ],
    trunk: {
      form: "single-whip",
      leanDegrees: [2, 4],
      taperRatio: [0.58, 0.7],
      firstWoodHeightRatio: [0.58, 0.7],
      barkAge: "smooth",
    },
    fork: {
      architecture: "single-lateral",
      leaderCount: [0, 1],
      firstForkHeightRatio: [0.58, 0.7],
      maximumMajorChildrenPerJunction: 1,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "narrow-juvenile",
      depthLayers: 1,
      protectedWindowCount: 0,
      negativeSpaceRatio: [0.65, 0.78],
      visibleWoodRatio: [0.62, 0.78],
      leftRightMassDifference: [0.06, 0.13],
      signatureLowBough: false,
    },
  },
  young: {
    stage: "young",
    blueprintId: "unequal-young-vase-v1",
    ordinalRange: [48, 95],
    proportions: {
      height: 4.35,
      crownWidthToHeight: 0.68,
      crownDepthToWidth: 0.37,
      trunkDiameterToHeight: 0.052,
      rootFlareToHeight: 0.11,
      crownBaseHeightRatio: 0.44,
      crownCentroidOffsetRatio: 0.045,
    },
    roles: [
      { role: "root-thread", minimum: 3, maximum: 5, progression: "stage-progress" },
      { role: "trunk", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "leader", minimum: 1, maximum: 2, progression: "stage-progress" },
      { role: "primary", minimum: 3, maximum: 5, progression: "stage-progress" },
      { role: "secondary", minimum: 3, maximum: 9, progression: "stage-progress" },
      { role: "shoot", minimum: 6, maximum: 16, progression: "stage-progress" },
    ],
    trunk: {
      form: "forking-whip",
      leanDegrees: [3, 5],
      taperRatio: [0.48, 0.6],
      firstWoodHeightRatio: [0.42, 0.52],
      barkAge: "smooth",
    },
    fork: {
      architecture: "unequal-young-fork",
      leaderCount: [1, 2],
      firstForkHeightRatio: [0.42, 0.52],
      maximumMajorChildrenPerJunction: 2,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "open-vase",
      depthLayers: 2,
      protectedWindowCount: 1,
      negativeSpaceRatio: [0.42, 0.56],
      visibleWoodRatio: [0.5, 0.66],
      leftRightMassDifference: [0.08, 0.15],
      signatureLowBough: false,
    },
  },
  established: {
    stage: "established",
    blueprintId: "asymmetric-established-v1",
    ordinalRange: [96, 191],
    proportions: {
      height: 6.15,
      crownWidthToHeight: 0.96,
      crownDepthToWidth: 0.41,
      trunkDiameterToHeight: 0.072,
      rootFlareToHeight: 0.16,
      crownBaseHeightRatio: 0.36,
      crownCentroidOffsetRatio: 0.055,
    },
    roles: [
      { role: "root-thread", minimum: 4, maximum: 6, progression: "stage-progress" },
      { role: "trunk", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "leader", minimum: 2, maximum: 2, progression: "fixed" },
      { role: "primary", minimum: 5, maximum: 7, progression: "stage-progress" },
      { role: "secondary", minimum: 10, maximum: 18, progression: "stage-progress" },
      { role: "tertiary", minimum: 18, maximum: 38, progression: "stage-progress" },
    ],
    trunk: {
      form: "young-barked-axis",
      leanDegrees: [3, 6],
      taperRatio: [0.42, 0.54],
      firstWoodHeightRatio: [0.34, 0.42],
      barkAge: "banded",
    },
    fork: {
      architecture: "two-leader-vase",
      leaderCount: [2, 2],
      firstForkHeightRatio: [0.34, 0.42],
      maximumMajorChildrenPerJunction: 2,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "asymmetric-spreading",
      depthLayers: 3,
      protectedWindowCount: 2,
      negativeSpaceRatio: [0.32, 0.4],
      visibleWoodRatio: [0.42, 0.56],
      leftRightMassDifference: [0.1, 0.18],
      signatureLowBough: true,
    },
  },
  mature: {
    stage: "mature",
    blueprintId: "broad-mature-sakura-v1",
    ordinalRange: [192, 192],
    proportions: {
      height: 7.4,
      crownWidthToHeight: 1.16,
      crownDepthToWidth: 0.44,
      trunkDiameterToHeight: 0.085,
      rootFlareToHeight: 0.21,
      crownBaseHeightRatio: 0.35,
      crownCentroidOffsetRatio: 0.06,
    },
    roles: [
      { role: "root-thread", minimum: 5, maximum: 7, progression: "fixed" },
      { role: "trunk", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "leader", minimum: 2, maximum: 2, progression: "fixed" },
      { role: "primary", minimum: 5, maximum: 7, progression: "fixed" },
      { role: "secondary", minimum: 14, maximum: 22, progression: "fixed" },
      { role: "tertiary", minimum: 50, maximum: 90, progression: "fixed" },
    ],
    trunk: {
      form: "settled-sakura-axis",
      leanDegrees: [3, 6],
      taperRatio: [0.38, 0.5],
      firstWoodHeightRatio: [0.32, 0.4],
      barkAge: "settled",
    },
    fork: {
      architecture: "settled-two-leader-vase",
      leaderCount: [2, 2],
      firstForkHeightRatio: [0.32, 0.4],
      maximumMajorChildrenPerJunction: 2,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "broad-layered",
      depthLayers: 3,
      protectedWindowCount: 3,
      negativeSpaceRatio: [0.28, 0.34],
      visibleWoodRatio: [0.35, 0.45],
      leftRightMassDifference: [0.12, 0.18],
      signatureLowBough: true,
    },
  },
  enduring: {
    stage: "enduring",
    blueprintId: "renewing-enduring-sakura-v1",
    ordinalRange: [193, null],
    proportions: {
      height: 7.65,
      crownWidthToHeight: 1.18,
      crownDepthToWidth: 0.46,
      trunkDiameterToHeight: 0.09,
      rootFlareToHeight: 0.22,
      crownBaseHeightRatio: 0.34,
      crownCentroidOffsetRatio: 0.065,
    },
    roles: [
      { role: "root-thread", minimum: 6, maximum: 8, progression: "fixed" },
      { role: "trunk", minimum: 1, maximum: 1, progression: "fixed" },
      { role: "leader", minimum: 2, maximum: 2, progression: "fixed" },
      { role: "primary", minimum: 6, maximum: 7, progression: "fixed" },
      { role: "secondary", minimum: 16, maximum: 22, progression: "fixed" },
      {
        role: "tertiary",
        minimum: 58,
        maximum: null,
        progression: "enduring-cycle",
        growthIntervalJournals: 12,
      },
      {
        role: "renewal-shoot",
        minimum: 1,
        maximum: null,
        progression: "enduring-cycle",
        growthIntervalJournals: 48,
      },
    ],
    trunk: {
      form: "aged-renewing-axis",
      leanDegrees: [3, 6],
      taperRatio: [0.36, 0.48],
      firstWoodHeightRatio: [0.32, 0.4],
      barkAge: "aged",
    },
    fork: {
      architecture: "renewal-over-mature-frame",
      leaderCount: [2, 2],
      firstForkHeightRatio: [0.32, 0.4],
      maximumMajorChildrenPerJunction: 2,
      parentChildAreaTolerance: 0.15,
    },
    crown: {
      habit: "renewing-layered",
      depthLayers: 3,
      protectedWindowCount: 3,
      negativeSpaceRatio: [0.28, 0.34],
      visibleWoodRatio: [0.35, 0.45],
      leftRightMassDifference: [0.12, 0.18],
      signatureLowBough: true,
    },
  },
};

const ROLE_ORDER: readonly LifeStageSegmentRole[] = [
  "seed",
  "radicle",
  "root-thread",
  "stem",
  "trunk",
  "leader",
  "primary",
  "secondary",
  "tertiary",
  "shoot",
  "renewal-shoot",
];

const PARENT_ROLES: Readonly<
  Partial<Record<LifeStageSegmentRole, readonly LifeStageSegmentRole[]>>
> = {
  radicle: ["seed"],
  "root-thread": ["radicle", "trunk"],
  shoot: ["stem", "primary", "trunk"],
  leader: ["trunk"],
  primary: ["trunk", "leader"],
  secondary: ["primary", "leader"],
  tertiary: ["secondary", "primary"],
  "renewal-shoot": ["tertiary", "secondary"],
};

export const LIVING_SAKURA_LIFE_STAGE_CONTRACTS = CONTRACTS;

export function livingSakuraLifeStageForOrdinal(
  journalOrdinal: number,
): LivingSakuraLifeStage {
  const ordinal = validOrdinal(journalOrdinal);
  if (ordinal === 0) return "seed";
  if (ordinal < 12) return "sprout";
  if (ordinal < 48) return "sapling";
  if (ordinal < 96) return "young";
  if (ordinal < 192) return "established";
  if (ordinal === 192) return "mature";
  return "enduring";
}

export function livingSakuraMemoryIdentity(
  rootSeed: string,
  entryId: string,
): LifeStageMemoryIdentity {
  const normalizedRoot = validText(rootSeed, "rootSeed");
  const normalizedEntry = validText(entryId, "entryId");
  return {
    entryId: normalizedEntry,
    anchorKey: botanicalMemoryAnchorKey(normalizedRoot, normalizedEntry),
  };
}

export function planLivingSakuraLifeStage(
  input: PlanLivingSakuraLifeStageInput,
): LivingSakuraLifeStagePlan {
  const rootSeed = validText(input.rootSeed, "rootSeed");
  const journalOrdinal = validOrdinal(input.journalOrdinal);
  const stage = livingSakuraLifeStageForOrdinal(journalOrdinal);
  const contract = CONTRACTS[stage];
  const stageProgress = progressThroughStage(contract, journalOrdinal);
  const phenotype = phenotypeFor(rootSeed);
  const rolePlans = contract.roles.map((role) => ({
    contract: role,
    count: countForRole(rootSeed, contract, role, journalOrdinal, stageProgress),
  }));
  const targetCounts: Partial<Record<LifeStageSegmentRole, number>> = {};
  rolePlans.forEach(({ contract: role, count }) => {
    targetCounts[role.role] = count;
  });

  const allSegments: LifeStageSegmentIntent[] = [];
  for (const role of ROLE_ORDER) {
    const rolePlan = rolePlans.find((candidate) => candidate.contract.role === role);
    if (!rolePlan) continue;
    for (let index = 0; index < rolePlan.count; index += 1) {
      const emergenceOrdinal = emergenceFor(
        rootSeed,
        contract,
        rolePlan.contract,
        index,
      );
      allSegments.push(
        segmentIntent(
          rootSeed,
          contract,
          phenotype,
          role,
          index,
          emergenceOrdinal,
          allSegments,
        ),
      );
    }
  }

  const entryId = input.entryId?.trim();
  const appendStableSegments = [...allSegments].sort(
    (left, right) =>
      left.emergenceOrdinal - right.emergenceOrdinal ||
      ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) ||
      left.roleOrdinal - right.roleOrdinal,
  );
  return {
    rootSeed,
    journalOrdinal,
    stage,
    stageProgress,
    contract,
    phenotype,
    targetCounts,
    segments: appendStableSegments,
    currentMemoryIdentity: entryId
      ? livingSakuraMemoryIdentity(rootSeed, entryId)
      : null,
  };
}

function countForRole(
  rootSeed: string,
  stage: LivingSakuraLifeStageContract,
  role: LifeStageRoleContract,
  ordinal: number,
  progress: number,
): number {
  if (role.maximum === null) {
    const interval = role.growthIntervalJournals;
    if (!interval) throw new Error(`unbounded role ${role.role} needs an interval`);
    return role.minimum + Math.floor((ordinal - stage.ordinalRange[0]) / interval);
  }

  const finalCount = seededInteger(
    `${rootSeed}|${stage.blueprintId}|${role.role}|count`,
    role.minimum,
    role.maximum,
  );
  if (role.progression !== "stage-progress") return finalCount;
  return role.minimum + Math.floor((finalCount - role.minimum) * progress);
}

function emergenceFor(
  rootSeed: string,
  stage: LivingSakuraLifeStageContract,
  role: LifeStageRoleContract,
  roleIndex: number,
): number {
  const start = stage.ordinalRange[0];
  if (roleIndex < role.minimum || role.progression === "fixed") return start;
  if (role.maximum === null) {
    return start + (roleIndex - role.minimum + 1) * (role.growthIntervalJournals ?? 1);
  }
  const end = stage.ordinalRange[1] ?? start;
  const finalCount = seededInteger(
    `${rootSeed}|${stage.blueprintId}|${role.role}|count`,
    role.minimum,
    role.maximum,
  );
  const additions = finalCount - role.minimum;
  if (additions <= 0 || end === start) return start;
  const additionIndex = roleIndex - role.minimum + 1;
  return start + Math.ceil((additionIndex / additions) * (end - start));
}

function segmentIntent(
  rootSeed: string,
  stage: LivingSakuraLifeStageContract,
  phenotype: LifeStagePhenotype,
  role: LifeStageSegmentRole,
  roleIndex: number,
  emergenceOrdinal: number,
  existing: readonly LifeStageSegmentIntent[],
): LifeStageSegmentIntent {
  const roleOrdinal = roleIndex + 1;
  const id = `${stage.blueprintId}/${role}/${roleOrdinal.toString().padStart(3, "0")}`;
  const seed = `${rootSeed}|${id}`;
  const eligibleParents = existing.filter(
    (candidate) =>
      (PARENT_ROLES[role] ?? []).includes(candidate.role) &&
      candidate.emergenceOrdinal <= emergenceOrdinal,
  );
  const parent =
    eligibleParents.length === 0
      ? null
      : eligibleParents[stableHash(`${seed}|parent`) % eligibleParents.length];
  const ranges = intentRanges(role);
  const azimuthDirection = roleIndex % 2 === 0 ? phenotype.dominantSide : -phenotype.dominantSide;
  const azimuth =
    phenotype.radialPhaseDegrees +
    azimuthDirection * valueInRange(`${seed}|azimuth`, ranges.azimuth);
  const signature =
    stage.crown.signatureLowBough && role === "primary" && roleIndex === 0
      ? "low-sweeping-bough"
      : null;

  return {
    id,
    continuityKey: `${role}/${roleOrdinal.toString().padStart(3, "0")}`,
    parentId: parent?.id ?? null,
    role,
    roleOrdinal,
    emergenceOrdinal,
    attachmentT: parent
      ? valueInRange(`${seed}|attachment`, ranges.attachment)
      : 0,
    azimuthDegrees: round(azimuth),
    elevationDegrees: round(
      signature
        ? valueInRange(`${seed}|elevation`, [-4, 8])
        : valueInRange(`${seed}|elevation`, ranges.elevation),
    ),
    relativeLength: round(
      valueInRange(`${seed}|length`, ranges.length) *
        (signature ? 1.28 : 1),
    ),
    curvature: round(valueInRange(`${seed}|curve`, ranges.curvature)),
    terminalDroop: round(
      signature
        ? valueInRange(`${seed}|droop`, [0.04, 0.08])
        : valueInRange(`${seed}|droop`, ranges.droop),
    ),
    depthLayer: depthLayerFor(seed, stage.crown.depthLayers),
    signature,
  };
}

function intentRanges(role: LifeStageSegmentRole): {
  attachment: readonly [number, number];
  azimuth: readonly [number, number];
  elevation: readonly [number, number];
  length: readonly [number, number];
  curvature: readonly [number, number];
  droop: readonly [number, number];
} {
  switch (role) {
    case "seed":
      return ranges([0, 0], [0, 0], [0, 0], [0.08, 0.12], [0, 0], [0, 0]);
    case "radicle":
    case "root-thread":
      return ranges([0.1, 0.7], [15, 165], [-35, -10], [0.18, 0.56], [0.08, 0.24], [0, 0.03]);
    case "stem":
    case "trunk":
      return ranges([0, 0], [0, 5], [82, 90], [0.72, 1], [0.08, 0.2], [0, 0.02]);
    case "leader":
      return ranges([0.68, 0.86], [12, 42], [56, 76], [0.58, 0.82], [0.12, 0.28], [0, 0.025]);
    case "primary":
      return ranges([0.28, 0.84], [28, 84], [14, 48], [0.48, 0.78], [0.14, 0.34], [0.01, 0.07]);
    case "secondary":
      return ranges([0.3, 0.9], [24, 76], [8, 42], [0.26, 0.52], [0.16, 0.38], [0.01, 0.08]);
    case "tertiary":
      return ranges([0.36, 0.94], [18, 68], [-5, 34], [0.12, 0.3], [0.18, 0.42], [0.015, 0.1]);
    case "shoot":
      return ranges([0.54, 0.96], [15, 72], [34, 72], [0.08, 0.22], [0.12, 0.3], [0, 0.04]);
    case "renewal-shoot":
      return ranges([0.56, 0.96], [18, 78], [24, 64], [0.1, 0.26], [0.18, 0.4], [0.01, 0.06]);
  }
}

function ranges(
  attachment: readonly [number, number],
  azimuth: readonly [number, number],
  elevation: readonly [number, number],
  length: readonly [number, number],
  curvature: readonly [number, number],
  droop: readonly [number, number],
) {
  return { attachment, azimuth, elevation, length, curvature, droop };
}

function progressThroughStage(
  contract: LivingSakuraLifeStageContract,
  ordinal: number,
): number {
  const [start, end] = contract.ordinalRange;
  if (end === null) {
    const offset = Math.max(0, ordinal - start);
    return round(1 - 1 / (1 + offset / 48));
  }
  if (start === end) return 1;
  return round(Math.min(1, Math.max(0, (ordinal - start) / (end - start))));
}

function phenotypeFor(rootSeed: string): LifeStagePhenotype {
  const dominantSide: -1 | 1 = hashUnit(`${rootSeed}|dominance`) < 0.5 ? -1 : 1;
  return {
    dominantSide,
    leanBias: round(valueInRange(`${rootSeed}|lean`, [0.42, 0.92])),
    radialPhaseDegrees: round(valueInRange(`${rootSeed}|radial`, [-28, 28])),
    crownBias: round(valueInRange(`${rootSeed}|crown`, [0.46, 0.88])),
  };
}

function depthLayerFor(
  seed: string,
  layerCount: LifeStageCrownContract["depthLayers"],
): LifeStageSegmentIntent["depthLayer"] {
  if (layerCount < 2) return "middle";
  if (layerCount === 2) return hashUnit(`${seed}|depth`) < 0.5 ? "rear" : "front";
  return (["rear", "middle", "front"] as const)[stableHash(`${seed}|depth`) % 3];
}

function valueInRange(seed: string, range: readonly [number, number]): number {
  return range[0] + (range[1] - range[0]) * hashUnit(seed);
}

function seededInteger(seed: string, minimum: number, maximum: number): number {
  if (minimum === maximum) return minimum;
  return minimum + (stableHash(seed) % (maximum - minimum + 1));
}

function hashUnit(value: string): number {
  return stableHash(value) / 4294967296;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function validText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

function validOrdinal(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("journalOrdinal must be a non-negative safe integer");
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
