/**
 * Renderer-independent living-development grammar.
 *
 * The memory blossom is deliberately invariant: private reflection richness
 * changes only the surrounding botanical generosity. Renderers should never
 * expose `privateGenerosity` or infer semantic importance from recipe size.
 */

export const PRIVATE_GROWTH_UNITS = [1, 2, 4, 6] as const;

export type PrivateGrowthUnits = (typeof PRIVATE_GROWTH_UNITS)[number];

export type LivingMaturityPhase =
  | "seed"
  | "sprout"
  | "sapling"
  | "young-tree"
  | "established"
  | "mature"
  | "enduring";

export type LivingDevelopmentFeatureKind =
  | "stem-extension"
  | "root-thread"
  | "terminal-twig"
  | "branchlet"
  | "canopy-pocket"
  | "branch-thickening"
  | "root-strengthening"
  | "memory-spur"
  | "bark-character"
  | "blossom-cluster"
  | "leaf-pair"
  | "bud-cluster";

export interface LivingMemoryInput {
  /** Stable opaque journal identifier. */
  entryId: string;
  /** One-based completed-journal ordinal, independent of renderer events. */
  ordinal: number;
  /** Private value derived inside the encrypted journaling experience. */
  privateGrowthUnits: PrivateGrowthUnits;
  seed: number | string;
  /** A revisit grows adjacent to this memory when present and valid. */
  parentEntryId?: string | null;
  /** Optional root keeps a multi-generation revisit family grouped. */
  lineageRootEntryId?: string | null;
}

export interface BotanicalLocation {
  /** Stable key owned by this memory, unchanged by recipe or maturity. */
  anchorKey: string;
  /** Stable placement key for deterministic renderer reconstruction. */
  locationKey: string;
  /** Direct revisit parent. Renderers interpret this as a proximity constraint. */
  adjacentToKey: string | null;
  /** Shared key for a longitudinal family of memories. */
  familyKey: string;
  /** Deterministic local slot around the parent/family anchor. */
  adjacencySlot: number;
}

export interface LivingMemoryMarker {
  entryId: string;
  ordinal: number;
  kind: "memory-blossom";
  semanticImportance: "equal";
  persistence: "permanent";
  location: BotanicalLocation;
}

export interface LivingDevelopmentFeature {
  kind: LivingDevelopmentFeatureKind;
  count: number;
  persistence: "permanent";
}

export interface LivingMaturity {
  phase: LivingMaturityPhase;
  /** Increments forever after maturity; zero before enduring development. */
  enduringCycle: number;
  /** One-based position within a 48-memory enduring cycle. */
  enduringPosition: number;
}

export interface LivingSurroundingRecipe {
  /** Internal-only generosity ordering. Never display or announce this value. */
  privateGenerosity: 1 | 2 | 3 | 4;
  /** Stable variation identity; equal generosity need not look repetitive. */
  variantKey: string;
  persistentChangeCount: number;
  features: readonly LivingDevelopmentFeature[];
}

export interface LivingDevelopment {
  memory: LivingMemoryMarker;
  maturity: LivingMaturity;
  surrounding: LivingSurroundingRecipe;
}

export interface LivingDevelopmentLedger {
  developments: readonly LivingDevelopment[];
  byEntryId: Readonly<Record<string, LivingDevelopment>>;
}

export interface ActiveMarkerProjection {
  /** Bounded markers a renderer may expose at once. */
  activeMarkers: readonly LivingMemoryMarker[];
  /** Complete historical reachability, independent of active projection. */
  historicalByEntryId: Readonly<Record<string, LivingMemoryMarker>>;
  totalHistorical: number;
  activeLimit: number;
}

const ENDURING_CYCLE_SIZE = 48;
const CHANGE_BUDGET: Readonly<Record<PrivateGrowthUnits, number>> = {
  1: 2,
  2: 4,
  4: 7,
  6: 11,
};
const GENEROSITY: Readonly<
  Record<PrivateGrowthUnits, LivingSurroundingRecipe["privateGenerosity"]>
> = {
  1: 1,
  2: 2,
  4: 3,
  6: 4,
};
const STRUCTURAL_COUNT: Readonly<Record<PrivateGrowthUnits, number>> = {
  1: 1,
  2: 1,
  4: 2,
  6: 3,
};

const ORGAN_KINDS = [
  "blossom-cluster",
  "leaf-pair",
  "bud-cluster",
] as const satisfies readonly LivingDevelopmentFeatureKind[];

const STRUCTURE_BY_PHASE: Readonly<
  Record<LivingMaturityPhase, readonly LivingDevelopmentFeatureKind[]>
> = {
  seed: ["root-thread"],
  sprout: ["stem-extension", "root-thread", "terminal-twig"],
  sapling: ["terminal-twig", "branchlet", "root-strengthening"],
  "young-tree": ["branchlet", "terminal-twig", "canopy-pocket"],
  established: [
    "canopy-pocket",
    "branch-thickening",
    "terminal-twig",
    "root-strengthening",
  ],
  mature: [
    "memory-spur",
    "canopy-pocket",
    "branch-thickening",
    "root-strengthening",
  ],
  enduring: [
    "memory-spur",
    "terminal-twig",
    "branch-thickening",
    "canopy-pocket",
    "root-strengthening",
    "bark-character",
  ],
};

export function livingMaturityForOrdinal(ordinal: number): LivingMaturity {
  const safeOrdinal = Number.isFinite(ordinal)
    ? Math.max(0, Math.floor(ordinal))
    : 0;

  if (safeOrdinal === 0) {
    return { phase: "seed", enduringCycle: 0, enduringPosition: 0 };
  }
  if (safeOrdinal < 12) {
    return { phase: "sprout", enduringCycle: 0, enduringPosition: 0 };
  }
  if (safeOrdinal < 48) {
    return { phase: "sapling", enduringCycle: 0, enduringPosition: 0 };
  }
  if (safeOrdinal < 96) {
    return { phase: "young-tree", enduringCycle: 0, enduringPosition: 0 };
  }
  if (safeOrdinal < 192) {
    return { phase: "established", enduringCycle: 0, enduringPosition: 0 };
  }
  if (safeOrdinal === 192) {
    return { phase: "mature", enduringCycle: 0, enduringPosition: 0 };
  }

  const enduringOffset = safeOrdinal - 193;
  return {
    phase: "enduring",
    enduringCycle: Math.floor(enduringOffset / ENDURING_CYCLE_SIZE) + 1,
    enduringPosition: (enduringOffset % ENDURING_CYCLE_SIZE) + 1,
  };
}

export function botanicalMemoryAnchorKey(
  treeKey: string,
  entryId: string,
): string {
  requireText(treeKey, "treeKey");
  requireText(entryId, "entryId");
  return `tree:${stableToken(treeKey)}/memory:${stableToken(entryId)}`;
}

export function botanicalLocationForMemory(
  treeKey: string,
  memory: Pick<
    LivingMemoryInput,
    "entryId" | "parentEntryId" | "lineageRootEntryId"
  >,
): BotanicalLocation {
  const anchorKey = botanicalMemoryAnchorKey(treeKey, memory.entryId);
  const parentEntryId = normalizedRelatedEntryId(
    memory.parentEntryId,
    memory.entryId,
  );
  const rootEntryId = normalizedRelatedEntryId(
    memory.lineageRootEntryId,
    memory.entryId,
  );
  const adjacentToKey = parentEntryId
    ? botanicalMemoryAnchorKey(treeKey, parentEntryId)
    : null;
  const familyKey = botanicalMemoryAnchorKey(
    treeKey,
    rootEntryId ?? parentEntryId ?? memory.entryId,
  );
  const placementIdentity = [anchorKey, adjacentToKey ?? familyKey].join("|");

  return {
    anchorKey,
    locationKey: `${anchorKey}/place:${stableToken(placementIdentity)}`,
    adjacentToKey,
    familyKey,
    adjacencySlot: stableHash(placementIdentity) % 24,
  };
}

export function createLivingDevelopment(
  treeKey: string,
  input: LivingMemoryInput,
): LivingDevelopment {
  requireText(treeKey, "treeKey");
  requireText(input.entryId, "entryId");
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1) {
    throw new Error("ordinal must be a positive safe integer");
  }
  if (!PRIVATE_GROWTH_UNITS.includes(input.privateGrowthUnits)) {
    throw new Error("privateGrowthUnits must be one of 1, 2, 4, or 6");
  }

  const maturity = livingMaturityForOrdinal(input.ordinal);
  const location = botanicalLocationForMemory(treeKey, input);
  const variant = stableHash(
    `${treeKey}|${input.entryId}|${String(input.seed)}|${maturity.phase}`,
  );
  const surrounding = surroundingRecipe(
    input.privateGrowthUnits,
    maturity,
    variant,
  );

  return {
    memory: {
      entryId: input.entryId,
      ordinal: input.ordinal,
      kind: "memory-blossom",
      semanticImportance: "equal",
      persistence: "permanent",
      location,
    },
    maturity,
    surrounding,
  };
}

export function createLivingDevelopmentLedger(
  treeKey: string,
  inputs: readonly LivingMemoryInput[],
): LivingDevelopmentLedger {
  const ordered = [...inputs].sort(
    (left, right) =>
      left.ordinal - right.ordinal || left.entryId.localeCompare(right.entryId),
  );
  const byEntryId: Record<string, LivingDevelopment> = {};
  const developments = ordered.map((input) => {
    if (byEntryId[input.entryId]) {
      throw new Error(`duplicate living memory entryId: ${input.entryId}`);
    }
    const development = createLivingDevelopment(treeKey, input);
    byEntryId[input.entryId] = development;
    return development;
  });

  return { developments, byEntryId };
}

export function projectActiveMemoryMarkers(
  developments: readonly LivingDevelopment[],
  options: {
    limit: number;
    selectedEntryIds?: readonly string[];
  },
): ActiveMarkerProjection {
  const limit = Number.isFinite(options.limit)
    ? Math.max(0, Math.floor(options.limit))
    : 0;
  const historicalByEntryId: Record<string, LivingMemoryMarker> = {};
  for (const development of developments) {
    const entryId = development.memory.entryId;
    if (historicalByEntryId[entryId]) {
      throw new Error(`duplicate living memory entryId: ${entryId}`);
    }
    historicalByEntryId[entryId] = development.memory;
  }

  const activeEntryIds: string[] = [];
  const activeSet = new Set<string>();
  const addIfReachable = (entryId: string) => {
    if (
      activeEntryIds.length < limit &&
      historicalByEntryId[entryId] &&
      !activeSet.has(entryId)
    ) {
      activeSet.add(entryId);
      activeEntryIds.push(entryId);
    }
  };

  for (const entryId of options.selectedEntryIds ?? []) addIfReachable(entryId);
  const byRecency = [...developments].sort(
    (left, right) =>
      right.memory.ordinal - left.memory.ordinal ||
      left.memory.entryId.localeCompare(right.memory.entryId),
  );
  for (const development of byRecency) {
    addIfReachable(development.memory.entryId);
  }

  return {
    activeMarkers: activeEntryIds.map(
      (entryId) => historicalByEntryId[entryId],
    ),
    historicalByEntryId,
    totalHistorical: developments.length,
    activeLimit: limit,
  };
}

export function historicalMemoryMarker(
  projection: ActiveMarkerProjection,
  entryId: string,
): LivingMemoryMarker | undefined {
  return projection.historicalByEntryId[entryId];
}

function surroundingRecipe(
  units: PrivateGrowthUnits,
  maturity: LivingMaturity,
  variant: number,
): LivingSurroundingRecipe {
  const persistentChangeCount = CHANGE_BUDGET[units];
  const structuralCount = STRUCTURAL_COUNT[units];
  const organCount = persistentChangeCount - structuralCount;
  const structures = STRUCTURE_BY_PHASE[maturity.phase];
  const structureKind = structures[variant % structures.length];
  const primaryOrgan = ORGAN_KINDS[(variant >>> 3) % ORGAN_KINDS.length];
  const secondaryOrgan =
    ORGAN_KINDS[((variant >>> 7) + 1) % ORGAN_KINDS.length];
  const primaryCount = Math.ceil(organCount * 0.6);
  const secondaryCount = organCount - primaryCount;
  const features: LivingDevelopmentFeature[] = [
    permanentFeature(structureKind, structuralCount),
    permanentFeature(primaryOrgan, primaryCount),
  ];
  if (secondaryCount > 0 && secondaryOrgan !== primaryOrgan) {
    features.push(permanentFeature(secondaryOrgan, secondaryCount));
  } else if (secondaryCount > 0) {
    features[1] = permanentFeature(primaryOrgan, organCount);
  }

  return {
    privateGenerosity: GENEROSITY[units],
    variantKey: `${maturity.phase}:${(variant % 97).toString(36)}`,
    persistentChangeCount,
    features,
  };
}

function permanentFeature(
  kind: LivingDevelopmentFeatureKind,
  count: number,
): LivingDevelopmentFeature {
  return { kind, count, persistence: "permanent" };
}

function normalizedRelatedEntryId(
  value: string | null | undefined,
  ownEntryId: string,
): string | null {
  const normalized = value?.trim();
  return normalized && normalized !== ownEntryId ? normalized : null;
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} must not be empty`);
}

function stableToken(value: string): string {
  const left = stableHash(`left|${value}`).toString(16).padStart(8, "0");
  const right = stableHash(`right|${value}`).toString(16).padStart(8, "0");
  return `${left}${right}`;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
