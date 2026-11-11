"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { GardenWeatherKind } from "@/features/reflection";
import { LivingSakuraScene } from "./LivingSakuraScene";
import { navigateVisibleMemories } from "./memoryInteraction";
import styles from "./LivingSakuraScene.module.css";

const MILESTONES = [0, 1, 12, 48, 96, 192, 1_000, 10_000] as const;

const VIEW_YAWS = {
  front: 0,
  threeQuarter: Math.PI / 4,
  side: Math.PI / 2,
  rear: Math.PI,
} as const;

type ViewKey = keyof typeof VIEW_YAWS;

/** SSR-safe defaults — URL capture flags apply only after mount. */
const DEFAULT_CAPTURE = {
  journalCount: 192,
  newestGrowthUnits: 4 as 1 | 2 | 4 | 6,
  viewYaw: 0,
  clean: false,
  staticCapture: false,
  structureOnly: false,
  revealMode: false,
  rootSeed: "seed-journal-living-sakura-v2",
  weatherKind: "still" as GardenWeatherKind,
};

const WEATHER_KINDS: readonly GardenWeatherKind[] = [
  "still",
  "dew",
  "mist",
  "rain",
  "breeze",
  "sunbreak",
  "restless",
];

function parseWeatherKind(value: string | null): GardenWeatherKind {
  if (value && (WEATHER_KINDS as readonly string[]).includes(value)) {
    return value as GardenWeatherKind;
  }
  return "still";
}

function phaseFor(count: number): string {
  if (count <= 0) return "Seed";
  if (count < 12) return "First roots";
  if (count < 48) return "Tender sapling";
  if (count < 96) return "Young crown";
  if (count < 192) return "Established tree";
  if (count < 1_000) return "Mature bloom";
  return "Enduring seasons";
}

/** One-based journal ordinal from lab entry ids (`lab-memory-N` / trailing digits). */
function journalOrdinal(entryId: string | null): number | null {
  if (!entryId) return null;
  const match = entryId.match(/(\d+)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function memoryLabel(entryId: string | null): string {
  const ordinal = journalOrdinal(entryId);
  return ordinal ? `Journal ${ordinal}` : "A quiet reflection";
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseGrowthUnits(value: string | null): 1 | 2 | 4 | 6 {
  const parsed = Number.parseInt(value ?? "", 10);
  if (parsed === 1 || parsed === 2 || parsed === 4 || parsed === 6) return parsed;
  return 4;
}

function parseViewYaw(params: URLSearchParams): number {
  const named = params.get("view");
  if (named && named in VIEW_YAWS) {
    return VIEW_YAWS[named as ViewKey];
  }
  const degrees = params.get("yaw");
  if (degrees != null && degrees !== "") {
    const parsed = Number.parseFloat(degrees);
    if (Number.isFinite(parsed)) return (parsed * Math.PI) / 180;
  }
  return 0;
}

/**
 * Lab capture flags (founder still-pack / Playwright). Client-only.
 * Query keys: journals, units, view|yaw, clean, static, structure, reveal, seed
 */
function readCaptureParamsFromWindow() {
  const params = new URLSearchParams(window.location.search);
  return {
    journalCount: parsePositiveInt(
      params.get("journals") ?? params.get("count"),
      DEFAULT_CAPTURE.journalCount,
    ),
    newestGrowthUnits: parseGrowthUnits(params.get("units")),
    viewYaw: parseViewYaw(params),
    clean: params.has("clean"),
    staticCapture: params.has("static"),
    structureOnly:
      params.has("structure") || params.get("mode") === "structure",
    revealMode: params.has("reveal"),
    rootSeed: params.get("seed")?.trim() || DEFAULT_CAPTURE.rootSeed,
    weatherKind: parseWeatherKind(params.get("weather")),
  };
}

export function LivingSakuraLab() {
  // Always start from SSR-safe defaults so server HTML matches the first client paint.
  const [paramsReady, setParamsReady] = useState(false);
  const [journalCount, setJournalCount] = useState(DEFAULT_CAPTURE.journalCount);
  const [newestGrowthUnits, setNewestGrowthUnits] = useState<1 | 2 | 4 | 6>(
    DEFAULT_CAPTURE.newestGrowthUnits,
  );
  const [viewYaw, setViewYaw] = useState(DEFAULT_CAPTURE.viewYaw);
  const [clean, setClean] = useState(DEFAULT_CAPTURE.clean);
  const [staticCapture, setStaticCapture] = useState(
    DEFAULT_CAPTURE.staticCapture,
  );
  const [structureOnly, setStructureOnly] = useState(
    DEFAULT_CAPTURE.structureOnly,
  );
  const [revealMode, setRevealMode] = useState(DEFAULT_CAPTURE.revealMode);
  const [rootSeed, setRootSeed] = useState(DEFAULT_CAPTURE.rootSeed);
  const [weatherKind, setWeatherKind] = useState<GardenWeatherKind>(
    DEFAULT_CAPTURE.weatherKind,
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    branches: 0,
    memories: 0,
    history: 0,
    careCycle: 0,
    visibleEntryIds: [] as readonly string[],
  });
  const [announcement, setAnnouncement] = useState(
    `${phaseFor(DEFAULT_CAPTURE.journalCount)} — shaped by ${DEFAULT_CAPTURE.journalCount.toLocaleString()} completed journals.`,
  );
  const [captureReady, setCaptureReady] = useState(false);

  useEffect(() => {
    const capture = readCaptureParamsFromWindow();
    setJournalCount(capture.journalCount);
    setNewestGrowthUnits(capture.newestGrowthUnits);
    setViewYaw(capture.viewYaw);
    setClean(capture.clean);
    setStaticCapture(capture.staticCapture);
    setStructureOnly(capture.structureOnly);
    setRevealMode(capture.revealMode);
    setRootSeed(capture.rootSeed);
    setWeatherKind(capture.weatherKind);
    setAnnouncement(
      `${phaseFor(capture.journalCount)} — shaped by ${capture.journalCount.toLocaleString()} completed journals.`,
    );
    setParamsReady(true);
    if (!capture.clean) setCaptureReady(true);
  }, []);

  // Founder still-pack: settle after params + model stats land.
  useEffect(() => {
    if (!paramsReady || !clean) return;
    setCaptureReady(false);
    if (stats.branches <= 0 && journalCount > 0) return;
    const timer = window.setTimeout(() => setCaptureReady(true), 550);
    return () => window.clearTimeout(timer);
  }, [
    clean,
    journalCount,
    paramsReady,
    stats.branches,
    structureOnly,
    viewYaw,
    newestGrowthUnits,
    rootSeed,
    revealMode,
  ]);

  const selectedOrdinal = useMemo(
    () => journalOrdinal(selectedEntryId),
    [selectedEntryId],
  );
  const selectedLabel = useMemo(
    () => memoryLabel(selectedEntryId),
    [selectedEntryId],
  );

  const nurture = useCallback((units: 1 | 6) => {
    setNewestGrowthUnits(units);
    setJournalCount((current) => current + 1);
    setAnnouncement(
      units === 1
        ? "A new memory petal opened, with a quiet leaf and bud beside it."
        : "A new memory petal opened, and nearby life unfolded more fully.",
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntryId(null);
    setAnnouncement("Memory selection cleared.");
  }, []);

  const selectMemory = useCallback((entryId: string, source: "tree" | "keyboard") => {
    setSelectedEntryId(entryId);
    const label = memoryLabel(entryId);
    setAnnouncement(
      source === "tree"
        ? `${label} opened from the tree. This petal is one completed journal.`
        : `${label} selected on the tree.`,
    );
  }, []);

  const navigateMemory = useCallback(
    (key: string) => {
      const result = navigateVisibleMemories({
        key,
        visibleEntryIds: stats.visibleEntryIds,
        activeEntryId: selectedEntryId,
      });
      if (result.action === "clear") {
        clearSelection();
      }
      if (result.action === "focus" && result.activeEntryId) {
        selectMemory(result.activeEntryId, "keyboard");
      }
      if (result.action === "activate" && result.activeEntryId) {
        // Lab has no vault entry body — keep selection and speak journal bond.
        setSelectedEntryId(result.activeEntryId);
        setAnnouncement(
          `${memoryLabel(result.activeEntryId)} is ready to open. This petal is one completed journal.`,
        );
      }
      return result.handled;
    },
    [clearSelection, selectMemory, selectedEntryId, stats.visibleEntryIds],
  );

  const lifeStage = phaseFor(journalCount);

  return (
    <main
      className={styles.lab}
      data-clean-capture={clean || undefined}
      data-capture-ready={captureReady || undefined}
      data-params-ready={paramsReady || undefined}
      data-structure-only={structureOnly || undefined}
      data-reveal-mode={revealMode || undefined}
      data-journal-count={journalCount}
      data-view-yaw={viewYaw.toFixed(4)}
    >
      {!clean ? (
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Seed Journal · Living Sakura</p>
            <h1>Your care becomes a living place.</h1>
            <p className={styles.intro}>
              Each completed journal leaves one permanent memory petal. Over time
              the tree flourishes—more wood, richer bloom, deeper life. Tap a
              glowing petal to revisit that entry.
            </p>
            <p className={styles.lifeStageInline} aria-live="polite">
              <span>{lifeStage}</span>
              <span aria-hidden="true"> · </span>
              <span>
                {journalCount.toLocaleString()}{" "}
                {journalCount === 1 ? "journal" : "journals"}
              </span>
            </p>
          </div>
          <div className={styles.phaseCard} aria-label="Current life stage">
            <span>{lifeStage}</span>
            <strong>{journalCount.toLocaleString()}</strong>
            <small>memory petals</small>
          </div>
        </header>
      ) : null}

      <section
        className={styles.stage}
        data-memory-selected={selectedEntryId ? "true" : undefined}
        data-clean-stage={clean || undefined}
        aria-label="Living Sakura. Tap a glowing memory petal to open a journal memory."
        aria-describedby={clean ? undefined : "living-sakura-keyboard-help"}
        tabIndex={0}
        onKeyDown={(event) => {
          if (navigateMemory(event.key)) event.preventDefault();
        }}
      >
        {!clean ? (
          <p id="living-sakura-keyboard-help" className="sr-only">
            Keyboard: Left and Right move between visible memory petals. Home and
            End jump to the oldest and newest. Enter opens the focused petal.
            Escape clears the selection. Drag on the tree to walk around it.
          </p>
        ) : null}
        {/* Delay WebGL until URL params applied so clean captures match the request. */}
        {paramsReady ? (
          <LivingSakuraScene
            journalCount={journalCount}
            newestGrowthUnits={newestGrowthUnits}
            viewYaw={viewYaw}
            rootSeed={rootSeed}
            selectedEntryId={structureOnly ? null : selectedEntryId}
            onSelectMemory={
              structureOnly || revealMode
                ? undefined
                : (entryId) => selectMemory(entryId, "tree")
            }
            onModelStats={setStats}
            interactive={!staticCapture && !revealMode && !structureOnly}
            reducedMotion={staticCapture || undefined}
            revealMode={revealMode}
            structureOnly={structureOnly}
            weatherKind={weatherKind}
          />
        ) : (
          <div className={styles.scene} data-living-sakura-scene aria-hidden />
        )}
        {!clean ? <div className={styles.stageWash} aria-hidden="true" /> : null}
        {!clean ? (
          <div className={styles.stats} aria-label="What the tree holds">
            <span>
              {stats.branches}{" "}
              {stats.branches === 1 ? "branch" : "branches"}
            </span>
            <span>
              {stats.history.toLocaleString()}{" "}
              {stats.history === 1 ? "memory held" : "memories held"}
            </span>
            {stats.history > stats.memories ? (
              <span>{stats.memories} in view</span>
            ) : null}
            {stats.careCycle > 0 ? (
              <span>season {stats.careCycle}</span>
            ) : null}
          </div>
        ) : null}
        {!clean && selectedEntryId ? (
          <div
            className={styles.memorySelection}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`${selectedLabel} memory petal selected`}
          >
            <span className={styles.memorySelectionKicker}>Memory petal</span>
            <strong className={styles.memorySelectionTitle}>
              {selectedLabel}
            </strong>
            {selectedOrdinal ? (
              <p className={styles.memorySelectionOrdinal}>
                Completed journal {selectedOrdinal.toLocaleString()}
                {journalCount > 0
                  ? ` of ${journalCount.toLocaleString()}`
                  : null}
              </p>
            ) : null}
            <p className={styles.memorySelectionHint}>
              Still yours — a page you chose to keep on the Sakura.
            </p>
            <p className={styles.memorySelectionBond}>
              This petal is one completed journal
            </p>
            <button
              type="button"
              className={styles.memorySelectionClose}
              onClick={clearSelection}
              aria-label="Clear memory selection"
            >
              Clear
            </button>
          </div>
        ) : null}
      </section>

      {!clean ? (
        <>
          <section className={styles.controls} aria-label="Explore and nurture">
            <div className={styles.milestones}>
              <p>Life stages</p>
              <div role="group" aria-label="Jump to a life stage">
                {MILESTONES.map((milestone) => (
                  <button
                    type="button"
                    key={milestone}
                    data-active={journalCount === milestone || undefined}
                    aria-pressed={journalCount === milestone}
                    aria-label={`${phaseFor(milestone)} — ${milestone.toLocaleString()} journals`}
                    onClick={() => {
                      setJournalCount(milestone);
                      setSelectedEntryId(null);
                      setAnnouncement(
                        `${phaseFor(milestone)} after ${milestone.toLocaleString()} completed journals.`,
                      );
                    }}
                  >
                    {milestone.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className={styles.viewControls} aria-label="Turn around the tree">
                <button
                  type="button"
                  onClick={() => setViewYaw((current) => current - Math.PI / 8)}
                  aria-label="Turn the tree left"
                >
                  Turn left
                </button>
                <button
                  type="button"
                  onClick={() => setViewYaw(0)}
                  aria-label="Face the tree from the front"
                >
                  Face front
                </button>
                <button
                  type="button"
                  onClick={() => setViewYaw((current) => current + Math.PI / 8)}
                  aria-label="Turn the tree right"
                >
                  Turn right
                </button>
              </div>
            </div>
            <div className={styles.nurtureControls}>
              <p>Nurture once more</p>
              <div role="group" aria-label="Add one completed journal">
                <button type="button" onClick={() => nurture(1)}>
                  Quiet reflection
                </button>
                <button type="button" onClick={() => nurture(6)}>
                  Deep reflection
                </button>
              </div>
            </div>
          </section>

          <p className={styles.privacyNote}>
            Both leave the same permanent memory petal. A deeper reflection only
            adds a richer flourish nearby—never a score. Private words stay off the
            tree; only a petal of light marks what you completed.
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </>
      ) : null}
    </main>
  );
}
