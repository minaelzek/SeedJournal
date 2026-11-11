import type {
  JournalEntryPayloadV1,
  MemoryForm,
  ReflectionSnapshot,
} from "@/lib/contracts";
import { stableHash } from "./hash";

export interface GrowthResult {
  memoryForm: MemoryForm;
  growthUnits: 1 | 2 | 4 | 6;
  seed: number;
  signalCount: number;
}

/**
 * Private depth only. Every completed entry adds 1, 2, 4, or 6 units.
 * Four or more signals plus a follow-up and a carry line reach 6.
 * Three signals with both answered reach 4. The floor is 1.
 * Nothing here can shrink the tree. Sentiment belongs to weather, not growth.
 */
export function mapReflectionToGrowth(options: {
  entryId: string;
  reflection?: ReflectionSnapshot;
  body: string;
  followUpAnswered: boolean;
  seedInsightAdded: boolean;
  languageNeutralCompletionConfirmed?: boolean;
}): GrowthResult {
  const {
    entryId,
    reflection,
    body,
    followUpAnswered,
    seedInsightAdded,
    languageNeutralCompletionConfirmed = false,
  } = options;

  if (reflection?.mode === "language-neutral") {
    if (
      body.trim() &&
      followUpAnswered &&
      seedInsightAdded &&
      languageNeutralCompletionConfirmed
    ) {
      return result("luminous-blossom", 6, entryId, 0);
    }
    if (body.trim() && followUpAnswered && seedInsightAdded) {
      return result("blossom", 4, entryId, 0);
    }
    if (body.trim() && followUpAnswered) {
      return result("bud", 2, entryId, 0);
    }
    return result("leaf", 1, entryId, 0);
  }

  const signalCount = Math.max(
    0,
    reflection
      ? Object.values(reflection.strengths).filter((strength) => strength > 0).length
      : 0,
  );
  const bothAnswered = followUpAnswered && seedInsightAdded;

  if (signalCount >= 4 && bothAnswered) {
    return result("luminous-blossom", 6, entryId, signalCount);
  }
  if (signalCount >= 4) {
    return result("blossom", 4, entryId, signalCount);
  }
  if (signalCount === 3 && bothAnswered) {
    return result("blossom", 4, entryId, signalCount);
  }
  if (signalCount >= 3) {
    return result("bud", 2, entryId, signalCount);
  }
  return result("leaf", 1, entryId, signalCount);
}

function result(
  memoryForm: MemoryForm,
  growthUnits: 1 | 2 | 4 | 6,
  entryId: string,
  signalCount: number,
): GrowthResult {
  return {
    memoryForm,
    growthUnits,
    seed: stableHash(`${entryId}|${memoryForm}|${growthUnits}`) & 0x7fffffff,
    signalCount,
  };
}

export function growthForEntry(
  entryId: string,
  entry: JournalEntryPayloadV1,
  languageNeutralCompletionConfirmed = false,
): GrowthResult {
  return mapReflectionToGrowth({
    entryId,
    reflection: entry.reflection,
    body: entry.body,
    followUpAnswered: Boolean(
      entry.followUp && !entry.followUp.skipped && entry.followUp.response.trim(),
    ),
    seedInsightAdded: Boolean(entry.seedInsight.trim()),
    languageNeutralCompletionConfirmed,
  });
}
