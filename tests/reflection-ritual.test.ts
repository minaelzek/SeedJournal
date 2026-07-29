import { describe, expect, it } from "vitest";
import {
  createRitualState,
  ritualReducer,
} from "../features/journal/ritual-machine";
import { measureReflectionEligibility } from "../features/journal/text-metrics";

describe("journal ritual", () => {
  it("restores the prompt and exact stage from an encrypted draft payload", () => {
    const initial = createRitualState({
      entryId: "entry-1",
      localDay: "2026-07-29",
    });
    const writing = ritualReducer(initial, { type: "begin-writing" });
    const withBody = ritualReducer(writing, {
      type: "set-body",
      body: "Words that should survive a refresh.",
    });
    const restored = createRitualState(
      { entryId: "entry-1", localDay: "2026-07-29" },
      { stage: withBody.stage, entry: withBody.entry },
    );
    expect(restored.stage).toBe("writing");
    expect(restored.entry.body).toBe("Words that should survive a refresh.");
    expect(restored.entry.prompt.id).toBe(withBody.entry.prompt.id);
  });

  it("persists a selected follow-up and moves through authored stages", () => {
    let state = createRitualState({
      entryId: "entry-2",
      localDay: "2026-07-29",
      category: "feeling",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "This morning I felt unsettled after our conversation because it mattered.",
    });
    state = ritualReducer(state, { type: "offer-reflection" });
    const selectedId = state.entry.followUp?.id;
    expect(state.stage).toBe("reflection-offered");
    expect(selectedId).toBeTruthy();

    state = ritualReducer(state, {
      type: "answer-follow-up",
      response: "I may need a little time before I answer.",
    });
    state = ritualReducer(state, { type: "continue-from-follow-up" });
    state = ritualReducer(state, {
      type: "set-seed-insight",
      seedInsight: "Pause before answering.",
    });
    state = ritualReducer(state, { type: "continue-with-seed-insight" });
    state = ritualReducer(state, {
      type: "nurture",
      completionId: "completion-1",
    });

    expect(state.stage).toBe("nurtured");
    expect(state.entry.followUp?.id).toBe(selectedId);
    expect(state.entry.growth?.completionId).toBe("completion-1");
  });

  it("allows a deliberately concise reflection to continue as a small seed", () => {
    let state = createRitualState({
      entryId: "entry-3",
      localDay: "2026-07-29",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "Today was enough.",
    });
    expect(measureReflectionEligibility(state.entry.body).eligible).toBe(false);
    state = ritualReducer(state, { type: "keep-small-seed" });
    expect(state.entry.ritual.conciseBodyOverride).toBe(true);
    expect(state.stage).toBe("follow-up-skipped");
  });
});

