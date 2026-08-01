import type { RitualStage } from "./types";

export const RITUAL_PROGRESS_LABELS = ["Arrive", "Reflect", "Carry"] as const;

export type RitualProgressLabel = (typeof RITUAL_PROGRESS_LABELS)[number];

export interface RitualProgress {
  /** 0 = Arrive (write), 1 = Reflect, 2 = Carry (insight / nurture). */
  activeStep: 0 | 1 | 2;
  label: RitualProgressLabel;
  labels: readonly RitualProgressLabel[];
  /** Human step index for a11y, 1-based. */
  stepNumber: number;
  stepCount: number;
}

/**
 * Maps ritual machine stages onto a three-beat daily path.
 * Pure so progress chrome stays unit-testable and free of score language.
 */
export function ritualProgress(stage: RitualStage): RitualProgress {
  let activeStep: 0 | 1 | 2;
  switch (stage) {
    case "new":
    case "writing":
      activeStep = 0;
      break;
    case "reflection-offered":
    case "second-reflection-offered":
      activeStep = 1;
      break;
    // Answered follow-ups render SeedInsightStep (Carry) in JournalRitual.
    case "follow-up-answered":
    case "second-reflection-answered":
    case "follow-up-skipped":
    case "second-reflection-skipped":
    case "seed-insight-added":
    case "seed-insight-skipped":
    case "nurtured":
      activeStep = 2;
      break;
    default: {
      const _exhaustive: never = stage;
      void _exhaustive;
      activeStep = 0;
    }
  }

  return {
    activeStep,
    label: RITUAL_PROGRESS_LABELS[activeStep],
    labels: RITUAL_PROGRESS_LABELS,
    stepNumber: activeStep + 1,
    stepCount: RITUAL_PROGRESS_LABELS.length,
  };
}

/** Completion handoff copy — calm celebration into growth reveal / tree. */
export function ritualNurturedCopy(isCompleting: boolean): {
  title: string;
  detail: string;
  ctaLabel: string;
} {
  if (isCompleting) {
    return {
      title: "The tree is receiving your care.",
      detail: "A quiet moment while your reflection finds its place.",
      ctaLabel: "Nurturing…",
    };
  }
  return {
    title: "Your reflection has taken its place.",
    detail: "The tree changed because you showed up for yourself. See what grew.",
    ctaLabel: "See what grew",
  };
}
