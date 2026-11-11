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

  it("hears implicit affect in a short sentence like “today was a great day”", () => {
    const result = evaluateReflection("Today was a great day.", {
      category: "moment",
    });
    expect(result.mode).toBe("english-rules");
    expect(result.strengths.emotion).toBeGreaterThan(0);
    expect(result.selectedTarget).toBe("emotion");
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

  it("does not count a negated emotion word such as “I am not sad”", () => {
    const result = evaluateReflection("I am not sad about the weather.");
    expect(result.strengths.emotion).toBe(0);
    const distant = evaluateReflection(
      "I am not really that very sad today.",
    );
    expect(distant.strengths.emotion).toBe(0);
  });

  it("does not score “I felt sad sad sad” higher than “I felt sad”", () => {
    const once = evaluateReflection("I felt sad.");
    const repeated = evaluateReflection("I felt sad sad sad.");
    expect(repeated.strengths.emotion).toBe(once.strengths.emotion);
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

  it("lets a follow-up and a carry line raise three signals to 4 and four signals to 6", () => {
    const withSignals = (count: number) => ({
      ...englishReflection,
      strengths: {
        context: (count > 0 ? 1 : 0) as 0 | 1,
        emotion: (count > 1 ? 1 : 0) as 0 | 1,
        meaning: (count > 2 ? 1 : 0) as 0 | 1,
        perspective: (count > 3 ? 1 : 0) as 0 | 1,
        integration: (count > 4 ? 1 : 0) as 0 | 1,
      },
    });

    expect(
      mapReflectionToGrowth({
        entryId: "entry-1",
        reflection: englishReflection,
        body: "A complete entry.",
        followUpAnswered: true,
        seedInsightAdded: true,
      }),
    ).toMatchObject({ memoryForm: "luminous-blossom", growthUnits: 6 });

    expect(
      mapReflectionToGrowth({
        entryId: "entry-four",
        reflection: withSignals(4),
        body: "Four signals, both stages answered.",
        followUpAnswered: true,
        seedInsightAdded: true,
      }),
    ).toMatchObject({ memoryForm: "luminous-blossom", growthUnits: 6, signalCount: 4 });

    expect(
      mapReflectionToGrowth({
        entryId: "entry-four-open",
        reflection: withSignals(4),
        body: "Four signals, nothing answered after the page.",
        followUpAnswered: false,
        seedInsightAdded: false,
      }),
    ).toMatchObject({ memoryForm: "blossom", growthUnits: 4 });

    expect(
      mapReflectionToGrowth({
        entryId: "entry-three",
        reflection: withSignals(3),
        body: "Three signals, both stages answered.",
        followUpAnswered: true,
        seedInsightAdded: true,
      }),
    ).toMatchObject({ memoryForm: "blossom", growthUnits: 4, signalCount: 3 });

    expect(
      mapReflectionToGrowth({
        entryId: "entry-three-open",
        reflection: withSignals(3),
        body: "Three signals, nothing answered after the page.",
        followUpAnswered: false,
        seedInsightAdded: false,
      }),
    ).toMatchObject({ memoryForm: "bud", growthUnits: 2 });

    const floor = mapReflectionToGrowth({
      entryId: "entry-floor",
      reflection: withSignals(0),
      body: "No signals.",
      followUpAnswered: false,
      seedInsightAdded: false,
    });
    expect(floor.growthUnits).toBe(1);
    expect(floor.growthUnits).toBeGreaterThan(0);
  });

  it("still grows a leaf when the writing is heavy or thin", () => {
    const thin = mapReflectionToGrowth({
      entryId: "entry-heavy",
      body: "I felt so sad and empty after the loss.",
      followUpAnswered: false,
      seedInsightAdded: false,
    });
    expect(thin.growthUnits).toBeGreaterThanOrEqual(1);
    expect(thin.memoryForm).toBe("leaf");
    expect([1, 2, 4, 6]).toContain(thin.growthUnits);
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

