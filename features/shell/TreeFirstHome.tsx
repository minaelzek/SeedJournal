"use client";

import { useState } from "react";
import { ArrowRightIcon, PenNibIcon } from "@phosphor-icons/react";
import type { TreeSnapshot } from "@/lib/contracts";
import {
  MemoryNavigator,
  type GardenMemoryRecord,
} from "@/features/garden/MemoryNavigator";
import { AppFrame } from "./AppFrame";
import { SeedJournalHeader } from "./SeedJournalHeader";
import "./shell.css";

export interface TreeFirstHomeProps {
  snapshot: TreeSnapshot;
  memories: GardenMemoryRecord[];
  onBeginJournal: () => void;
  onOpenArchive?: () => void;
  onOpenSettings?: () => void;
  onLock?: () => void;
  onReadEntry?: (entryId: string) => void;
  onRevisitEntry?: (entryId: string) => void;
  greeting?: string;
}

export function TreeFirstHome({
  snapshot,
  memories,
  onBeginJournal,
  onOpenArchive,
  onOpenSettings,
  onLock,
  onReadEntry,
  onRevisitEntry,
  greeting = "Your tree is listening.",
}: TreeFirstHomeProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  return (
    <AppFrame
      snapshot={snapshot}
      gardenMode="active"
      selectedEntryId={selectedEntryId}
      onSelectEntry={setSelectedEntryId}
    >
      <SeedJournalHeader
        onOpenArchive={onOpenArchive}
        onOpenSettings={onOpenSettings}
        onLock={onLock}
      />
      <main className="sj-home" id="main-content">
        <div className="sj-home__quiet-copy" aria-live="polite">
          <p>{greeting}</p>
          <span>
            {memories.length === 0
              ? "A first reflection can become its first leaf."
              : `${memories.length} ${
                  memories.length === 1 ? "memory rests" : "memories rest"
                } among its branches.`}
          </span>
        </div>

        <div className="sj-home__memory-control">
          <MemoryNavigator
            memories={memories}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
            onReadEntry={onReadEntry}
            onRevisitEntry={onRevisitEntry}
          />
        </div>

        <button
          className="sj-journal-cta"
          type="button"
          onClick={onBeginJournal}
        >
          <PenNibIcon aria-hidden weight="regular" />
          <span>Journal</span>
          <ArrowRightIcon aria-hidden />
        </button>
      </main>
    </AppFrame>
  );
}

