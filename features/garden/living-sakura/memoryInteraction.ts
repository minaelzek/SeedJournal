/**
 * Pure interaction primitives for Living Sakura memory blossoms.
 *
 * This module deliberately has no DOM, React, R3F, or Three.js dependency. It
 * defines the deterministic identity and input contracts that those layers can
 * consume without placing private journal content in renderer-owned state.
 */

/**
 * Journal-memory petal hit diameters in CSS px.
 * Generous so orbitable 3D petals stay easy to open as journal entries.
 */
export const MEMORY_TARGET_DIAMETER_CSS_PX = Object.freeze({
  fine: 44,
  coarse: 64,
} as const);

/**
 * Max pointer travel still counted as a blossom activation (not orbit drag).
 * Coarse is slightly looser so finger jitter still activates.
 */
export const MEMORY_GESTURE_THRESHOLD_CSS_PX = Object.freeze({
  fine: 8,
  coarse: 18,
} as const);

/** Default padding between neighboring target edges when planning separation. */
export const MEMORY_SCREEN_SEPARATION_PADDING_CSS_PX = 8;

export type PointerPrecision = keyof typeof MEMORY_GESTURE_THRESHOLD_CSS_PX;

export interface MemoryInstanceSource {
  /** Opaque application identity. Never use journal content as this value. */
  readonly entryId: string;
  /** Stable ordinal supplied by the active memory projection. */
  readonly projectionOrdinal: number;
}

export interface MemoryInstanceIdentity {
  readonly instanceId: number;
  readonly entryId: string;
  readonly projectionOrdinal: number;
}

export interface MemoryInstanceIndex {
  readonly instances: readonly MemoryInstanceIdentity[];
  readonly entryIdByInstanceId: readonly string[];
  readonly instanceIdByEntryId: ReadonlyMap<string, number>;
}

export interface SafeMemoryRendererMetadata {
  readonly kind: "living-sakura-memory";
  readonly entryId: string;
  readonly instanceId: number;
}

export interface PointerPosition {
  readonly clientX: number;
  readonly clientY: number;
}

export type MemoryPointerGesture = "activate" | "drag" | "cancel";

export interface MemoryHitRadiusInput {
  readonly pointerPrecision: PointerPrecision;
  readonly distanceToCamera: number;
  readonly viewportHeightCssPx: number;
  readonly verticalFovDegrees: number;
  readonly minimumWorldRadius?: number;
  readonly maximumWorldRadius?: number;
}

export interface MemoryHitCandidate {
  readonly instanceId: number;
  /** Euclidean screen-space distance from the pointer to the blossom center. */
  readonly screenDistanceCssPx: number;
  /** Positive camera-space distance; smaller values are closer to the camera. */
  readonly cameraDepth: number;
}

export type VisibleMemoryKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "Enter"
  | "Escape";

export type VisibleMemoryKeyboardAction =
  | "focus"
  | "activate"
  | "clear"
  | "none";

export interface VisibleMemoryKeyboardResult {
  readonly action: VisibleMemoryKeyboardAction;
  readonly activeEntryId: string | null;
  readonly handled: boolean;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  const result = finite(value, label);
  if (!Number.isInteger(result) || result < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return result;
}

function positive(value: number, label: string): number {
  const result = finite(value, label);
  if (result <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return result;
}

function opaqueEntryId(value: string): string {
  const result = value.trim();
  if (!result) throw new TypeError("entryId must not be empty.");
  return result;
}

function stableInstanceOrder(
  left: MemoryInstanceSource,
  right: MemoryInstanceSource,
): number {
  return (
    left.projectionOrdinal - right.projectionOrdinal ||
    left.entryId.localeCompare(right.entryId)
  );
}

/**
 * Builds a contiguous, deterministic instance index from an already-selected
 * visible-memory projection. Stable ordinals keep existing instance IDs stable
 * when later memories are appended.
 */
export function createMemoryInstanceIndex(
  sources: readonly MemoryInstanceSource[],
): MemoryInstanceIndex {
  const normalized = sources.map((source) =>
    Object.freeze({
      entryId: opaqueEntryId(source.entryId),
      projectionOrdinal: nonNegativeInteger(
        source.projectionOrdinal,
        "projectionOrdinal",
      ),
    }),
  );
  const seenEntryIds = new Set<string>();
  for (const source of normalized) {
    if (seenEntryIds.has(source.entryId)) {
      throw new Error(`Duplicate memory entryId: ${source.entryId}.`);
    }
    seenEntryIds.add(source.entryId);
  }

  const ordered = [...normalized].sort(stableInstanceOrder);
  const instanceIdByEntryId = new Map<string, number>();
  const instances = ordered.map((source, instanceId) => {
    instanceIdByEntryId.set(source.entryId, instanceId);
    return Object.freeze({
      instanceId,
      entryId: source.entryId,
      projectionOrdinal: source.projectionOrdinal,
    });
  });

  return Object.freeze({
    instances: Object.freeze(instances),
    entryIdByInstanceId: Object.freeze(
      instances.map((instance) => instance.entryId),
    ),
    instanceIdByEntryId,
  });
}

/** Resolves a raycast instance ID without exposing journal data to the mesh. */
export function entryIdForMemoryInstance(
  index: MemoryInstanceIndex,
  instanceId: number,
): string | null {
  if (!Number.isInteger(instanceId) || instanceId < 0) return null;
  return index.entryIdByInstanceId[instanceId] ?? null;
}

/**
 * Produces the complete and intentionally tiny metadata object allowed on a
 * renderer-owned object. Extra fields on caller data are never copied.
 */
export function createSafeMemoryRendererMetadata(
  index: MemoryInstanceIndex,
  instanceId: number,
): SafeMemoryRendererMetadata {
  const normalizedInstanceId = nonNegativeInteger(instanceId, "instanceId");
  const entryId = entryIdForMemoryInstance(index, normalizedInstanceId);
  if (!entryId) {
    throw new RangeError(`Unknown memory instanceId: ${normalizedInstanceId}.`);
  }
  return Object.freeze({
    kind: "living-sakura-memory" as const,
    entryId,
    instanceId: normalizedInstanceId,
  });
}

/** Runtime guard for metadata recovered from an untyped renderer boundary. */
export function isSafeMemoryRendererMetadata(
  value: unknown,
): value is SafeMemoryRendererMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 3 &&
    keys[0] === "entryId" &&
    keys[1] === "instanceId" &&
    keys[2] === "kind" &&
    record.kind === "living-sakura-memory" &&
    typeof record.entryId === "string" &&
    record.entryId.trim().length > 0 &&
    Number.isInteger(record.instanceId) &&
    (record.instanceId as number) >= 0
  );
}

/**
 * Nearest journal blossom to a pointer, in CSS pixels.
 * One pass. No raycasting. Screen distance wins; equal distances break toward
 * the smaller camera depth (closer blossom), then the earlier petal.
 */
export function nearestPetalId(
  petals: readonly {
    entryId: string;
    screenX: number;
    screenY: number;
    /** Positive distance from the camera. Omit when depth is unknown. */
    depth?: number;
  }[],
  pointerX: number,
  pointerY: number,
  radiusPx: number,
): string | null {
  if (!(radiusPx > 0) || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return null;
  }
  let bestId: string | null = null;
  let bestDistance = radiusPx;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const petal of petals) {
    if (!Number.isFinite(petal.screenX) || !Number.isFinite(petal.screenY)) continue;
    const distance = Math.hypot(petal.screenX - pointerX, petal.screenY - pointerY);
    if (!Number.isFinite(distance) || distance > radiusPx) continue;
    const depth = Number.isFinite(petal.depth) ? petal.depth! : Number.POSITIVE_INFINITY;
    const closerOnScreen = distance < bestDistance;
    const sameScreenNearerCamera =
      distance === bestDistance && depth < bestDepth;
    if (bestId === null || closerOnScreen || sameScreenNearerCamera) {
      bestDistance = distance;
      bestDepth = depth;
      bestId = petal.entryId;
    }
  }
  return bestId;
}

/** Classifies release as blossom activation or camera drag by CSS-pixel travel. */
export function classifyMemoryPointerGesture(input: {
  readonly pointerPrecision: PointerPrecision;
  readonly start: PointerPosition;
  readonly end: PointerPosition;
  readonly cancelled?: boolean;
}): MemoryPointerGesture {
  if (input.cancelled) return "cancel";
  const deltaX = finite(input.end.clientX, "end.clientX") -
    finite(input.start.clientX, "start.clientX");
  const deltaY = finite(input.end.clientY, "end.clientY") -
    finite(input.start.clientY, "start.clientY");
  const threshold = MEMORY_GESTURE_THRESHOLD_CSS_PX[input.pointerPrecision];
  return Math.hypot(deltaX, deltaY) <= threshold ? "activate" : "drag";
}

/**
 * Preferred minimum center-to-center screen separation when planning non-
 * overlapping memory hit targets. Equals the pointer target diameter plus
 * optional edge padding so coarse fingers can disambiguate neighbors.
 * Pure / Three.js-free — convert to world units at the camera layer if needed.
 */
export function minimumMemoryScreenSeparationCssPx(
  pointerPrecision: PointerPrecision,
  paddingCssPx: number = MEMORY_SCREEN_SEPARATION_PADDING_CSS_PX,
): number {
  const padding = finite(paddingCssPx, "paddingCssPx");
  if (padding < 0) {
    throw new RangeError("paddingCssPx must not be negative.");
  }
  return MEMORY_TARGET_DIAMETER_CSS_PX[pointerPrecision] + padding;
}

/**
 * Calculates the world-space radius that projects to the required CSS-pixel
 * target diameter for a perspective camera at a given depth.
 */
export function projectedMemoryHitRadius(input: MemoryHitRadiusInput): number {
  const distance = positive(input.distanceToCamera, "distanceToCamera");
  const viewportHeight = positive(
    input.viewportHeightCssPx,
    "viewportHeightCssPx",
  );
  const fov = positive(input.verticalFovDegrees, "verticalFovDegrees");
  if (fov >= 180) {
    throw new RangeError("verticalFovDegrees must be less than 180.");
  }
  const targetDiameter = MEMORY_TARGET_DIAMETER_CSS_PX[input.pointerPrecision];
  const visibleWorldHeight =
    2 * distance * Math.tan((fov * Math.PI) / 360);
  let radius = (visibleWorldHeight / viewportHeight) * (targetDiameter / 2);

  if (input.minimumWorldRadius !== undefined) {
    radius = Math.max(
      radius,
      positive(input.minimumWorldRadius, "minimumWorldRadius"),
    );
  }
  if (input.maximumWorldRadius !== undefined) {
    const maximum = positive(input.maximumWorldRadius, "maximumWorldRadius");
    if (
      input.minimumWorldRadius !== undefined &&
      maximum < input.minimumWorldRadius
    ) {
      throw new RangeError(
        "maximumWorldRadius must be greater than or equal to minimumWorldRadius.",
      );
    }
    radius = Math.min(radius, maximum);
  }
  return radius;
}

/** Non-mutating candidate ranking: pointer proximity, camera depth, stable ID. */
export function orderMemoryHitCandidates<T extends MemoryHitCandidate>(
  candidates: readonly T[],
): readonly T[] {
  for (const candidate of candidates) {
    nonNegativeInteger(candidate.instanceId, "candidate.instanceId");
    if (finite(candidate.screenDistanceCssPx, "candidate.screenDistanceCssPx") < 0) {
      throw new RangeError("candidate.screenDistanceCssPx must not be negative.");
    }
    if (finite(candidate.cameraDepth, "candidate.cameraDepth") < 0) {
      throw new RangeError("candidate.cameraDepth must not be negative.");
    }
  }
  return Object.freeze(
    [...candidates].sort(
      (left, right) =>
        left.screenDistanceCssPx - right.screenDistanceCssPx ||
        left.cameraDepth - right.cameraDepth ||
        left.instanceId - right.instanceId,
    ),
  );
}

/**
 * Pure roving-memory keyboard semantics. Navigation clamps at either end; an
 * absent selection begins at the nearest edge for the requested direction.
 */
export function navigateVisibleMemories(input: {
  readonly key: string;
  readonly visibleEntryIds: readonly string[];
  readonly activeEntryId: string | null;
}): VisibleMemoryKeyboardResult {
  const visibleEntryIds = input.visibleEntryIds.map(opaqueEntryId);
  if (new Set(visibleEntryIds).size !== visibleEntryIds.length) {
    throw new Error("visibleEntryIds must be unique.");
  }
  const currentIndex = input.activeEntryId
    ? visibleEntryIds.indexOf(input.activeEntryId)
    : -1;
  const lastIndex = visibleEntryIds.length - 1;

  if (input.key === "Escape") {
    return Object.freeze({ action: "clear", activeEntryId: null, handled: true });
  }
  if (input.key === "Enter") {
    return Object.freeze({
      action: currentIndex >= 0 ? "activate" : "none",
      activeEntryId: currentIndex >= 0 ? visibleEntryIds[currentIndex] : null,
      handled: currentIndex >= 0,
    });
  }
  if (lastIndex < 0) {
    return Object.freeze({ action: "none", activeEntryId: null, handled: false });
  }

  let nextIndex: number | null = null;
  if (input.key === "Home") nextIndex = 0;
  if (input.key === "End") nextIndex = lastIndex;
  if (input.key === "ArrowLeft") {
    nextIndex = currentIndex < 0 ? lastIndex : Math.max(0, currentIndex - 1);
  }
  if (input.key === "ArrowRight") {
    nextIndex = currentIndex < 0 ? 0 : Math.min(lastIndex, currentIndex + 1);
  }
  if (nextIndex === null) {
    return Object.freeze({
      action: "none",
      activeEntryId: currentIndex >= 0 ? visibleEntryIds[currentIndex] : null,
      handled: false,
    });
  }
  return Object.freeze({
    action: "focus",
    activeEntryId: visibleEntryIds[nextIndex],
    handled: true,
  });
}
