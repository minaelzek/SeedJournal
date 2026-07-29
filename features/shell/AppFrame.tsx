"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { describeTreeStage, stageForGrowthUnits } from "@/features/growth";
import type { TreeSnapshot } from "@/lib/contracts";
import type { QualityTier } from "@/features/garden/types";
import "./shell.css";

const SakuraScene = dynamic(
  () =>
    import("@/features/garden/SakuraScene").then((module) => module.SakuraScene),
  {
    ssr: false,
    loading: () => (
      <div className="sj-garden-chunk-fallback" aria-hidden="true">
        <span />
      </div>
    ),
  },
);

export type GardenMode = "active" | "ambient" | "paused";

export interface AppFrameProps {
  children: ReactNode;
  snapshot?: TreeSnapshot;
  gardenMode?: GardenMode;
  quality?: QualityTier;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  className?: string;
}

export function AppFrame({
  children,
  snapshot,
  gardenMode = "active",
  quality,
  selectedEntryId,
  onSelectEntry,
  className,
}: AppFrameProps) {
  const totalGrowthUnits =
    snapshot?.events.reduce((total, event) => total + event.growthUnits, 0) ?? 0;
  const memoryCount =
    snapshot?.events.filter(
      (event) => event.entryId && event.kind.startsWith("memory_"),
    ).length ?? 0;
  const branchCount =
    snapshot?.events.filter(
      (event) => event.kind === "twig" || event.kind === "branch",
    ).length ?? 0;

  return (
    <div
      className={["sj-app-frame", className].filter(Boolean).join(" ")}
      data-garden-mode={gardenMode}
    >
      <a className="sj-skip-link" href="#main-content">
        Skip to main content
      </a>
      {snapshot ? (
        <div
          className="sj-app-frame__garden"
          data-tree-stage={stageForGrowthUnits(totalGrowthUnits)}
          aria-hidden="true"
        >
          <SakuraScene
            snapshot={snapshot}
            quality={quality}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
          />
        </div>
      ) : null}
      {snapshot ? (
        <p className="sr-only" aria-live="polite">
          {describeTreeStage(stageForGrowthUnits(totalGrowthUnits), {
            memoryCount,
            branchCount,
          })}
        </p>
      ) : null}
      <div className="sj-app-frame__content">{children}</div>
    </div>
  );
}
