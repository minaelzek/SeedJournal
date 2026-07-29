export type PromptCategory =
  | "moment"
  | "feeling"
  | "relationship"
  | "decision"
  | "change"
  | "gratitude"
  | "open";

export type ReflectionSignal =
  | "context"
  | "emotion"
  | "meaning"
  | "perspective"
  | "integration";

export type MemoryForm =
  | "leaf"
  | "bud"
  | "blossom"
  | "luminous-blossom";

export type GrowthKind =
  | "leaf"
  | "memory_leaf"
  | "memory_bud"
  | "memory_blossom"
  | "memory_luminous_blossom"
  | "twig"
  | "branch";

export interface ReflectionSnapshot {
  engineVersion: "1";
  mode: "english-rules" | "language-neutral";
  strengths: Record<ReflectionSignal, 0 | 1 | 2>;
  selectedTarget: ReflectionSignal | "deepen" | "language-neutral";
}

export interface JournalEntryPayloadV1 {
  version: 1;
  kind: "entry" | "revisit";
  parentEntryId?: string;
  title: string;
  prompt: {
    id: string;
    libraryVersion: "1";
    category: PromptCategory;
    renderedText: string;
  };
  body: string;
  threads: string[];
  tags: string[];
  followUp?: {
    id: string;
    target: ReflectionSignal | "deepen" | "language-neutral";
    renderedText: string;
    response: string;
    skipped: boolean;
  };
  seedInsight: string;
  ritual: {
    conciseBodyOverride: boolean;
    conciseFollowUpOverride: boolean;
  };
  reflection?: ReflectionSnapshot;
  growth?: {
    completionId: string;
    memoryForm: MemoryForm;
    growthUnits: 1 | 2 | 4 | 6;
    seed: number;
  };
}

export interface EncryptedEntryEnvelope {
  id: string;
  state: "draft" | "complete";
  envelopeVersion: 1;
  iv: string;
  ciphertext: string;
  revision: number;
  clientCreatedAt: number;
  clientUpdatedAt: number;
  completedAt?: number;
  localDay?: string;
}

export interface TreeGrowthEvent {
  id: string;
  sequence: number;
  entryId: string | null;
  occurredAt: number;
  localDate: string;
  kind: GrowthKind;
  growthUnits: 0 | 1 | 2 | 4 | 6;
  seed: number;
}

export interface TreeSnapshot {
  treeId: string;
  rootSeed: string;
  algorithmVersion: 1;
  totalEntries: number;
  distinctJournalDays: number;
  events: TreeGrowthEvent[];
}

export interface TreeGrowthDelta {
  previousSequence: number;
  nextSequence: number;
  events: TreeGrowthEvent[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}
