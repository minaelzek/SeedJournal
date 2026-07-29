import { PROMPT_LIBRARY_VERSION } from "@/data/prompts";
import {
  evaluateReflection,
  growthForEntry,
  selectDailyOpeningPrompt,
  selectFollowUp,
} from "@/features/reflection";
import type {
  JournalEntryPayloadV1,
  PromptCategory,
} from "@/lib/contracts";
import type {
  JournalRitualDraft,
  NewJournalOptions,
  RitualStage,
} from "./types";

export interface RitualState extends JournalRitualDraft {
  entryId: string;
  localDay: string;
  category: PromptCategory;
  identitySeed: string;
  openingOffset: number;
  followUpOffset: number;
}

export type RitualAction =
  | { type: "choose-category"; category: PromptCategory }
  | { type: "different-opening" }
  | { type: "begin-writing" }
  | { type: "set-title"; title: string }
  | { type: "set-body"; body: string }
  | { type: "set-threads"; threads: string[] }
  | { type: "set-tags"; tags: string[] }
  | {
      type: "offer-reflection";
      previousBodies?: readonly string[];
      previousFollowUpIds?: readonly string[];
    }
  | {
      type: "different-follow-up";
      previousBodies?: readonly string[];
      previousFollowUpIds?: readonly string[];
    }
  | { type: "answer-follow-up"; response: string }
  | { type: "continue-from-follow-up" }
  | { type: "skip-follow-up" }
  | { type: "keep-small-seed" }
  | { type: "set-seed-insight"; seedInsight: string }
  | { type: "continue-with-seed-insight" }
  | { type: "skip-seed-insight" }
  | { type: "return-to-writing" }
  | { type: "nurture"; completionId: string };

function initialPayload(
  options: NewJournalOptions,
  category: PromptCategory,
  openingOffset = 0,
): JournalEntryPayloadV1 {
  const prompt = selectDailyOpeningPrompt({
    category,
    localDay: options.localDay,
    identitySeed: options.identitySeed,
    alternateOffset: openingOffset,
  });
  return {
    version: 1,
    kind: options.kind ?? "entry",
    ...(options.parentEntryId ? { parentEntryId: options.parentEntryId } : {}),
    title: "",
    prompt: {
      id: prompt.id,
      libraryVersion: PROMPT_LIBRARY_VERSION,
      category,
      renderedText: prompt.text,
    },
    body: "",
    threads: [],
    tags: [],
    seedInsight: "",
    ritual: {
      conciseBodyOverride: false,
      conciseFollowUpOverride: false,
    },
  };
}

export function createRitualState(
  options: NewJournalOptions,
  restored?: JournalRitualDraft,
): RitualState {
  const category = restored?.entry.prompt.category ?? options.category ?? "moment";
  return {
    entryId: options.entryId,
    localDay: options.localDay,
    category,
    identitySeed: options.identitySeed ?? "seed-journal",
    openingOffset: 0,
    followUpOffset: 0,
    stage: restored?.stage ?? "new",
    entry: restored?.entry ?? initialPayload(options, category),
  };
}

function replacePrompt(
  state: RitualState,
  category: PromptCategory,
  openingOffset: number,
): RitualState {
  const prompt = selectDailyOpeningPrompt({
    category,
    localDay: state.localDay,
    identitySeed: state.identitySeed,
    alternateOffset: openingOffset,
  });
  return {
    ...state,
    category,
    openingOffset,
    entry: {
      ...state.entry,
      prompt: {
        id: prompt.id,
        libraryVersion: PROMPT_LIBRARY_VERSION,
        category,
        renderedText: prompt.text,
      },
    },
  };
}

function withFollowUp(
  state: RitualState,
  options: {
    offset: number;
    previousBodies?: readonly string[];
    previousFollowUpIds?: readonly string[];
  },
): RitualState {
  const reflection = evaluateReflection(state.entry.body, {
    category: state.category,
    renderedPrompt: state.entry.prompt.renderedText,
  });
  const followUp = selectFollowUp({
    entryId: state.entryId,
    reflection,
    body: state.entry.body,
    previousBodies: options.previousBodies,
    previousFollowUpIds: options.previousFollowUpIds,
    differentQuestionOffset: options.offset,
  });

  return {
    ...state,
    stage: "reflection-offered",
    followUpOffset: options.offset,
    entry: {
      ...state.entry,
      reflection,
      followUp: {
        id: followUp.id,
        target: followUp.target,
        renderedText: followUp.renderedText,
        response: "",
        skipped: false,
      },
    },
  };
}

export function ritualReducer(
  state: RitualState,
  action: RitualAction,
): RitualState {
  switch (action.type) {
    case "choose-category":
      return replacePrompt(state, action.category, 0);
    case "different-opening":
      return replacePrompt(
        state,
        state.category,
        state.openingOffset + 1,
      );
    case "begin-writing":
      return { ...state, stage: "writing" };
    case "set-title":
      return { ...state, entry: { ...state.entry, title: action.title } };
    case "set-body":
      return { ...state, entry: { ...state.entry, body: action.body } };
    case "set-threads":
      return { ...state, entry: { ...state.entry, threads: action.threads } };
    case "set-tags":
      return { ...state, entry: { ...state.entry, tags: action.tags } };
    case "offer-reflection":
      return withFollowUp(state, {
        offset: 0,
        previousBodies: action.previousBodies,
        previousFollowUpIds: action.previousFollowUpIds,
      });
    case "different-follow-up":
      return withFollowUp(state, {
        offset: state.followUpOffset + 1,
        previousBodies: action.previousBodies,
        previousFollowUpIds: action.previousFollowUpIds,
      });
    case "answer-follow-up":
      return {
        ...state,
        entry: {
          ...state.entry,
          followUp: state.entry.followUp
            ? {
                ...state.entry.followUp,
                response: action.response,
                skipped: false,
              }
            : undefined,
        },
      };
    case "continue-from-follow-up":
      return { ...state, stage: "follow-up-answered" };
    case "skip-follow-up":
      return {
        ...state,
        stage: "follow-up-skipped",
        entry: {
          ...state.entry,
          followUp: state.entry.followUp
            ? { ...state.entry.followUp, response: "", skipped: true }
            : undefined,
        },
      };
    case "keep-small-seed":
      return {
        ...state,
        stage: "follow-up-skipped",
        entry: {
          ...state.entry,
          ritual: { ...state.entry.ritual, conciseBodyOverride: true },
        },
      };
    case "set-seed-insight":
      return {
        ...state,
        entry: { ...state.entry, seedInsight: action.seedInsight },
      };
    case "continue-with-seed-insight":
      return { ...state, stage: "seed-insight-added" };
    case "skip-seed-insight":
      return {
        ...state,
        stage: "seed-insight-skipped",
        entry: { ...state.entry, seedInsight: "" },
      };
    case "return-to-writing":
      return { ...state, stage: "writing" };
    case "nurture": {
      const growth = growthForEntry(
        state.entryId,
        state.entry,
        state.entry.reflection?.mode === "language-neutral" &&
          Boolean(state.entry.seedInsight.trim()) &&
          Boolean(
            state.entry.followUp &&
              !state.entry.followUp.skipped &&
              state.entry.followUp.response.trim(),
          ),
      );
      return {
        ...state,
        stage: "nurtured",
        entry: {
          ...state.entry,
          growth: {
            completionId: action.completionId,
            memoryForm: growth.memoryForm,
            growthUnits: growth.growthUnits,
            seed: growth.seed,
          },
        },
      };
    }
  }
}

export function nextSeedStage(stage: RitualStage): RitualStage {
  if (stage === "follow-up-answered" || stage === "follow-up-skipped") {
    return stage;
  }
  return "follow-up-skipped";
}

