"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ClockCounterClockwiseIcon,
  FlowerLotusIcon,
  XIcon,
} from "@phosphor-icons/react";
import "./garden.css";

export interface GardenMemoryRecord {
  entryId: string;
  eventId: string;
  dateLabel: string;
  title?: string;
  seedInsight?: string;
  form: "leaf" | "bud" | "blossom" | "luminous-blossom";
}

export interface MemoryNavigatorProps {
  memories: GardenMemoryRecord[];
  selectedEntryId?: string | null;
  onSelectEntry: (entryId: string | null) => void;
  onReadEntry?: (entryId: string) => void;
  onRevisitEntry?: (entryId: string) => void;
}

export function MemoryNavigator({
  memories,
  selectedEntryId,
  onSelectEntry,
  onReadEntry,
  onRevisitEntry,
}: MemoryNavigatorProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const selected = useMemo(
    () => memories.find((memory) => memory.entryId === selectedEntryId),
    [memories, selectedEntryId],
  );

  return (
    <>
      <Dialog.Root open={navigatorOpen} onOpenChange={setNavigatorOpen}>
        <Dialog.Trigger asChild>
          <button className="sj-memory-explore" type="button">
            <FlowerLotusIcon aria-hidden weight="regular" />
            <span>Explore tree memories</span>
            <span className="sj-memory-explore__count">{memories.length}</span>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="sj-dialog-overlay" />
          <Dialog.Content
            className="sj-memory-navigator"
            aria-describedby="sj-memory-navigator-description"
          >
            <div className="sj-dialog-heading">
              <div>
                <Dialog.Title>Tree memories</Dialog.Title>
                <Dialog.Description id="sj-memory-navigator-description">
                  Every marker holds a moment you chose to nurture.
                </Dialog.Description>
              </div>
              <Dialog.Close className="sj-icon-button" aria-label="Close memories">
                <XIcon aria-hidden />
              </Dialog.Close>
            </div>

            {memories.length === 0 ? (
              <div className="sj-memory-empty">
                <FlowerLotusIcon aria-hidden />
                <p>Your first reflection will leave a quiet marker here.</p>
              </div>
            ) : (
              <ol className="sj-memory-list">
                {memories.map((memory) => (
                  <li key={memory.eventId}>
                    <button
                      type="button"
                      aria-current={
                        memory.entryId === selectedEntryId ? "true" : undefined
                      }
                      onClick={() => {
                        onSelectEntry(memory.entryId);
                        setNavigatorOpen(false);
                      }}
                    >
                      <span
                        className="sj-memory-list__marker"
                        data-form={memory.form}
                        aria-hidden
                      />
                      <span className="sj-memory-list__copy">
                        <span>{memory.title || "A quiet reflection"}</span>
                        <time>{memory.dateLabel}</time>
                      </span>
                      <ArrowRightIcon aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) onSelectEntry(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sj-dialog-overlay" />
          {selected ? (
            <Dialog.Content
              className="sj-memory-preview"
              aria-describedby="sj-memory-preview-description"
            >
              <div className="sj-memory-preview__meta">
                <span className="sj-memory-preview__form">
                  <FlowerLotusIcon aria-hidden weight="regular" />
                  {selected.form === "leaf"
                    ? "Memory leaf"
                    : selected.form === "bud"
                      ? "Memory bud"
                      : selected.form === "luminous-blossom"
                        ? "Luminous blossom"
                        : "Memory blossom"}
                </span>
                <Dialog.Close
                  className="sj-icon-button"
                  aria-label="Close memory"
                >
                  <XIcon aria-hidden />
                </Dialog.Close>
              </div>
              <time className="sj-memory-preview__date">{selected.dateLabel}</time>
              <Dialog.Title>{selected.title || "A quiet reflection"}</Dialog.Title>
              <Dialog.Description
                id="sj-memory-preview-description"
                className="sj-memory-preview__insight"
              >
                {selected.seedInsight ||
                  "This memory is waiting for you in your journal."}
              </Dialog.Description>
              <div className="sj-memory-preview__actions">
                <button
                  className="sj-secondary-button"
                  type="button"
                  onClick={() => onRevisitEntry?.(selected.entryId)}
                >
                  <ClockCounterClockwiseIcon aria-hidden />
                  Revisit
                </button>
                <button
                  className="sj-primary-button"
                  type="button"
                  onClick={() => onReadEntry?.(selected.entryId)}
                >
                  <BookOpenTextIcon aria-hidden />
                  Read entry
                </button>
              </div>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

