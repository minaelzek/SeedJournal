/** Deterministic, renderer-independent Living Sakura growth ceremony. */

export const GROWTH_CEREMONY_DURATION_SECONDS = 4.2;

/** Reduced-motion reveal: short dissolve to the same end state as the full ceremony. */
export const GROWTH_REVEAL_REDUCED_MOTION_SECONDS = 0.45;

export const GROWTH_CEREMONY_WINDOWS = Object.freeze({
  // Longer path pulse so sap-rise reads before wood extends (cinematic film).
  parentPathPulse: Object.freeze({ start: 0, end: 0.85 }),
  woodExtension: Object.freeze({ start: 0.45, end: 1.9 }),
  organStagger: Object.freeze({ start: 1.45, end: 3.35 }),
  localSettle: Object.freeze({ start: 3.35, end: 4.2 }),
});

export type GrowthCeremonyPhase =
  | "parent-path"
  | "wood-extension"
  | "organ-stagger"
  | "local-settle"
  | "complete";

export interface GrowthCeremonyPathStep {
  readonly segmentId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface GrowthCeremonyOrganStep {
  readonly organId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly settlePhase: number;
}

export interface GrowthCeremonySchedule {
  readonly eventId: string;
  readonly durationSeconds: 4.2;
  readonly path: readonly GrowthCeremonyPathStep[];
  readonly organs: readonly GrowthCeremonyOrganStep[];
}

export interface GrowthCeremonySample {
  readonly elapsedSeconds: number;
  readonly phase: GrowthCeremonyPhase;
  readonly complete: boolean;
  readonly overallProgress: number;
  readonly parentPath: readonly {
    segmentId: string;
    progress: number;
    emphasis: number;
  }[];
  readonly woodProgress: number;
  readonly organs: readonly {
    organId: string;
    progress: number;
    localSettleOffset: number;
  }[];
  readonly settleProgress: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function progressBetween(value: number, start: number, end: number): number {
  return clamp((value - start) / (end - start));
}

function smoothstep(value: number): number {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function uniqueIds(values: readonly string[], label: string): string[] {
  const seen = new Set<string>();
  return values.map((value) => {
    const id = value.trim();
    if (!id) throw new TypeError(`${label} must not contain empty IDs.`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate ID ${id}.`);
    seen.add(id);
    return id;
  });
}

function phaseAt(elapsedSeconds: number): GrowthCeremonyPhase {
  if (elapsedSeconds >= GROWTH_CEREMONY_DURATION_SECONDS) return "complete";
  if (elapsedSeconds >= GROWTH_CEREMONY_WINDOWS.localSettle.start) {
    return "local-settle";
  }
  if (elapsedSeconds >= GROWTH_CEREMONY_WINDOWS.organStagger.start) {
    return "organ-stagger";
  }
  if (elapsedSeconds >= GROWTH_CEREMONY_WINDOWS.woodExtension.start) {
    return "wood-extension";
  }
  return "parent-path";
}

/**
 * Produces a stable schedule from permanent event, path, and organ IDs.
 * Organ input order does not alter the schedule.
 */
export function createGrowthCeremonySchedule(input: {
  eventId: string;
  parentPathSegmentIds: readonly string[];
  organIds: readonly string[];
}): GrowthCeremonySchedule {
  const eventId = input.eventId.trim();
  if (!eventId) throw new TypeError("eventId must not be empty.");
  const pathIds = uniqueIds(input.parentPathSegmentIds, "parentPathSegmentIds");
  const organIds = uniqueIds(input.organIds, "organIds").sort(
    (left, right) =>
      hashText(`${eventId}:${left}`) - hashText(`${eventId}:${right}`) ||
      left.localeCompare(right),
  );

  const pathWindow = GROWTH_CEREMONY_WINDOWS.parentPathPulse;
  // Step length scales with the cinematic path window so multi-hop sap-rise reads.
  const pathStepDuration =
    pathIds.length <= 1
      ? pathWindow.end - pathWindow.start
      : Math.min(0.42, (pathWindow.end - pathWindow.start) * 0.55);
  const pathStartRange = pathWindow.end - pathStepDuration;
  const path = pathIds.map((segmentId, index) => {
    const amount = pathIds.length <= 1 ? 0 : index / (pathIds.length - 1);
    const startSeconds = pathWindow.start + pathStartRange * amount;
    return Object.freeze({
      segmentId,
      startSeconds,
      endSeconds: startSeconds + pathStepDuration,
    });
  });

  const organWindow = GROWTH_CEREMONY_WINDOWS.organStagger;
  const organDuration = 0.75;
  const organStartRange = organWindow.end - organWindow.start - organDuration;
  const organs = organIds.map((organId, index) => {
    const amount = organIds.length <= 1 ? 0.5 : index / (organIds.length - 1);
    return Object.freeze({
      organId,
      startSeconds: organWindow.start + organStartRange * amount,
      endSeconds:
        organWindow.start + organStartRange * amount + organDuration,
      settlePhase: (hashText(`${eventId}:${organId}:settle`) % 6283) / 1000,
    });
  });

  return Object.freeze({
    eventId,
    durationSeconds: GROWTH_CEREMONY_DURATION_SECONDS,
    path: Object.freeze(path),
    organs: Object.freeze(organs),
  });
}

/** Samples the full 4.2 second sequence without mutating renderer state. */
export function sampleGrowthCeremony(
  schedule: GrowthCeremonySchedule,
  elapsedSeconds: number,
  options: { reducedMotion?: boolean } = {},
): GrowthCeremonySample {
  if (!Number.isFinite(elapsedSeconds)) {
    throw new TypeError("elapsedSeconds must be finite.");
  }
  const elapsed = clamp(
    elapsedSeconds,
    0,
    GROWTH_CEREMONY_DURATION_SECONDS,
  );
  const settleProgress = smoothstep(
    progressBetween(
      elapsed,
      GROWTH_CEREMONY_WINDOWS.localSettle.start,
      GROWTH_CEREMONY_WINDOWS.localSettle.end,
    ),
  );
  const reducedMotion = options.reducedMotion === true;

  const parentPath = schedule.path.map((step) => {
    const progress = smoothstep(
      progressBetween(elapsed, step.startSeconds, step.endSeconds),
    );
    return Object.freeze({
      segmentId: step.segmentId,
      progress,
      emphasis: Math.sin(progress * Math.PI),
    });
  });

  const organs = schedule.organs.map((step) => {
    const progress = smoothstep(
      progressBetween(elapsed, step.startSeconds, step.endSeconds),
    );
    const localSettleOffset = reducedMotion
      ? 0
      : Math.sin((elapsed - step.startSeconds) * 8.3 + step.settlePhase) *
        0.035 *
        progress *
        (1 - settleProgress);
    return Object.freeze({
      organId: step.organId,
      progress,
      localSettleOffset,
    });
  });

  return Object.freeze({
    elapsedSeconds: elapsed,
    phase: phaseAt(elapsed),
    complete: elapsed >= GROWTH_CEREMONY_DURATION_SECONDS,
    overallProgress: smoothstep(
      elapsed / GROWTH_CEREMONY_DURATION_SECONDS,
    ),
    parentPath: Object.freeze(parentPath),
    woodProgress: smoothstep(
      progressBetween(
        elapsed,
        GROWTH_CEREMONY_WINDOWS.woodExtension.start,
        GROWTH_CEREMONY_WINDOWS.woodExtension.end,
      ),
    ),
    organs: Object.freeze(organs),
    settleProgress,
  });
}
