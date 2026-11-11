"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import {
  ArrowRightIcon,
  FlowerLotusIcon,
  PenNibIcon,
} from "@phosphor-icons/react";
import {
  careInvitation,
  gentleCareNoteCopy,
  nextNamedGrowth,
  readGentleCareNoteEnabled,
  selectOnThisDayMemories,
  type CareRhythm,
  type DueReturnBud,
} from "@/features/growth";
import type { TreeSnapshot } from "@/lib/contracts";
import type { GardenWeather } from "@/features/reflection";
import {
  MemoryNavigator,
  type GardenMemoryRecord,
} from "@/features/garden/MemoryNavigator";
import { SeedJournalHeader } from "./SeedJournalHeader";
import {
  FIRST_OPEN_ARRIVAL_MS,
  FIRST_OPEN_BEATS,
  FIRST_OPEN_STORAGE_KEY,
  shouldPlayFirstOpenArrival,
} from "./firstOpenArrival";
import "./shell.css";

export interface TreeFirstHomeProps {
  snapshot: TreeSnapshot;
  memories: GardenMemoryRecord[];
  weather?: GardenWeather;
  careRhythm?: CareRhythm;
  returnBud?: DueReturnBud | null;
  hasUnfinishedReflection?: boolean;
  onBeginJournal: () => void;
  onStartFreshJournal?: () => void;
  onOpenReturnBud?: (entryId: string) => Promise<void> | void;
  onReleaseReturnBud?: (entryId: string) => Promise<void> | void;
  onOpenArchive?: () => void;
  onOpenSettings?: () => void;
  onLock?: () => void;
  onReadEntry?: (entryId: string) => void;
  onRevisitEntry?: (entryId: string) => void;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string | null) => void;
  /** Journal card is open over this same page. Keep the tree; hide the dock. */
  companionOpen?: boolean;
}

export function TreeFirstHome({
  snapshot,
  memories,
  weather,
  careRhythm,
  returnBud,
  hasUnfinishedReflection = false,
  onBeginJournal,
  onStartFreshJournal,
  onOpenReturnBud,
  onReleaseReturnBud,
  onOpenArchive,
  onOpenSettings,
  onLock,
  onReadEntry,
  onRevisitEntry,
  selectedEntryId = null,
  onSelectEntry,
  companionOpen = false,
}: TreeFirstHomeProps) {
  const growthUnits = snapshot.events.reduce(
    (total, event) => total + event.growthUnits,
    0,
  );
  const reflectionCount = memories.length;
  const hasBegun = reflectionCount > 0 || growthUnits > 0;
  const isSeed = growthUnits === 0;
  const tendedToday = careRhythm?.tendedToday ?? false;
  const hasReturnBud = Boolean(returnBud);
  const nextGrowth = nextNamedGrowth(reflectionCount);
  const invitation = careInvitation({
    hasBegun,
    hasUnfinishedReflection,
    hasReturnBud,
    reflectionCount,
    rhythm: careRhythm,
    nextChangeLabel: nextGrowth?.label,
  });
  // Body copy only for first visit / draft — never over the living tree.
  const showWelcomeCopy =
    invitation.state === "first" || invitation.state === "draft";

  const todayLocalDay =
    careRhythm?.days.find((day) => day.isToday)?.localDay ??
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const onThisDay = selectOnThisDayMemories(memories, todayLocalDay, {
    excludeToday: true,
    limit: 3,
  });

  const [gentleCareEnabled, setGentleCareEnabled] = useState(false);
  const [arrivalPlaying, setArrivalPlaying] = useState(false);
  useEffect(() => {
    setGentleCareEnabled(readGentleCareNoteEnabled());
  }, []);
  useLayoutEffect(() => {
    if (!isSeed || hasBegun) {
      setArrivalPlaying(false);
      return;
    }
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(FIRST_OPEN_STORAGE_KEY) === "1";
    } catch {
      alreadySeen = false;
    }
    const arriveQuery =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("arrive") === "1";
    if (
      !shouldPlayFirstOpenArrival({
        isSeed,
        alreadySeen,
        arriveQuery,
        reducedMotion,
      })
    ) {
      setArrivalPlaying(false);
      return;
    }
    setArrivalPlaying(true);
    const doneTimer = window.setTimeout(() => {
      setArrivalPlaying(false);
      try {
        sessionStorage.setItem(FIRST_OPEN_STORAGE_KEY, "1");
      } catch {
        // sessionStorage may be blocked; the film simply will not persist.
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has("arrive")) {
        url.searchParams.delete("arrive");
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next);
      }
    }, FIRST_OPEN_ARRIVAL_MS);
    return () => {
      window.clearTimeout(doneTimer);
    };
  }, [hasBegun, isSeed]);
  const gentleCareNote = gentleCareNoteCopy({
    enabled: gentleCareEnabled,
    hasBegun,
    tendedToday,
    hasUnfinishedReflection,
  });

  const quietChrome = arrivalPlaying || companionOpen;
  const showDockTitle = arrivalPlaying || invitation.state === "first";
  const dockTitle = arrivalPlaying
    ? FIRST_OPEN_BEATS[0].title
    : invitation.title;

  return (
    <>
      <SeedJournalHeader
        onOpenArchive={quietChrome ? undefined : onOpenArchive}
        onOpenSettings={quietChrome ? undefined : onOpenSettings}
        onLock={quietChrome ? undefined : onLock}
        weather={arrivalPlaying || !hasBegun ? undefined : weather}
      />
      <main
        className="sj-home"
        id={companionOpen ? undefined : "main-content"}
        aria-hidden={companionOpen || undefined}
        data-conversing={companionOpen || undefined}
        data-has-draft={hasUnfinishedReflection || undefined}
        data-tended-today={tendedToday || undefined}
        data-care-state={invitation.state}
        data-return-bud={hasReturnBud || undefined}
        data-tree-clear={!showWelcomeCopy || undefined}
        data-first-open={arrivalPlaying || undefined}
      >
        {/* Top strip after the arrival beat — tree owns the rest.
            First visit keeps its one line in the dock, with the button. */}
        {arrivalPlaying || invitation.state === "first" ? null : (
          <section
            className="sj-home__welcome"
            aria-labelledby="sj-home-title"
          >
            {invitation.eyebrow ? (
              <p className="sj-home__eyebrow">{invitation.eyebrow}</p>
            ) : null}
            <h1 id="sj-home-title">{invitation.title}</h1>
            {invitation.description ? (
              showWelcomeCopy ? (
                <p className="sj-home__description">{invitation.description}</p>
              ) : (
                <p className="sr-only">{invitation.description}</p>
              )
            ) : null}
          </section>
        )}

        {/*
          Open stage — the living Sakura is rendered by AppFrame (gardenRenderer = "living").
          This slot keeps layout clearance only; the tree owns presence and personality.
        */}
        <div
          className="sj-home__tree-stage"
          data-seed={isSeed || undefined}
          aria-hidden="true"
        />

        {memories.length > 0 ? (
          <div
            className="sj-home__memory-control"
            data-memory-selected={selectedEntryId ? "true" : undefined}
          >
            {/*
              Garden petal taps set selectedEntryId in SeedJournalApp/AppFrame.
              MemoryNavigator opens the petal viewer for that entry (no body in 3D).
            */}
            <MemoryNavigator
              memories={memories}
              selectedEntryId={selectedEntryId}
              onSelectEntry={(entryId) => onSelectEntry?.(entryId)}
              onReadEntry={onReadEntry}
              onRevisitEntry={onRevisitEntry}
            />
          </div>
        ) : null}

        {/*
          Bottom dock system — single safe-area stack so return bud, On This Day,
          care rhythm, and primary CTA never absolute-collide on ~375px.
        */}
        <div className="sj-home__dock">
          {showDockTitle ? (
            <h1 id="sj-home-title" className="sj-home__arrival">
              {dockTitle}
            </h1>
          ) : null}
          {arrivalPlaying ? null : onThisDay.length > 0 && !hasReturnBud ? (
            <section
              className="sj-on-this-day"
              aria-label="On this day in your journal"
            >
              <p className="sj-on-this-day__kicker">On this day</p>
              <p className="sj-on-this-day__lede">
                Past care returns — without a streak to keep.
              </p>
              <ul className="sj-on-this-day__list">
                {onThisDay.map((memory) => {
                  const ordinal = memory.journalOrdinal;
                  return (
                    <li key={memory.eventId}>
                      <button
                        type="button"
                        className="sj-on-this-day__item"
                        onClick={() => onSelectEntry?.(memory.entryId)}
                      >
                        <span className="sj-on-this-day__title">
                          {memory.title || "A quiet reflection"}
                        </span>
                        <span className="sj-on-this-day__meta">
                          {ordinal ? `Journal ${ordinal}` : "Memory petal"}
                          <span aria-hidden="true"> · </span>
                          {memory.dateLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {!arrivalPlaying &&
          hasReturnBud &&
          returnBud &&
          onOpenReturnBud &&
          onReleaseReturnBud ? (
            <ReturnBudMoment
              bud={returnBud}
              onOpen={onOpenReturnBud}
              onRelease={onReleaseReturnBud}
            />
          ) : null}

          {!arrivalPlaying &&
          !(
            hasReturnBud &&
            returnBud &&
            onOpenReturnBud &&
            onReleaseReturnBud
          ) ? (
            <div className="sj-home__actions">
              <button
                className="sj-journal-cta"
                type="button"
                onClick={onBeginJournal}
                data-care-cta={invitation.state}
              >
                <PenNibIcon aria-hidden weight="regular" />
                <span>{invitation.ctaLabel}</span>
                <ArrowRightIcon aria-hidden />
              </button>
            </div>
          ) : null}

          {!arrivalPlaying &&
          !hasReturnBud &&
          (gentleCareNote ||
            invitation.footnote ||
            invitation.state === "first" ||
            invitation.state === "open") ? (
            <p className="sj-home__footnote">
              {gentleCareNote ? (
                <>
                  {gentleCareNote}
                  {invitation.footnote ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      {invitation.footnote}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {invitation.footnote}
                  {invitation.state === "first" || invitation.state === "open"
                    ? " A small seed is enough."
                    : null}
                </>
              )}
            </p>
          ) : null}

          {!arrivalPlaying && hasUnfinishedReflection && onStartFreshJournal ? (
            <button
              type="button"
              className="sj-home__fresh-start"
              onClick={onStartFreshJournal}
            >
              Start a fresh page
            </button>
          ) : null}
        </div>
      </main>
    </>
  );
}

function ReturnBudMoment({
  bud,
  onOpen,
  onRelease,
}: {
  bud: DueReturnBud;
  onOpen: (entryId: string) => Promise<void> | void;
  onRelease: (entryId: string) => Promise<void> | void;
}) {
  const [pending, setPending] = useState<"open" | "release" | null>(null);
  const [error, setError] = useState("");

  const resolve = async (choice: "open" | "release") => {
    setPending(choice);
    setError("");
    try {
      if (choice === "open") {
        await onOpen(bud.entryId);
      } else {
        await onRelease(bud.entryId);
      }
    } catch {
      setPending(null);
      setError("The bud is still here. Try again when you’re ready.");
    }
  };

  return (
    <section className="sj-return-bud" aria-label="A reflection has returned">
      <p className="sj-return-bud__kicker">
        <FlowerLotusIcon aria-hidden size={14} weight="regular" />
        A memory returned
      </p>
      <blockquote>“{bud.seedInsight}”</blockquote>
      <div className="sj-return-bud__actions">
        <button
          type="button"
          className="sj-return-bud__primary"
          onClick={() => void resolve("open")}
          disabled={pending !== null}
        >
          {pending === "open" ? "Opening…" : "Sit with this"}
          <ArrowRightIcon aria-hidden />
        </button>
        <button
          type="button"
          className="sj-return-bud__secondary"
          onClick={() => void resolve("release")}
          disabled={pending !== null}
        >
          {pending === "release" ? "Letting it rest…" : "Let it rest"}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}


