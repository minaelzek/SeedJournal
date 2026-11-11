/**
 * Bridge: append-only lifelong wood → production flowering-spur clusters.
 * Never remeshes the companion. Returns null when the chapter cannot host
 * an airy umbel field (seed / tender sprout / too little wood).
 */

import {
  planFloweringSpurs,
  type FloweringSpurPlan,
} from "./floweringSpurs";
import { createLifelongProtectedWindows } from "./lifelongSakura";
import {
  resolveLivingSakuraIdentity,
  type LivingSakuraSegment,
  type LivingSakuraTopology,
} from "./livingTopology";
import { planProductionPresentationFromLiving } from "./productionWood";

export interface PlanLivingFloweringSpursInput {
  rootSeed: string;
  segments: readonly LivingSakuraSegment[];
  journalCount: number;
}

export function livingFloweringSiteBudget(journalCount: number): number {
  const n = Math.max(0, Math.floor(journalCount));
  if (n < 12) return 0;
  if (n < 48) return 72;
  if (n < 96) return 88;
  if (n < 192) return 104;
  return 118;
}

export function planLivingFloweringSpurs(
  input: PlanLivingFloweringSpursInput,
): FloweringSpurPlan | null {
  const rootSeed = input.rootSeed.trim();
  const journalCount = Math.max(0, Math.floor(input.journalCount));
  const segments = input.segments;
  if (!rootSeed || journalCount < 12 || segments.length < 6) return null;

  const hosts = segments.filter((segment) => segment.role !== "trunk");
  if (hosts.length < 6) return null;

  const identity = resolveLivingSakuraIdentity(rootSeed);
  const dominantLeader =
    segments.find((segment) => segment.id.includes("leader/dominant"))?.id ??
    segments.find((segment) => segment.role === "leader")?.id ??
    segments[0].id;
  const subordinateLeader =
    segments.find((segment) => segment.id.includes("leader/subordinate"))?.id ??
    segments.find(
      (segment) => segment.role === "leader" && segment.id !== dominantLeader,
    )?.id ??
    dominantLeader;

  const topology: LivingSakuraTopology = {
    rootSeed,
    phenotype: {
      lean: identity.lean,
      dominantSide: identity.dominantSide,
      primaryCount: identity.primaryCount,
      secondaryCount: identity.secondaryCount,
      tertiaryCount: identity.tertiaryCount,
      dominantLeaderId: dominantLeader,
      subordinateLeaderId: subordinateLeader,
    },
    cumulativeEventCount: journalCount,
    explicitCapacity: Math.max(segments.length, journalCount),
    segments,
    protectedWindows: createLifelongProtectedWindows(segments),
    care: {
      cumulativeEvents: journalCount,
      explicitEvents: Math.min(journalCount, segments.length),
      compactedEvents: Math.max(0, journalCount - segments.length),
      ageRings: Math.log1p(Math.max(0, journalCount - 192)),
      cumulativeCare: journalCount,
    },
  };

  try {
    const wood = planProductionPresentationFromLiving({ rootSeed, topology });
    const potentialSiteCount = livingFloweringSiteBudget(journalCount);
    if (potentialSiteCount < 72) return null;
    return planFloweringSpurs({ rootSeed, wood, potentialSiteCount });
  } catch {
    return null;
  }
}
