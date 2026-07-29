"use client";

import { useEffect, useState } from "react";
import type { QualityTier } from "./types";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
  };
}

export interface GardenPreferences {
  quality: QualityTier;
  reducedMotion: boolean;
  reduceQuality: () => void;
}

function initialQuality(reducedMotion: boolean): QualityTier {
  if (typeof navigator === "undefined") return "balanced";
  const hints = navigator as NavigatorWithHints;
  if (
    reducedMotion ||
    hints.connection?.saveData ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 4)
  ) {
    return "low";
  }
  return "balanced";
}

export function useGardenPreferences(
  requestedQuality?: QualityTier,
): GardenPreferences {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<QualityTier>(
    requestedQuality ?? "balanced",
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      if (!requestedQuality) setQuality(initialQuality(query.matches));
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [requestedQuality]);

  return {
    quality,
    reducedMotion,
    reduceQuality: () =>
      setQuality((current) =>
        current === "high" ? "balanced" : current === "balanced" ? "low" : "low",
      ),
  };
}

export const QUALITY_SETTINGS: Record<
  QualityTier,
  { dpr: number; foliageLimit: number; petalCount: number }
> = {
  high: { dpr: 1.5, foliageLimit: 8000, petalCount: 1200 },
  balanced: { dpr: 1.25, foliageLimit: 4000, petalCount: 500 },
  low: { dpr: 1, foliageLimit: 1800, petalCount: 120 },
};

