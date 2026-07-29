"use client";

import { Canvas } from "@react-three/fiber";
import type { TreeSnapshot } from "@/lib/contracts";
import { GardenErrorBoundary } from "./GardenErrorBoundary";
import { GardenFallback } from "./GardenFallback";
import { GardenWorld } from "./GardenWorld";
import { QUALITY_SETTINGS, useGardenPreferences } from "./useGardenPreferences";
import { useTreeTopology } from "./useTreeTopology";
import type { QualityTier } from "./types";
import "./garden.css";

export interface SakuraSceneProps {
  snapshot: TreeSnapshot;
  quality?: QualityTier;
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
  selectedEntryId,
  onSelectEntry,
  onContextLost,
  className,
}: SakuraSceneProps) {
  const preferences = useGardenPreferences(requestedQuality);
  const topology = useTreeTopology(snapshot);
  const settings = QUALITY_SETTINGS[preferences.quality];

  if (typeof window !== "undefined" && !canUseWebGL()) {
    return <GardenFallback snapshot={snapshot} reason="unsupported" />;
  }

  return (
    <div
      className={["sj-garden-scene", className].filter(Boolean).join(" ")}
      data-quality={preferences.quality}
      data-reduced-motion={preferences.reducedMotion || undefined}
    >
      <GardenErrorBoundary
        fallback={<GardenFallback snapshot={snapshot} reason="context-lost" />}
        onError={onContextLost}
      >
        <Canvas
          dpr={[1, settings.dpr]}
          camera={{ position: [0, 0.25, 9.4], fov: 46, near: 0.1, far: 40 }}
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
                onContextLost?.();
              },
              { once: true },
            );
          }}
        >
          <GardenWorld
            snapshot={snapshot}
            topology={topology}
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

