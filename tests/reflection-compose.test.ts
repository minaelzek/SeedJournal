import { describe, expect, it } from "vitest";
import { composeGardenReply } from "../features/reflection/compose";

const DEEP =
  "I keep saying yes to my sister because I am afraid she will think I do not care, but every time I do I feel smaller, and I think I have been calling that love.";

function reply(text: string, extra: Parameters<typeof composeGardenReply>[0] = { text }) {
  return composeGardenReply({ ...extra, text: extra.text ?? text });
}

function readingOf(rendered: string): string {
  const gap = rendered.lastIndexOf(". ");
  if (gap < 0 || !rendered.includes("?")) return rendered;
  return rendered.slice(0, gap + 1);
}

describe("garden reading", () => {
  it("reads a deep choice instead of quoting a noun", () => {
    const line = composeGardenReply({ text: DEEP });
    const reading = readingOf(line.renderedText);
    expect(line.asks).toBe(true);
    expect(reading.toLowerCase()).toMatch(/afraid/);
    expect(reading.toLowerCase()).toMatch(/smaller/);
    expect(reading.toLowerCase()).toMatch(/sister/);
    expect(reading.toLowerCase()).toMatch(/calling that love/);
    expect(line.renderedText.split("?").length).toBe(2);
    expect(line.renderedText.split("?")[0]?.toLowerCase()).toMatch(/love/);
    expect(reading.split(/(?<=[.!?])\s+/u).length).toBeLessThanOrEqual(2);
    expect(reading.split(/\s+/u).length).toBeLessThan(45);
    expect(line.renderedText).not.toMatch(/every time i do/iu);
    expect(line.renderedText).not.toMatch(
      /at stake|5%|truest|usually pass by|standing next to|what part of that|underneath|in your body|leaves you smaller/iu,
    );
  });

  it("holds both feelings in the kitchen and asks what the quiet was for", () => {
    const line = composeGardenReply({
      text: "I felt sad and still grateful for the quiet in the kitchen.",
    });
    expect(line.renderedText).toBe(
      "You felt sad, and still grateful for the quiet in the kitchen. What was that quiet making room for?",
    );
    expect(line.renderedText).not.toMatch(/what else was in that place/iu);
  });

  it("reads the concert as care, not a clipped because-clause", () => {
    const line = composeGardenReply({
      text: "I went out last night with my friends to a concert and I really enjoyed my time because my friends really took care of me.",
    });
    expect(line.renderedText.toLowerCase()).toMatch(/took care|care/);
    expect(line.renderedText.toLowerCase()).toMatch(/friend/);
    expect(line.asks).toBe(true);
    expect(line.renderedText).not.toMatch(/your friends taking care of you that made you feel/iu);
  });

  it("lets anxious stay small and does not invent a place", () => {
    const line = composeGardenReply({ text: "I feel anxious." });
    expect(line.renderedText.toLowerCase()).toMatch(/anxious/);
    expect(line.renderedText).not.toMatch(/kitchen|meeting|hallway|standing next to/iu);
    expect(line.renderedText).toMatch(/what is the anxious about/iu);
    expect(line.asks).toBe(true);
  });

  it("does not speak a copied opening", () => {
    const prompt = "Begin wherever your attention is resting.";
    const line = composeGardenReply({ text: prompt, renderedPrompt: prompt });
    expect(line.renderedText).toBe("The page can stay this quiet.");
    expect(line.asks).toBe(false);
  });

  it("does not treat a negated feeling as the feeling", () => {
    const line = composeGardenReply({ text: "I am not sad about the weather." });
    expect(line.renderedText.toLowerCase()).toMatch(/not sad/);
    expect(line.renderedText).not.toMatch(/what about the weather is still/iu);
    expect(line.asks).toBe(true);
  });

  it("stays with the freeze before the meeting", () => {
    const line = composeGardenReply({
      text: "I feel anxious about the meeting tomorrow because I keep imagining I'll freeze.",
    });
    expect(line.renderedText.toLowerCase()).toMatch(/freeze/);
    expect(line.renderedText.toLowerCase()).toMatch(/meeting/);
    expect(line.asks).toBe(true);
    expect(line.renderedText).not.toMatch(/at stake|the situation/iu);
  });

  it("asks what the hallway replay is trying to settle", () => {
    const line = composeGardenReply({
      text: "Work has been a lot. I keep replaying what my manager said in the hallway.",
    });
    expect(line.renderedText.toLowerCase()).toMatch(/replaying/);
    expect(line.renderedText.toLowerCase()).toMatch(/manager|hallway/);
    expect(line.renderedText).toMatch(/replaying|stay with that/iu);
  });

  it("asks what the notes were asking", () => {
    const line = composeGardenReply({
      text: "This morning I sat with my notes and felt tired.",
    });
    expect(line.renderedText.toLowerCase()).toMatch(/notes/);
    expect(line.renderedText.toLowerCase()).toMatch(/tired/);
    expect(line.renderedText).toMatch(/asking of you/iu);
  });

  it("reads a second turn from the answer, then stops", () => {
    const first = composeGardenReply({
      text: "I went out last night with my friends to a concert and I really enjoyed my time because my friends really took care of me.",
    });
    const second = composeGardenReply({
      text: "They noticed I was tired and stayed with me.",
      previousSpan: first.span,
      turn: 2,
    });
    expect(second.renderedText.toLowerCase()).toMatch(/stayed|tired/);
    expect(second.asks).toBe(true);
    expect(second.renderedText).not.toBe(first.renderedText);
    const third = composeGardenReply({
      text: "The room got quiet after that.",
      previousSpan: second.span,
      turn: 3,
    });
    expect(third.asks).toBe(false);
    expect(third.renderedText).toBe("That can stay as it is.");
  });

  it("releases a thin answer", () => {
    const line = composeGardenReply({ text: "I don't know.", turn: 2 });
    expect(line.renderedText).toBe("That can stay as it is.");
  });

  it("quotes another script and does not ask in English", () => {
    const page = "今日は静かな公園を歩きながら、最近の変化についてゆっくり考えました。";
    const line = composeGardenReply({ text: page });
    expect(line.asks).toBe(false);
    expect(line.renderedText).toContain("静かな公園");
    expect(line.renderedText).not.toMatch(/\bwhat\b/iu);
  });

  it("offers a door out of explicit distress and does not analyze it", () => {
    const line = composeGardenReply({ text: "I want to die." });
    expect(line.renderedText).toBe(
      "You can leave this with the tree. You do not have to write more.",
    );
    expect(line.asks).toBe(false);
    expect(line.span).toBeUndefined();
  });

  it("does not invent a meeting when someone says they will meet", () => {
    const line = composeGardenReply({
      text: "I keep imagining the picnic will be easy. I will meet her at the park.",
    });
    expect(line.renderedText).toMatch(/picnic/i);
    expect(line.renderedText).toMatch(/meet her at the park/i);
    expect(line.renderedText).toMatch(/what would easy look like at the picnic/iu);
    expect(line.renderedText).not.toMatch(/freez|the meeting/iu);
  });

  it("does not turn never loved into not loved", () => {
    const line = composeGardenReply({
      text: "I never loved the quiet in the kitchen.",
    });
    expect(line.renderedText).not.toMatch(/you are not loved/iu);
    expect(line.renderedText.toLowerCase()).toMatch(/never loved/);
  });

  it("does not invent tired or someone when a dog stayed", () => {
    const line = composeGardenReply({ text: "The dog stayed with me." });
    expect(line.renderedText.toLowerCase()).toMatch(/the dog stayed with you/);
    expect(line.renderedText).not.toMatch(/tired|someone/iu);
  });

  it("says you were, not you was", () => {
    const line = composeGardenReply({
      text: "I was glad of the extra ten minutes with my book, because nobody needed me yet.",
    });
    expect(line.renderedText).not.toMatch(/you was/iu);
    expect(line.renderedText.toLowerCase()).toMatch(/glad/);
    expect(line.renderedText.toLowerCase()).toMatch(/book/);
  });

  it("hears a claim about meaning instead of asking what to keep", () => {
    const line = composeGardenReply({
      text: "For without God, life is meaningless.",
    });
    expect(line.renderedText).toBe(
      "You are tying life's meaning to God. What meaning are you saying God gives to life?",
    );
    expect(line.renderedText).not.toMatch(/want to keep/iu);
  });

  it("acknowledges a short finished line instead of going silent", () => {
    const line = composeGardenReply({ text: "Today was enough." });
    expect(line.kind).not.toBe("silent");
    expect(line.asks).toBe(true);
    expect(line.renderedText).toBe("Today was enough. What made it enough?");
    expect(line.renderedText).not.toMatch(/stay this small/iu);
  });

  it("acknowledges sadness without opening the distress door", () => {
    const line = composeGardenReply({ text: "I feel sad." });
    expect(line.renderedText).not.toBe(
      "You can leave this with the tree. You do not have to write more.",
    );
    expect(line.renderedText.toLowerCase()).toMatch(/sad/);
    expect(line.renderedText).toMatch(/what is the sad about/iu);
    expect(line.renderedText).not.toMatch(/stay this small/iu);
    expect(line.asks).toBe(true);
  });

  it("keeps the letter, the kinder, and the don't", () => {
    const line = composeGardenReply({
      text: "I almost left the letter in the drawer. I told myself waiting was kinder. I sent it anyway, and I keep hearing the version of me that said don't.",
    });
    const reading = readingOf(line.renderedText);
    expect(reading.toLowerCase()).toMatch(/letter/);
    expect(reading.toLowerCase()).toMatch(/kinder/);
    expect(line.renderedText.toLowerCase()).toMatch(/don['’]t/);
    expect(reading.split(/(?<=[.!?])\s+/u).length).toBeLessThanOrEqual(2);
    expect(reading.split(/\s+/u).length).toBeLessThan(45);
    expect(line.renderedText.split("?").length).toBe(2);
    expect(line.renderedText).toMatch(/what is the don't you keep hearing/iu);
  });

  it("keeps the folded sweater and the laugh", () => {
    const line = composeGardenReply({
      text: "I sat on the floor of her room and folded the last sweater. I miss the way she laughed at nothing.",
    });
    expect(line.renderedText.toLowerCase()).toMatch(/sweater/);
    expect(line.renderedText.toLowerCase()).toMatch(/laugh/);
    expect(line.renderedText.toLowerCase()).toMatch(/fold/);
    expect(line.renderedText.split("?").length).toBe(2);
    expect(readingOf(line.renderedText).split(/\s+/u).length).toBeLessThan(45);
  });

  it("keeps glad and the book when an earlier didn't does not govern them", () => {
    const line = composeGardenReply({
      text: "The train was late and I didn't mind. I was glad of the extra ten minutes with my book, because nobody needed me yet.",
    });
    expect(line.renderedText).not.toMatch(/you was/iu);
    expect(line.renderedText.toLowerCase()).toMatch(/you were/);
    expect(line.renderedText.toLowerCase()).toMatch(/glad/);
    expect(line.renderedText.toLowerCase()).toMatch(/book/);
    expect(line.renderedText.toLowerCase()).toMatch(/didn['’]t mind/);
    expect(line.renderedText).not.toMatch(/what else sits beside that reason/iu);
    expect(line.asks).toBe(true);
  });

  it("gives explicit distress the door and no question", () => {
    const phrases = [
      "I want to die.",
      "I want to kill myself.",
      "I should kill myself.",
      "I want to end my life.",
      "I keep thinking about ending it.",
      "I want to end it all.",
      "I feel suicidal.",
      "This is about suicide.",
      "I wish I were dead.",
      "I don't want to be alive.",
      "I want to hurt myself.",
      "I don't want to live.",
    ];
    for (const phrase of phrases) {
      const line = composeGardenReply({ text: phrase, turn: 2 });
      expect(line.renderedText).toBe(
        "You can leave this with the tree. You do not have to write more.",
      );
      expect(line.asks).toBe(false);
      expect(line.span).toBeUndefined();
      expect(line.renderedText).not.toMatch(/[“”]/u);
    }
  });

  it("does not ask again when the first page is heavy", () => {
    const line = composeGardenReply({
      text: "I sat with it a little longer.",
      turn: 2,
      heavy: true,
    });
    expect(line.renderedText).toBe("That can stay as it is.");
    expect(line.asks).toBe(false);
  });

  it("prints the deep replies for review", () => {
    const samples = [
      DEEP,
      "I felt sad and still grateful for the quiet in the kitchen.",
      "I went out last night with my friends to a concert and I really enjoyed my time because my friends really took care of me.",
    ];
    for (const sample of samples) {
      expect(composeGardenReply({ text: sample }).renderedText.length).toBeGreaterThan(20);
    }
    void reply;
  });
});
