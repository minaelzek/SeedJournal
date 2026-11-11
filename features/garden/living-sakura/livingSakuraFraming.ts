/**
 * Product home camera framing for the living sakura.
 * Keeps the companion above the bottom dock and fills mid-stage as it grows.
 */

export interface ProductTreeFraming {
  /** World-space look-at height (tree mid-crown). */
  focusY: number;
  /** Default camera distance along +Z from origin. */
  distance: number;
  /** Camera height. */
  cameraY: number;
  /** Vertical FOV degrees. */
  fov: number;
  /** Optional root lift so small trees sit above the dock ground line. */
  rootLiftY: number;
}

/** Warm courtyard air — matches living stage cream, not a greyer canvas void. */
export const COURTYARD_AIR_COLOR = "#f2e8dc";

export interface ProductCourtyardAtmosphere {
  color: string;
  fogNear: number;
  fogFar: number;
}

/**
 * Fog must start *behind* the companion. A near of 11 with the youth camera
 * at ~11.2 dissolved the seed/sprout into cream.
 */
export function productCourtyardAtmosphere(
  journalCount: number,
): ProductCourtyardAtmosphere {
  const count = Math.max(0, Math.floor(journalCount));
  if (count <= 0) {
    return { color: COURTYARD_AIR_COLOR, fogNear: 12, fogFar: 36 };
  }
  if (count < 12) {
    return { color: COURTYARD_AIR_COLOR, fogNear: 18, fogFar: 42 };
  }
  if (count < 96) {
    return { color: COURTYARD_AIR_COLOR, fogNear: 20, fogFar: 46 };
  }
  return { color: COURTYARD_AIR_COLOR, fogNear: 22, fogFar: 50 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Mirrors the model’s stageScale bands so framing tracks densify (shipped scale).
 */
export function productStageScale(journalCount: number): number {
  const count = Math.max(0, Math.floor(journalCount));
  if (count <= 0) return 0.28;
  if (count < 3) return 0.42 + (count / 3) * 0.1;
  if (count < 12) return 0.52 + ((count - 3) / 9) * 0.14;
  if (count < 48) return 0.66 + ((count - 12) / 36) * 0.16;
  if (count < 96) return 0.82 + ((count - 48) / 48) * 0.1;
  if (count < 192) return 0.92 + ((count - 96) / 96) * 0.08;
  return 1;
}

/**
 * Home-stage framing: early companions are closer and slightly lifted so they
 * never read as under the write CTA; mature trees pull back for full crown.
 */
function frameProductTree(
  journalCount: number,
  narrow: boolean,
): ProductTreeFraming {
  const count = Math.max(0, Math.floor(journalCount));

  if (count === 0) {
    // Cherished stone sits in the soil nest — close and low, not lifted out.
    return {
      focusY: narrow ? 0.18 : 0.22,
      distance: narrow ? 4.85 : 4.2,
      cameraY: narrow ? 1.55 : 1.38,
      fov: narrow ? 32 : 28,
      rootLiftY: 0,
    };
  }

  if (count < 12) {
    // Tender sprout owns the slot — not a postage stamp on a courtyard.
    const t = (count - 1) / 11;
    return {
      focusY: 0.55 + t * 0.22,
      distance: (narrow ? 3.25 : 2.85) + t * 0.55,
      cameraY: 1.12 + t * 0.2,
      fov: narrow ? 28 : 25,
      rootLiftY: 0.16,
    };
  }

  if (count < 48) {
    // Sapling — close enough that laterals and the first tuft fill the stage.
    const t = (count - 12) / 36;
    return {
      focusY: 0.78 + t * 0.48,
      distance: (narrow ? 5.15 : 4.55) + t * 1.05,
      cameraY: 1.58 + t * 0.28,
      fov: narrow ? 32 : 29,
      rootLiftY: 0.06 * (1 - t),
    };
  }

  if (count < 96) {
    const t = (count - 48) / 48;
    return {
      focusY: 1.42 + t * 0.28,
      distance: (narrow ? 6.85 : 6.15) + t * 0.85,
      cameraY: 1.88 + t * 0.22,
      fov: narrow ? 33 : 30.5,
      rootLiftY: 0.03 * (1 - t),
    };
  }

  // Established → mature: fill the stage with the vase, not a postage stamp.
  const matureT = clamp((count - 96) / 96, 0, 1);
  return {
    focusY: 1.72 + matureT * 0.22,
    distance: (narrow ? 7.85 : 7.15) + matureT * 0.7,
    cameraY: 2.12 + matureT * 0.2,
    fov: narrow ? 33 : 30.5,
    rootLiftY: 0,
  };
}

/**
 * Growth reveal looks at the newest shoot, not the trunk in the dirt.
 * The join sits on the midline so the stem and opening flower occupy the upper half.
 */
export function revealShootFraming(
  journalCount: number,
  narrow: boolean,
): ProductTreeFraming {
  const count = Math.max(1, Math.floor(journalCount));
  let tip = 0.95;
  if (count < 12) {
    const bole = 0.78 + ((count - 1) / 10) * 0.44;
    tip = bole * 0.72 + 0.38;
  } else if (count < 48) {
    tip = 1.35 + ((count - 12) / 36) * 0.7;
  } else if (count < 96) {
    tip = 2.05 + ((count - 48) / 48) * 0.45;
  } else {
    tip = 2.55 + Math.min(0.45, (count - 96) / 400);
  }
  const join = count < 12 ? Math.max(0.02, tip * 0.08) : tip * 0.55;
  const fov = narrow ? 30 : 26;
  const half = Math.tan((fov * Math.PI) / 360);
  const span = Math.max(0.55, tip - join);
  const distance = Math.min(
    narrow ? 9.5 : 8.6,
    Math.max(narrow ? 3.6 : 3.15, (span * 1.28) / half),
  );
  return {
    focusY: join,
    distance,
    cameraY: join + Math.min(0.9, span * 0.62),
    fov,
    rootLiftY: 0,
  };
}

/**
 * Home-stage framing. `aboveCard` parks the stone or shoot in the clear
 * band above the journal card (~40dvh). It does not change the tree.
 */
export function productTreeFraming(
  journalCount: number,
  options: { narrow?: boolean; aboveCard?: boolean } = {},
): ProductTreeFraming {
  const narrow = options.narrow === true;
  const framing = frameProductTree(journalCount, narrow);
  if (!options.aboveCard) return framing;
  const count = Math.max(0, Math.floor(journalCount));
  const distance = Math.max(1.15, framing.distance * (narrow ? 0.95 : 0.93));
  const halfH = distance * Math.tan(((framing.fov * Math.PI) / 180) / 2);
  if (count <= 0) {
    // Stone center near 70% of the frame — above the card, still in the nest.
    const ndc = (0.7 - 0.5) * 2;
    return {
      ...framing,
      focusY: 0.14 - ndc * halfH,
      distance,
      cameraY: framing.cameraY + 0.06,
    };
  }
  if (count < 12) {
    const ndc = (0.66 - 0.5) * 2;
    return {
      ...framing,
      focusY: framing.focusY - ndc * halfH,
      distance,
      cameraY: framing.cameraY + 0.04,
    };
  }
  return {
    ...framing,
    focusY: framing.focusY - (narrow ? 0.1 : 0.2),
    distance,
    cameraY: framing.cameraY + (narrow ? 0.02 : 0.04),
  };
}
