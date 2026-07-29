"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import type { TreeSnapshot } from "@/lib/contracts";
import type { QualityTier } from "@/features/garden/types";
import "./shell.css";

const SakuraScene = dynamic(
  () =>
    import("@/features/garden/SakuraScene").then((module) => module.SakuraScene),
  { ssr: false },
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
  return (
    <div
      className={["sj-app-frame", className].filter(Boolean).join(" ")}
      data-garden-mode={gardenMode}
    >
      <a className="sj-skip-link" href="#main-content">
        Skip to main content
      </a>
      {snapshot ? (
        <div className="sj-app-frame__garden" aria-hidden={gardenMode === "paused"}>
          <SakuraScene
            snapshot={snapshot}
            quality={quality}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
          />
        </div>
      ) : null}
      <div className="sj-app-frame__content">{children}</div>
    </div>
  );
}
