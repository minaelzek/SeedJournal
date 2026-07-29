import {
  getFollowUpPrompts,
  getOpeningPrompts,
  PROMPT_LIBRARY_VERSION,
  type FollowUpPrompt,
  type OpeningPrompt,
} from "@/data/prompts";
import type {
  PromptCategory,
  ReflectionSnapshot,
} from "@/lib/contracts";
import { extractLongitudinalAnchor, extractSafeAnchor } from "./anchors";
import { seededIndex, stableHash } from "./hash";

export interface SelectedFollowUp {
  id: string;
  target: FollowUpPrompt["target"];
  renderedText: string;
  anchor?: string;
}

function orderPrompts(
  prompts: readonly FollowUpPrompt[],
  seed: string,
): FollowUpPrompt[] {
  return [...prompts].sort(
    (left, right) =>
      stableHash(`${seed}|${left.id}`) - stableHash(`${seed}|${right.id}`) ||
      left.id.localeCompare(right.id),
  );
}

export function selectFollowUp(options: {
  entryId: string;
  reflection: ReflectionSnapshot;
  body: string;
  previousBodies?: readonly string[];
  previousFollowUpIds?: readonly string[];
  differentQuestionOffset?: number;
}): SelectedFollowUp {
  const {
    entryId,
    reflection,
    body,
    previousBodies = [],
    previousFollowUpIds = [],
    differentQuestionOffset = 0,
  } = options;
  const target = reflection.selectedTarget;
  const seed = `${entryId}|${reflection.engineVersion}|${target}|${PROMPT_LIBRARY_VERSION}`;
  const ordered = orderPrompts(getFollowUpPrompts(target), seed);
  const recent = new Set(previousFollowUpIds.slice(0, 7));
  const fresh = ordered.filter((prompt) => !recent.has(prompt.id));
  const pool = fresh.length > 0 ? fresh : ordered;
  const prompt = pool[differentQuestionOffset % pool.length] ?? ordered[0];
  const anchor =
    extractSafeAnchor(body) ??
    extractLongitudinalAnchor(body, previousBodies.slice(0, 10));

  return {
    id: prompt.id,
    target,
    renderedText:
      anchor && prompt.anchoredText
        ? prompt.anchoredText.replace("{anchor}", anchor)
        : prompt.text,
    ...(anchor && prompt.anchoredText ? { anchor } : {}),
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

