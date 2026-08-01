"use client";

import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GrowthKind,
  TreeGrowthDelta,
  TreeGrowthEvent,
  TreeSnapshot,
  TreeStage,
} from "@/lib/contracts";
import { IllustratedSakura } from "@/features/garden/illustration";
import {
  morphIntentForReveal,
  presentSakura,
  presentationAtSequence,
  type MorphIntent,
} from "@/features/garden/illustration/presentation";
import { stageGrowthMessage } from "./stages";
import "./growth.css";

export interface GrowthRevealProps {
  delta: TreeGrowthDelta;
  seedInsight?: string;
  stage: TreeStage;
  reducedMotion: boolean;
  treeId: string;
  onReturn: () => void;
  /** Full snapshot enables on-tree sakura morph theater. */
  snapshot?: TreeSnapshot;
}

export interface GrowthRevealStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type GrowthFormKind = "leaf" | "bud" | "blossom" | "luminous";

export interface GrowthCelebration {
  form: GrowthFormKind;
  formLabel: string;
  title: string;
  detail: string;
  returnLabel: string;
  morphIntent: MorphIntent;
  kicker: string;
}

const STORAGE_PREFIX = "seed-journal:growth-reveal:";
const shownThisSession = new Set<string>();

const MORPH_MS: Record<MorphIntent, number> = {
  micro: 900,
  hanami: 1700,
  "stage-cross": 2000,
};

export function growthRevealKey(
  treeId: string,
  delta: TreeGrowthDelta,
): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(treeId)}:${delta.previousSequence}:${delta.nextSequence}`;
}

export function isExactGrowthDelta(delta: TreeGrowthDelta): boolean {
  if (
    delta.events.length === 0 ||
    delta.nextSequence <= delta.previousSequence
  ) {
    return false;
  }

  const expectedLength = delta.nextSequence - delta.previousSequence;
  if (delta.events.length !== expectedLength) return false;

  return delta.events.every(
    (event, index) =>
      event.sequence === delta.previousSequence + index + 1 &&
      event.sequence <= delta.nextSequence,
  );
}

export function hasPresentedGrowthReveal(
  treeId: string,
  delta: TreeGrowthDelta,
  storage?: GrowthRevealStorage,
): boolean {
  const key = growthRevealKey(treeId, delta);
  return shownThisSession.has(key) || storage?.getItem(key) === "presented";
}

export function markGrowthRevealPresented(
  treeId: string,
  delta: TreeGrowthDelta,
  storage?: GrowthRevealStorage,
): void {
  const key = growthRevealKey(treeId, delta);
  shownThisSession.add(key);
  try {
    storage?.setItem(key, "presented");
  } catch {
    // in-memory still prevents duplicates
  }
}

export function selectEarnedGrowthEvent(
  delta: TreeGrowthDelta,
): TreeGrowthEvent | undefined {
  return (
    delta.events.find((event) => event.kind.startsWith("memory_")) ??
    delta.events.find((event) => event.kind === "leaf") ??
    delta.events.at(-1)
  );
}

export function growthFormFromKind(kind: GrowthKind | string): GrowthFormKind {
  if (kind.includes("luminous")) return "luminous";
  if (kind.includes("blossom")) return "blossom";
  if (kind.includes("bud")) return "bud";
  return "leaf";
}

export function growthFormLabel(form: GrowthFormKind): string {
  switch (form) {
    case "luminous":
      return "A radiant sakura blossom opened";
    case "blossom":
      return "A sakura blossom opened";
    case "bud":
      return "A new sakura bud formed";
    case "leaf":
      return "Fresh leaves unfurled on your sakura";
  }
}

/**
 * Celebration copy — Duolingo joy, Apple restraint, sakura identity.
 * No XP / scores / evaluation language.
 */
export function growthCelebration(
  delta: TreeGrowthDelta,
  stage: TreeStage,
  morphIntent: MorphIntent = "micro",
): GrowthCelebration {
  const earned = selectEarnedGrowthEvent(delta);
  const form = growthFormFromKind(earned?.kind ?? "leaf");
  const formLabel = growthFormLabel(form);
  const stageCopy = stageGrowthMessage(stage);
  const structural = delta.events.filter(
    (event) => event.kind === "twig" || event.kind === "branch",
  );
  const memoryEvents = delta.events.filter((event) =>
    event.kind.startsWith("memory_"),
  );

  let title = stageCopy.title;
  let detail = stageCopy.detail;
  let kicker = "Your sakura grew";

  if (morphIntent === "hanami") {
    kicker = form === "luminous" ? "Deep noticing" : "Spring answered";
    title =
      form === "luminous"
        ? "Your sakura opened in light."
        : "Your sakura has blossomed.";
    detail = `${formLabel}. The canopy holds what you were willing to see.`;
  } else if (morphIntent === "stage-cross") {
    kicker = "A new form";
    title = stageCopy.title;
    detail = `${formLabel}. The cherry stepped into a fuller life. ${stageCopy.detail}`;
  } else if (structural.length > 0 && memoryEvents.length > 0) {
    kicker = "Quiet growth";
    const branchLike = structural.some((event) => event.kind === "branch");
    detail = branchLike
      ? `${formLabel.replace(/\.$/, "")}, and a new branch reached outward. ${stageCopy.detail}`
      : `${formLabel.replace(/\.$/, "")}, and a new twig found light. ${stageCopy.detail}`;
  } else if (memoryEvents.length > 1) {
    kicker = "More than one gift";
    detail = `Several quiet forms took place in the sakura. ${stageCopy.detail}`;
  } else {
    kicker = form === "leaf" ? "Tender care" : "A small opening";
    detail = `${formLabel}. ${stageCopy.detail}`;
  }

  return {
    form,
    formLabel,
    title,
    detail,
    returnLabel: "Return to your sakura",
    morphIntent,
    kicker,
  };
}

function sessionStorageIfAvailable(): GrowthRevealStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function revealSnapshot(
  treeId: string,
  delta: TreeGrowthDelta,
  snapshot?: TreeSnapshot,
): TreeSnapshot {
  if (snapshot) return snapshot;
  return {
    treeId,
    rootSeed: treeId,
    algorithmVersion: 2,
    totalEntries: delta.events.filter((event) => event.entryId).length,
    distinctJournalDays: 1,
    events: delta.events,
  };
}

export function GrowthReveal({
  delta,
  seedInsight,
  stage,
  reducedMotion,
  treeId,
  onReturn,
  snapshot,
}: GrowthRevealProps) {
  const exact = useMemo(() => isExactGrowthDelta(delta), [delta]);
  const storage = sessionStorageIfAvailable();
  const [shouldPresent] = useState(
    () => exact && !hasPresentedGrowthReveal(treeId, delta, storage),
  );
  const returned = useRef(false);
  const treeSnapshot = useMemo(
    () => revealSnapshot(treeId, delta, snapshot),
    [delta, snapshot, treeId],
  );
  const morphIntent = useMemo(
    () => morphIntentForReveal(treeSnapshot, delta),
    [delta, treeSnapshot],
  );
  const celebration = useMemo(
    () => growthCelebration(delta, stage, morphIntent),
    [delta, morphIntent, stage],
  );
  const afterPresentation = useMemo(
    () => presentationAtSequence(treeSnapshot, delta.nextSequence),
    [delta.nextSequence, treeSnapshot],
  );
  const beforePresentation = useMemo(
    () => presentationAtSequence(treeSnapshot, delta.previousSequence),
    [delta.previousSequence, treeSnapshot],
  );

  const [revealPhase, setRevealPhase] = useState<"before" | "after">(
    reducedMotion ? "after" : "before",
  );
  const [copyReady, setCopyReady] = useState(reducedMotion);

  useEffect(() => {
    if (shouldPresent) {
      markGrowthRevealPresented(treeId, delta, storage);
      return;
    }
    if (!returned.current) {
      returned.current = true;
      onReturn();
    }
  }, [delta, onReturn, shouldPresent, storage, treeId]);

  useEffect(() => {
    if (!shouldPresent) return;
    if (reducedMotion) {
      setRevealPhase("after");
      setCopyReady(true);
      return;
    }
    // Hold "before" one frame, then morph — Apple-calm choreography
    let copyTimer = 0;
    const morphTimer = window.setTimeout(() => {
      setRevealPhase("after");
      copyTimer = window.setTimeout(() => setCopyReady(true), 280);
    }, 420);
    return () => {
      window.clearTimeout(morphTimer);
      window.clearTimeout(copyTimer);
    };
  }, [reducedMotion, shouldPresent]);

  if (!shouldPresent) return null;

  const isLeap =
    celebration.morphIntent === "hanami" ||
    celebration.morphIntent === "stage-cross";

  return (
    <section
      aria-labelledby="growth-reveal-title"
      aria-describedby="growth-reveal-detail"
      aria-live="polite"
      className="sj-growth-reveal"
      data-reduced-motion={reducedMotion || undefined}
      data-growth-form={
        celebration.form === "luminous" ? "blossom" : celebration.form
      }
      data-morph-intent={celebration.morphIntent}
      data-copy-ready={copyReady || undefined}
      data-leap={isLeap || undefined}
    >
      <div className="sj-growth-reveal__sky" aria-hidden="true" />
      <div className="sj-growth-reveal__glow" aria-hidden="true" />

      <div className="sj-growth-reveal__stage">
        <IllustratedSakura
          snapshot={treeSnapshot}
          growthDelta={delta}
          revealPhase={revealPhase}
          morphIntent={celebration.morphIntent}
          reducedMotion={reducedMotion}
          size="reveal"
          className="sj-growth-reveal__tree"
        />
        {isLeap && revealPhase === "after" && !reducedMotion ? (
          <div className="sj-growth-reveal__petals" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, index) => (
              <span
                key={index}
                className="sj-growth-reveal__petal"
                style={{
                  ["--petal-i" as string]: String(index),
                  animationDelay: `${0.08 * index}s`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="sj-growth-reveal__copy"
        data-ready={copyReady || undefined}
      >
        <p className="sj-growth-reveal__eyebrow">
          <Sparkle aria-hidden size={14} weight="fill" />
          {celebration.kicker}
        </p>
        <h1 id="growth-reveal-title">{celebration.title}</h1>
        <p id="growth-reveal-detail">{celebration.detail}</p>
        {seedInsight ? (
          <blockquote className="sj-growth-reveal__insight">
            “{seedInsight}”
          </blockquote>
        ) : null}
        <p className="sj-growth-reveal__meta sr-only">
          {beforePresentation.stageLabel} became {afterPresentation.stageLabel}.
          {presentSakura(treeSnapshot).memoryCount} memories held.
        </p>
        <button
          type="button"
          className="sj-growth-reveal__return"
          onClick={onReturn}
        >
          {celebration.returnLabel}
          <ArrowRight aria-hidden size={18} />
        </button>
      </div>
    </section>
  );
}

// re-export for timing-aware tests if needed
export const growthRevealMorphMs = MORPH_MS;
