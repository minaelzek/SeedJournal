"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
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
  /** YYYY-MM-DD for On This Day rediscovery when known. */
  localDay?: string;
  title?: string;
  seedInsight?: string;
  /** The journal writing, when the entry is already open in memory. */
  body?: string;
  form: "leaf" | "bud" | "blossom" | "luminous-blossom";
  /** One-based completed-journal ordinal when known (stable bond copy). */
  journalOrdinal?: number;
}

/** Title first, then the ordinal phrase smoke tests look up. */
function openTreeMemoryName(title: string | undefined, ordinal: number) {
  const ordinalName = `Open tree memory ${ordinal}`;
  const trimmed = title?.trim();
  return trimmed ? `${trimmed}, ${ordinalName}` : ordinalName;
}

function memorySheetIsVisible(dialog: HTMLElement | null) {
  if (!dialog?.isConnected) return false;
  const style = window.getComputedStyle(dialog);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return dialog.getClientRects().length > 0;
}

/**
 * Pointer presses activate on pointerup only if pointerdown started here.
 * A petal press that opens this sheet must not click Open journal on release.
 * Keyboard activation still arrives as a click with detail 0.
 */
function sheetButtonProps(action: () => void) {
  return {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      event.currentTarget.dataset.sheetPress = "true";
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const pressed = event.currentTarget.dataset.sheetPress === "true";
      delete event.currentTarget.dataset.sheetPress;
      if (!pressed || event.button !== 0) return;
      action();
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
      delete event.currentTarget.dataset.sheetPress;
    },
    onClick(event: MouseEvent<HTMLButtonElement>) {
      if (event.detail !== 0) return;
      action();
    },
  };
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
  const previewRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const selected = useMemo(
    () => memories.find((memory) => memory.entryId === selectedEntryId),
    [memories, selectedEntryId],
  );
  const selectedIndex = useMemo(
    () => memories.findIndex((memory) => memory.entryId === selectedEntryId),
    [memories, selectedEntryId],
  );
  const selectedOrdinal =
    selected?.journalOrdinal ??
    (selectedIndex >= 0 ? selectedIndex + 1 : null);
  const selectedTitle = selected?.title || "A quiet reflection";

  // Announce petal focus when garden or list sets selection (dialog also focuses).
  const selectionAnnouncement = selected
    ? selectedOrdinal
      ? `Memory petal selected: Journal ${selectedOrdinal}, ${selectedTitle}. Open to read this completed journal.`
      : `Memory petal selected: ${selectedTitle}. Open to read this completed journal.`
    : "";

  useEffect(() => {
    if (!selectedEntryId || selected) return;
    // Stale id (deleted/unavailable) — release so chrome stays honest.
    onSelectEntry(null);
  }, [onSelectEntry, selected, selectedEntryId]);

  const openEntryId = selected?.entryId ?? null;

  useEffect(() => {
    if (!openEntryId) return;
    const title = titleRef.current;
    if (title) {
      title.focus({ preventScroll: true });
      return;
    }
    previewRef.current?.focus({ preventScroll: true });
  }, [openEntryId]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat) return;
      // The petal list is the open dialog; let it take Escape.
      if (navigatorOpen) return;
      // Journal card also listens on window. Do not handle Escape unless
      // this sheet is actually on screen.
      if (!memorySheetIsVisible(previewRef.current)) return;
      event.preventDefault();
      onSelectEntry(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigatorOpen, onSelectEntry, selected]);

  return (
    <>
      <Dialog.Root open={navigatorOpen} onOpenChange={setNavigatorOpen}>
        <Dialog.Trigger asChild>
          <button className="sj-memory-explore" type="button">
            <FlowerLotusIcon aria-hidden weight="regular" />
            <span>Explore memory petals</span>
            <span className="sj-memory-explore__count">
              {memories.length === 1 ? "1 petal" : `${memories.length} petals`}
            </span>
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
                <Dialog.Title>Memory petals</Dialog.Title>
                <Dialog.Description id="sj-memory-navigator-description">
                  Each glowing petal holds one completed journal you chose to
                  keep.
                </Dialog.Description>
              </div>
              <Dialog.Close className="sj-icon-button" aria-label="Close list">
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
                {memories.map((memory, index) => {
                  const ordinal = memory.journalOrdinal ?? index + 1;
                  return (
                    <li key={memory.eventId}>
                      <button
                        type="button"
                        aria-label={openTreeMemoryName(memory.title, ordinal)}
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
                          aria-hidden
                        />
                        <span className="sj-memory-list__copy">
                          <span>{memory.title || "A quiet reflection"}</span>
                          <time>
                            Journal {ordinal}
                            <span aria-hidden="true"> · </span>
                            {memory.dateLabel}
                          </time>
                        </span>
                        <ArrowRightIcon aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {selected ? (
        <section
          ref={previewRef}
          className="sj-memory-preview"
          role="dialog"
          aria-modal="false"
          aria-labelledby="sj-memory-preview-date sj-memory-preview-title"
          data-memory-petal="true"
          tabIndex={-1}
        >
          <time id="sj-memory-preview-date" className="sj-memory-preview__date">
            {selectedOrdinal
              ? `Journal ${selectedOrdinal} · ${selected.dateLabel}`
              : selected.dateLabel}
          </time>
          <h2 id="sj-memory-preview-title" ref={titleRef} tabIndex={-1}>
            {selectedTitle}
          </h2>
          <p id="sj-memory-preview-description" className="sj-memory-preview__body">
            {selected.body?.trim() ||
              selected.seedInsight ||
              "This memory is waiting for you in your journal."}
          </p>
          <div className="sj-memory-preview__actions">
            <button
              className="sj-secondary-button"
              type="button"
              {...sheetButtonProps(() => onSelectEntry(null))}
            >
              Close memory
            </button>
            <button
              className="sj-secondary-button"
              type="button"
              {...sheetButtonProps(() => onRevisitEntry?.(selected.entryId))}
            >
              <ClockCounterClockwiseIcon aria-hidden />
              Revisit
            </button>
            <button
              className="sj-primary-button"
              type="button"
              {...sheetButtonProps(() => onReadEntry?.(selected.entryId))}
            >
              <BookOpenTextIcon aria-hidden />
              Open journal
            </button>
          </div>
        </section>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {selectionAnnouncement}
      </p>
    </>
  );
}
