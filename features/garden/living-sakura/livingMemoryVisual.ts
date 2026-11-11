import type { GardenMemoryRecord } from "../MemoryNavigator";
import {
  projectActiveMemoryMarkers,
  type BotanicalLocation,
  type LivingDevelopment,
} from "../../growth/livingDevelopment";

/**
 * Renderer-safe contract between completed journals and the Living Sakura.
 *
 * This module is intentionally an allowlist boundary. It copies opaque identity
 * and stable botanical placement only. Human-readable journal fields and the
 * private surrounding-growth recipe never cross into renderer metadata.
 */

export type LivingMemoryVisualState =
  | "available"
  | "selected"
  | "deleted"
  | "unavailable";

export interface LivingMemoryBotanicalIdentity {
  readonly anchorKey: string;
  readonly locationKey: string;
  readonly familyKey: string;
  readonly adjacencySlot: number;
}

export interface LivingMemoryLineage {
  /** Botanical identity only; no private journal IDs are exposed for lineage. */
  readonly adjacentToAnchorKey: string | null;
  readonly familyAnchorKey: string;
}

/**
 * A serializable reference resolved by the topology/animation layer into a
 * BranchLocalOrganBinding. It carries no world coordinates and cannot detach
 * from its owning branch by silently changing coordinate spaces.
 */
export interface LivingMemoryBranchLocalTransformRef {
  readonly kind: "branch-local-binding-ref";
  readonly space: "segment-local";
  readonly bindingKey: string;
  readonly botanicalAddress: string;
}

export interface LivingMemoryBlossomContract {
  readonly kind: "memory-blossom";
  readonly petalCount: 5;
  readonly semanticImportance: "equal";
  readonly interactionTarget: "whole-flower";
  readonly treatment: "equal-memory-v1";
}

export interface LivingMemoryVisual {
  readonly schemaVersion: 1;
  /** Null after deletion so a renderer cannot retain the former journal link. */
  readonly entryId: string | null;
  readonly ordinal: number;
  readonly state: LivingMemoryVisualState;
  readonly interactive: boolean;
  /** Deleted memories retain an anonymous botanical trace, not a clickable flower. */
  readonly renderRole: "memory-blossom" | "anonymous-growth-trace";
  readonly botanicalIdentity: LivingMemoryBotanicalIdentity;
  readonly lineage: LivingMemoryLineage;
  readonly branchLocalTransform: LivingMemoryBranchLocalTransformRef;
  /** Null for a deleted memory because its attributed blossom is removed. */
  readonly blossom: LivingMemoryBlossomContract | null;
}

export interface LivingMemoryProjectionRequest {
  readonly kind: "project-selected-memory";
  readonly entryId: string;
  readonly botanicalAddress: string;
  readonly reason: "selected-outside-active-window";
  readonly required: true;
}

export interface LivingMemoryVisualProjection {
  readonly schemaVersion: 1;
  readonly locked: boolean;
  /** Complete renderer-safe history. Empty while locked. */
  readonly history: readonly LivingMemoryVisual[];
  /** Bounded active projection. Empty while locked. */
  readonly active: readonly LivingMemoryVisual[];
  readonly projectionRequests: readonly LivingMemoryProjectionRequest[];
  /** Zero while locked so the personalized journal count is not disclosed. */
  readonly totalCompleted: number;
  readonly activeLimit: number;
}

export interface CreateLivingMemoryVisualProjectionOptions {
  readonly memories: readonly GardenMemoryRecord[];
  readonly developments: readonly LivingDevelopment[];
  readonly locked: boolean;
  readonly selectedEntryId?: string | null;
  readonly deletedEntryIds?: readonly string[];
  readonly unavailableEntryIds?: readonly string[];
  readonly activeLimit?: number;
}

const EQUAL_BLOSSOM: LivingMemoryBlossomContract = Object.freeze({
  kind: "memory-blossom",
  petalCount: 5,
  semanticImportance: "equal",
  interactionTarget: "whole-flower",
  treatment: "equal-memory-v1",
});

const LOCKED_PROJECTION: LivingMemoryVisualProjection = Object.freeze({
  schemaVersion: 1,
  locked: true,
  history: Object.freeze([]),
  active: Object.freeze([]),
  projectionRequests: Object.freeze([]),
  totalCompleted: 0,
  activeLimit: 0,
});

/**
 * Converts completed journal records and their stable living-development
 * markers into one equal five-petal renderer contract per historical entry.
 */
export function createLivingMemoryVisualProjection(
  options: CreateLivingMemoryVisualProjectionOptions,
): LivingMemoryVisualProjection {
  if (options.locked) return LOCKED_PROJECTION;

  const activeLimit = normalizeActiveLimit(options.activeLimit ?? 256);
  const recordsByEntryId = indexRecords(options.memories);
  const deleted = normalizedIdSet(options.deletedEntryIds);
  const unavailable = normalizedIdSet(options.unavailableEntryIds);
  const orderedDevelopments = [...options.developments].sort(
    (left, right) =>
      left.memory.ordinal - right.memory.ordinal ||
      left.memory.entryId.localeCompare(right.memory.entryId),
  );
  assertUniqueDevelopments(orderedDevelopments);
  assertEveryRecordHasDevelopment(recordsByEntryId, orderedDevelopments);

  const selectedEntryId = normalizeId(options.selectedEntryId);
  const selectedIsReachable = Boolean(
    selectedEntryId &&
      orderedDevelopments.some(
        (development) => development.memory.entryId === selectedEntryId,
      ),
  );
  const selectedIsUsable = Boolean(
    selectedEntryId &&
      selectedIsReachable &&
      !deleted.has(selectedEntryId) &&
      !unavailable.has(selectedEntryId) &&
      recordsByEntryId.has(selectedEntryId),
  );

  const visualByHistoricalEntryId = new Map<string, LivingMemoryVisual>();
  const history = orderedDevelopments.map((development) => {
    const entryId = development.memory.entryId;
    const state = stateForMemory({
      entryId,
      hasRecord: recordsByEntryId.has(entryId),
      deleted,
      unavailable,
      selectedEntryId: selectedIsUsable ? selectedEntryId : null,
    });
    const visual = createVisual(development, state);
    visualByHistoricalEntryId.set(entryId, visual);
    return visual;
  });

  const defaultProjection = projectActiveMemoryMarkers(orderedDevelopments, {
    limit: activeLimit,
  });
  const selectedWasOutsideActiveWindow = Boolean(
    selectedIsUsable &&
      !defaultProjection.activeMarkers.some(
        (marker) => marker.entryId === selectedEntryId,
      ),
  );
  const activeProjection = projectActiveMemoryMarkers(orderedDevelopments, {
    limit: activeLimit,
    selectedEntryIds: selectedIsUsable && selectedEntryId
      ? [selectedEntryId]
      : [],
  });
  const active = activeProjection.activeMarkers.map((marker) => {
    const visual = visualByHistoricalEntryId.get(marker.entryId);
    if (!visual) {
      throw new Error(`missing renderer visual for ${marker.entryId}`);
    }
    return visual;
  });

  const selectedVisual = selectedEntryId
    ? visualByHistoricalEntryId.get(selectedEntryId)
    : undefined;
  const projectionRequests =
    selectedWasOutsideActiveWindow && selectedVisual?.entryId
      ? [
          Object.freeze({
            kind: "project-selected-memory" as const,
            entryId: selectedVisual.entryId,
            botanicalAddress:
              selectedVisual.branchLocalTransform.botanicalAddress,
            reason: "selected-outside-active-window" as const,
            required: true as const,
          }),
        ]
      : [];

  return Object.freeze({
    schemaVersion: 1 as const,
    locked: false,
    history: Object.freeze(history),
    active: Object.freeze(active),
    projectionRequests: Object.freeze(projectionRequests),
    totalCompleted: history.length,
    activeLimit,
  });
}

function createVisual(
  development: LivingDevelopment,
  state: LivingMemoryVisualState,
): LivingMemoryVisual {
  const { memory } = development;
  const deleted = state === "deleted";
  const botanicalIdentity = botanicalIdentityFrom(memory.location);
  const botanicalAddress = `${botanicalIdentity.locationKey}/memory-flower`;

  return Object.freeze({
    schemaVersion: 1 as const,
    entryId: deleted ? null : memory.entryId,
    ordinal: memory.ordinal,
    state,
    interactive: state === "available" || state === "selected",
    renderRole: deleted ? "anonymous-growth-trace" : "memory-blossom",
    botanicalIdentity,
    lineage: Object.freeze({
      adjacentToAnchorKey: memory.location.adjacentToKey,
      familyAnchorKey: memory.location.familyKey,
    }),
    branchLocalTransform: Object.freeze({
      kind: "branch-local-binding-ref" as const,
      space: "segment-local" as const,
      bindingKey: `${botanicalIdentity.locationKey}/branch-binding`,
      botanicalAddress,
    }),
    blossom: deleted ? null : EQUAL_BLOSSOM,
  });
}

function botanicalIdentityFrom(
  location: BotanicalLocation,
): LivingMemoryBotanicalIdentity {
  return Object.freeze({
    anchorKey: location.anchorKey,
    locationKey: location.locationKey,
    familyKey: location.familyKey,
    adjacencySlot: location.adjacencySlot,
  });
}

function stateForMemory(input: {
  entryId: string;
  hasRecord: boolean;
  deleted: ReadonlySet<string>;
  unavailable: ReadonlySet<string>;
  selectedEntryId: string | null;
}): LivingMemoryVisualState {
  if (input.deleted.has(input.entryId)) return "deleted";
  if (input.unavailable.has(input.entryId) || !input.hasRecord) {
    return "unavailable";
  }
  return input.selectedEntryId === input.entryId ? "selected" : "available";
}

function indexRecords(
  records: readonly GardenMemoryRecord[],
): ReadonlyMap<string, GardenMemoryRecord> {
  const result = new Map<string, GardenMemoryRecord>();
  for (const record of records) {
    const entryId = requireId(record.entryId, "memory entryId");
    if (result.has(entryId)) {
      throw new Error(`duplicate garden memory entryId: ${entryId}`);
    }
    result.set(entryId, record);
  }
  return result;
}

function assertUniqueDevelopments(
  developments: readonly LivingDevelopment[],
): void {
  const entryIds = new Set<string>();
  for (const development of developments) {
    const entryId = requireId(
      development.memory.entryId,
      "development entryId",
    );
    if (entryIds.has(entryId)) {
      throw new Error(`duplicate living development entryId: ${entryId}`);
    }
    entryIds.add(entryId);
  }
}

function assertEveryRecordHasDevelopment(
  recordsByEntryId: ReadonlyMap<string, GardenMemoryRecord>,
  developments: readonly LivingDevelopment[],
): void {
  const developedEntryIds = new Set(
    developments.map((development) => development.memory.entryId),
  );
  for (const entryId of recordsByEntryId.keys()) {
    if (!developedEntryIds.has(entryId)) {
      throw new Error(
        `completed garden memory has no living development: ${entryId}`,
      );
    }
  }
}

function normalizedIdSet(values: readonly string[] | undefined): Set<string> {
  const result = new Set<string>();
  for (const value of values ?? []) result.add(requireId(value, "entryId"));
  return result;
}

function normalizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function requireId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function normalizeActiveLimit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}
