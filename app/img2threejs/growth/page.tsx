"use client";

import type { TreeGrowthEvent, TreeSnapshot } from "@/lib/contracts";
import { SakuraScene } from "@/features/garden/SakuraScene";

function previewEvents(targetUnits: number): TreeGrowthEvent[] {
  const events: TreeGrowthEvent[] = [];
  let sequence = 0;
  let totalUnits = 0;
  let twigCount = 0;

  const add = (
    kind: TreeGrowthEvent["kind"],
    growthUnits: TreeGrowthEvent["growthUnits"],
    memory: boolean,
  ) => {
    sequence += 1;
    events.push({
      id: `img2threejs-growth-${targetUnits}-${sequence}`,
      sequence,
      entryId: memory ? `preview-entry-${sequence}` : null,
      occurredAt: 1_770_000_000_000 + sequence,
      localDate: "2026-08-04",
      kind,
      growthUnits,
      seed: 17_171 + sequence * 7_919,
    });
  };

  while (totalUnits < targetUnits) {
    const remaining = targetUnits - totalUnits;
    const units: 1 | 2 | 4 | 6 =
      remaining >= 6 ? 6 : remaining >= 4 ? 4 : remaining >= 2 ? 2 : 1;
    const previousMilestone = Math.floor(totalUnits / 12);
    totalUnits += units;
    const nextMilestone = Math.floor(totalUnits / 12);

    add("leaf", 0, false);
    add(
      units === 6
        ? "memory_luminous_blossom"
        : units === 4
          ? "memory_blossom"
          : units === 2
            ? "memory_bud"
            : "memory_leaf",
      units,
      true,
    );

    for (
      let milestone = previousMilestone;
      milestone < nextMilestone;
      milestone += 1
    ) {
      twigCount += 1;
      add("twig", 0, false);
      if (twigCount % 4 === 0) add("branch", 0, false);
    }
  }

  return events;
}

const MATURE_SNAPSHOT: TreeSnapshot = {
  treeId: "img2threejs-growth-audit",
  rootSeed: "img2threejs-sakura-reference",
  algorithmVersion: 2,
  totalEntries: 32,
  distinctJournalDays: 32,
  events: previewEvents(192),
};

export default function GrowthSakuraAuditPage() {
  return (
    <main className="h-svh min-h-[36rem] overflow-hidden bg-[#f3ebe3]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-8">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-[#846d67]">
            Seed Journal / existing growth engine
          </p>
          <h1 className="mt-2 font-serif text-2xl text-[#4d403b] sm:text-3xl">
            Mature topology audit
          </h1>
        </div>
        <span className="rounded-full border border-[#b8898c]/40 bg-[#fffaf4]/75 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[#875d64] backdrop-blur-sm">
          192 units
        </span>
      </div>
      <SakuraScene
        snapshot={MATURE_SNAPSHOT}
        quality="balanced"
        motionMode="paused"
        weatherKind="still"
        className="h-full w-full"
      />
    </main>
  );
}
