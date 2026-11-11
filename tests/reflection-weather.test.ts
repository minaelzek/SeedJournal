import { describe, expect, it } from "vitest";
import type { JournalEntryPayloadV1 } from "../lib/contracts";
import { weatherForEntry } from "../features/reflection";

function entry(
  selectedTarget: NonNullable<
    JournalEntryPayloadV1["reflection"]
  >["selectedTarget"],
): Pick<JournalEntryPayloadV1, "prompt" | "reflection"> {
  return {
    prompt: {
      id: "weather-test",
      libraryVersion: "1",
      category: "open",
      renderedText: "What is here?",
    },
    reflection: {
      engineVersion: "1",
      mode:
        selectedTarget === "language-neutral"
          ? "language-neutral"
          : "english-rules",
      strengths: {
        context: 0,
        emotion: 0,
        meaning: 0,
        perspective: 0,
        integration: 0,
      },
      selectedTarget,
    },
  };
}

describe("garden weather", () => {
  it("maps local reflection analysis to non-judgmental atmosphere", () => {
    expect(weatherForEntry(entry("emotion")).kind).toBe("mist");
    expect(weatherForEntry(entry("perspective")).kind).toBe("breeze");
    expect(weatherForEntry(entry("meaning")).kind).toBe("sunbreak");
  });

  it("always returns a calm atmosphere when no reflection exists", () => {
    expect(weatherForEntry().label).toBe("Quiet air");
    expect(weatherForEntry(entry("language-neutral")).kind).toBe("still");
  });

  it("lets heavy writing bring soft rain without scoring the writer", () => {
    const heavy = {
      ...entry("emotion"),
      body: "I felt so sad and empty after the loss. I keep crying.",
    };
    const weather = weatherForEntry(heavy);
    expect(weather.kind).toBe("rain");
    expect(weather.label).toBe("Soft rain");
    expect(weather.description.toLowerCase()).not.toMatch(/score|grade|sadness/);
  });

  it("keeps a mixed day in mist so the tree is not judged", () => {
    const mixed = {
      ...entry("meaning"),
      body: "I felt sad and empty, and I am also grateful it happened.",
    };
    expect(weatherForEntry(mixed).kind).toBe("mist");
    expect(weatherForEntry(mixed).label).toBe("Soft mist");
  });

  it("does not rain on a negated sadness, and anxious air stays restless", () => {
    const negated = {
      ...entry("emotion"),
      body: "I am not sad about the weather.",
    };
    expect(weatherForEntry(negated).kind).not.toBe("rain");
    const anxious = {
      ...entry("context"),
      body: "I feel anxious and worried.",
    };
    expect(weatherForEntry(anxious).kind).toBe("restless");
    const numb = {
      ...entry("emotion"),
      body: "I feel numb and far away.",
    };
    expect(weatherForEntry(numb).kind).not.toBe("rain");
  });

  it("lets glad writing open more light", () => {
    const glad = {
      ...entry("context"),
      body: "I am grateful and happy. Today felt warm and peaceful.",
    };
    expect(weatherForEntry(glad).kind).toBe("sunbreak");
  });
});
