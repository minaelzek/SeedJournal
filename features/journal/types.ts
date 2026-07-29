import type {
  JournalEntryPayloadV1,
  PromptCategory,
} from "@/lib/contracts";

export type RitualStage =
  | "new"
  | "writing"
  | "reflection-offered"
  | "follow-up-answered"
  | "follow-up-skipped"
  | "seed-insight-added"
  | "seed-insight-skipped"
  | "nurtured";

export type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

export interface JournalRitualDraft {
  stage: RitualStage;
  entry: JournalEntryPayloadV1;
}

export interface CompletionResult {
  entry: JournalEntryPayloadV1;
  localDay: string;
  stage: "nurtured";
}

export interface NewJournalOptions {
  entryId: string;
  localDay: string;
  category?: PromptCategory;
  identitySeed?: string;
  kind?: JournalEntryPayloadV1["kind"];
  parentEntryId?: string;
}

export interface DecryptedJournalEntry {
  id: string;
  payload: JournalEntryPayloadV1;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  localDay?: string;
}

