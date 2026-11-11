import {
  getOpeningPrompts,
  PROMPT_LIBRARY_VERSION,
  type FollowUpPrompt,
  type OpeningPrompt,
} from "@/data/prompts";
import type {
  PromptCategory,
  ReflectionSnapshot,
} from "@/lib/contracts";
import { composeGardenReply, type ComposedLine } from "./compose";
import { seededIndex } from "./hash";

export interface SelectedFollowUp {
  id: string;
  target: FollowUpPrompt["target"];
  renderedText: string;
  anchor?: string;
  /** True when the line asks a question drawn from the writer's words. */
  fromScene?: boolean;
  asks: boolean;
  kind: ComposedLine["kind"];
  span?: string;
}

export function selectFollowUp(options: {
  entryId: string;
  reflection: ReflectionSnapshot;
  body: string;
  renderedPrompt?: string;
  previousBodies?: readonly string[];
  previousFollowUpIds?: readonly string[];
  previousSpan?: string;
  differentQuestionOffset?: number;
  turn?: 1 | 2 | 3;
  heavy?: boolean;
}): SelectedFollowUp {
  const {
    entryId,
    reflection,
    body,
    renderedPrompt,
    previousBodies = [],
    previousFollowUpIds = [],
    previousSpan,
    turn = previousFollowUpIds.length > 0 ? 2 : 1,
    heavy = false,
  } = options;
  void entryId;
  void previousBodies;
  const composed = composeGardenReply({
    text: body,
    renderedPrompt,
    previousSpan,
    turn,
    heavy,
  });
  const target =
    reflection.selectedTarget === "language-neutral"
      ? "language-neutral"
      : composed.asks
        ? "deepen"
        : reflection.selectedTarget;
  return {
    id: composed.id,
    target,
    renderedText: composed.renderedText,
    fromScene: composed.asks,
    asks: composed.asks,
    kind: composed.kind,
    span: composed.span,
  };
}

export function selectDailyOpeningPrompt(options: {
  category: PromptCategory;
  localDay: string;
  identitySeed?: string;
  alternateOffset?: number;
}): OpeningPrompt {
  const {
    category,
    localDay,
    identitySeed = "seed-journal",
    alternateOffset = 0,
  } = options;
  const prompts = getOpeningPrompts(category);
  const index =
    (seededIndex(
      `${PROMPT_LIBRARY_VERSION}|${identitySeed}|${localDay}|${category}`,
      prompts.length,
    ) +
      alternateOffset) %
    prompts.length;
  return prompts[index];
}

