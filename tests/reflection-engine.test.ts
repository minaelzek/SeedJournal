import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_PROMPTS,
  OPENING_PROMPTS,
} from "../data/prompts/library";
import {
  evaluateReflection,
  extractLongitudinalAnchor,
  extractSafeAnchor,
  getReflectionMode,
  mapReflectionToGrowth,
  selectDailyOpeningPrompt,
  selectFollowUp,
} from "../features/reflection";

describe("versioned prompt library", () => {
  it("ships at least eight opening prompts for every path", () => {
    Object.values(OPENING_PROMPTS).forEach((prompts) => {
      expect(prompts.length).toBeGreaterThanOrEqual(8);
      expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(
        prompts.length,
      );
    });
  });

  it("ships at least six prompts for every reflection target", () => {
    Object.values(FOLLOW_UP_PROMPTS).forEach((prompts) => {
      expect(prompts.length).toBeGreaterThanOrEqual(6);
    });
  });

  it("selects the daily opening deterministically", () => {
    const input = {
      category: "moment" as const,
      localDay: "2026-07-29",
      identitySeed: "account-1",
    };
    expect(selectDailyOpeningPrompt(input)).toEqual(
      selectDailyOpeningPrompt(input),
    );
    expect(
      selectDailyOpeningPrompt({ ...input, alternateOffset: 1 }).id,
    ).not.toEqual(selectDailyOpeningPrompt(input).id);
  });
});

describe("private reflection engine", () => {
  it("finds independently evidenced signals without using length as evidence", () => {
    const body =
      "This morning I sat in the kitchen with my sister. I felt anxious and my chest was tight because her words mattered to me. Maybe I misunderstood part of what she meant, and I can be kind to myself while I ask. Tomorrow I will call her and listen before answering.";
    const result = evaluateReflection(body, { category: "relationship" });
    expect(result.mode).toBe("english-rules");
    expect(result.strengths).toEqual({
      context: 2,
      emotion: 2,
      meaning: 2,
      perspective: 2,
      integration: 2,
    });
    expect(result.selectedTarget).toBe("deepen");
  });

  it("does not treat a long but unreflective string as deep", () => {
    const result = evaluateReflection(
      "table table table table table table table table table table table table table table table table",
    );
    expect(Object.values(result.strengths).every((value) => value === 0)).toBe(
      true,
    );
  });

  it("removes copied opening prompt text from evidence", () => {
    const prompt = "What happened today that mattered because you felt sad?";
    const result = evaluateReflection(prompt, {
      category: "moment",
      renderedPrompt: prompt,
    });
    expect(result.strengths).toEqual({
      context: 0,
      emotion: 0,
      meaning: 0,
      perspective: 0,
      integration: 0,
    });
  });

  it("uses a language-neutral mode for unsupported scripts", () => {
    const body =
      "今日は静かな公園を歩きながら、最近の変化についてゆっくり考えました。まだ答えはありませんが、この時間を大切にしたいです。";
    expect(getReflectionMode(body)).toBe("language-neutral");
    expect(evaluateReflection(body).selectedTarget).toBe("language-neutral");
  });
});

describe("safe contextual selection", () => {
  it("extracts a repeated safe anchor but excludes sensitive anchors", () => {
    expect(
      extractSafeAnchor(
        "The garden felt peaceful. I returned to the garden after dinner.",
      ),
    ).toBe("garden");
    expect(
      extractSafeAnchor(
        "The diagnosis changed everything. The diagnosis is all I can name.",
      ),
    ).toBeUndefined();
  });

  it("recognizes a longitudinal anchor only after two prior entries", () => {
    expect(
      extractLongitudinalAnchor("Change feels close today.", [
        "I noticed change at work.",
        "The shape of change is unfamiliar.",
        "A separate memory.",
      ]),
    ).toBe("change");
  });

  it("is deterministic and avoids recent follow-ups when possible", () => {
    const reflection = evaluateReflection(
      "Today I walked home after work and noticed the quiet street.",
      { category: "moment" },
    );
    const first = selectFollowUp({
      entryId: "entry-1",
      reflection,
      body: "Today I walked home after work and noticed the quiet street.",
    });
    const again = selectFollowUp({
      entryId: "entry-1",
      reflection,
      body: "Today I walked home after work and noticed the quiet street.",
    });
    const avoided = selectFollowUp({
      entryId: "entry-1",
      reflection,
      body: "Today I walked home after work and noticed the quiet street.",
      previousFollowUpIds: [first.id],
    });
    expect(first).toEqual(again);
    expect(avoided.id).not.toBe(first.id);
  });
});

describe("growth mapping", () => {
  const englishReflection = {
    engineVersion: "1" as const,
    mode: "english-rules" as const,
    selectedTarget: "deepen" as const,
    strengths: {
      context: 1 as const,
      emotion: 1 as const,
      meaning: 1 as const,
      perspective: 1 as const,
      integration: 1 as const,
    },
  };

  it("creates a luminous blossom only when all signals and authored stages exist", () => {
    expect(
      mapReflectionToGrowth({
        entryId: "entry-1",
        reflection: englishReflection,
        body: "A complete entry.",
        followUpAnswered: true,
        seedInsightAdded: true,
      }),
    ).toMatchObject({ memoryForm: "luminous-blossom", growthUnits: 6 });
  });

  it("lets language-neutral writers reach every tier through ritual completion", () => {
    const reflection = {
      ...englishReflection,
      mode: "language-neutral" as const,
      selectedTarget: "language-neutral" as const,
    };
    expect(
      mapReflectionToGrowth({
        entryId: "entry-2",
        reflection,
        body: "静かな一日について書きました。",
        followUpAnswered: true,
        seedInsightAdded: true,
        languageNeutralCompletionConfirmed: true,
      }),
    ).toMatchObject({ memoryForm: "luminous-blossom", growthUnits: 6 });
  });
});

