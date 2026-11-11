import { describe, expect, it } from "vitest";
import {
  evaluateReflection,
  extractWritingScene,
  selectFollowUp,
  weatherForEntry,
} from "../features/reflection";

const CONCERT =
  "I went out last night with my friends to a concert and I really enjoyed my time because my friends really took care of me.";

describe("writing scene follow-ups", () => {
  it("asks about friends taking care of you after a concert night", () => {
    const scene = extractWritingScene(CONCERT);
    expect(scene.causePhrase).toMatch(/friends/i);
    expect(scene.causePhrase).toMatch(/taking care of you/i);
    expect(scene.questions[0]?.text).toBe(
      "What is it about your friends taking care of you that made you feel like this?",
    );

    const reflection = evaluateReflection(CONCERT, { category: "open" });
    const followUp = selectFollowUp({
      entryId: "concert-night",
      reflection,
      body: CONCERT,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.id.startsWith("compose.")).toBe(true);
    expect(followUp.renderedText).toMatch(/took care of you/i);
    expect(followUp.renderedText).toMatch(/remember|took care of you/iu);
    expect(followUp.renderedText).not.toMatch(/“friends”/u);
  });

  it("cycles scene variants instead of falling back to Mad Libs", () => {
    const reflection = evaluateReflection(CONCERT, { category: "open" });
    const first = selectFollowUp({
      entryId: "concert-night",
      reflection,
      body: CONCERT,
    });
    const second = selectFollowUp({
      entryId: "concert-night",
      reflection,
      body: "They noticed I was tired and stayed with me.",
      previousFollowUpIds: [first.id],
      previousSpan: first.span,
      turn: 2,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.renderedText).toMatch(/stayed with you/i);
    expect(second.renderedText).toMatch(/\?/);
  });

  it("lets glad concert writing open more light", () => {
    expect(
      weatherForEntry({
        prompt: {
          id: "p",
          libraryVersion: "1",
          category: "open",
          renderedText: "Begin wherever your attention is resting.",
        },
        body: CONCERT,
      }).kind,
    ).toBe("sunbreak");
  });

  it("does not stuff a repeated noun into a generic card", () => {
    const body =
      "The garden felt peaceful. I returned to the garden after dinner.";
    const reflection = evaluateReflection(body, { category: "open" });
    const followUp = selectFollowUp({
      entryId: "garden-walk",
      reflection,
      body,
    });
    expect(followUp.renderedText.includes("“garden”")).toBe(false);
  });

  it("does not invent a scene from an empty page", () => {
    expect(extractWritingScene("").questions).toEqual([]);
    expect(extractWritingScene("ok").questions).toEqual([]);
    expect(extractWritingScene("I feel anxious.").questions).toEqual([]);
  });

  it("stays with imagining freezing before a meeting", () => {
    const body =
      "I feel anxious about the meeting tomorrow because I keep imagining I'll freeze.";
    const scene = extractWritingScene(body);
    const joined = scene.questions.map((question) => question.text).join("\n");
    expect(scene.causePhrase).toMatch(/imagining/i);
    expect(scene.causePhrase).toMatch(/freeze/i);
    expect(scene.questions[0]?.text).toBe(
      "What is it about imagining you'll freeze that made you feel like this?",
    );
    expect(joined).not.toMatch(/the situation/i);
    expect(joined).not.toMatch(/how does that make you feel/i);
    expect(joined).not.toMatch(/can you tell me more/i);
    for (const question of scene.questions) {
      expect(question.text.split("?").length).toBe(2);
    }

    const followUp = selectFollowUp({
      entryId: "freeze-meeting",
      reflection: evaluateReflection(body, { category: "feeling" }),
      body,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.renderedText).toMatch(/freeze/i);
    expect(followUp.renderedText).toMatch(/freeze/i);
    expect(followUp.renderedText).not.toMatch(/“anxious”/u);
  });

  it("stays with replaying what a manager said", () => {
    const body =
      "Work has been a lot. I keep replaying what my manager said in the hallway.";
    const scene = extractWritingScene(body);
    expect(scene.loopPhrase).toMatch(/manager/i);
    expect(scene.loopPhrase).toMatch(/hallway/i);
    expect(scene.questions[0]?.text).toMatch(
      /replaying what your manager said in the hallway/i,
    );
    expect(scene.questions.length).toBeGreaterThanOrEqual(2);

    const followUp = selectFollowUp({
      entryId: "manager-hallway",
      reflection: evaluateReflection(body, { category: "relationship" }),
      body,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.renderedText).toMatch(/manager/i);
    expect(followUp.renderedText).toMatch(/hallway|replaying/i);
    expect(followUp.renderedText).not.toMatch(/the situation/i);
  });

  it("stays with missing home in a quiet apartment", () => {
    const body =
      "I miss home tonight. The apartment is quiet in a way that feels honest.";
    const scene = extractWritingScene(body);
    const joined = scene.questions.map((question) => question.text).join("\n");
    expect(scene.questions[0]?.text).toMatch(/missing home/i);
    expect(joined).toMatch(/apartment|quiet/i);
    expect(joined).not.toMatch(/tonight\./i);
    expect(joined).not.toMatch(/the situation/i);
    expect(scene.questions.length).toBeGreaterThanOrEqual(2);

    const followUp = selectFollowUp({
      entryId: "quiet-apartment",
      reflection: evaluateReflection(body, { category: "open" }),
      body,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.renderedText).toMatch(/apartment/i);
  });

  it("names the meeting when feeling is only the doorway", () => {
    const body = "I feel anxious about the meeting tomorrow.";
    const joined = extractWritingScene(body)
      .questions.map((question) => question.text)
      .join("\n");
    expect(joined).toMatch(/meeting tomorrow/i);
    expect(joined).not.toMatch(/anxious/i);
  });

  it("turns “I felt sad and still grateful for the quiet in the kitchen.” into a scene question", () => {
    const body =
      "I felt sad and still grateful for the quiet in the kitchen.";
    const scene = extractWritingScene(body);
    const joined = scene.questions.map((question) => question.text).join("\n");
    expect(joined).toMatch(/the quiet|kitchen/i);
    expect(joined).not.toMatch(/the situation/i);
    expect(joined).not.toMatch(/how does that make you feel/i);
    expect(joined).not.toMatch(/can you tell me more/i);
    expect(joined).not.toMatch(/“kitchen”/u);
    for (const question of scene.questions) {
      expect(question.text.split("?").length).toBe(2);
    }

    const followUp = selectFollowUp({
      entryId: "quiet-kitchen",
      reflection: evaluateReflection(body, { category: "open" }),
      body,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.renderedText).toMatch(/the quiet|kitchen/i);
    expect(followUp.renderedText.split("?").length).toBe(2);
  });

  it("stays with sitting in the kitchen and does not invent one for “I feel anxious.”", () => {
    const body = "I sat in the kitchen and felt sad.";
    const followUp = selectFollowUp({
      entryId: "sat-kitchen",
      reflection: evaluateReflection(body, { category: "feeling" }),
      body,
    });
    expect(followUp.fromScene).toBe(true);
    expect(followUp.renderedText).toMatch(/in the kitchen/i);
    expect(followUp.renderedText).not.toMatch(/“kitchen”/u);
    expect(followUp.renderedText.split("?").length).toBe(2);
    expect(extractWritingScene("I feel anxious.").questions).toEqual([]);
  });
});
