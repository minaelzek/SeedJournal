/**
 * Illustration-first sakura presentation model.
 * Pure functions: TreeSnapshot → visual knobs. No WebGL.
 *
 * Design law (Duolingo × Apple × sakura):
 * - Every completed reflection visibly changes the tree.
 * - Early progress is loved (never a barren stick).
 * - From sapling up, pink blossom mass dominates green leaves.
 * - Deep insight → hanami leap; stage change → silhouette leap.
 */

import type {
  GrowthKind,
  MemoryForm,
  TreeGrowthDelta,
  TreeGrowthEvent,
  TreeSnapshot,
  TreeStage,
} from "@/lib/contracts";
import { stageForGrowthUnits } from "@/features/growth/stages";

export type MorphIntent = "micro" | "hanami" | "stage-cross";

export interface SakuraVisualKnobs {
  /** 0–1 trunk thickness / presence */
  trunkWeight: number;
  /** 0–1 canopy cloud volume */
  canopyMass: number;
  /** 0–1 pink blossom dominance */
  blossomDensity: number;
  /** 0–1 rose buds */
  budDensity: number;
  /** 0–1 secondary foliage */
  leafDensity: number;
  /** 0–1 ambient petal fall */
  petalFall: number;
  /** 0–1 radiant glow (deep insight residue) */
  luminosity: number;
  /** Relative height scale for stage silhouette */
  heightScale: number;
  /** 0–1 overall “character presence” (shadow, ground, halo) */
  presence: number;
  /** Absolute organ counts for renderer (readable at phone size) */
  blossomCount: number;
  leafCount: number;
  budCount: number;
}

export interface MemoryMarkerPresentation {
  entryId: string;
  eventId: string;
  form: MemoryForm;
  /** Normalized 0–1 position in canopy ellipse */
  x: number;
  y: number;
  sequence: number;
}

export interface SakuraPresentation {
  stage: TreeStage;
  /** Intra-stage progress 0–1 for small steps */
  fill: number;
  totalGrowthUnits: number;
  memoryCount: number;
  sakura: SakuraVisualKnobs;
  memoryMarkers: MemoryMarkerPresentation[];
  /** True when early progress is past bare stick territory */
  earlyFullness: boolean;
  /** Human stage label for UI */
  stageLabel: string;
}

const STAGE_MIN: Record<TreeStage, number> = {
  seed: 0,
  sprout: 1,
  sapling: 12,
  "young-tree": 48,
  established: 96,
  mature: 192,
};

const STAGE_SPAN: Record<TreeStage, number> = {
  seed: 1,
  sprout: 11,
  sapling: 36,
  "young-tree": 48,
  established: 96,
  mature: 64,
};

const STAGE_LABEL: Record<TreeStage, string> = {
  seed: "Seed",
  sprout: "Sprout",
  sapling: "Sapling",
  "young-tree": "Young sakura",
  established: "Established sakura",
  mature: "Mature sakura",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

function roundCount(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function totalGrowthUnitsFromEvents(
  events: readonly TreeGrowthEvent[],
): number {
  return events.reduce((total, event) => total + (event.growthUnits || 0), 0);
}

export function fillForUnits(totalUnits: number, stage: TreeStage): number {
  const safe = Math.max(0, Math.floor(totalUnits));
  if (stage === "seed") return 0;
  if (stage === "mature") {
    return clamp01((safe - STAGE_MIN.mature) / STAGE_SPAN.mature);
  }
  const min = STAGE_MIN[stage];
  const span = STAGE_SPAN[stage];
  return clamp01((safe - min) / span);
}

function countMemoryForms(events: readonly TreeGrowthEvent[]): {
  leaf: number;
  bud: number;
  blossom: number;
  luminous: number;
  totalMemories: number;
} {
  const counts = { leaf: 0, bud: 0, blossom: 0, luminous: 0, totalMemories: 0 };
  for (const event of events) {
    if (!event.kind.startsWith("memory_") && event.kind !== "leaf") continue;
    switch (event.kind) {
      case "memory_leaf":
        counts.leaf += 1;
        counts.totalMemories += 1;
        break;
      case "leaf":
        // Ambient leaf event from complete route — soft density only
        counts.leaf += 0.35;
        break;
      case "memory_bud":
        counts.bud += 1;
        counts.totalMemories += 1;
        break;
      case "memory_blossom":
        counts.blossom += 1;
        counts.totalMemories += 1;
        break;
      case "memory_luminous_blossom":
        counts.luminous += 1;
        counts.totalMemories += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

/**
 * Aggressive, readable knobs — every session must show on the tree.
 * Early sprout is intentionally lush. Blossom wins from sapling up.
 */
export function sakuraKnobsFor(
  stage: TreeStage,
  fill: number,
  forms: ReturnType<typeof countMemoryForms>,
): SakuraVisualKnobs {
  const f = easeOutCubic(fill);
  const deepBloom = forms.blossom + forms.luminous * 1.6;
  const memoryBoost = Math.min(1, forms.totalMemories * 0.12);

  switch (stage) {
    case "seed":
      return {
        trunkWeight: 0,
        canopyMass: 0,
        blossomDensity: 0,
        budDensity: 0,
        leafDensity: 0,
        petalFall: 0,
        luminosity: 0,
        heightScale: 0.92,
        presence: 0.85,
        blossomCount: 0,
        leafCount: 0,
        budCount: 0,
      };
    case "sprout": {
      // Loved from first unit — soft leaves + buds, tiny optional pink
      const love = 0.62 + f * 0.35 + memoryBoost * 0.15;
      const blossom = Math.min(
        0.28,
        forms.blossom * 0.14 + forms.luminous * 0.2 + f * 0.08,
      );
      return {
        trunkWeight: 0.32 + f * 0.18,
        canopyMass: 0.38 + f * 0.4 + memoryBoost * 0.12,
        blossomDensity: blossom,
        budDensity: 0.28 + f * 0.35 + forms.bud * 0.08,
        leafDensity: love,
        petalFall: blossom > 0.1 ? 0.08 : 0,
        luminosity: forms.luminous > 0 ? 0.35 : 0,
        heightScale: 0.78 + f * 0.14,
        presence: 0.9,
        blossomCount: roundCount(blossom * 8 + forms.blossom * 2, 0, 10),
        leafCount: roundCount(5 + love * 10 + forms.leaf * 1.5, 5, 18),
        budCount: roundCount(2 + forms.bud * 2 + f * 4, 2, 12),
      };
    }
    case "sapling": {
      const blossom = 0.48 + f * 0.32 + deepBloom * 0.05 + memoryBoost * 0.1;
      const leaf = 0.32 + f * 0.12;
      const blossomDensity = Math.max(blossom, leaf + 0.08);
      return {
        trunkWeight: 0.48 + f * 0.2,
        canopyMass: 0.55 + f * 0.35,
        blossomDensity,
        budDensity: 0.34 + f * 0.22 + forms.bud * 0.04,
        leafDensity: leaf,
        petalFall: 0.14 + f * 0.16 + deepBloom * 0.03,
        luminosity: clamp01(forms.luminous * 0.22),
        heightScale: 0.88 + f * 0.1,
        presence: 0.94,
        blossomCount: roundCount(8 + blossomDensity * 16 + deepBloom * 2, 8, 28),
        leafCount: roundCount(4 + leaf * 8, 4, 14),
        budCount: roundCount(4 + forms.bud * 2 + f * 5, 4, 16),
      };
    }
    case "young-tree": {
      const blossom = 0.62 + f * 0.28 + deepBloom * 0.04;
      const leaf = 0.22 + f * 0.08;
      const blossomDensity = Math.max(blossom, leaf + 0.28);
      return {
        trunkWeight: 0.62 + f * 0.16,
        canopyMass: 0.72 + f * 0.24,
        blossomDensity,
        budDensity: 0.24 + f * 0.14,
        leafDensity: leaf,
        petalFall: 0.28 + f * 0.22,
        luminosity: clamp01(0.18 + forms.luminous * 0.14),
        heightScale: 0.96 + f * 0.06,
        presence: 0.97,
        blossomCount: roundCount(14 + blossomDensity * 20 + deepBloom * 2, 14, 40),
        leafCount: roundCount(3 + leaf * 6, 3, 12),
        budCount: roundCount(5 + f * 6, 5, 16),
      };
    }
    case "established": {
      const blossom = 0.76 + f * 0.18 + deepBloom * 0.03;
      const leaf = 0.14 + f * 0.05;
      const blossomDensity = Math.max(blossom, leaf + 0.42);
      return {
        trunkWeight: 0.74 + f * 0.14,
        canopyMass: 0.86 + f * 0.12,
        blossomDensity,
        budDensity: 0.16 + f * 0.1,
        leafDensity: leaf,
        petalFall: 0.42 + f * 0.24,
        luminosity: clamp01(0.26 + forms.luminous * 0.12),
        heightScale: 1.02 + f * 0.04,
        presence: 1,
        blossomCount: roundCount(22 + blossomDensity * 22, 22, 52),
        leafCount: roundCount(2 + leaf * 5, 2, 10),
        budCount: roundCount(4 + f * 5, 4, 14),
      };
    }
    case "mature": {
      const blossom = 0.88 + f * 0.1;
      const leaf = 0.1 + f * 0.03;
      const blossomDensity = Math.max(blossom, leaf + 0.55);
      return {
        trunkWeight: 0.88 + f * 0.1,
        canopyMass: 0.96 + f * 0.04,
        blossomDensity,
        budDensity: 0.12 + f * 0.06,
        leafDensity: leaf,
        petalFall: 0.58 + f * 0.3,
        luminosity: clamp01(0.34 + forms.luminous * 0.1),
        heightScale: 1.06 + f * 0.04,
        presence: 1,
        blossomCount: roundCount(30 + blossomDensity * 24, 30, 64),
        leafCount: roundCount(2 + leaf * 4, 2, 8),
        budCount: roundCount(3 + f * 4, 3, 12),
      };
    }
  }
}

function seededUnit(seed: number, salt: number): number {
  let t = (seed ^ salt) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 2246822507);
  t = Math.imul(t ^ (t >>> 13), 3266489909);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function formFromKind(kind: GrowthKind): MemoryForm | null {
  switch (kind) {
    case "memory_leaf":
    case "leaf":
      return "leaf";
    case "memory_bud":
      return "bud";
    case "memory_blossom":
      return "blossom";
    case "memory_luminous_blossom":
      return "luminous-blossom";
    default:
      return null;
  }
}

export function memoryMarkersFromEvents(
  events: readonly TreeGrowthEvent[],
): MemoryMarkerPresentation[] {
  const markers: MemoryMarkerPresentation[] = [];
  for (const event of events) {
    if (!event.entryId || !event.kind.startsWith("memory_")) continue;
    const form = formFromKind(event.kind);
    if (!form) continue;
    const ux = seededUnit(event.seed, 0x91e);
    const uy = seededUnit(event.seed, 0x5a3);
    markers.push({
      entryId: event.entryId,
      eventId: event.id,
      form,
      x: 0.16 + ux * 0.68,
      y: 0.1 + uy * 0.58,
      sequence: event.sequence,
    });
  }
  return markers;
}

export function presentSakura(snapshot: TreeSnapshot): SakuraPresentation {
  const totalGrowthUnits = totalGrowthUnitsFromEvents(snapshot.events);
  const stage = stageForGrowthUnits(totalGrowthUnits);
  const fill = fillForUnits(totalGrowthUnits, stage);
  const forms = countMemoryForms(snapshot.events);
  const sakura = sakuraKnobsFor(stage, fill, forms);
  const memoryMarkers = memoryMarkersFromEvents(snapshot.events);
  const memoryCount = memoryMarkers.length;

  const earlyFullness =
    stage !== "seed" &&
    (sakura.leafDensity >= 0.55 ||
      sakura.canopyMass >= 0.35 ||
      sakura.blossomDensity > 0.05);

  return {
    stage,
    fill,
    totalGrowthUnits,
    memoryCount,
    sakura,
    memoryMarkers,
    earlyFullness,
    stageLabel: STAGE_LABEL[stage],
  };
}

export function presentationAtSequence(
  snapshot: TreeSnapshot,
  sequence: number,
): SakuraPresentation {
  const events = snapshot.events.filter((event) => event.sequence <= sequence);
  return presentSakura({ ...snapshot, events });
}

/**
 * Classify celebration: small daily steps vs deep insight leaps.
 */
export function morphIntentFromDelta(
  delta: TreeGrowthDelta,
  previousStage: TreeStage,
  nextStage: TreeStage,
): MorphIntent {
  if (previousStage !== nextStage) return "stage-cross";

  const deep = delta.events.some(
    (event) =>
      event.kind === "memory_blossom" ||
      event.kind === "memory_luminous_blossom",
  );
  if (deep) return "hanami";

  return "micro";
}

export function morphIntentForReveal(
  snapshot: TreeSnapshot,
  delta: TreeGrowthDelta,
): MorphIntent {
  const previous = presentationAtSequence(snapshot, delta.previousSequence);
  const next = presentationAtSequence(snapshot, delta.nextSequence);
  return morphIntentFromDelta(delta, previous.stage, next.stage);
}

/** QA helper: blossom must dominate leaves from sapling up. */
export function assertSakuraSpeciesLaw(presentation: SakuraPresentation): boolean {
  const { stage, sakura } = presentation;
  if (stage === "seed" || stage === "sprout") return true;
  return sakura.blossomDensity + 0.02 >= sakura.leafDensity;
}
