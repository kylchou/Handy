"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Stop this long after the person stops talking. Generous, since older users pause mid-sentence. */
const SILENCE_MS = 3000;

/** Plain-language reason when the mic stops for a reason other than the person finishing. */
const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Click the lock icon next to the web address and allow the microphone.",
  "service-not-allowed": "The microphone is blocked. Click the lock icon next to the web address and allow the microphone.",
  "audio-capture": "No microphone was found. Check that one is plugged in.",
  network: "Voice typing needs an internet connection. It works best in Chrome.",
  "no-speech": "I didn't hear anything. Tap the microphone and try again.",
};

/**
 * Wraps the browser's Web Speech API. Voice is optional per spec - if
 * the browser doesn't support it, `supported` is false and the caller
 * should just hide the microphone button and rely on typing.
 *
 * Keeps listening until a pause of SILENCE_MS or a second tap (toggle),
 * shows words as they're spoken, and reports why it stopped in `error`.
 */
export function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event: any) => {
      // Whole transcript so far (final + in-progress words), so the text box fills in live.
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      onResultRef.current(text.trim());
      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => recognition.stop(), SILENCE_MS);
    };
    recognition.onend = () => {
      clearTimeout(silenceTimer.current);
      setListening(false);
    };
    recognition.onerror = (event: any) => {
      // "aborted" = stopped on purpose; not worth a message.
      if (event.error !== "aborted") {
        setError(ERROR_TEXT[event.error] ?? "Voice typing stopped. You can tap the microphone to try again, or type instead.");
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      clearTimeout(silenceTimer.current);
      recognition.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    try {
      recognitionRef.current.start();
    } catch {
      // Already running; ignore.
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    clearTimeout(silenceTimer.current);
    recognitionRef.current.stop();
  }, []);

  /** Mic button: tap to start, tap again to stop. */
  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported, error, start, stop, toggle };
}
