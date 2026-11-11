"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlowerLotus,
  Leaf,
  SpinnerGap,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { composeGardenReply, isSceneFollowUpId } from "@/features/reflection";
import type { JournalEntryPayloadV1, PromptCategory } from "@/lib/contracts";
import { ConversationCard } from "./ConversationCard";
import { EntryEditor } from "./EntryEditor";
import {
  closeConversation,
  createRitualState,
  ritualReducer,
  type RitualState,
} from "./ritual-machine";
import {
  ritualNurturedCopy,
  ritualProgress,
} from "./ritualProgress";
import { measureReflectionEligibility } from "./text-metrics";
import type {
  CompletionResult,
  DecryptedJournalEntry,
  JournalRitualDraft,
  NewJournalOptions,
  SaveState,
} from "./types";
import "./journal.css";

const CATEGORIES: ReadonlyArray<{
  value: PromptCategory;
  label: string;
}> = [
  { value: "moment", label: "A moment" },
  { value: "feeling", label: "A feeling" },
  { value: "relationship", label: "A relationship" },
  { value: "decision", label: "A decision" },
  { value: "change", label: "A change" },
  { value: "gratitude", label: "Gratitude" },
  { value: "open", label: "Open page" },
];

const primaryButton = "sj-ritual-button sj-ritual-button--primary";

const secondaryButton = "sj-ritual-button sj-ritual-button--secondary";

export interface JournalRitualProps extends NewJournalOptions {
  restoredDraft?: JournalRitualDraft;
  previousEntries?: readonly DecryptedJournalEntry[];
  previousFollowUpIds?: readonly string[];
  onAutosave?: (draft: JournalRitualDraft) => Promise<void> | void;
  onComplete: (
    result: CompletionResult,
  ) => Promise<void> | void;
  onExit?: () => void;
  onNurtured?: () => void;
  /** Page keeps the older ritual. Card is the one-page conversation under the tree. */
  layout?: "page" | "card";
  onAtmosphere?: (entry: JournalEntryPayloadV1) => void;
  /** This card resumed an unfinished draft. Offer a fresh page beside it. */
  resumed?: boolean;
  onFresh?: () => void;
}

/** Kept for existing imports. The card offers only after focus leaves, not on a typing timer. */
export const CONVERSATION_OFFER_MS = 1_400;

export function JournalRitual({
  entryId,
  localDay,
  category,
  identitySeed,
  kind,
  parentEntryId,
  restoredDraft,
  previousEntries = [],
  previousFollowUpIds = [],
  onAutosave,
  onComplete,
  onExit,
  onNurtured,
  layout = "page",
  onAtmosphere,
  resumed = false,
  onFresh,
}: JournalRitualProps) {
  const [state, dispatch] = useReducer(
    ritualReducer,
    {
      entryId,
      localDay,
      category,
      identitySeed,
      kind,
      parentEntryId,
    },
    (options) => createRitualState(options, restoredDraft),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [completionError, setCompletionError] = useState<string>();
  const [isCompleting, setIsCompleting] = useState(false);
  const saveVersion = useRef(0);
  const pendingCompletionId = useRef<string | undefined>(undefined);
  const cardOffered = useRef({ writing: false, reflection: false });

  const previousBodies = useMemo(
    () => previousEntries.slice(0, 10).map((entry) => entry.payload.body),
    [previousEntries],
  );
  const returningInsight = useMemo(() => {
    const sourceId = state.entry.parentEntryId;
    if (!sourceId) return "";
    return (
      previousEntries.find((entry) => entry.id === sourceId)?.payload
        .seedInsight ?? ""
    );
  }, [previousEntries, state.entry.parentEntryId]);
  const eligibility = useMemo(
    () => measureReflectionEligibility(state.entry.body),
    [state.entry.body],
  );
  const persistedDraft = useMemo<JournalRitualDraft>(
    () => ({
      stage: state.stage,
      entry: {
        ...state.entry,
        ritual: { ...state.entry.ritual, stage: state.stage },
      },
    }),
    [state.entry, state.stage],
  );

  useEffect(() => {
    if (layout === "card") return;
    const frame = window.requestAnimationFrame(() => {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [layout, state.stage]);

  useEffect(() => {
    if (layout !== "card") return;
    onAtmosphere?.(state.entry);
  }, [layout, onAtmosphere, state.entry]);

  useEffect(() => {
    if (layout !== "card" || state.stage !== "new") return;
    dispatch({ type: "begin-writing" });
  }, [layout, state.stage]);

  useEffect(() => {
    if (layout !== "card" || state.stage !== "writing") return;
    if (!state.entry.body.trim()) return;
    const preview = composeGardenReply({
      text: state.entry.body,
      renderedPrompt: state.entry.prompt.renderedText,
      turn: 1,
    });
    if (!preview.renderedText) return;
    const timer = window.setTimeout(() => {
      dispatch({
        type: "offer-reflection",
        previousBodies,
        previousFollowUpIds,
      });
    }, CONVERSATION_OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [
    layout,
    previousBodies,
    previousFollowUpIds,
    state.entry.body,
    state.entry.prompt.renderedText,
    state.stage,
  ]);

  useEffect(() => {
    if (layout !== "card" || state.stage !== "nurtured") return;
    const timer = window.setTimeout(() => {
      (onNurtured ?? onExit)?.();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [layout, onExit, onNurtured, state.stage]);

  useEffect(() => {
    if (!onAutosave || state.stage === "new" || state.stage === "nurtured") {
      return;
    }
    const version = ++saveVersion.current;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await onAutosave(persistedDraft);
        if (saveVersion.current === version) setSaveState("saved");
      } catch {
        if (saveVersion.current === version) {
          setSaveState(navigator.onLine ? "error" : "offline");
        }
      }
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [onAutosave, persistedDraft, state.stage]);

  const saveImmediately = async () => {
    if (!onAutosave || state.stage === "new" || state.stage === "nurtured") {
      return;
    }
    const version = ++saveVersion.current;
    setSaveState("saving");
    try {
      await onAutosave(persistedDraft);
      if (saveVersion.current === version) setSaveState("saved");
    } catch {
      if (saveVersion.current === version) {
        setSaveState(navigator.onLine ? "error" : "offline");
      }
    }
  };

  const complete = async (nextState: RitualState) => {
    const completionId =
      pendingCompletionId.current ?? (pendingCompletionId.current = crypto.randomUUID());
    const completed = ritualReducer(nextState, {
      type: "nurture",
      completionId,
    });
    setCompletionError(undefined);
    setIsCompleting(true);
    try {
      await onComplete({
        entry: {
          ...completed.entry,
          ritual: { ...completed.entry.ritual, stage: "nurtured" },
        },
        localDay,
        stage: "nurtured",
      });
      dispatch({ type: "nurture", completionId });
      pendingCompletionId.current = undefined;
    } catch {
      setCompletionError(
        navigator.onLine
          ? "Your reflection is still here. The garden could not receive it yet."
          : "Your reflection is saved on this device. The garden will receive it when you reconnect.",
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const renderContent = () => {
    if (state.stage === "new") {
      return (
        <OpeningStep
          state={state}
          returningInsight={returningInsight}
          onCategory={(nextCategory) =>
            dispatch({ type: "choose-category", category: nextCategory })
          }
          onDifferent={() => dispatch({ type: "different-opening" })}
          onBegin={() => dispatch({ type: "begin-writing" })}
        />
      );
    }

    if (state.stage === "writing") {
      return (
        <WritingStep
          state={state}
          eligible={eligibility.eligible}
          onBack={() => dispatch({ type: "return-to-writing" })}
          onTitle={(title) => dispatch({ type: "set-title", title })}
          onBody={(body) => dispatch({ type: "set-body", body })}
          onBlur={saveImmediately}
          onReflect={() =>
            dispatch({
              type: "offer-reflection",
              previousBodies,
              previousFollowUpIds,
            })
          }
          onKeepSmall={() => dispatch({ type: "keep-small-seed" })}
        />
      );
    }

    if (state.stage === "reflection-offered") {
      return (
        <FollowUpStep
          state={state}
          round={1}
          onBack={() => dispatch({ type: "return-to-writing" })}
          onResponse={(response) =>
            dispatch({ type: "answer-follow-up", response })
          }
          onDifferent={() =>
            dispatch({
              type: "different-follow-up",
              previousBodies,
              previousFollowUpIds,
            })
          }
          onContinue={() => {
            dispatch({
              type: "offer-second-reflection",
              previousBodies,
              previousFollowUpIds,
            });
          }}
          onClose={() => dispatch({ type: "continue-from-follow-up" })}
          onSkip={() => dispatch({ type: "skip-follow-up" })}
        />
      );
    }

    if (state.stage === "second-reflection-offered") {
      return (
        <FollowUpStep
          state={state}
          round={2}
          onBack={() =>
            dispatch({ type: "return-to-first-reflection" })
          }
          onResponse={(response) =>
            dispatch({ type: "answer-second-follow-up", response })
          }
          onDifferent={() =>
            dispatch({
              type: "different-second-follow-up",
              previousBodies,
              previousFollowUpIds,
            })
          }
          onContinue={() =>
            dispatch({ type: "continue-from-second-follow-up" })
          }
          onSkip={() => dispatch({ type: "skip-second-follow-up" })}
        />
      );
    }

    if (
      state.stage === "follow-up-answered" ||
      state.stage === "follow-up-skipped" ||
      state.stage === "second-reflection-answered" ||
      state.stage === "second-reflection-skipped" ||
      state.stage === "seed-insight-added" ||
      state.stage === "seed-insight-skipped"
    ) {
      return (
        <SeedInsightStep
          state={state}
          isCompleting={isCompleting}
          completionError={completionError}
          onBack={() => dispatch({ type: "return-to-reflection" })}
          onInsight={(seedInsight) =>
            dispatch({ type: "set-seed-insight", seedInsight })
          }
          onReturnBud={(scheduled) =>
            dispatch({ type: "set-return-bud", scheduled })
          }
          onNurture={() => {
            const next =
              state.entry.seedInsight.trim().length > 0
                ? ritualReducer(state, {
                    type: "continue-with-seed-insight",
                  })
                : ritualReducer(state, { type: "skip-seed-insight" });
            void complete(next);
          }}
        />
      );
    }

    // Single climax: while completing, show calm handoff; once nurtured, auto-advance
    // into GrowthReveal on the home garden body (no second celebration screen).
    if (state.stage === "nurtured") {
      return (
        <NurturedStep
          isCompleting={false}
          autoAdvance
          onDone={onNurtured ?? onExit}
        />
      );
    }

    return (
      <NurturedStep
        isCompleting={isCompleting}
        onDone={onNurtured ?? onExit}
      />
    );
  };

  if (layout === "card") {
    return (
      <ConversationCard
        state={state}
        saveState={saveState}
        isCompleting={isCompleting}
        completionError={completionError}
        onClose={() => {
          void saveImmediately().finally(() => onExit?.());
        }}
        onBody={(body) => dispatch({ type: "set-body", body })}
        onFollowUp={(response) =>
          dispatch({ type: "answer-follow-up", response })
        }
        onSecondFollowUp={(response) =>
          dispatch({ type: "answer-second-follow-up", response })
        }
        onBlur={() => void saveImmediately()}
        onSettle={(field, value) => {
          if (field === "body") {
            if (state.stage !== "writing" || cardOffered.current.writing) return;
            if (!value.trim()) return;
            dispatch({ type: "set-body", body: value });
            const preview = composeGardenReply({
              text: value,
              renderedPrompt: state.entry.prompt.renderedText,
              turn: 1,
            });
            if (preview.kind === "silent") return;
            cardOffered.current.writing = true;
            dispatch({
              type: "offer-reflection",
              previousBodies,
              previousFollowUpIds,
            });
            return;
          }
          if (state.stage !== "reflection-offered" || cardOffered.current.reflection) {
            return;
          }
          if (!value.trim()) return;
          cardOffered.current.reflection = true;
          dispatch({ type: "answer-follow-up", response: value });
          dispatch({
            type: "offer-second-reflection",
            previousBodies,
            previousFollowUpIds,
          });
        }}
        onInsight={(seedInsight) =>
          dispatch({ type: "set-seed-insight", seedInsight })
        }
        resumed={resumed}
        onFresh={onFresh}
        onSkip={() => {
          if (state.stage === "second-reflection-offered") {
            dispatch({ type: "skip-second-follow-up" });
            return;
          }
          dispatch({ type: "skip-follow-up" });
        }}
        onSend={() => {
          if (!state.entry.body.trim() || state.stage !== "writing") return;
          dispatch({
            type: "offer-reflection",
            previousBodies,
            previousFollowUpIds,
          });
        }}
        onLeave={() => {
          if (!state.entry.body.trim() || isCompleting) return;
          if (state.stage === "writing" && !state.entry.followUp?.renderedText) {
            const preview = composeGardenReply({
              text: state.entry.body,
              renderedPrompt: state.entry.prompt.renderedText,
              turn: 1,
            });
            if (preview.renderedText) {
              dispatch({
                type: "offer-reflection",
                previousBodies,
                previousFollowUpIds,
              });
              return;
            }
          }
          void complete(closeConversation(state));
        }}
      />
    );
  }

  return (
    <section
      aria-label="Journal reflection"
      className="sj-ritual"
      data-stage={state.stage}
    >
      <div className="sj-ritual__shell">
        <header className="sj-ritual__header">
          <button
            type="button"
            onClick={onExit}
            aria-label="Leave journal"
            className="sj-ritual__close"
          >
            <ArrowLeft aria-hidden size={20} weight="regular" />
          </button>
          <RitualProgress stage={state.stage} />
          <SaveStatus state={saveState} />
        </header>
        <div className="sj-ritual__content" key={ritualFilmChapter(state.stage)}>
          {renderContent()}
        </div>
      </div>
    </section>
  );
}

/** Visual film chapter — remount on chapter change, not every machine stage. */
function ritualFilmChapter(stage: RitualState["stage"]) {
  switch (stage) {
    case "new":
      return "opening";
    case "writing":
      return "writing";
    case "reflection-offered":
      return "follow-up";
    case "second-reflection-offered":
      return "follow-up-deeper";
    case "nurtured":
      return "nurtured";
    default:
      return "carry";
  }
}

function RitualProgress({ stage }: { stage: RitualState["stage"] }) {
  const progress = ritualProgress(stage);

  return (
    <div
      className="sj-ritual-progress"
      data-step={progress.activeStep}
      role="group"
      aria-label={`Step ${progress.stepNumber} of ${progress.stepCount}: ${progress.label}`}
    >
      <span className="sj-ritual-progress__label">{progress.label}</span>
      <span className="sj-ritual-progress__dots" aria-hidden="true">
        {progress.labels.map((label, index) => (
          <i
            key={label}
            data-state={
              index < progress.activeStep
                ? "done"
                : index === progress.activeStep
                  ? "active"
                  : "resting"
            }
          />
        ))}
      </span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {progress.stepNumber} of {progress.stepCount}: {progress.label}
      </span>
    </div>
  );
}

function OpeningStep({
  state,
  returningInsight,
  onCategory,
  onDifferent,
  onBegin,
}: {
  state: RitualState;
  returningInsight?: string;
  onCategory: (category: PromptCategory) => void;
  onDifferent: () => void;
  onBegin: () => void;
}) {
  return (
    <div className="sj-ritual-step sj-ritual-step--opening">
      <div className="sj-ritual-step__intro">
        <p className="sj-ritual-kicker">
          {state.entry.kind === "revisit"
            ? "A memory, returning"
            : "Today’s reflection"}
        </p>
        <h1>{state.entry.prompt.renderedText}</h1>
        {returningInsight ? (
          <blockquote className="sj-returning-insight">
            “{returningInsight}”
          </blockquote>
        ) : null}
        <p className="sj-ritual-reassurance">
          {state.entry.kind === "revisit"
            ? "Notice what softened, sharpened, or remained."
            : "Take one slow breath. Start wherever the truth feels easiest to touch."}
        </p>
      </div>
      <details className="sj-ritual-directions">
        <summary>Choose a direction</summary>
        <div
          className="sj-ritual-paths"
          role="radiogroup"
          aria-label="Journal path"
        >
          {CATEGORIES.map((item) => {
            const selected = item.value === state.category;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onCategory(item.value)}
                onKeyDown={(event) => {
                  const direction =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (!direction) return;
                  event.preventDefault();
                  const radios = Array.from(
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    ) ?? [],
                  );
                  const currentIndex = radios.indexOf(event.currentTarget);
                  if (currentIndex < 0 || radios.length === 0) return;
                  const nextIndex =
                    (currentIndex + direction + radios.length) % radios.length;
                  const next = radios[nextIndex];
                  onCategory(CATEGORIES[nextIndex].value);
                  next.focus();
                }}
                className="sj-ritual-path"
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </details>
      <div className="sj-ritual-actions">
        <button type="button" className={primaryButton} onClick={onBegin}>
          Begin writing
          <ArrowRight aria-hidden size={18} />
        </button>
        <button type="button" className={secondaryButton} onClick={onDifferent}>
          Another prompt
        </button>
      </div>
    </div>
  );
}

function WritingStep({
  state,
  eligible,
  onTitle,
  onBody,
  onBlur,
  onReflect,
  onKeepSmall,
}: {
  state: RitualState;
  eligible: boolean;
  onBack: () => void;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onBlur: () => void;
  onReflect: () => void;
  onKeepSmall: () => void;
}) {
  const hasBody = state.entry.body.trim().length > 0;
  const reflectionState = eligible
    ? "There is enough here to reflect with."
    : hasBody
      ? "A short seed is enough — the garden can still ask one question."
      : "Nothing you write here needs to be polished.";
  return (
    <div className="sj-ritual-step sj-ritual-step--writing">
      <p className="sj-ritual-prompt">{state.entry.prompt.renderedText}</p>
      <div className="sj-writing-canvas">
        <EntryEditor
          title={state.entry.title}
          body={state.entry.body}
          onTitleChange={onTitle}
          onBodyChange={onBody}
          onBlur={onBlur}
          showTitle
          autoFocus
        />
        <div className="sj-writing-canvas__footer">
          <span role="status" aria-live="polite" aria-atomic="true">
            {reflectionState}
          </span>
        </div>
      </div>
      <div className="sj-ritual-actions">
        <button
          type="button"
          className={primaryButton}
          onClick={onReflect}
          disabled={!hasBody}
        >
          Reflect with me
          <ArrowRight aria-hidden size={18} />
        </button>
        {hasBody ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={onKeepSmall}
          >
            Keep as a small seed
          </button>
        ) : null}
      </div>
      {hasBody && !eligible ? (
        <p className="sj-ritual-hint">
          You can keep this as a small seed, or reflect with me — even a short
          sentence is a place to begin.
        </p>
      ) : null}
    </div>
  );
}

function FollowUpStep({
  state,
  round,
  onBack,
  onResponse,
  onDifferent,
  onContinue,
  onClose,
  onSkip,
}: {
  state: RitualState;
  round: 1 | 2;
  onBack: () => void;
  onResponse: (value: string) => void;
  onDifferent: () => void;
  onContinue: () => void;
  onClose?: () => void;
  onSkip: () => void;
}) {
  const followUp =
    round === 2 ? state.entry.secondFollowUp : state.entry.followUp;
  if (!followUp) return null;
  const fromScene = isSceneFollowUpId(followUp.id);
  const canContinue = followUp.response.trim().length > 0;
  const responseId =
    round === 2 ? "second-follow-up-response" : "follow-up-response";
  return (
    <div
      className="sj-ritual-step sj-ritual-step--follow-up"
      data-from-scene={fromScene || undefined}
      data-reflection-round={round}
    >
      <button
        type="button"
        onClick={onBack}
        className="sj-ritual-back"
      >
        <ArrowLeft aria-hidden size={18} />
        {round === 2 ? "Back to your first reflection" : "Back to your entry"}
      </button>
      <div className="sj-ritual-heard">
        <p className="sj-ritual-kicker">
          {round === 2
            ? "One layer deeper"
            : fromScene
              ? "A question from what you wrote"
              : "A question to sit with"}
        </p>
        <h1>
          {followUp.renderedText}
        </h1>
        <p className="sj-ritual-reassurance">
          {round === 2
            ? "This is the last thing the garden will ask. Follow it only as far as it feels useful."
            : "Answer in one honest sentence, or stay with the thought a little longer."}
        </p>
      </div>
      <div className="sj-writing-well">
        <label className="sr-only" htmlFor={responseId}>
          {round === 2 ? "Your deeper reflection" : "Your reflection"}
        </label>
        <textarea
          id={responseId}
          value={followUp.response}
          onChange={(event) => onResponse(event.target.value)}
          autoFocus
          rows={6}
          maxLength={60_000}
          placeholder="There is no perfect answer…"
          className="sj-ritual-textarea"
        />
      </div>
      <div className="sj-ritual-actions">
        <button
          type="button"
          className={primaryButton}
          disabled={!canContinue}
          onClick={onContinue}
        >
          {round === 2
            ? "Carry this with me"
            : "Go one layer deeper"}
          <ArrowRight aria-hidden size={18} />
        </button>
        {round === 1 && onClose ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={onClose}
            disabled={!canContinue}
          >
            I&apos;m ready to carry this
          </button>
        ) : null}
        <button type="button" className={secondaryButton} onClick={onDifferent}>
          Another question
        </button>
        {!canContinue ? (
          <button type="button" className={secondaryButton} onClick={onSkip}>
            {round === 2 ? "I’m ready to close" : "Skip for today"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SeedInsightStep({
  state,
  isCompleting,
  completionError,
  onBack,
  onInsight,
  onReturnBud,
  onNurture,
}: {
  state: RitualState;
  isCompleting: boolean;
  completionError?: string;
  onBack: () => void;
  onInsight: (value: string) => void;
  onReturnBud: (scheduled: boolean) => void;
  onNurture: () => void;
}) {
  const hadInsight = useRef(Boolean(state.entry.seedInsight.trim()));
  const defaultedReturnBud = useRef(false);

  useEffect(() => {
    const hasInsight = Boolean(state.entry.seedInsight.trim());
    if (
      !defaultedReturnBud.current &&
      hasInsight &&
      !hadInsight.current
    ) {
      defaultedReturnBud.current = true;
      if (state.entry.returnBud?.state !== "waiting") {
        onReturnBud(true);
      }
    }
    hadInsight.current = hasInsight;
  }, [onReturnBud, state.entry.returnBud?.state, state.entry.seedInsight]);

  return (
    <div className="sj-ritual-step sj-ritual-step--insight">
      <button
        type="button"
        onClick={onBack}
        className="sj-ritual-back"
      >
        <ArrowLeft aria-hidden size={18} />
        Return to reflection
      </button>
      <p className="sj-ritual-kicker">Leave a sentence, or skip</p>
      <h1>
        Want to leave a sentence with the tree?
      </h1>
      <p className="sj-ritual-reassurance">
        Optional. One line the sakura can hold for you tomorrow. You can nurture without it.
      </p>
      <div className="sj-writing-well sj-writing-well--quiet">
        <label className="sr-only" htmlFor="seed-insight">
          Seed insight
        </label>
        <textarea
          id="seed-insight"
          value={state.entry.seedInsight}
          onChange={(event) => onInsight(event.target.value)}
          autoFocus
          rows={3}
          maxLength={1_000}
          placeholder="I want to remember…"
          className="sj-ritual-textarea sj-ritual-textarea--insight"
        />
      </div>
      <button
        type="button"
        className="sj-return-bud-choice"
        aria-pressed={state.entry.returnBud?.state === "waiting"}
        data-selected={state.entry.returnBud?.state === "waiting" || undefined}
        onClick={() =>
          onReturnBud(state.entry.returnBud?.state !== "waiting")
        }
      >
        <FlowerLotus aria-hidden size={20} weight="regular" />
        <span>
          <strong>Bring this back tomorrow</strong>
          <small>A patient bud, only when you return.</small>
        </span>
        <i aria-hidden />
      </button>
      <div className="sj-ritual-actions">
        <button
          type="button"
          className={primaryButton}
          onClick={onNurture}
          disabled={isCompleting}
        >
          {isCompleting ? (
            <SpinnerGap aria-hidden className="animate-spin" size={18} />
          ) : (
            <Leaf aria-hidden size={18} />
          )}
          {isCompleting ? "Nurturing…" : "Nurture the tree"}
        </button>
        {completionError ? (
          <p
            role="alert"
            className="sj-ritual-error"
          >
            {completionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NurturedStep({
  isCompleting,
  onDone,
  autoAdvance = false,
}: {
  isCompleting: boolean;
  onDone?: () => void;
  /** After successful complete — advance into garden ceremony without a second peak. */
  autoAdvance?: boolean;
}) {
  const copy = ritualNurturedCopy(isCompleting || autoAdvance);
  useEffect(() => {
    if (!autoAdvance || !onDone) return;
    const timer = window.setTimeout(() => onDone(), 280);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, onDone]);

  return (
    <div className="sj-ritual-step sj-ritual-step--nurtured" aria-live="polite">
      <span className="sj-ritual-grown-mark" data-completing={isCompleting || autoAdvance || undefined}>
        {isCompleting || autoAdvance ? (
          <SpinnerGap aria-hidden className="animate-spin" size={24} />
        ) : (
          <Leaf aria-hidden size={24} weight="regular" />
        )}
      </span>
      <p className="sj-ritual-kicker">Care complete</p>
      <h1>
        {autoAdvance ? "Your sakura is receiving your care…" : copy.title}
      </h1>
      <p className="sj-ritual-reassurance">
        {autoAdvance
          ? "A quiet moment while the tree shows what changed."
          : copy.detail}
      </p>
      {autoAdvance ? null : (
        <button
          type="button"
          className={primaryButton}
          onClick={onDone}
          disabled={isCompleting}
        >
          {copy.ctaLabel}
          {!isCompleting ? <ArrowRight aria-hidden size={18} /> : null}
        </button>
      )}
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const label: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    offline: "Saved on this device; will sync when you reconnect",
    error: "Save needs attention",
  };
  if (state === "idle") return <span aria-hidden className="size-11" />;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sj-ritual-save"
    >
      {state === "saving" ? (
        <SpinnerGap aria-hidden className="animate-spin" size={14} />
      ) : state === "saved" ? (
        <Check aria-hidden size={14} />
      ) : null}
      {label[state]}
    </span>
  );
}
