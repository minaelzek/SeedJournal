import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalRitual } from "../features/journal";
import {
  createVoiceCapture,
  joinVoiceText,
  speechRecognitionSupported,
  type VoiceTranscript,
} from "../features/journal/voiceCapture";

class FakeRecognition {
  static latest: FakeRecognition | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null =
    null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;

  constructor() {
    FakeRecognition.latest = this;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
    this.onend?.();
  }

  abort() {}
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  FakeRecognition.latest = null;
  delete (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe("voice capture", () => {
  it("is unavailable until a browser constructor exists", () => {
    expect(speechRecognitionSupported()).toBe(false);
    (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeRecognition;
    expect(speechRecognitionSupported()).toBe(true);
  });

  it("joins a transcript without doubling a space or an interim", () => {
    expect(joinVoiceText("", "hello", 20)).toBe("hello");
    expect(joinVoiceText("I sat", "down", 20)).toBe("I sat down");
    expect(joinVoiceText("I sat ", "down", 20)).toBe("I sat down");
    expect(joinVoiceText("I sat", " down", 20)).toBe("I sat down");
    expect(joinVoiceText("hello", " there", 8)).toBe("hello th");
  });

  it("replaces an interim with the final phrase and folds a reset list once", () => {
    (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeRecognition;
    const published: VoiceTranscript[] = [];
    const capture = createVoiceCapture({
      ontranscript: (update) => published.push(update),
      onerror: () => undefined,
      onend: () => undefined,
    });
    capture.start();
    const session = FakeRecognition.latest;
    expect(session?.continuous).toBe(true);
    expect(session?.interimResults).toBe(true);
    expect(session?.lang).toBe(navigator.language || "en-US");

    session?.onresult?.({
      results: [{ isFinal: false, 0: { transcript: "hel" } }],
    });
    session?.onresult?.({
      results: [{ isFinal: true, 0: { transcript: "hello" } }],
    });
    session?.onresult?.({
      results: [
        { isFinal: true, 0: { transcript: "hello" } },
        { isFinal: true, 0: { transcript: " world" } },
      ],
    });
    expect(published.map((item) => `${item.committed}${item.interim}`)).toEqual([
      "hel",
      "hello",
      "hello world",
    ]);

    session?.onresult?.({
      results: [{ isFinal: true, 0: { transcript: "there" } }],
    });
    expect(published.at(-1)?.committed).toBe("hello world there");
  });

  it("ignores a result that arrives after stop", () => {
    (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeRecognition;
    let calls = 0;
    const capture = createVoiceCapture({
      ontranscript: () => {
        calls += 1;
      },
      onerror: () => undefined,
      onend: () => undefined,
    });
    capture.start();
    const session = FakeRecognition.latest;
    capture.stop();
    session?.onresult?.({
      results: [{ isFinal: true, 0: { transcript: "late" } }],
    });
    expect(calls).toBe(0);
  });

  it("keeps typing available when dictation is missing", () => {
    render(
      <JournalRitual
        layout="card"
        entryId="voice-entry"
        localDay="2026-10-08"
        onComplete={async () => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();
    const entry = screen.getByLabelText("Journal entry");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toHaveProperty("disabled", true);
    fireEvent.change(entry, {
      target: { value: "I noticed the room get quiet." },
    });
    expect(screen.queryByRole("button", { name: "Go deeper" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Leave with the tree" })).toBeNull();
    expect(send).toHaveProperty("disabled", false);
    expect(
      screen.queryByText(/This browser may send audio to its own speech service/),
    ).toBeNull();
  });

  it("asks before leaving with the tree", () => {
    const onComplete = vi.fn(async () => undefined);
    render(
      <JournalRitual
        layout="card"
        entryId="leave-entry"
        localDay="2026-10-08"
        onComplete={onComplete}
      />,
    );
    fireEvent.change(screen.getByLabelText("Journal entry"), {
      target: {
        value: "I felt sad and still grateful for the quiet in the kitchen.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/what was that quiet making room for/i)).toBeTruthy();
  });

  it("asks from the writing after a pause, without a button", async () => {
    vi.useFakeTimers();
    const view = render(
      <JournalRitual
        layout="card"
        entryId="pause-entry"
        localDay="2026-10-08"
        onComplete={async () => undefined}
      />,
    );
    const entry = screen.getByLabelText("Journal entry");
    fireEvent.change(entry, {
      target: {
        value: "I felt sad and still grateful for the quiet in the kitchen.",
      },
    });
    act(() => {
      entry.focus();
      fireEvent.blur(entry);
      if (document.activeElement === entry) entry.blur();
    });
    expect(view.container.querySelector(".sj-converse")?.getAttribute("data-stage")).toBe(
      "writing",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(view.container.querySelector(".sj-converse")?.getAttribute("data-stage")).toBe(
      "reflection-offered",
    );
    expect(view.container.querySelector("#sj-converse-ask")?.textContent).toMatch(
      /the quiet in the kitchen/i,
    );
    expect(screen.queryByLabelText("One line to carry, if you want")).toBeNull();
    view.unmount();
    vi.useRealTimers();
  });
});
