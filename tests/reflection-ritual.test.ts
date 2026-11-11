import { describe, expect, it } from "vitest";
import {
  closeConversation,
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

  it("asks about friends taking care of you after a concert night", () => {
    let state = createRitualState({
      entryId: "entry-concert",
      localDay: "2026-08-14",
      category: "open",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "I went out last night with my friends to a concert and I really enjoyed my time because my friends really took care of me.",
    });
    state = ritualReducer(state, { type: "offer-reflection" });
    expect(state.entry.followUp?.id.startsWith("compose.")).toBe(true);
    expect(state.entry.followUp?.renderedText).toMatch(/took care of you/i);
    expect(state.entry.followUp?.renderedText).not.toMatch(/“friends”/u);

    const firstId = state.entry.followUp?.id;
    state = ritualReducer(state, {
      type: "answer-follow-up",
      response: "They noticed I was tired and stayed with me.",
    });
    state = ritualReducer(state, { type: "offer-second-reflection" });
    expect(state.stage).toBe("second-reflection-offered");
    expect(state.entry.secondFollowUp?.renderedText).toMatch(/stayed|tired/i);
    expect(state.entry.secondFollowUp?.id.startsWith("compose.")).toBe(true);
    expect(state.entry.secondFollowUp?.id).not.toBe(firstId);
  });

  it("lets a short emotional sentence enter reflection instead of locking it", () => {
    let state = createRitualState({
      entryId: "entry-great-day",
      localDay: "2026-08-14",
      category: "moment",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "Today was a great day.",
    });
    expect(measureReflectionEligibility(state.entry.body).eligible).toBe(false);
    state = ritualReducer(state, { type: "offer-reflection" });
    expect(state.stage).toBe("reflection-offered");
    expect(state.entry.followUp?.renderedText).toBeTruthy();
    expect(state.entry.reflection?.selectedTarget).toBe("emotion");
  });

  it("scores a deep page when you leave before a question is offered", () => {
    const body =
      "This morning I sat in the kitchen with my sister. I felt anxious and my chest was tight because her words mattered to me. Maybe I misunderstood part of what she meant, and I can be kind to myself while I ask. Tomorrow I will call her and listen before answering.";
    let state = createRitualState({
      entryId: "entry-leave-deep",
      localDay: "2026-08-14",
      category: "open",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, { type: "set-body", body });
    state = closeConversation(state);
    state = ritualReducer(state, {
      type: "nurture",
      completionId: "completion-deep",
    });
    expect(state.entry.growth?.growthUnits).toBe(4);
    expect(state.entry.growth?.growthUnits).toBeGreaterThan(0);
  });

  it("still nurtures a sad one-line page", () => {
    let state = createRitualState({
      entryId: "entry-sad",
      localDay: "2026-08-14",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, { type: "set-body", body: "I am sad." });
    state = closeConversation(state);
    state = ritualReducer(state, {
      type: "nurture",
      completionId: "completion-sad",
    });
    expect(state.entry.growth?.growthUnits).toBe(1);
    expect(state.entry.growth?.memoryForm).toBe("leaf");
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

  it("closes a short conversation as a small seed without shrinking care", () => {
    let state = createRitualState({
      entryId: "entry-close",
      localDay: "2026-07-29",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "A small true thing.",
    });
    const closed = closeConversation(state);
    expect(closed.stage).toBe("seed-insight-skipped");
    expect(closed.entry.ritual.conciseBodyOverride).toBe(true);
    expect(closed.entry.growth).toBeUndefined();
  });

  it("keeps an answered follow-up when the conversation closes", () => {
    let state = createRitualState({
      entryId: "entry-close-deep",
      localDay: "2026-07-29",
      category: "feeling",
    });
    state = ritualReducer(state, { type: "begin-writing" });
    state = ritualReducer(state, {
      type: "set-body",
      body: "I felt anxious before the meeting because I might freeze, and tomorrow I will speak anyway.",
    });
    state = ritualReducer(state, { type: "offer-reflection" });
    state = ritualReducer(state, {
      type: "answer-follow-up",
      response: "The fear is that I will go blank.",
    });
    const closed = closeConversation(state);
    expect(closed.stage).toBe("seed-insight-skipped");
    expect(closed.entry.followUp?.response).toBe(
      "The fear is that I will go blank.",
    );
    expect(closed.entry.followUp?.skipped).toBe(false);
    expect(closed.entry.reflection).toBeDefined();
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
