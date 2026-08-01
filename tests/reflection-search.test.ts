import { describe, expect, it } from "vitest";
import type { DecryptedJournalEntry } from "../features/journal/types";
import { searchEntries } from "../features/archive/search";

function entry(
  id: string,
  body: string,
  category: "moment" | "change",
  updatedAt: number,
): DecryptedJournalEntry {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    payload: {
      version: 1,
      kind: "entry",
      title: "",
      prompt: {
        id: `prompt-${id}`,
        libraryVersion: "1",
        category,
        renderedText: "A prompt",
      },
      body,
      threads: [],
      tags: id === "one" ? ["Work"] : [],
      seedInsight: "",
      ritual: {
        conciseBodyOverride: false,
        conciseFollowUpOverride: false,
      },
    },
  };
}

describe("local decrypted archive search", () => {
  const entries = [
    entry("one", "A thoughtful morning at the café.", "moment", 100),
    entry("two", "Change is arriving slowly.", "change", 200),
  ];

  it("matches normalized text and combines filters", () => {
    expect(searchEntries(entries, { query: "cafe" }).map((item) => item.id)).toEqual([
      "one",
    ]);
    expect(
      searchEntries(entries, { category: "change", query: "slowly" }).map(
        (item) => item.id,
      ),
    ).toEqual(["two"]);
    expect(searchEntries(entries, { tag: "work" }).map((item) => item.id)).toEqual([
      "one",
    ]);
  });

  it("returns newest entries first", () => {
    expect(searchEntries(entries).map((item) => item.id)).toEqual([
      "two",
      "one",
    ]);
  });

  it("indexes the deeper reflection without exposing it outside local search", () => {
    const layered = entry("layered", "I am sitting with this.", "moment", 300);
    layered.payload.secondFollowUp = {
      id: "follow-up-layered",
      target: "deepen",
      renderedText: "What can remain unresolved?",
      response: "I can allow uncertainty without abandoning honesty.",
      skipped: false,
    };

    expect(
      searchEntries([...entries, layered], { query: "abandoning honesty" }).map(
        (item) => item.id,
      ),
    ).toEqual(["layered"]);
  });
});
