"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
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
import { measureReflectionEligibility } from "./text-metrics";
import type {
  CompletionResult,
  DecryptedJournalEntry,
  JournalRitualDraft,
  NewJournalOptions,
  SaveState,
} from "./types";

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

const THREADS = [
  "Something I felt",
  "A choice",
  "Someone close",
  "A change",
  "What I need",
] as const;

const primaryButton =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-blossom-light)] px-6 font-[var(--font-ui)] text-[15px] font-medium leading-5 text-[var(--color-surface)] outline-none transition-[opacity,transform,box-shadow] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0";

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-transparent px-4 font-[var(--font-ui)] text-[15px] leading-5 text-[var(--color-text-primary)] outline-none transition-[background-color,border-color,transform] duration-150 hover:bg-[var(--color-surface-raised)] focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

export interface JournalRitualProps extends NewJournalOptions {
  restoredDraft?: JournalRitualDraft;
  previousEntries?: readonly DecryptedJournalEntry[];
  previousFollowUpIds?: readonly string[];
  onAutosave?: (draft: JournalRitualDraft) => Promise<void> | void;
  onComplete: (
    result: CompletionResult,
  ) => Promise<void> | void;
  onExit?: () => void;
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

  const previousBodies = useMemo(
    () => previousEntries.slice(0, 10).map((entry) => entry.payload.body),
    [previousEntries],
  );
  const eligibility = useMemo(
    () => measureReflectionEligibility(state.entry.body),
    [state.entry.body],
  );

  useEffect(() => {
    if (!onAutosave || state.stage === "new" || state.stage === "nurtured") {
      return;
    }
    const version = ++saveVersion.current;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await onAutosave({ stage: state.stage, entry: state.entry });
        if (saveVersion.current === version) setSaveState("saved");
      } catch {
        if (saveVersion.current === version) {
          setSaveState(navigator.onLine ? "error" : "offline");
        }
      }
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [onAutosave, state.entry, state.stage]);

  const saveImmediately = async () => {
    if (!onAutosave || state.stage === "new" || state.stage === "nurtured") {
      return;
    }
    const version = ++saveVersion.current;
    setSaveState("saving");
    try {
      await onAutosave({ stage: state.stage, entry: state.entry });
      if (saveVersion.current === version) setSaveState("saved");
    } catch {
      if (saveVersion.current === version) {
        setSaveState(navigator.onLine ? "error" : "offline");
      }
    }
  };

  const complete = async (nextState: RitualState) => {
    const completionId = crypto.randomUUID();
    const completed = ritualReducer(nextState, {
      type: "nurture",
      completionId,
    });
    dispatch({ type: "nurture", completionId });
    setCompletionError(undefined);
    setIsCompleting(true);
    try {
      await onComplete({
        entry: completed.entry,
        localDay,
        stage: "nurtured",
      });
    } catch {
      setCompletionError(
        "Your reflection is still here. We could not nurture the tree yet.",
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
          onThread={(thread) => {
            const hasThread = state.entry.threads.includes(thread);
            dispatch({
              type: "set-threads",
              threads: hasThread
                ? state.entry.threads.filter((item) => item !== thread)
                : [...state.entry.threads, thread],
            });
          }}
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
          onContinue={() => dispatch({ type: "continue-from-follow-up" })}
          onSkip={() => dispatch({ type: "skip-follow-up" })}
        />
      );
    }

    if (
      state.stage === "follow-up-answered" ||
      state.stage === "follow-up-skipped" ||
      state.stage === "seed-insight-added" ||
      state.stage === "seed-insight-skipped"
    ) {
      return (
        <SeedInsightStep
          state={state}
          isCompleting={isCompleting}
          onBack={() => {
            if (state.entry.followUp) {
              dispatch({
                type: "answer-follow-up",
                response: state.entry.followUp.response,
              });
              dispatch({ type: "return-to-writing" });
            } else {
              dispatch({ type: "return-to-writing" });
            }
          }}
          onInsight={(seedInsight) =>
            dispatch({ type: "set-seed-insight", seedInsight })
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
        state={state}
        isCompleting={isCompleting}
        error={completionError}
        onRetry={() => void onComplete({ entry: state.entry, localDay, stage: "nurtured" })}
        onDone={onExit}
      />
    );
  };

  return (
    <section
      aria-label="Journal reflection"
      className="min-h-[100dvh] w-full bg-[var(--color-surface)] text-[var(--color-text-primary)]"
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[760px] flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] sm:px-8 lg:px-10">
        <header className="flex min-h-11 items-center justify-between">
          <button
            type="button"
            onClick={onExit}
            aria-label="Leave journal"
            className="inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-secondary)] outline-none transition-colors duration-150 hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            <ArrowLeft aria-hidden size={20} weight="regular" />
          </button>
          <SaveStatus state={saveState} />
        </header>
        <div className="flex flex-1 flex-col justify-center py-8 sm:py-12">
          {renderContent()}
        </div>
      </div>
    </section>
  );
}

function OpeningStep({
  state,
  onCategory,
  onDifferent,
  onBegin,
}: {
  state: RitualState;
  onCategory: (category: PromptCategory) => void;
  onDifferent: () => void;
  onBegin: () => void;
}) {
  return (
    <div className="animate-[fade-in_300ms_var(--ease-enter,both)]">
      <p className="mb-6 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
        Where would you like to begin?
      </p>
      <div
        className="-mx-1 mb-10 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"
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
              className={`min-h-11 shrink-0 rounded-full border px-4 font-[var(--font-ui)] text-[14px] leading-5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${
                selected
                  ? "border-[var(--color-blossom)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <h1 className="max-w-[680px] text-balance font-[var(--font-poetic)] text-[26px] leading-[34px] text-[var(--color-text-primary)] sm:text-[32px] sm:leading-[40px]">
        {state.entry.prompt.renderedText}
      </h1>
      <div className="mt-12 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} onClick={onBegin}>
          Begin writing
          <ArrowRight aria-hidden size={18} />
        </button>
        <button type="button" className={secondaryButton} onClick={onDifferent}>
          Choose another path
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
  onThread,
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
  onThread: (value: string) => void;
  onReflect: () => void;
  onKeepSmall: () => void;
}) {
  const hasBody = state.entry.body.trim().length > 0;
  return (
    <div>
      <p className="mb-8 max-w-[680px] text-balance font-[var(--font-poetic)] text-[26px] leading-[34px] text-[var(--color-text-primary)] sm:text-[32px] sm:leading-[40px]">
        {state.entry.prompt.renderedText}
      </p>
      <EntryEditor
        title={state.entry.title}
        body={state.entry.body}
        onTitleChange={onTitle}
        onBodyChange={onBody}
        onBlur={onBlur}
        autoFocus
      />
      {hasBody ? (
        <div className="mt-8 border-t border-[var(--color-border)] pt-6">
          <p className="mb-3 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
            A thread you may want to hold
          </p>
          <div className="flex flex-wrap gap-2">
            {THREADS.map((thread) => {
              const selected = state.entry.threads.includes(thread);
              return (
                <button
                  key={thread}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onThread(thread)}
                  className={`min-h-11 rounded-full border px-4 font-[var(--font-ui)] text-[13px] leading-[18px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${
                    selected
                      ? "border-[var(--color-leaf)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {thread}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="mt-10 flex flex-wrap items-center gap-3">
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
        <p className="mt-4 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
          Stay with the page a little longer, or keep this as a small seed.
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
  onBack,
  onResponse,
  onDifferent,
  onContinue,
  onSkip,
}: {
  state: RitualState;
  onBack: () => void;
  onResponse: (value: string) => void;
  onDifferent: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const followUp = state.entry.followUp;
  if (!followUp) return null;
  const canContinue = followUp.response.trim().length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-[var(--font-ui)] text-[14px] text-[var(--color-text-secondary)] outline-none transition-colors hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
      >
        <ArrowLeft aria-hidden size={18} />
        Back to your entry
      </button>
      <p className="mb-4 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
        A question to sit with
      </p>
      <h1 className="mb-9 text-balance font-[var(--font-poetic)] text-[26px] leading-[34px] text-[var(--color-text-primary)] sm:text-[32px] sm:leading-[40px]">
        {followUp.renderedText}
      </h1>
      <label className="sr-only" htmlFor="follow-up-response">
        Your reflection
      </label>
      <textarea
        id="follow-up-response"
        value={followUp.response}
        onChange={(event) => onResponse(event.target.value)}
        autoFocus
        rows={6}
        maxLength={60_000}
        placeholder="There is no perfect answer…"
        className="w-full resize-none rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 font-[var(--font-poetic)] text-[18px] leading-[30px] text-[var(--color-text-primary)] caret-[var(--color-blossom)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-secondary)]/60 focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]/20"
      />
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
          <ArrowRight aria-hidden size={18} />
        </button>
        <button type="button" className={secondaryButton} onClick={onDifferent}>
          Different question
        </button>
        <button type="button" className={secondaryButton} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

function SeedInsightStep({
  state,
  isCompleting,
  onBack,
  onInsight,
  onNurture,
}: {
  state: RitualState;
  isCompleting: boolean;
  onBack: () => void;
  onInsight: (value: string) => void;
  onNurture: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-[var(--font-ui)] text-[14px] text-[var(--color-text-secondary)] outline-none transition-colors hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
      >
        <ArrowLeft aria-hidden size={18} />
        Return to writing
      </button>
      <p className="mb-4 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]">
        Your seed insight
      </p>
      <h1 className="mb-4 text-balance font-[var(--font-poetic)] text-[26px] leading-[34px] text-[var(--color-text-primary)] sm:text-[32px] sm:leading-[40px]">
        What do you want to carry from this?
      </h1>
      <p className="mb-8 max-w-[560px] font-[var(--font-ui)] text-[15px] leading-6 text-[var(--color-text-secondary)]">
        A word or a sentence is enough. You can also leave this open.
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
        className="w-full resize-none rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 font-[var(--font-poetic)] text-[18px] leading-[30px] text-[var(--color-text-primary)] caret-[var(--color-blossom)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-secondary)]/60 focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]/20"
      />
      <div className="mt-9">
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
      </div>
    </div>
  );
}

function NurturedStep({
  state,
  isCompleting,
  error,
  onRetry,
  onDone,
}: {
  state: RitualState;
  isCompleting: boolean;
  error?: string;
  onRetry: () => void;
  onDone?: () => void;
}) {
  const form = state.entry.growth?.memoryForm ?? "leaf";
  const message =
    form === "luminous-blossom"
      ? "A luminous blossom opened on your tree."
      : form === "blossom"
        ? "A new blossom opened on your tree."
        : form === "bud"
          ? "A new bud formed on your tree."
          : "A new leaf unfolded on your tree.";
  return (
    <div className="mx-auto max-w-[520px] text-center" aria-live="polite">
      <span className="mx-auto mb-8 inline-flex size-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-blossom-light)]">
        {isCompleting ? (
          <SpinnerGap aria-hidden className="animate-spin" size={24} />
        ) : (
          <Check aria-hidden size={24} weight="regular" />
        )}
      </span>
      <h1 className="text-balance font-[var(--font-poetic)] text-[30px] leading-[38px] text-[var(--color-text-primary)] sm:text-[36px] sm:leading-[44px]">
        {message}
      </h1>
      <p className="mt-4 font-[var(--font-ui)] text-[15px] leading-6 text-[var(--color-text-secondary)]">
        Your reflection is part of the living record now.
      </p>
      {error ? (
        <div
          role="alert"
          className="mt-8 rounded-[var(--radius-surface)] border border-[var(--color-destructive)] p-4 text-left font-[var(--font-ui)] text-[14px] leading-5"
        >
          <p>{error}</p>
          <button
            type="button"
            className={`${secondaryButton} mt-4`}
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`${primaryButton} mt-10`}
          onClick={onDone}
          disabled={isCompleting}
        >
          Return to the garden
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
    offline: "Saved on this device",
    error: "Save needs attention",
  };
  if (state === "idle") return <span aria-hidden className="size-11" />;
  return (
    <span
      role="status"
      className="inline-flex min-h-11 items-center gap-2 px-2 font-[var(--font-ui)] text-[13px] leading-[18px] text-[var(--color-text-secondary)]"
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
