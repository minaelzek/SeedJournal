"use client";

import { useCallback, useState } from "react";
import type { TreeSnapshot } from "@/lib/contracts";
import type { PrivateGrowthUnits } from "@/features/growth/livingDevelopment";
import type { GardenWeatherKind } from "@/features/reflection";
import { GardenErrorBoundary } from "@/features/garden/GardenErrorBoundary";
import { GardenFallback } from "@/features/garden/GardenFallback";
import {
  canUseWebGL,
  resolveLivingGardenTier,
} from "@/features/garden/canUseWebGL";
import { LivingSakuraGarden } from "./LivingSakuraGarden";

export interface LivingProductGardenProps {
  snapshot: TreeSnapshot;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  interactive?: boolean;
  revealMode?: boolean;
  reducedMotion?: boolean;
  newestGrowthUnits?: PrivateGrowthUnits;
  onCeremonyComplete?: () => void;
  className?: string;
  /** Test injection: force webgl probe result. */
  webglAvailable?: boolean;
  weatherKind?: GardenWeatherKind;
  aboveCard?: boolean;
}

/**
 * Product mount for Living Sakura.
 * Demotes living WebGL → GardenFallback seed mark. No illustrated 2D tree.
 * Never leaves the home garden slot blank.
 */
export function LivingProductGarden({
  snapshot,
  selectedEntryId,
  onSelectEntry,
  interactive = true,
  revealMode = false,
  reducedMotion,
  newestGrowthUnits,
  onCeremonyComplete,
  className,
  webglAvailable: webglOverride,
  weatherKind,
  aboveCard = false,
}: LivingProductGardenProps) {
  const [livingFailed, setLivingFailed] = useState(false);

  const webglAvailable =
    typeof webglOverride === "boolean" ? webglOverride : canUseWebGL();

  const tier = resolveLivingGardenTier({
    preferLiving: true,
    webglAvailable,
    livingFailed,
  });

  const onLivingError = useCallback(() => {
    setLivingFailed(true);
  }, []);

  /** Runtime context loss (non-React) — same demotion as React error boundary. */
  const onLivingContextLost = useCallback(() => {
    setLivingFailed(true);
  }, []);

  if (tier === "seed") {
    return (
      <GardenFallback
        snapshot={snapshot}
        reason={livingFailed ? "context-lost" : "unsupported"}
      />
    );
  }

  return (
    <div data-living-product-garden data-demotion-tier="living">
      <GardenErrorBoundary
        fallback={
          <GardenFallback snapshot={snapshot} reason="context-lost" />
        }
        onError={onLivingError}
      >
        <LivingSakuraGarden
          snapshot={snapshot}
          selectedEntryId={selectedEntryId}
          onSelectEntry={onSelectEntry}
          interactive={interactive}
          revealMode={revealMode}
          reducedMotion={reducedMotion}
          weatherKind={weatherKind}
          aboveCard={aboveCard && !revealMode}
          newestGrowthUnits={newestGrowthUnits}
          onCeremonyComplete={onCeremonyComplete}
          onContextLost={onLivingContextLost}
          className={className}
        />
      </GardenErrorBoundary>
    </div>
  );
}
