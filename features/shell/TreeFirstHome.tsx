"use client";

import { ArrowRightIcon, PenNibIcon } from "@phosphor-icons/react";
import type { TreeSnapshot } from "@/lib/contracts";
import {
  MemoryNavigator,
  type GardenMemoryRecord,
} from "@/features/garden/MemoryNavigator";
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
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string | null) => void;
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
  selectedEntryId = null,
  onSelectEntry,
}: TreeFirstHomeProps) {
  const growthUnits = snapshot.events.reduce(
    (total, event) => total + event.growthUnits,
    0,
  );

  return (
    <>
      <SeedJournalHeader
        onOpenArchive={onOpenArchive}
        onOpenSettings={onOpenSettings}
        onLock={onLock}
      />
      <main className="sj-home" id="main-content">
        {memories.length > 0 ? (
          <div className="sj-home__memory-control">
            <MemoryNavigator
              memories={memories}
              selectedEntryId={selectedEntryId}
              onSelectEntry={(entryId) => onSelectEntry?.(entryId)}
              onReadEntry={onReadEntry}
              onRevisitEntry={onRevisitEntry}
            />
          </div>
        ) : null}

        <button
          className="sj-journal-cta"
          type="button"
          onClick={onBeginJournal}
        >
          <PenNibIcon aria-hidden weight="regular" />
          <span>{growthUnits === 0 ? "Begin a reflection" : "Journal"}</span>
          <ArrowRightIcon aria-hidden />
        </button>
      </main>
    </>
  );
}
