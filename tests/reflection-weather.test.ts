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
});
