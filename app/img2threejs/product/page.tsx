"use client";

import { useMemo, useState } from "react";
import { Img2ThreeSakuraScene } from "@/features/garden/img2threejs/Img2ThreeSakuraScene";
import type { TreeGrowthEvent, TreeSnapshot } from "@/lib/contracts";

function previewEvents(targetUnits: number): TreeGrowthEvent[] {
  const events: TreeGrowthEvent[] = [];
  let total = 0;
  let sequence = 0;
  while (total < targetUnits) {
    const remaining = targetUnits - total;
    const units: 1 | 2 | 4 | 6 =
      remaining >= 6 ? 6 : remaining >= 4 ? 4 : remaining >= 2 ? 2 : 1;
    total += units;
    sequence += 1;
    events.push({
      id: `product-preview-event-${sequence}`,
      sequence,
      entryId: `product-preview-entry-${sequence}`,
      occurredAt: sequence,
      localDate: "2026-08-04",
      kind:
        units === 6
          ? "memory_luminous_blossom"
          : units === 4
            ? "memory_blossom"
            : units === 2
              ? "memory_bud"
              : "memory_leaf",
      growthUnits: units,
      seed: 91_337 + sequence * 2_971,
    });
  }
  return events;
}

export default function Img2ThreeProductPreview() {
  const snapshot = useMemo<TreeSnapshot>(
    () => ({
      treeId: "img2threejs-product-preview",
      rootSeed: "img2threejs-product-preview",
      algorithmVersion: 2,
      totalEntries: 32,
      distinctJournalDays: 32,
      events: previewEvents(192),
    }),
    [],
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  return (
    <main className="relative h-svh min-h-[36rem] overflow-hidden bg-[#f3ebe3]">
      <Img2ThreeSakuraScene
        snapshot={snapshot}
        quality="balanced"
        motionMode="paused"
        selectedEntryId={selectedEntryId}
        onSelectEntry={setSelectedEntryId}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5 sm:p-8">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-[#846d67]">
            Seed Journal / integrated renderer
          </p>
          <h1 className="mt-2 font-serif text-2xl text-[#4d403b] sm:text-3xl">
            Growth-constrained sakura
          </h1>
        </div>
        <span className="rounded-full border border-[#b8898c]/40 bg-[#fffaf4]/75 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[#875d64] backdrop-blur-sm">
          192 unit cap
        </span>
      </div>
      <p
        className="pointer-events-none absolute inset-x-0 bottom-6 z-20 mx-auto w-fit rounded-full border border-[#b8898c]/30 bg-[#fffaf4]/80 px-4 py-2 text-sm text-[#685650] backdrop-blur-sm"
        role="status"
      >
        {selectedEntryId
          ? `Selected ${selectedEntryId.replace("product-preview-entry-", "memory ")}`
          : "Choose a glowing blossom to revisit a memory"}
      </p>
    </main>
  );
}
