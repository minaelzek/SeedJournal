export type VoiceCaptureErrorCode =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "unavailable";

/** Session text only. `committed` is finalized phrases; `interim` is the current hypothesis. */
export interface VoiceTranscript {
  committed: string;
  interim: string;
}

export interface VoiceCaptureHandlers {
  ontranscript: (update: VoiceTranscript) => void;
  onerror: (code: VoiceCaptureErrorCode) => void;
  onend: () => void;
}

export interface VoiceCapture {
  start: () => void;
  stop: () => void;
}

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: RecognitionAlternative;
}

interface RecognitionEventLike {
  readonly results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorLike {
  error?: string;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => RecognitionLike;

interface SpeechHost {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

function speechHost(): SpeechHost | null {
  if (typeof window === "undefined") return null;
  return window as Window & SpeechHost;
}

export function speechRecognitionSupported(): boolean {
  const host = speechHost();
  if (!host) return false;
  return Boolean(host.SpeechRecognition ?? host.webkitSpeechRecognition);
}

export function voiceErrorCopy(code: VoiceCaptureErrorCode): string {
  switch (code) {
    case "not-allowed":
      return "The microphone stayed off. You can keep typing.";
    case "no-speech":
      return "No speech heard. You can try again, or keep typing.";
    case "audio-capture":
      return "No microphone was found. You can keep typing.";
    case "network":
    case "unavailable":
      return "Dictation isn't available right now. You can keep typing.";
  }
}

export function joinVoiceText(
  anchor: string,
  spoken: string,
  maxLength: number,
): string {
  if (!spoken) return anchor.slice(0, maxLength);
  if (!anchor) return spoken.slice(0, maxLength);
  const gap =
    /\s$/u.test(anchor) || /^\s/u.test(spoken) ? "" : " ";
  return `${anchor}${gap}${spoken}`.slice(0, maxLength);
}

function readRecognitionTranscript(
  results: ArrayLike<RecognitionResultLike>,
): VoiceTranscript {
  let committed = "";
  let interim = "";
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const text = result?.[0]?.transcript ?? "";
    if (result?.isFinal) committed += text;
    else interim += text;
  }
  return { committed, interim };
}

function mapVoiceError(error: string | undefined): VoiceCaptureErrorCode | null {
  switch (error) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    default:
      return "unavailable";
  }
}

/**
 * Browser speech recognition. Audio is never read, stored, or uploaded by
 * this app — only transcript strings are published.
 *
 * `continuous` stays on so a journal thought can include a pause. The engine
 * is not restarted from `onend`; iOS often ends a phrase on its own, and a
 * restart without a new tap is rejected. The next tap is a new gesture.
 */
export function createVoiceCapture(handlers: VoiceCaptureHandlers): VoiceCapture {
  let generation = 0;
  let recognition: RecognitionLike | null = null;

  return {
    start() {
      const host = speechHost();
      const Ctor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
      if (!Ctor) {
        handlers.onerror("unavailable");
        return;
      }

      generation += 1;
      const token = generation;
      const session = new Ctor();
      recognition = session;
      session.lang = navigator.language || "en-US";
      session.continuous = true;
      session.interimResults = true;
      session.maxAlternatives = 1;

      let previous: VoiceTranscript = { committed: "", interim: "" };
      let sessionPrefix = "";

      session.onresult = (event) => {
        if (token !== generation) return;
        const next = readRecognitionTranscript(event.results);
        if (
          previous.committed &&
          next.committed !== previous.committed &&
          !next.committed.startsWith(previous.committed)
        ) {
          sessionPrefix = joinVoiceText(sessionPrefix, previous.committed, 200_000);
        }
        previous = next;
        handlers.ontranscript({
          committed: joinVoiceText(sessionPrefix, next.committed, 200_000),
          interim: next.interim,
        });
      };

      session.onerror = (event) => {
        if (token !== generation) return;
        const code = mapVoiceError(event.error);
        if (!code) return;
        handlers.onerror(code);
      };

      session.onend = () => {
        if (token !== generation) return;
        handlers.onend();
      };

      try {
        session.start();
      } catch {
        generation += 1;
        handlers.onerror("unavailable");
      }
    },

    stop() {
      const session = recognition;
      generation += 1;
      recognition = null;
      try {
        session?.stop();
      } catch {
        // The engine may already have ended.
      }
      handlers.onend();
    },
  };
}
