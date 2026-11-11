"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { describeTreeStage } from "@/features/growth";
import type { GardenWeather } from "@/features/reflection";
import type { TreeGrowthDelta, TreeSnapshot, TreeStage } from "@/lib/contracts";
import type { QualityTier } from "@/features/garden/types";
import "./shell.css";

/** Legacy WebGL experiment retained for comparison and rollback diagnostics. */
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

const Img2ThreeSakuraScene = dynamic(
  () =>
    import("@/features/garden/img2threejs/Img2ThreeSakuraScene").then(
      (module) => module.Img2ThreeSakuraScene,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="sj-garden-chunk-fallback" aria-hidden="true">
        <span />
      </div>
    ),
  },
);

/** Living product garden with WebGL → seed-mark demotion. */
const LivingProductGarden = dynamic(
  () =>
    import("@/features/garden/living-sakura/LivingProductGarden").then(
      (module) => module.LivingProductGarden,
    ),
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
export type GardenRenderer = "living" | "webgl" | "img2threejs";

export interface AppFrameProps {
  children: ReactNode;
  snapshot?: TreeSnapshot;
  gardenMode?: GardenMode;
  /** Garden renderer. Defaults to the interactive Living Sakura v2 tree. */
  gardenRenderer?: GardenRenderer;
  weather?: GardenWeather;
  tendedToday?: boolean;
  returnBudEntryId?: string;
  growthDelta?: TreeGrowthDelta;
  quality?: QualityTier;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  /**
   * Growth-reveal on the home garden body — same Canvas, never a second WebGL tree.
   */
  revealMode?: boolean;
  newestGrowthUnits?: 1 | 2 | 4 | 6;
  reducedMotion?: boolean;
  onCeremonyComplete?: () => void;
  /** Lift the crown while the journal card covers the lower frame. */
  aboveCard?: boolean;
  className?: string;
}

/**
 * Same cutoffs as livingMaturityForOrdinal. TreeStage has no enduring phase,
 * so journals past mature stay "mature".
 */
function stageForCompletedJournals(count: number): TreeStage {
  const journals = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (journals === 0) return "seed";
  if (journals < 12) return "sprout";
  if (journals < 48) return "sapling";
  if (journals < 96) return "young-tree";
  if (journals < 192) return "established";
  return "mature";
}

function completedJournalCount(snapshot: TreeSnapshot): number {
  return snapshot.events.filter((event) => event.kind.startsWith("memory_"))
    .length;
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
  gardenRenderer = "living",
  weather,
  tendedToday = false,
  returnBudEntryId,
  growthDelta,
  quality,
  selectedEntryId,
  onSelectEntry,
  revealMode = false,
  newestGrowthUnits,
  reducedMotion: reducedMotionProp,
  onCeremonyComplete,
  aboveCard = false,
  className,
}: AppFrameProps) {
  const journalCount = snapshot ? completedJournalCount(snapshot) : 0;
  const treeStage = stageForCompletedJournals(journalCount);
  const memoryCount =
    snapshot?.events.filter(
      (event) => event.entryId && event.kind.startsWith("memory_"),
    ).length ?? 0;
  const branchCount =
    snapshot?.events.filter(
      (event) => event.kind === "twig" || event.kind === "branch",
    ).length ?? 0;
  const reducedMotion =
    reducedMotionProp ??
    (gardenMode === "paused" ? true : prefersReducedMotion());
  const hasInteractiveGarden = Boolean(
    snapshot && onSelectEntry && memoryCount > 0 && !revealMode && gardenMode === "active",
  );
  // Unmount WebGL when paused (archive/settings) to free GPU.
  const mountGarden = Boolean(snapshot) && gardenMode !== "paused";

  return (
    <div
      className={["sj-app-frame", className].filter(Boolean).join(" ")}
      data-garden-mode={gardenMode}
      data-garden-renderer={gardenRenderer}
      data-weather={weather?.kind ?? "still"}
      data-tended-today={tendedToday || undefined}
      data-return-bud={returnBudEntryId ? true : undefined}
      data-reveal-mode={revealMode || undefined}
    >
      <a className="sj-skip-link" href="#main-content">
        Skip to main content
      </a>
      {mountGarden && snapshot ? (
        <div
          className="sj-app-frame__garden"
          data-tree-stage={treeStage}
          role={hasInteractiveGarden ? "group" : undefined}
          aria-label={
            hasInteractiveGarden
              ? "Living Sakura garden. Tap a glowing memory petal to open its journal entry."
              : revealMode
                ? "Your sakura is growing."
                : undefined
          }
          aria-hidden={hasInteractiveGarden || revealMode ? undefined : "true"}
        >
          {gardenRenderer === "living" ? (
            <LivingProductGarden
              snapshot={snapshot}
              selectedEntryId={selectedEntryId}
              onSelectEntry={revealMode ? undefined : onSelectEntry}
              interactive={gardenMode === "active" && !revealMode}
              revealMode={revealMode}
              reducedMotion={reducedMotion}
              newestGrowthUnits={newestGrowthUnits}
              onCeremonyComplete={onCeremonyComplete}
              weatherKind={weather?.kind}
              aboveCard={aboveCard}
            />
          ) : gardenRenderer === "webgl" ? (
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
            <Img2ThreeSakuraScene
              snapshot={snapshot}
              quality={quality}
              motionMode={gardenMode}
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
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {describeTreeStage(treeStage, {
            memoryCount,
            branchCount,
          })}
        </p>
      ) : null}
      {hasInteractiveGarden ? (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedEntryId
            ? "Memory petal selected. Opening its journal in the memory viewer."
            : ""}
        </p>
      ) : null}
      <div className="sj-app-frame__content">{children}</div>
    </div>
  );
}
