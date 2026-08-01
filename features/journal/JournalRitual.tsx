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
import type { PromptCategory } from "@/lib/contracts";
import { EntryEditor } from "./EntryEditor";
import {
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
}

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
    const frame = window.requestAnimationFrame(() => {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.stage]);

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
          saveState={saveState}
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
          onContinue={() =>
            dispatch({
              type: "offer-second-reflection",
              previousBodies,
              previousFollowUpIds,
            })
          }
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

    return (
      <NurturedStep
        isCompleting={isCompleting}
        onDone={onNurtured ?? onExit}
      />
    );
  };

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
        <div className="sj-ritual__content">
          {renderContent()}
        </div>
      </div>
    </section>
  );
}

function RitualProgress({ stage }: { stage: RitualState["stage"] }) {
  const progress = ritualProgress(stage);

  return (
    <div
      className="sj-ritual-progress"
      data-step={progress.activeStep}
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
                onClick={() => onCategory(item.value)}
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
  saveState,
  eligible,
  onTitle,
  onBody,
  onBlur,
  onReflect,
  onKeepSmall,
}: {
  state: RitualState;
  saveState: SaveState;
  eligible: boolean;
  onBack: () => void;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onBlur: () => void;
  onReflect: () => void;
  onKeepSmall: () => void;
}) {
  const hasBody = state.entry.body.trim().length > 0;
  const wordCount = state.entry.body.trim()
    ? state.entry.body.trim().split(/\s+/u).length
    : 0;
  const reflectionState = eligible
    ? "There is enough here to reflect with."
    : wordCount > 0
      ? "Stay with it. The page is listening."
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
          autoFocus
        />
        <div className="sj-writing-canvas__footer" aria-live="polite">
          <span>{reflectionState}</span>
          {wordCount > 0 ? <span aria-label={`${wordCount} words`}>{wordCount} words</span> : null}
        </div>
      </div>
      <div className="sj-ritual-actions">
        <button
          type="button"
          className={primaryButton}
          onClick={onReflect}
          disabled={!hasBody || !eligible}
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
          Add a little more of what happened, what you felt, or why it mattered—or keep this as a small seed.
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {saveState === "saved" ? "Draft saved" : ""}
      </span>
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
  const canContinue = followUp.response.trim().length > 0;
  const responseId =
    round === 2 ? "second-follow-up-response" : "follow-up-response";
  return (
    <div
      className="sj-ritual-step sj-ritual-step--follow-up"
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
      <p className="sj-ritual-kicker">
        {round === 2 ? "One layer deeper" : "A question to sit with"}
      </p>
      <h1>
        {followUp.renderedText}
      </h1>
      <p className="sj-ritual-reassurance">
        {round === 2
          ? "This is the final question. Follow it only as far as it feels useful."
          : "You can answer in one honest sentence or follow the thought further."}
      </p>
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
      <div className="sj-ritual-actions">
        <button
          type="button"
          className={primaryButton}
          disabled={!canContinue}
          onClick={onContinue}
        >
          {round === 2 ? "Carry this with me" : "Go one layer deeper"}
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
          Different question
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
      <p className="sj-ritual-kicker">Your seed insight</p>
      <h1>
        What do you want to carry from this?
      </h1>
      <p className="sj-ritual-reassurance">
        Distill what you found into a word or sentence. This is what the tree will hold.
      </p>
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
      <button
        type="button"
        className="sj-return-bud-choice"
        aria-pressed={state.entry.returnBud?.state === "waiting"}
        data-selected={state.entry.returnBud?.state === "waiting" || undefined}
        disabled={!state.entry.seedInsight.trim()}
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
}: {
  isCompleting: boolean;
  onDone?: () => void;
}) {
  const copy = ritualNurturedCopy(isCompleting);
  return (
    <div className="sj-ritual-step sj-ritual-step--nurtured" aria-live="polite">
      <span className="sj-ritual-grown-mark" data-completing={isCompleting || undefined}>
        {isCompleting ? (
          <SpinnerGap aria-hidden className="animate-spin" size={24} />
        ) : (
          <Leaf aria-hidden size={24} weight="regular" />
        )}
      </span>
      <p className="sj-ritual-kicker">Care complete</p>
      <h1>{copy.title}</h1>
      <p className="sj-ritual-reassurance">{copy.detail}</p>
      <button
        type="button"
        className={primaryButton}
        onClick={onDone}
        disabled={isCompleting}
      >
        {copy.ctaLabel}
        {!isCompleting ? <ArrowRight aria-hidden size={18} /> : null}
      </button>
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const label: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    offline: "Saved on this device",
    error: "Save needs attention",
  };
  if (state === "idle") return <span aria-hidden className="size-11" />;
  return (
    <span
      role="status"
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
