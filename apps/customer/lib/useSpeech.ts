"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A little slower than normal, easier to follow. */
const RATE = 0.9;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return (
    english.find((v) => v.lang === "en-US" && v.localService) ??
    english.find((v) => v.lang === "en-US") ??
    english[0] ??
    null
  );
}

/**
 * Wraps the browser's speechSynthesis to read replies aloud. Optional like
 * voice input - if the browser can't speak, `supported` is false and the
 * caller should hide the read-aloud toggle.
 *
 * iPhone Safari only speaks if speech first starts inside a tap, so call
 * `unlock()` from the tap handler before any await.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const synth = window.speechSynthesis;
    // Voices load late in Chrome, so check again when they arrive.
    const load = () => {
      voiceRef.current = pickVoice(synth.getVoices());
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = RATE;
      utterance.lang = voiceRef.current?.lang ?? "en-US";
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [supported],
  );

  /** Must run inside a tap. Speaks nothing, but lets later speak() calls work on iPhone. */
  const unlock = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }, [supported]);

  return { supported, speaking, speak, stop, unlock };
}
