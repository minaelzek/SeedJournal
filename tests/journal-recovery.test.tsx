import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalRitual, type JournalRitualDraft } from "../features/journal";

const restoredDraft: JournalRitualDraft = {
  stage: "writing",
  entry: {
    version: 1,
    kind: "entry",
    title: "",
    prompt: {
      id: "moment-1",
      libraryVersion: "1",
      category: "moment",
      renderedText: "What stayed with you?",
    },
    body: "A reflection that should remain safely resumable.",
    threads: [],
    tags: [],
    seedInsight: "",
    ritual: {
      conciseBodyOverride: false,
      conciseFollowUpOverride: false,
    },
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("journal recovery", () => {
  it("persists the ritual stage once without entering an autosave loop", async () => {
    vi.useFakeTimers();
    const onAutosave = vi.fn(
      async (draft: JournalRitualDraft) => {
        void draft;
      },
    );
    const view = render(
      <JournalRitual
        entryId="entry-recovery"
        localDay="2026-07-29"
        restoredDraft={restoredDraft}
        onAutosave={onAutosave}
        onComplete={async () => undefined}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(onAutosave).toHaveBeenCalledTimes(1);
    expect(onAutosave.mock.calls[0][0]).toMatchObject({
      stage: "writing",
      entry: { ritual: { stage: "writing" } },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(onAutosave).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
