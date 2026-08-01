"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  FlowerLotusIcon,
  PenNibIcon,
} from "@phosphor-icons/react";
import {
  careInvitation,
  careRhythmDetail,
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
  const invitation = careInvitation({
    hasBegun,
    hasUnfinishedReflection,
    hasReturnBud,
    reflectionCount,
    rhythm: careRhythm,
  });
  // Body copy only for first visit / draft — never over the living tree.
  const showWelcomeCopy =
    invitation.state === "first" || invitation.state === "draft";

  return (
    <>
      <SeedJournalHeader
        onOpenArchive={onOpenArchive}
        onOpenSettings={onOpenSettings}
        onLock={onLock}
        weather={hasBegun ? weather : undefined}
      />
      <main
        className="sj-home"
        id="main-content"
        data-has-draft={hasUnfinishedReflection || undefined}
        data-tended-today={tendedToday || undefined}
        data-care-state={invitation.state}
        data-return-bud={hasReturnBud || undefined}
        data-tree-clear={!showWelcomeCopy || undefined}
      >
        {/* Top strip: one short line only — tree owns the rest. */}
        <section className="sj-home__welcome" aria-labelledby="sj-home-title">
          <p className="sj-home__eyebrow">{invitation.eyebrow}</p>
          <h1 id="sj-home-title">{invitation.title}</h1>
          {showWelcomeCopy ? (
            <p className="sj-home__description">{invitation.description}</p>
          ) : (
            <p className="sr-only">{invitation.description}</p>
          )}
        </section>

        {/*
          Open stage — tree is rendered by AppFrame IllustratedSakura.
          No CSS seed companion: the illustrated sakura owns seed personality.
        */}
        <div
          className="sj-home__tree-stage"
          data-seed={isSeed || undefined}
          aria-hidden="true"
        />

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

        {/* Bottom dock: rhythm + single primary path. */}
        <div className="sj-home__dock">
          {hasBegun && careRhythm ? (
            <CareRhythmMark rhythm={careRhythm} />
          ) : null}

          {hasReturnBud && returnBud && onOpenReturnBud && onReleaseReturnBud ? (
            <ReturnBudMoment
              bud={returnBud}
              onOpen={onOpenReturnBud}
              onRelease={onReleaseReturnBud}
            />
          ) : (
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
              {tendedToday && !hasUnfinishedReflection ? (
                <p className="sj-home__settled" aria-live="polite">
                  Care complete for today
                </p>
              ) : null}
            </div>
          )}

          {!hasReturnBud ? (
            <p className="sj-home__footnote">{invitation.footnote}</p>
          ) : null}

          {hasUnfinishedReflection && onStartFreshJournal ? (
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

function CareRhythmMark({ rhythm }: { rhythm: CareRhythm }) {
  const detail = careRhythmDetail(rhythm);
  const openToday = !rhythm.tendedToday;

  return (
    <div
      className="sj-care-rhythm"
      data-tended-today={rhythm.tendedToday || undefined}
      data-open-today={openToday || undefined}
      data-rhythm={rhythm.currentRhythm > 0 ? rhythm.currentRhythm : undefined}
      aria-label={`Care rhythm: ${rhythm.recentCareDays} of the last seven days. ${
        rhythm.tendedToday ? "Today is tended." : "Today is open."
      } ${detail}.`}
    >
      <span className="sj-care-rhythm__days" aria-hidden="true">
        {rhythm.days.map((day) => (
          <span
            className="sj-care-rhythm__day"
            data-tended={day.tended || undefined}
            data-today={day.isToday || undefined}
            data-open={day.isToday && !day.tended ? true : undefined}
            key={day.localDay}
            title={day.fullLabel}
          >
            <i />
          </span>
        ))}
      </span>
      <span className="sj-care-rhythm__detail">{detail}</span>
    </div>
  );
}
