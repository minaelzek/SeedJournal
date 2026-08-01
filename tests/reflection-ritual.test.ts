import { describe, expect, it } from "vitest";
import {
  createRitualState,
  ritualReducer,
} from "../features/journal/ritual-machine";
import {
  ritualNurturedCopy,
  ritualProgress,
} from "../features/journal/ritualProgress";
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

  it("offers one adaptive second layer and then closes the deepening loop", () => {
    let state = createRitualState({
      entryId: "entry-deepening",
      localDay: "2026-07-30",
      category: "relationship",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body:
        "After our conversation I felt defensive, but I think I was protecting how much the relationship matters to me.",
    });
    state = ritualReducer(state, { type: "offer-reflection" });
    const firstQuestionId = state.entry.followUp?.id;
    state = ritualReducer(state, {
      type: "answer-follow-up",
      response:
        "Underneath the defensiveness I felt hurt and afraid of being misunderstood.",
    });
    state = ritualReducer(state, { type: "offer-second-reflection" });

    expect(state.stage).toBe("second-reflection-offered");
    expect(state.entry.secondFollowUp?.id).toBeTruthy();
    expect(state.entry.secondFollowUp?.id).not.toBe(firstQuestionId);

    state = ritualReducer(state, {
      type: "answer-second-follow-up",
      response:
        "I can ask for clarity without treating the conversation like a threat.",
    });
    state = ritualReducer(state, {
      type: "continue-from-second-follow-up",
    });

    expect(state.stage).toBe("second-reflection-answered");
    expect(state.entry.reflection).toBeTruthy();
  });

  it("schedules an optional encrypted return bud for the next local day", () => {
    let state = createRitualState({
      entryId: "entry-return-bud",
      localDay: "2026-12-31",
    });
    state = ritualReducer(state, {
      type: "set-seed-insight",
      seedInsight: "I can let this be unfinished.",
    });
    state = ritualReducer(state, {
      type: "set-return-bud",
      scheduled: true,
    });

    expect(state.entry.returnBud).toEqual({
      dueLocalDay: "2027-01-01",
      state: "waiting",
    });

    state = ritualReducer(state, {
      type: "set-return-bud",
      scheduled: false,
    });
    expect(state.entry.returnBud).toBeUndefined();
  });

  it("opens a revisit as a continuing conversation with the tree", () => {
    const state = createRitualState({
      entryId: "entry-revisit",
      localDay: "2026-07-30",
      kind: "revisit",
      parentEntryId: "entry-origin",
    });

    expect(state.category).toBe("change");
    expect(state.entry.prompt.renderedText).toBe(
      "You left this with the tree. What feels different now?",
    );
    expect(state.entry.parentEntryId).toBe("entry-origin");
  });

  it("maps ritual stages onto a three-beat progress path without score language", () => {
    expect(ritualProgress("writing")).toMatchObject({
      activeStep: 0,
      label: "Arrive",
      stepNumber: 1,
      stepCount: 3,
    });
    expect(ritualProgress("reflection-offered").label).toBe("Reflect");
    expect(ritualProgress("second-reflection-offered").activeStep).toBe(1);

    // SeedInsightStep is mounted for answered follow-ups — must show Carry.
    expect(ritualProgress("follow-up-answered")).toMatchObject({
      activeStep: 2,
      label: "Carry",
      stepNumber: 3,
    });
    expect(ritualProgress("second-reflection-answered")).toMatchObject({
      activeStep: 2,
      label: "Carry",
    });
    expect(ritualProgress("follow-up-skipped").label).toBe("Carry");
    expect(ritualProgress("second-reflection-skipped").activeStep).toBe(2);
    expect(ritualProgress("seed-insight-added")).toMatchObject({
      activeStep: 2,
      label: "Carry",
    });
    expect(ritualProgress("nurtured").label).toBe("Carry");

    // Align progress with the real reducer path into SeedInsightStep.
    // answer-follow-up only stores text; continue-from-follow-up advances stage.
    let state = createRitualState({
      entryId: "progress-path",
      localDay: "2026-07-30",
      category: "feeling",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "This morning I felt unsettled after our conversation because it mattered.",
    });
    state = ritualReducer(state, { type: "offer-reflection" });
    expect(state.stage).toBe("reflection-offered");
    expect(ritualProgress(state.stage).label).toBe("Reflect");
    state = ritualReducer(state, {
      type: "answer-follow-up",
      response: "I may need a little time before I answer.",
    });
    // Still on the Reflect step while answering in FollowUpStep.
    expect(state.stage).toBe("reflection-offered");
    expect(ritualProgress(state.stage).label).toBe("Reflect");
    state = ritualReducer(state, { type: "continue-from-follow-up" });
    expect(state.stage).toBe("follow-up-answered");
    expect(ritualProgress(state.stage).label).toBe("Carry");

    let deeper = createRitualState({
      entryId: "progress-path-2",
      localDay: "2026-07-30",
      category: "relationship",
    });
    deeper = ritualReducer(deeper, { type: "begin-writing" });
    deeper = ritualReducer(deeper, {
      type: "set-body",
      body:
        "After our conversation I felt defensive, but I think I was protecting how much the relationship matters to me.",
    });
    deeper = ritualReducer(deeper, { type: "offer-reflection" });
    deeper = ritualReducer(deeper, {
      type: "answer-follow-up",
      response: "Underneath I felt hurt and afraid of being misunderstood.",
    });
    deeper = ritualReducer(deeper, { type: "offer-second-reflection" });
    expect(deeper.stage).toBe("second-reflection-offered");
    expect(ritualProgress(deeper.stage).label).toBe("Reflect");
    deeper = ritualReducer(deeper, {
      type: "answer-second-follow-up",
      response: "I can ask for clarity without treating the conversation like a threat.",
    });
    deeper = ritualReducer(deeper, {
      type: "continue-from-second-follow-up",
    });
    expect(deeper.stage).toBe("second-reflection-answered");
    expect(ritualProgress(deeper.stage).label).toBe("Carry");

    const labels = [
      "new",
      "writing",
      "reflection-offered",
      "follow-up-answered",
      "second-reflection-answered",
      "nurtured",
    ]
      .map((stage) =>
        ritualProgress(
          stage as
            | "new"
            | "writing"
            | "reflection-offered"
            | "follow-up-answered"
            | "second-reflection-answered"
            | "nurtured",
        ).label,
      )
      .join(" ");
    expect(labels).not.toMatch(/\b(xp|points?|score|leaderboard|gems?)\b/i);
  });

  it("hands off completion with growth-facing copy, not a dead end", () => {
    const completing = ritualNurturedCopy(true);
    const ready = ritualNurturedCopy(false);
    expect(completing.ctaLabel).toBe("Nurturing…");
    expect(ready.ctaLabel).toBe("See what grew");
    expect(ready.detail).toMatch(/tree/i);
    expect(`${ready.title} ${ready.detail} ${ready.ctaLabel}`).not.toMatch(
      /\b(xp|points?|score|leaderboard|gems?)\b/i,
    );
  });
});
