"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS } from "@handy/contracts";

export interface Recording {
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
}

/** Formats that phones and browsers can both record and play, best first. */
const FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Records a voice message with the microphone. start() asks for the mic,
 * stop() hands the recording to onDone, cancel() throws it away. Stops by
 * itself at MAX_VOICE_SECONDS.
 */
export function useVoiceRecorder(onDone: (recording: Recording) => void) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const keepRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
    return () => {
      clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const finish = useCallback((keep: boolean) => {
    keepRef.current = keep;
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The microphone is blocked. Allow it in your browser settings to send voice messages.");
      return;
    }
    const mimeType = FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    keepRef.current = true;
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const durationSeconds = (Date.now() - startedRef.current) / 1000;
      if (!keepRef.current || durationSeconds < 0.5 || chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result);
        onDoneRef.current({
          audioBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
          mimeType: blob.type.split(";")[0] || "audio/webm",
          durationSeconds: Math.min(durationSeconds, MAX_VOICE_SECONDS),
        });
      };
      reader.readAsDataURL(blob);
    };
    recorderRef.current = recorder;
    startedRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
    recorder.start();
    timerRef.current = setInterval(() => {
      const s = (Date.now() - startedRef.current) / 1000;
      setSeconds(Math.floor(s));
      if (s >= MAX_VOICE_SECONDS) finish(true);
    }, 250);
  }, [finish]);

  return { supported, recording, seconds, error, start, stop: () => finish(true), cancel: () => finish(false) };
}

/** 7 -> "0:07" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
