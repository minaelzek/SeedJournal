/**
 * Renderer-independent growth contract for an authored Living Sakura crown.
 *
 * The complete authored crown catalog is stable at every journal count. Growth
 * changes element activation instead of swapping geometry at stage boundaries.
 * Journal identifiers are converted to opaque renderer keys, and private depth
 * is reduced to a small surrounding-growth recipe before leaving this module.
 */

export const AUTHORED_GROWTH_MILESTONES = [1, 12, 48, 96, 192, 1_000] as const;

export type AuthoredGrowthMilestone =
  (typeof AUTHORED_GROWTH_MILESTONES)[number];

export type AuthoredGrowthStage =
  | "dormant"
  | "first-bloom"
  | "sapling"
  | "young-crown"
  | "established-crown"
  | "mature-crown"
  | "enduring-crown";

export type AuthoredCrownRole =
  | "trunk"
  | "leader"
  | "primary"
  | "secondary"
  | "tertiary"
  | "fine-shoot"
  | "renewal-shoot";

export type CrownNeighborhood =
  | "lower-left"
  | "lower-right"
  | "middle-left"
  | "middle-right"
  | "upper-left"
  | "upper-right"
  | "crown-heart"
  | "crown-back";

export interface AuthoredGrowthJournal {
  /** Stable private identifier. It is never copied into the result. */
  readonly entryId: string;
  /** Immutable one-based completion order, including deletion tombstones. */
  readonly ordinal: number;
  readonly completed: boolean;
  readonly deleted?: boolean;
  /** Private normalized depth in [0, 1]. The raw value is never emitted. */
  readonly reflectionDepth?: number;
}

export interface AuthoredCrownElementBlueprint {
  readonly elementId: string;
  readonly parentElementId: string | null;
  readonly role: AuthoredCrownRole;
  readonly neighborhood: CrownNeighborhood;
  readonly depthLayer: 0 | 1 | 2;
  readonly revealStart: number;
  readonly revealEnd: number;
  readonly targetScale: number;
}

export interface AuthoredCrownElementActivation
  extends AuthoredCrownElementBlueprint {
  /** Smooth, monotonic 0..1 morph weight for this permanent element. */
  readonly activation: number;
  readonly visible: boolean;
}

export interface AuthoredBlossomSocket {
  readonly socketId: string;
  readonly hostElementId: string;
  readonly neighborhood: CrownNeighborhood;
  readonly attachmentT: number;
  readonly azimuth: number;
  readonly radialOffset: number;
  readonly depthOffset: number;
}

export interface EqualMemoryFlower {
  readonly kind: "memory-blossom";
  readonly petalCount: 5;
  readonly semanticImportance: "equal";
  readonly scale: 1;
  readonly treatment: "authored-equal-memory-v1";
}

export interface SurroundingGrowthEnrichment {
  readonly kind: "surrounding-growth";
  readonly budCount: 0 | 1 | 2 | 3;
  readonly leafPairCount: 0 | 1 | 2;
  readonly fineShootActivation: number;
  readonly motionLift: number;
}

export interface AuthoredMemoryBlossom {
  readonly memoryKey: string;
  readonly socket: AuthoredBlossomSocket;
  readonly flower: EqualMemoryFlower;
  /** The only output affected by private reflection depth. */
  readonly surroundingGrowth: SurroundingGrowthEnrichment;
}

export interface AnonymousGrowthTrace {
  readonly kind: "anonymous-growth-trace";
  readonly traceKey: string;
  readonly socket: AuthoredBlossomSocket;
  readonly interactive: false;
}

export interface AuthoredSakuraGrowthPlan {
  readonly schemaVersion: 1;
  readonly stage: AuthoredGrowthStage;
  readonly completedCount: number;
  readonly crown: readonly AuthoredCrownElementActivation[];
  readonly memoryBlossoms: readonly AuthoredMemoryBlossom[];
  readonly anonymousTraces: readonly AnonymousGrowthTrace[];
}

export interface PlanAuthoredSakuraGrowthInput {
  readonly subjectId: string;
  readonly history: readonly AuthoredGrowthJournal[];
}

interface CrownPhaseRecipe {
  readonly id: string;
  readonly count: number;
  readonly revealStart: number;
  readonly revealEnd: number;
  readonly roles: readonly AuthoredCrownRole[];
}

const NEIGHBORHOODS: readonly CrownNeighborhood[] = Object.freeze([
  "lower-left",
  "lower-right",
  "middle-left",
  "middle-right",
  "upper-left",
  "upper-right",
  "crown-heart",
  "crown-back",
]);

const CROWN_PHASES: readonly CrownPhaseRecipe[] = Object.freeze([
  {
    id: "awakening",
    count: 6,
    revealStart: -4,
    revealEnd: 12,
    roles: ["trunk", "leader", "primary"],
  },
  {
    id: "sapling",
    count: 12,
    revealStart: 4,
    revealEnd: 48,
    roles: ["primary", "secondary"],
  },
  {
    id: "young",
    count: 18,
    revealStart: 24,
    revealEnd: 96,
    roles: ["secondary", "tertiary"],
  },
  {
    id: "established",
    count: 24,
    revealStart: 60,
    revealEnd: 192,
    roles: ["secondary", "tertiary", "fine-shoot"],
  },
  {
    id: "mature",
    count: 30,
    revealStart: 128,
    revealEnd: 384,
    roles: ["tertiary", "fine-shoot"],
  },
  {
    id: "enduring",
    count: 36,
    revealStart: 320,
    revealEnd: 1_000,
    roles: ["fine-shoot", "renewal-shoot"],
  },
]);

const ROLE_SCALE: Readonly<Record<AuthoredCrownRole, number>> = Object.freeze({
  trunk: 1,
  leader: 0.86,
  primary: 0.72,
  secondary: 0.52,
  tertiary: 0.34,
  "fine-shoot": 0.2,
  "renewal-shoot": 0.24,
});

const EQUAL_MEMORY_FLOWER: EqualMemoryFlower = Object.freeze({
  kind: "memory-blossom",
  petalCount: 5,
  semanticImportance: "equal",
  scale: 1,
  treatment: "authored-equal-memory-v1",
});

export const AUTHORED_CROWN_BLUEPRINT: readonly AuthoredCrownElementBlueprint[] =
  buildAuthoredCrownBlueprint();

/** Returns an opaque stable key suitable for interaction lookup metadata. */
export function authoredMemoryKey(subjectId: string, entryId: string): string {
  const subject = requireText(subjectId, "subjectId");
  const entry = requireText(entryId, "entryId");
  return `memory_${opaqueToken(`${subject}\u0000${entry}`)}`;
}

export function authoredGrowthStageForCount(
  completedCount: number,
): AuthoredGrowthStage {
  const count = requireCount(completedCount);
  if (count === 0) return "dormant";
  if (count < 12) return "first-bloom";
  if (count < 48) return "sapling";
  if (count < 96) return "young-crown";
  if (count < 192) return "established-crown";
  if (count < 1_000) return "mature-crown";
  return "enduring-crown";
}

/**
 * Maps private journal history onto permanent authored crown elements.
 *
 * Completed ordinals must be contiguous. Keeping a deletion tombstone preserves
 * later socket assignments while removing all readable identity and depth data.
 */
export function planAuthoredSakuraGrowth(
  input: PlanAuthoredSakuraGrowthInput,
): AuthoredSakuraGrowthPlan {
  const subjectId = requireText(input.subjectId, "subjectId");
  const completed = input.history
    .filter((journal) => journal.completed)
    .map(validateJournal)
    .sort(
      (left, right) =>
        left.ordinal - right.ordinal || left.entryId.localeCompare(right.entryId),
    );

  assertCanonicalHistory(completed);
  const completedCount = completed.length;
  const crown = AUTHORED_CROWN_BLUEPRINT.map((element) =>
    activateElement(element, completedCount),
  );
  const memoryBlossoms: AuthoredMemoryBlossom[] = [];
  const anonymousTraces: AnonymousGrowthTrace[] = [];

  for (const journal of completed) {
    const memoryKey = authoredMemoryKey(subjectId, journal.entryId);
    const socket = blossomSocketFor(subjectId, memoryKey, journal.ordinal);
    if (journal.deleted) {
      anonymousTraces.push(
        Object.freeze({
          kind: "anonymous-growth-trace" as const,
          traceKey: `trace_${opaqueToken(`${subjectId}\u0000${memoryKey}\u0000deleted`)}`,
          socket,
          interactive: false as const,
        }),
      );
      continue;
    }

    memoryBlossoms.push(
      Object.freeze({
        memoryKey,
        socket,
        flower: EQUAL_MEMORY_FLOWER,
        surroundingGrowth: surroundingGrowthFor(journal.reflectionDepth),
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    stage: authoredGrowthStageForCount(completedCount),
    completedCount,
    crown: Object.freeze(crown),
    memoryBlossoms: Object.freeze(memoryBlossoms),
    anonymousTraces: Object.freeze(anonymousTraces),
  });
}

function buildAuthoredCrownBlueprint(): readonly AuthoredCrownElementBlueprint[] {
  const result: AuthoredCrownElementBlueprint[] = [];
  let previousPhaseIds: readonly string[] = [];

  for (const [phaseIndex, phase] of CROWN_PHASES.entries()) {
    const phaseIds = Array.from(
      { length: phase.count },
      (_, index) => `crown/${phase.id}/${String(index + 1).padStart(2, "0")}`,
    );
    const span = phase.revealEnd - phase.revealStart;
    const revealDuration = Math.max(12, span * 0.55);
    const staggerSpan = span - revealDuration;

    for (let index = 0; index < phase.count; index += 1) {
      const progress = phase.count === 1 ? 0 : index / (phase.count - 1);
      const revealStart = phase.revealStart + progress * staggerSpan;
      const role = phase.roles[index % phase.roles.length];
      const neighborhood = NEIGHBORHOODS[
        (index * 5 + phaseIndex * 3) % NEIGHBORHOODS.length
      ];
      result.push(
        Object.freeze({
          elementId: phaseIds[index],
          parentElementId:
            previousPhaseIds.length === 0
              ? null
              : previousPhaseIds[(index * 3 + phaseIndex) % previousPhaseIds.length],
          role,
          neighborhood,
          depthLayer: ((index + phaseIndex) % 3) as 0 | 1 | 2,
          revealStart: round(revealStart),
          revealEnd: round(revealStart + revealDuration),
          targetScale: ROLE_SCALE[role],
        }),
      );
    }
    previousPhaseIds = phaseIds;
  }

  return Object.freeze(result);
}

function activateElement(
  element: AuthoredCrownElementBlueprint,
  completedCount: number,
): AuthoredCrownElementActivation {
  const linear = clamp01(
    (completedCount - element.revealStart) /
      (element.revealEnd - element.revealStart),
  );
  const activation = round(linear * linear * (3 - 2 * linear));
  return Object.freeze({
    ...element,
    activation,
    visible: activation > 0.015,
  });
}

function blossomSocketFor(
  subjectId: string,
  memoryKey: string,
  ordinal: number,
): AuthoredBlossomSocket {
  const candidates = AUTHORED_CROWN_BLUEPRINT.filter(
    (element) => activationAt(element, ordinal) > 0.08,
  );
  if (candidates.length === 0) {
    throw new Error(`No authored crown socket is available for ordinal ${ordinal}.`);
  }
  const seed = `${subjectId}\u0000${memoryKey}\u0000${ordinal}`;
  const host = candidates[hash32(seed) % candidates.length];
  const unitA = hashUnit(`${seed}\u0000a`);
  const unitB = hashUnit(`${seed}\u0000b`);
  const unitC = hashUnit(`${seed}\u0000c`);
  const unitD = hashUnit(`${seed}\u0000d`);

  return Object.freeze({
    socketId: `socket_${opaqueToken(seed)}`,
    hostElementId: host.elementId,
    neighborhood: host.neighborhood,
    attachmentT: round(0.38 + unitA * 0.54),
    azimuth: round(-Math.PI + unitB * Math.PI * 2),
    radialOffset: round(0.035 + unitC * 0.095),
    depthOffset: round(-0.14 + unitD * 0.28),
  });
}

function activationAt(
  element: AuthoredCrownElementBlueprint,
  completedCount: number,
): number {
  return activateElement(element, completedCount).activation;
}

function surroundingGrowthFor(
  privateDepth: number | undefined,
): SurroundingGrowthEnrichment {
  const normalized = Number.isFinite(privateDepth)
    ? clamp01(privateDepth ?? 0)
    : 0;
  const tier: 0 | 1 | 2 | 3 =
    normalized < 0.25 ? 0 : normalized < 0.5 ? 1 : normalized < 0.75 ? 2 : 3;
  const fineShootActivation = [0, 0.28, 0.62, 1] as const;
  const motionLift = [0, 0.025, 0.055, 0.09] as const;

  return Object.freeze({
    kind: "surrounding-growth" as const,
    budCount: tier,
    leafPairCount: (tier === 0 ? 0 : tier < 3 ? 1 : 2) as 0 | 1 | 2,
    fineShootActivation: fineShootActivation[tier],
    motionLift: motionLift[tier],
  });
}

function validateJournal(journal: AuthoredGrowthJournal): AuthoredGrowthJournal {
  const entryId = requireText(journal.entryId, "entryId");
  if (!Number.isSafeInteger(journal.ordinal) || journal.ordinal < 1) {
    throw new RangeError("completed journal ordinal must be a positive safe integer");
  }
  if (
    journal.reflectionDepth !== undefined &&
    !Number.isFinite(journal.reflectionDepth)
  ) {
    throw new TypeError("reflectionDepth must be finite when provided");
  }
  return Object.freeze({ ...journal, entryId });
}

function assertCanonicalHistory(history: readonly AuthoredGrowthJournal[]): void {
  const entryIds = new Set<string>();
  for (let index = 0; index < history.length; index += 1) {
    const journal = history[index];
    if (journal.ordinal !== index + 1) {
      throw new RangeError(
        "completed journal ordinals must be contiguous from one; retain deletion tombstones",
      );
    }
    if (entryIds.has(journal.entryId)) {
      throw new Error(`duplicate completed journal entryId: ${journal.entryId}`);
    }
    entryIds.add(journal.entryId);
  }
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

function requireCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("completedCount must be a non-negative safe integer");
  }
  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function hashUnit(value: string): number {
  return hash32(value) / 0x1_0000_0000;
}

function opaqueToken(value: string): string {
  return `${hash32(`a\u0000${value}`).toString(36)}${hash32(`b\u0000${value}`)
    .toString(36)
    .padStart(7, "0")}`;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
