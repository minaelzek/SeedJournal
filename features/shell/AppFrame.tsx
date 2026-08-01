"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { describeTreeStage, stageForGrowthUnits } from "@/features/growth";
import type { GardenWeather } from "@/features/reflection";
import type { TreeGrowthDelta, TreeSnapshot } from "@/lib/contracts";
import type { QualityTier } from "@/features/garden/types";
import { IllustratedSakura } from "@/features/garden/illustration";
import "./shell.css";

/**
 * Optional legacy WebGL path — not the product default.
 * Enable with gardenRenderer="webgl" for experiments only.
 */
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
export type GardenRenderer = "illustration" | "webgl";

export interface AppFrameProps {
  children: ReactNode;
  snapshot?: TreeSnapshot;
  gardenMode?: GardenMode;
  /** Default illustration-first sakura hero (Duolingo × Apple bar). */
  gardenRenderer?: GardenRenderer;
  weather?: GardenWeather;
  tendedToday?: boolean;
  returnBudEntryId?: string;
  growthDelta?: TreeGrowthDelta;
  quality?: QualityTier;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  className?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AppFrame({
  children,
  snapshot,
  gardenMode = "active",
  gardenRenderer = "illustration",
  weather,
  tendedToday = false,
  returnBudEntryId,
  growthDelta,
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
  const reducedMotion =
    gardenMode === "paused" ? true : prefersReducedMotion();

  return (
    <div
      className={["sj-app-frame", className].filter(Boolean).join(" ")}
      data-garden-mode={gardenMode}
      data-garden-renderer={gardenRenderer}
      data-weather={weather?.kind ?? "still"}
      data-tended-today={tendedToday || undefined}
      data-return-bud={returnBudEntryId ? true : undefined}
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
          {gardenRenderer === "webgl" ? (
            <SakuraScene
              snapshot={snapshot}
              quality={quality}
              motionMode={gardenMode}
              weatherKind={weather?.kind}
              growthDelta={growthDelta}
              returnBudEntryId={returnBudEntryId}
              selectedEntryId={selectedEntryId}
              onSelectEntry={onSelectEntry}
            />
          ) : (
            <IllustratedSakura
              snapshot={snapshot}
              growthDelta={growthDelta}
              weatherKind={weather?.kind}
              reducedMotion={reducedMotion}
              selectedEntryId={selectedEntryId}
              onSelectEntry={onSelectEntry}
            />
          )}
        </div>
      ) : null}
      {snapshot ? (
        <div className="sj-app-frame__weather" aria-hidden="true">
          <span />
          <span />
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
