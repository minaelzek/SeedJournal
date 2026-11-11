"use client";

import { ArrowRight } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type {
  GrowthKind,
  TreeGrowthDelta,
  TreeGrowthEvent,
  TreeSnapshot,
  TreeStage,
} from "@/lib/contracts";
import {
  GROWTH_CEREMONY_DURATION_SECONDS,
  GROWTH_REVEAL_REDUCED_MOTION_SECONDS,
} from "@/features/garden/living-sakura/growthCeremony";
import type {
  LivingMemoryInput,
  PrivateGrowthUnits,
} from "@/features/growth/livingDevelopment";
import type { LivingSakuraGardenProps } from "@/features/garden/living-sakura/LivingSakuraGarden";
import {
  morphIntentForReveal,
  presentSakura,
  presentationAtSequence,
  type MorphIntent,
} from "@/features/garden/illustration/presentation";
import { stageGrowthMessage } from "./stages";
import "./growth.css";

/**
 * Client-only living garden loader — keeps WebGL out of SSR/static markup
 * while still mounting the same Living Sakura body as home.
 */
function LivingRevealTree(props: LivingSakuraGardenProps) {
  const [Garden, setGarden] = useState<ComponentType<
    LivingSakuraGardenProps
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/features/garden/living-sakura/LivingSakuraGarden").then(
      (module) => {
        if (!cancelled) setGarden(() => module.LivingSakuraGarden);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Garden) {
    return (
      <div className="sj-growth-reveal__tree-fallback" aria-hidden="true" />
    );
  }
  return <Garden {...props} />;
}

/** Same private-units mapping as LivingSakuraGarden (kept local to avoid canvas import). */
function asPrivateGrowthUnits(value: number): PrivateGrowthUnits {
  if (value >= 6) return 6;
  if (value >= 4) return 4;
  if (value >= 2) return 2;
  return 1;
}

/** Same snapshot→memory mapping as LivingSakuraGarden.memoriesFromSnapshot. */
function livingMemoriesFromSnapshot(
  snapshot: TreeSnapshot,
): LivingMemoryInput[] {
  const memoryEvents = snapshot.events
    .filter(
      (event) =>
        Boolean(event.entryId) && event.kind.startsWith("memory_"),
    )
    .sort((left, right) => left.occurredAt - right.occurredAt);

  return memoryEvents.map((event, index) => ({
    entryId: event.entryId as string,
    ordinal: index + 1,
    privateGrowthUnits: asPrivateGrowthUnits(event.growthUnits || 1),
    seed: event.seed,
  }));
}

export interface GrowthRevealProps {
  delta: TreeGrowthDelta;
  seedInsight?: string;
  stage: TreeStage;
  reducedMotion: boolean;
  treeId: string;
  onReturn: () => void;
  /** Full snapshot enables the living-sakura ceremony on the same body as home. */
  snapshot?: TreeSnapshot;
  /**
   * When true, copy overlay only — the home AppFrame garden already runs
   * revealMode on a single Canvas (no second WebGL tree).
   */
  hostGarden?: boolean;
  /** True once the living tree ceremony has settled. */
  ceremonyComplete?: boolean;
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

/** Copy appears as organs settle — same clock for every private tier. */
const COPY_AT_SECONDS = 2.8;
/** Legacy morph timings retained for any timing-aware consumers. */
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

/**
 * Surrounding botanical flourish only — never a public grade of the memory itself.
 * Every completed journal still opens one equal memory petal.
 */
/**
 * Surrounding life language — variety, never a public grade ladder.
 * Avoid ranked words (leaf/bud/blossom as scores; no "luminous" rank).
 */
export function growthFormLabel(form: GrowthFormKind): string {
  switch (form) {
    case "luminous":
    case "blossom":
    case "bud":
    case "leaf":
      // One sentence for every tier. Depth still changes the tree in private.
      return "Nearby, quiet life gathered beside the memory";
  }
}

/**
 * Celebration copy — equal memory petal first; surrounding growth is flourish only.
 * No XP / scores / evaluation language. No structural grade claims.
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
  const memoryEvents = delta.events.filter((event) =>
    event.kind.startsWith("memory_"),
  );
  const hasMemory = memoryEvents.length > 0;

  // Equal beauty: every completion is a permanent memory petal.
  const petalLead = hasMemory
    ? "A bud opened on your sakura."
    : "Your sakura received quiet care.";

  let title = petalLead;
  let detail = `${formLabel}. ${stageCopy.detail}`;
  let kicker = "Your sakura grew";

  if (morphIntent === "hanami") {
    kicker = "Spring answered";
    title = petalLead;
    detail = `${formLabel}. The canopy holds what you were willing to see.`;
  } else if (morphIntent === "stage-cross") {
    kicker = "A fuller life";
    title = stageCopy.title;
    detail = `${petalLead} ${formLabel}. ${stageCopy.detail}`;
  } else if (memoryEvents.length > 1) {
    kicker = "More than one gift";
    detail = `Several memory petals found places on the tree. ${stageCopy.detail}`;
  } else {
    kicker = "With the tree";
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
    events: [...delta.events],
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
  hostGarden = false,
  ceremonyComplete = false,
}: GrowthRevealProps) {
  const exact = useMemo(() => isExactGrowthDelta(delta), [delta]);
  const hasEvents = delta.events.length > 0;
  const storage = sessionStorageIfAvailable();
  // Never silent-skip: present full ceremony when exact; otherwise calm fallback.
  const [shouldPresent] = useState(
    () =>
      hasEvents && !hasPresentedGrowthReveal(treeId, delta, storage),
  );
  const isFallback = shouldPresent && !exact;
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

  // Living body inputs — same mapping as the home garden.
  const livingMemories = useMemo(
    () => livingMemoriesFromSnapshot(treeSnapshot),
    [treeSnapshot],
  );
  const earnedEvent = useMemo(
    () => selectEarnedGrowthEvent(delta),
    [delta],
  );
  const newestEntryId =
    earnedEvent?.entryId ?? livingMemories.at(-1)?.entryId ?? null;
  const newestGrowthUnits = asPrivateGrowthUnits(
    earnedEvent?.growthUnits ??
      livingMemories.at(-1)?.privateGrowthUnits ??
      1,
  );

  const [copyReady, setCopyReady] = useState(false);
  const displayedCopyReady =
    reducedMotion || isFallback || copyReady || ceremonyComplete;

  useEffect(() => {
    if (shouldPresent) {
      markGrowthRevealPresented(treeId, delta, storage);
      return;
    }
    // Already presented this session — return home without a blank beat.
    if (!returned.current) {
      returned.current = true;
      onReturn();
    }
  }, [delta, onReturn, shouldPresent, storage, treeId]);

  useEffect(() => {
    if (!shouldPresent) return;
    // Equal ceremony duration across tiers; reduced-motion / fallback short dissolve.
    const copyAtMs =
      reducedMotion || isFallback
        ? GROWTH_REVEAL_REDUCED_MOTION_SECONDS * 1000
        : COPY_AT_SECONDS * 1000;
    const copyTimer = window.setTimeout(() => setCopyReady(true), copyAtMs);
    return () => {
      window.clearTimeout(copyTimer);
    };
  }, [isFallback, reducedMotion, shouldPresent]);

  if (!shouldPresent) return null;

  const isLeap =
    !isFallback &&
    (celebration.morphIntent === "hanami" ||
      celebration.morphIntent === "stage-cross");

  return (
    <section
      aria-labelledby="growth-reveal-title"
      aria-describedby="growth-reveal-detail"
      aria-busy={!displayedCopyReady}
      className="sj-growth-reveal"
      data-reduced-motion={reducedMotion || undefined}
      data-growth-form={
        celebration.form === "luminous" ? "blossom" : celebration.form
      }
      data-morph-intent={celebration.morphIntent}
      data-copy-ready={displayedCopyReady || undefined}
      data-leap={isLeap || undefined}
      data-living-reveal
      data-host-garden={hostGarden || undefined}
      data-fallback={isFallback || undefined}
      data-ceremony-seconds={String(GROWTH_CEREMONY_DURATION_SECONDS)}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {displayedCopyReady
          ? `${celebration.title} ${celebration.detail}`
          : "Your sakura is growing."}
      </p>
      <div className="sj-growth-reveal__sky" aria-hidden="true" />
      <div className="sj-growth-reveal__glow" aria-hidden="true" />

      <div className="sj-growth-reveal__stage">
        <div
          className="sj-growth-reveal__tree"
          data-living-sakura-reveal
          data-journal-count={livingMemories.length}
          data-newest-growth-units={newestGrowthUnits}
          data-host-garden={hostGarden || undefined}
        >
          {/* Product path: AppFrame hosts the single living Canvas in revealMode. */}
          {hostGarden ? null : (
            <LivingRevealTree
              snapshot={treeSnapshot}
              selectedEntryId={newestEntryId}
              interactive={false}
              revealMode
              reducedMotion={reducedMotion || isFallback}
              newestGrowthUnits={newestGrowthUnits}
            />
          )}
        </div>
        {isLeap && displayedCopyReady && !reducedMotion ? (
          <div className="sj-growth-reveal__petals" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
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
        data-ready={displayedCopyReady || undefined}
      >
        <p className="sj-growth-reveal__eyebrow">{celebration.kicker}</p>
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
export const growthRevealCeremonySeconds = GROWTH_CEREMONY_DURATION_SECONDS;
