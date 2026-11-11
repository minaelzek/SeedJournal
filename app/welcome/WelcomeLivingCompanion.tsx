"use client";

import { useCallback, useEffect, useState } from "react";

import { canUseWebGL, resolveLivingGardenTier } from "@/features/garden/canUseWebGL";
import { GardenErrorBoundary } from "@/features/garden/GardenErrorBoundary";
import { LivingSakuraScene } from "@/features/garden/living-sakura/LivingSakuraScene";
import { ensurePendingTreeSeed } from "@/features/garden/pendingTreeSeed";

/**
 * Welcome-stage living sakura — same body language as product home.
 * First-open seed (0 journals): cherished cherry stone, not a mid-life preview.
 * Non-interactive; demotes living → soft void on failure. No illustrated tree.
 *
 * Hydration-safe: server + first client paint render a stable shell only;
 * WebGL mounts after mount so canUseWebGL never mismatches SSR.
 */
const WELCOME_JOURNAL_COUNT = 0;

function WelcomeGardenVoid({ reason }: { reason: "pending" | "seed" }) {
  return (
    <div
      className="sj-welcome__garden-fallback"
      aria-hidden="true"
      data-welcome-garden={reason}
    />
  );
}

export function WelcomeLivingCompanion() {
  const [mounted, setMounted] = useState(false);
  const [rootSeed, setRootSeed] = useState<string>();
  const [livingFailed, setLivingFailed] = useState(false);

  useEffect(() => {
    setRootSeed(ensurePendingTreeSeed());
    setMounted(true);
  }, []);

  const onLivingError = useCallback(() => {
    setLivingFailed(true);
  }, []);

  const onContextLost = useCallback(() => {
    setLivingFailed(true);
  }, []);

  // Stable SSR shell — no window / WebGL branching until after hydrate.
  if (!mounted || !rootSeed) {
    return <WelcomeGardenVoid reason="pending" />;
  }

  const webglAvailable = canUseWebGL();
  const tier = resolveLivingGardenTier({
    preferLiving: true,
    webglAvailable,
    livingFailed,
  });

  if (tier === "seed") {
    return <WelcomeGardenVoid reason="seed" />;
  }

  return (
    <div
      className="sj-welcome__garden-mount"
      aria-hidden="true"
      data-welcome-garden="living"
      data-living-product-garden
    >
      <GardenErrorBoundary
        fallback={<WelcomeGardenVoid reason="seed" />}
        onError={onLivingError}
      >
        <LivingSakuraScene
          journalCount={WELCOME_JOURNAL_COUNT}
          newestGrowthUnits={2}
          rootSeed={rootSeed}
          interactive={false}
          onContextLost={onContextLost}
        />
      </GardenErrorBoundary>
    </div>
  );
}
