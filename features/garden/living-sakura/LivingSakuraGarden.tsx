"use client";

import { useMemo } from "react";

import type { LivingMemoryInput, PrivateGrowthUnits } from "@/features/growth/livingDevelopment";
import type { GardenWeatherKind } from "@/features/reflection";
import type { TreeSnapshot } from "@/lib/contracts";
import { LivingSakuraScene } from "./LivingSakuraScene";
import styles from "./LivingSakuraScene.module.css";

export interface LivingSakuraGardenProps {
  snapshot: TreeSnapshot;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  interactive?: boolean;
  className?: string;
  /**
   * Growth-reveal ceremony: same living body as the home garden, non-interactive,
   * 4.2s equal-duration schedule (or short dissolve under reduced motion).
   */
  revealMode?: boolean;
  reducedMotion?: boolean;
  /** Override newest private growth units from the committed delta. */
  newestGrowthUnits?: PrivateGrowthUnits;
  onCeremonyComplete?: () => void;
  /** Runtime WebGL context loss — product demotes living → seed mark. */
  onContextLost?: () => void;
  weatherKind?: GardenWeatherKind;
  aboveCard?: boolean;
}

export function asPrivateGrowthUnits(value: number): PrivateGrowthUnits {
  if (value >= 6) return 6;
  if (value >= 4) return 4;
  if (value >= 2) return 2;
  return 1;
}

/** Maps product tree events into living-sakura memory inputs. */
export function memoriesFromSnapshot(
  snapshot: TreeSnapshot,
): LivingMemoryInput[] {
  const memoryEvents = snapshot.events
    .filter(
      (event) =>
        Boolean(event.entryId) && event.kind.startsWith("memory_"),
    )
    .sort((left, right) => left.occurredAt - right.occurredAt);

  // Revisit adjacency: prefer explicit parentEntryId on events when present.
  const entryIds = new Set(
    memoryEvents.map((event) => event.entryId).filter(Boolean) as string[],
  );

  return memoryEvents.map((event, index) => {
    const parentFromEvent =
      "parentEntryId" in event &&
      typeof (event as { parentEntryId?: string | null }).parentEntryId ===
        "string"
        ? (event as { parentEntryId: string }).parentEntryId
        : null;
    const parentEntryId =
      parentFromEvent && entryIds.has(parentFromEvent)
        ? parentFromEvent
        : undefined;

    return {
      entryId: event.entryId as string,
      ordinal: index + 1,
      privateGrowthUnits: asPrivateGrowthUnits(event.growthUnits || 1),
      seed: event.seed,
      ...(parentEntryId ? { parentEntryId } : {}),
    };
  });
}

/**
 * Product garden surface for the Living Sakura v2 tree.
 * Fills the AppFrame garden slot and reuses the interactive 3D scene.
 * Also hosts the post-journal growth reveal (revealMode).
 */
export function LivingSakuraGarden({
  snapshot,
  selectedEntryId,
  onSelectEntry,
  interactive = true,
  className,
  revealMode = false,
  reducedMotion,
  newestGrowthUnits: newestGrowthUnitsProp,
  onCeremonyComplete,
  onContextLost,
  weatherKind,
  aboveCard = false,
}: LivingSakuraGardenProps) {
  const memories = useMemo(() => memoriesFromSnapshot(snapshot), [snapshot]);
  const journalCount = memories.length;
  const newestGrowthUnits =
    newestGrowthUnitsProp ?? memories.at(-1)?.privateGrowthUnits ?? 1;
  const allowInteraction = interactive && !revealMode;

  return (
    <div
      className={[
        revealMode ? styles.revealGarden : styles.productGarden,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-living-sakura-garden
      data-reveal-mode={revealMode || undefined}
      aria-hidden={allowInteraction ? undefined : true}
    >
      <LivingSakuraScene
        journalCount={journalCount}
        newestGrowthUnits={newestGrowthUnits}
        memories={memories}
        selectedEntryId={selectedEntryId}
        onSelectMemory={allowInteraction ? onSelectEntry : undefined}
        interactive={allowInteraction}
        revealMode={revealMode}
        reducedMotion={reducedMotion}
        onCeremonyComplete={onCeremonyComplete}
        onContextLost={onContextLost}
        weatherKind={weatherKind}
        aboveCard={aboveCard}
        rootSeed={snapshot.rootSeed || `seed-journal:${snapshot.algorithmVersion}`}
      />
    </div>
  );
}
