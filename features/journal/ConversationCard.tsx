"use client";

import { MicrophoneIcon, XIcon } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
} from "react";
import type { RitualState } from "./ritual-machine";
import type { SaveState } from "./types";
import {
  createVoiceCapture,
  joinVoiceText,
  speechRecognitionSupported,
  voiceErrorCopy,
  type VoiceCapture,
  type VoiceCaptureErrorCode,
  type VoiceTranscript,
} from "./voiceCapture";

type VoiceField = "body" | "follow-up" | "second";

function subscribeSpeechSupport() {
  return () => undefined;
}

function speechSupportOnServer() {
  return false;
}

/** WebKit blurs with a null relatedTarget when the keyboard closes. */
const KEYBOARD_BLUR_MS = 80;

const FIELD_LIMIT: Record<VoiceField, number> = {
  body: 200_000,
  "follow-up": 60_000,
  second: 60_000,
};

function SaveStatus({ label }: { label: string }) {
  const [shown, setShown] = useState(label);
  const [leaving, setLeaving] = useState("");

  useEffect(() => {
    if (label === shown) return;
    setLeaving(shown);
    setShown(label);
  }, [label, shown]);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(() => setLeaving(""), 360);
    return () => window.clearTimeout(timeout);
  }, [leaving]);

  return (
    <p className="sj-converse__save" role="status" aria-live="polite">
      {leaving ? (
        <span className="sj-converse__save-line sj-converse__save-line--out" aria-hidden="true">
          {leaving}
        </span>
      ) : null}
      <span className="sj-converse__save-line">{shown}</span>
    </p>
  );
}

export interface ConversationCardProps {
  state: RitualState;
  saveState: SaveState;
  isCompleting: boolean;
  completionError?: string;
  onClose: () => void;
  onBody: (body: string) => void;
  onFollowUp: (response: string) => void;
  onSecondFollowUp: (response: string) => void;
  onBlur: () => void;
  /** Focus has left the card, so a garden line can arrive without a button. */
  onSettle: (field: "body" | "follow-up", value: string) => void;
  onInsight: (seedInsight: string) => void;
  resumed?: boolean;
  onFresh?: () => void;
  onSkip: () => void;
  /** Commit the page so the seed can answer. Does not grow the tree. */
  onSend: () => void;
  onLeave: () => void;
}

export function ConversationCard({
  state,
  saveState,
  isCompleting,
  completionError,
  onClose,
  onBody,
  onFollowUp,
  onSecondFollowUp,
  onBlur,
  onSettle,
  onInsight,
  resumed = false,
  onFresh,
  onSkip,
  onSend,
  onLeave,
}: ConversationCardProps) {
  const canSpeak = useSyncExternalStore(
    subscribeSpeechSupport,
    speechRecognitionSupported,
    speechSupportOnServer,
  );
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const activeField: VoiceField =
    state.stage === "second-reflection-offered"
      ? "second"
      : state.stage === "reflection-offered"
        ? "follow-up"
        : "body";
  const [focusChoice, setFocusChoice] = useState<{
    stage: RitualState["stage"];
    field: VoiceField;
  } | null>(null);
  const focused =
    focusChoice?.stage === state.stage ? focusChoice.field : activeField;
  const captureRef = useRef<VoiceCapture | null>(null);
  const anchorRef = useRef("");
  const fieldRef = useRef<VoiceField>("body");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const settleTimer = useRef<number | null>(null);
  const controlHoldTimer = useRef<number | null>(null);
  const controlHeld = useRef(false);

  const question =
    state.stage === "second-reflection-offered"
      ? state.entry.secondFollowUp
      : state.stage === "reflection-offered"
        ? state.entry.followUp
        : undefined;
  const hasBody = state.entry.body.trim().length > 0;
  const answer = question?.response ?? "";
  const asks = Boolean(question?.renderedText.includes("?"));
  const showSkip = asks && answer.trim().length === 0;
  const showOpening = state.entry.kind === "revisit";
  const receiving = state.stage === "nurtured" || isCompleting;
  const saidBody = question ? state.entry.body.trim() : "";
  const awaitingSeed = !question && !receiving;
  const quietReply = Boolean(question && !asks && !receiving && hasBody);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog instanceof HTMLElement) {
        const style = window.getComputedStyle(dialog);
        if (style.display !== "none" && style.visibility !== "hidden") return;
      }
      event.preventDefault();
      captureRef.current?.stop();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => captureRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (controlHoldTimer.current !== null) window.clearTimeout(controlHoldTimer.current);
    };
  }, []);

  useEffect(() => {
    const view = window.visualViewport;
    const card = cardRef.current;
    if (!view || !card) return;

    const apply = () => {
      const layoutHeight = window.innerHeight;
      const overlap = Math.max(0, Math.round(layoutHeight - view.offsetTop - view.height));
      const keyboardOpen = view.height > 0 && view.height < layoutHeight && overlap >= 80;
      if (!keyboardOpen) {
        card.style.removeProperty("--sj-converse-lift");
        card.style.removeProperty("--sj-converse-above");
        delete card.dataset.keyboard;
        return;
      }
      card.style.setProperty("--sj-converse-lift", `${overlap}px`);
      card.style.setProperty("--sj-converse-above", `${Math.round(view.height)}px`);
      card.dataset.keyboard = "open";
    };

    apply();
    view.addEventListener("resize", apply);
    view.addEventListener("scroll", apply);
    return () => {
      view.removeEventListener("resize", apply);
      view.removeEventListener("scroll", apply);
      card.style.removeProperty("--sj-converse-lift");
      card.style.removeProperty("--sj-converse-above");
      delete card.dataset.keyboard;
    };
  }, []);

  const stopVoice = () => {
    captureRef.current?.stop();
    captureRef.current = null;
    setListening(false);
  };

  const publish = (field: VoiceField, value: string) => {
    if (field === "body") onBody(value);
    else if (field === "follow-up") onFollowUp(value);
    else onSecondFollowUp(value);
  };

  const fieldValue = (field: VoiceField) => {
    if (field === "body") return state.entry.body;
    if (field === "follow-up") return state.entry.followUp?.response ?? "";
    return state.entry.secondFollowUp?.response ?? "";
  };

  const startVoice = (field: VoiceField) => {
    if (!canSpeak || receiving) return;
    stopVoice();
    anchorRef.current = fieldValue(field);
    fieldRef.current = field;
    setVoiceNote("");
    const capture = createVoiceCapture({
      ontranscript: (update: VoiceTranscript) => {
        const spoken = `${update.committed}${update.interim}`;
        publish(
          fieldRef.current,
          joinVoiceText(anchorRef.current, spoken, FIELD_LIMIT[fieldRef.current]),
        );
      },
      onerror: (code: VoiceCaptureErrorCode) => {
        setListening(false);
        setVoiceNote(voiceErrorCopy(code));
      },
      onend: () => setListening(false),
    });
    captureRef.current = capture;
    setListening(true);
    capture.start();
  };

  const onFieldInput = (field: VoiceField, value: string) => {
    if (listening) stopVoice();
    publish(field, value);
  };

  const phase = listening
    ? "listening"
    : hasBody || question
      ? "writing"
      : "rest";

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "offline"
          ? "Saved on this device"
          : saveState === "error"
            ? "Save needs attention"
            : "";

  const earlierQuestion =
    state.entry.followUp &&
    !state.entry.followUp.skipped &&
    state.stage !== "new" &&
    state.stage !== "writing" &&
    state.stage !== "reflection-offered"
      ? state.entry.followUp
      : undefined;
  const answerId =
    state.stage === "second-reflection-offered"
      ? "second-follow-up-response"
      : "follow-up-response";

  const focusSheet = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button, a, input, textarea, select, label")) return;
    event.preventDefault();
    const next = asks && !receiving ? answerRef.current : bodyRef.current;
    next?.focus({ preventScroll: true });
  };

  const insideCard = (node: EventTarget | null) =>
    node instanceof Node && Boolean(cardRef.current?.contains(node));

  const clearSettle = () => {
    if (settleTimer.current === null) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };

  const holdForControl = () => {
    controlHeld.current = true;
    clearSettle();
    if (controlHoldTimer.current !== null) window.clearTimeout(controlHoldTimer.current);
    controlHoldTimer.current = window.setTimeout(() => {
      controlHeld.current = false;
      controlHoldTimer.current = null;
    }, 500);
  };

  const releaseField = (
    field: "body" | "follow-up",
    value: string,
    event: FocusEvent<HTMLElement>,
  ) => {
    onBlur();
    if (controlHeld.current) {
      controlHeld.current = false;
      return;
    }
    const next = event.relatedTarget;
    if (insideCard(next)) return;
    if (next != null) {
      onSettle(field, value);
      return;
    }
    clearSettle();
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      if (controlHeld.current) return;
      if (insideCard(document.activeElement)) return;
      onSettle(field, value);
    }, KEYBOARD_BLUR_MS);
  };

  useEffect(() => {
    if (!asks || receiving) return;
    const frame = window.requestAnimationFrame(() => {
      answerRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [asks, question?.id, receiving]);

  useEffect(() => {
    if (!quietReply) return;
    const frame = window.requestAnimationFrame(() => {
      const leave = leaveRef.current;
      if (!leave || leave.disabled) return;
      leave.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [quietReply, question?.id]);

  const gardenLine =
    question && !receiving ? (
      <p
        className="sj-converse__ask"
        id="sj-converse-ask"
        key={question.id}
        {...(asks ? {} : { role: "status" as const })}
      >
        {question.renderedText}
      </p>
    ) : null;

  return (
    <>
      <div className="sj-converse__veil" aria-hidden="true" />
      <section
        ref={cardRef}
        className="sj-converse"
        id="main-content"
        data-phase={phase}
        data-stage={state.stage}
        data-alert={completionError ? "true" : undefined}
        aria-labelledby={showOpening ? "sj-converse-prompt" : undefined}
        aria-label={showOpening ? undefined : "Journal"}
        onMouseDown={focusSheet}
        onPointerDown={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("button")) holdForControl();
        }}
      >
        <div className="sj-converse__bar">
          <button
            type="button"
            className="sj-converse__close"
            data-converse-control="close"
            aria-label="Leave journal unfinished"
            onClick={() => {
              stopVoice();
              onClose();
            }}
          >
            <XIcon aria-hidden size={16} />
          </button>
          <SaveStatus label={saveLabel} />
        </div>
        <div className="sj-converse__scroll">
        {resumed ? (
          <p className="sj-converse__resumed">
            Your thought is still here.
            {onFresh ? (
              <button
                type="button"
                className="sj-converse__fresh"
                data-converse-control="fresh"
                onClick={onFresh}
              >
                Start a fresh page
              </button>
            ) : null}
          </p>
        ) : null}

        <div className="sj-converse__thread">
          {showOpening ? (
            <p className="sj-converse__prompt" id="sj-converse-prompt">
              {state.entry.prompt.renderedText}
            </p>
          ) : null}
          {saidBody ? (
            <div className="sj-turn sj-turn--you">
              <span className="sj-turn__who">You</span>
              <p className="sj-converse__said">{saidBody}</p>
            </div>
          ) : null}
          {earlierQuestion ? (
            <div className="sj-converse__earlier">
              <p className="sj-converse__ask">{earlierQuestion.renderedText}</p>
              {earlierQuestion.response.trim() ? (
                <p className="sj-converse__said">{earlierQuestion.response}</p>
              ) : null}
            </div>
          ) : null}
          {state.entry.followUp?.skipped ? (
            <div className="sj-turn sj-turn--seed">
              <span className="sj-turn__who">Seed</span>
              <p className="sj-converse__ask">{state.entry.followUp.renderedText}</p>
            </div>
          ) : null}
          {gardenLine ? (
            <div className="sj-turn sj-turn--seed">
              <span className="sj-turn__who">Seed</span>
              {gardenLine}
            </div>
          ) : null}
        </div>

        {receiving ? (
          <p className="sj-converse__listening" role="status">
            Your sakura is receiving your care…
          </p>
        ) : (
          <div className="sj-converse__composer">
            {asks ? null : (
              <label className="sj-converse__sr" htmlFor="journal-body">
                Journal entry
              </label>
            )}
            {asks ? null : (
              <textarea
                id="journal-body"
                ref={bodyRef}
                className="sj-converse__field"
                data-converse-control="body"
                value={state.entry.body}
                placeholder="Write to the seed…"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  if (!hasBody || receiving) return;
                  stopVoice();
                  onSend();
                }}
                maxLength={FIELD_LIMIT.body}
                rows={3}
                autoFocus
                spellCheck
                onFocus={() =>
                  setFocusChoice({ stage: state.stage, field: "body" })
                }
                onChange={(event) => onFieldInput("body", event.target.value)}
                onBlur={(event) =>
                  releaseField("body", event.currentTarget.value, event)
                }
              />
            )}
            {asks ? (
              <textarea
                id={answerId}
                ref={answerRef}
                className="sj-converse__field sj-converse__field--answer"
                data-converse-control="answer"
                aria-labelledby="sj-converse-ask"
                value={answer}
                placeholder="One honest sentence is enough…"
                maxLength={FIELD_LIMIT["follow-up"]}
                rows={2}
                spellCheck
                onFocus={() =>
                  setFocusChoice({
                    stage: state.stage,
                    field:
                      state.stage === "second-reflection-offered"
                        ? "second"
                        : "follow-up",
                  })
                }
                onChange={(event) =>
                  onFieldInput(
                    state.stage === "second-reflection-offered"
                      ? "second"
                      : "follow-up",
                    event.target.value,
                  )
                }
                onBlur={(event) => {
                  if (state.stage === "second-reflection-offered") {
                    onBlur();
                    return;
                  }
                  releaseField("follow-up", event.currentTarget.value, event);
                }}
              />
            ) : null}
            {canSpeak ? (
              <button
                type="button"
                className="sj-converse__mic"
                data-converse-control="dictate"
                aria-pressed={listening}
                aria-label={listening ? "Stop dictating" : "Dictate"}
                onClick={() => {
                  if (listening) stopVoice();
                  else startVoice(question ? focused : "body");
                }}
              >
                <MicrophoneIcon aria-hidden size={18} weight="regular" />
              </button>
            ) : null}
          </div>
        )}
        {awaitingSeed ? (
          <p className="sj-converse__hint" id="sj-send-hint">
            Send this to the seed. It answers before the tree grows.
          </p>
        ) : null}

        {listening ? (
          <p className="sj-converse__listening" role="status">
            Listening
          </p>
        ) : null}
        {voiceNote ? (
          <p className="sj-converse__dictate-note" role="status">
            {voiceNote}
          </p>
        ) : listening ? (
          <p className="sj-converse__dictate-note" role="status">
            Only these words are saved. This browser may send audio to its own
            speech service. Seed Journal does not keep the recording.
          </p>
        ) : null}
        {question?.renderedText.includes("?") && answer.trim() && !receiving ? (
          <input
            id="seed-insight"
            className="sj-converse__carry-line"
            data-converse-control="insight"
            aria-label="One line to carry, if you want"
            value={state.entry.seedInsight}
            maxLength={1_000}
            placeholder="A sentence worth keeping, if you want one."
            onChange={(event) => onInsight(event.target.value)}
            onBlur={(event) => {
              if (state.stage !== "reflection-offered") {
                onBlur();
                return;
              }
              releaseField("follow-up", answer, event);
            }}
          />
        ) : null}
        </div>

        <div className="sj-converse__actions">
          {showSkip ? (
            <button
              type="button"
              className="sj-converse__quiet"
              data-converse-control="skip"
              onClick={() => {
                stopVoice();
                onSkip();
              }}
            >
              Skip
            </button>
          ) : null}
          <button
            ref={leaveRef}
            type="button"
            className="sj-converse__leave"
            data-converse-control={awaitingSeed ? "send" : "leave"}
            aria-disabled={!hasBody || receiving ? true : undefined}
            aria-describedby={
              awaitingSeed
                ? "sj-send-hint"
                : !hasBody
                  ? "sj-converse-leave-hint"
                  : undefined
            }
            disabled={!hasBody || receiving}
            onClick={() => {
              if (!hasBody || receiving) return;
              stopVoice();
              if (awaitingSeed) onSend();
              else onLeave();
            }}
          >
            {awaitingSeed ? "Send" : "Leave with the tree"}
          </button>
          <p id="sj-converse-leave-hint" className="sj-converse__sr">
            A few words are needed.
          </p>
        </div>
        {completionError ? (
          <p className="sj-converse__dictate-note" role="alert">
            {completionError}
          </p>
        ) : null}
      </section>
    </>
  );
}
