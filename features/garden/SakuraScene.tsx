"use client";

import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import type { GardenWeatherKind } from "@/features/reflection";
import type { TreeGrowthDelta, TreeSnapshot } from "@/lib/contracts";
import { GardenErrorBoundary } from "./GardenErrorBoundary";
import { GardenFallback } from "./GardenFallback";
import { GardenWorld } from "./GardenWorld";
import { stageForGarden } from "./art/stage";
import { QUALITY_SETTINGS, useGardenPreferences } from "./useGardenPreferences";
import { useTreeTopology } from "./useTreeTopology";
import type { QualityTier } from "./types";
import "./garden.css";

export interface SakuraSceneProps {
  snapshot: TreeSnapshot;
  quality?: QualityTier;
  motionMode?: "active" | "ambient" | "paused";
  weatherKind?: GardenWeatherKind;
  growthDelta?: TreeGrowthDelta;
  returnBudEntryId?: string;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  onContextLost?: () => void;
  className?: string;
}

function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

export function SakuraScene({
  snapshot,
  quality: requestedQuality,
  motionMode = "active",
  weatherKind = "still",
  growthDelta,
  returnBudEntryId,
  selectedEntryId,
  onSelectEntry,
  onContextLost,
  className,
}: SakuraSceneProps) {
  const [contextLost, setContextLost] = useState(false);
  const preferences = useGardenPreferences(requestedQuality);
  const topology = useTreeTopology(snapshot, preferences.quality);
  const settings = QUALITY_SETTINGS[preferences.quality];
  const stage = stageForGarden(snapshot, topology);
  const memoryCount = snapshot.events.filter((event) => event.entryId).length;
  const stageLabel = stage.replace("-", " ");
  const treeDescription =
    stage === "seed"
      ? "Seed, resting in the earth."
      : `${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} with ${topology.branches.length} ${topology.branches.length === 1 ? "branch" : "branches"} and ${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}.`;

  if (
    contextLost ||
    (typeof window !== "undefined" && !canUseWebGL())
  ) {
    return (
      <GardenFallback
        snapshot={snapshot}
        topology={topology}
        reason="unsupported"
      />
    );
  }

  return (
    <div
      className={["sj-garden-scene", className].filter(Boolean).join(" ")}
      data-quality={preferences.quality}
      data-tree-stage={stage}
      data-reduced-motion={preferences.reducedMotion || undefined}
      role="img"
      aria-label={treeDescription}
    >
      <GardenErrorBoundary
        fallback={
          <GardenFallback
            snapshot={snapshot}
            topology={topology}
            reason="context-lost"
          />
        }
        onError={onContextLost}
      >
        <Canvas
          frameloop={
            motionMode === "active" && !preferences.reducedMotion
              ? "always"
              : "demand"
          }
          dpr={[1, settings.dpr]}
          camera={{ position: [0, 0, 9.4], fov: 32, near: 0.05, far: 60 }}
          gl={{
            alpha: true,
            antialias: preferences.quality !== "low",
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              "webglcontextlost",
              (event) => {
                event.preventDefault();
                setContextLost(true);
                onContextLost?.();
              },
              { once: true },
            );
          }}
        >
          <GardenWorld
            snapshot={snapshot}
            topology={topology}
            motionMode={motionMode}
            weatherKind={weatherKind}
            growthDelta={growthDelta}
            returnBudEntryId={returnBudEntryId}
            quality={preferences.quality}
            foliageLimit={settings.foliageLimit}
            petalCount={settings.petalCount}
            reducedMotion={preferences.reducedMotion}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
            onSustainedSlowFrameRate={preferences.reduceQuality}
          />
        </Canvas>
      </GardenErrorBoundary>
    </div>
  );
}
