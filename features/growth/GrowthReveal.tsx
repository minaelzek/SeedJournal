"use client";

import { ArrowRight, Check } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TreeGrowthDelta, TreeStage } from "@/lib/contracts";
import { stageGrowthMessage } from "./stages";

export interface GrowthRevealProps {
  delta: TreeGrowthDelta;
  stage: TreeStage;
  reducedMotion: boolean;
  treeId: string;
  onReturn: () => void;
}

export interface GrowthRevealStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = "seed-journal:growth-reveal:";
const shownThisSession = new Set<string>();

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
    // The in-memory ledger still prevents duplicate reveals if storage is full.
  }
}

function sessionStorageIfAvailable(): GrowthRevealStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function GrowthReveal({
  delta,
  stage,
  reducedMotion,
  treeId,
  onReturn,
}: GrowthRevealProps) {
  const exact = useMemo(() => isExactGrowthDelta(delta), [delta]);
  const storage = sessionStorageIfAvailable();
  const [shouldPresent] = useState(
    () => exact && !hasPresentedGrowthReveal(treeId, delta, storage),
  );
  const returned = useRef(false);
  const copy = stageGrowthMessage(stage);

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

  if (!shouldPresent) return null;

  return (
    <section
      aria-labelledby="growth-reveal-title"
      aria-describedby="growth-reveal-detail"
      aria-live="polite"
      className={`mx-auto flex min-h-[min(34rem,100dvh)] w-full max-w-[560px] flex-col items-center justify-center px-5 text-center ${
        reducedMotion
          ? "opacity-100"
          : "animate-[fade-in_360ms_var(--ease-enter)_both]"
      }`}
    >
      <span className="mb-8 inline-flex size-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-blossom-light)]">
        <Check aria-hidden size={24} weight="regular" />
      </span>
      <h1
        id="growth-reveal-title"
        className="text-balance font-[var(--font-poetic)] text-[30px] leading-[38px] text-[var(--color-text-primary)] sm:text-[36px] sm:leading-[44px]"
      >
        {copy.title}
      </h1>
      <p
        id="growth-reveal-detail"
        className="mt-4 max-w-[440px] font-[var(--font-ui)] text-[15px] leading-6 text-[var(--color-text-secondary)]"
      >
        {copy.detail}
      </p>
      <button
        type="button"
        className="mt-10 inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-blossom-light)] px-6 font-[var(--font-ui)] text-[15px] font-medium leading-5 text-[var(--color-surface)] outline-none transition-[opacity,transform,box-shadow] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px"
        onClick={onReturn}
      >
        Return to garden
        <ArrowRight aria-hidden size={18} />
      </button>
    </section>
  );
}
