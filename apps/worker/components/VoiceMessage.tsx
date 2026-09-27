"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { JobMessageDTO } from "@handy/contracts";
import { api } from "@/lib/api";
import { clock } from "@/lib/useVoiceRecorder";

/** A voice message bubble: play/pause, how far along it is, and how long it is. */
export default function VoiceMessage({ message, mine }: { message: JobMessageDTO; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const length = message.voiceSeconds ?? 0;

  useEffect(() => () => audioRef.current?.pause(), []);

  async function toggle() {
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    if (!audioRef.current) {
      setLoading(true);
      try {
        // Fetched only when played, so opening a chat stays quick.
        const { mimeType, audioBase64 } = await api.jobs.voiceAudio(message.jobId, message.id);
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audio.onplay = () => setPlaying(true);
        audio.onpause = () => setPlaying(false);
        audio.onended = () => {
          setPlaying(false);
          setProgress(0);
        };
        audio.ontimeupdate = () => setProgress(length ? Math.min(1, audio.currentTime / length) : 0);
        audioRef.current = audio;
      } catch {
        setFailed(true);
        return;
      } finally {
        setLoading(false);
      }
    }
    audioRef.current.play().catch(() => setFailed(true));
  }

  return (
    <div className={`flex items-center gap-3 rounded-control px-3 py-2 ${mine ? "bg-accent text-white" : "border border-line bg-paper text-ink"}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white text-accent" : "bg-accent text-white"}`}
      >
        {playing ? <Pause aria-hidden="true" size={22} /> : <Play aria-hidden="true" size={22} className="ml-0.5" />}
      </button>
      <div className="min-w-[7rem] flex-1">
        <div className={`h-1.5 overflow-hidden rounded-full ${mine ? "bg-white/40" : "bg-line"}`}>
          <div className={`h-full ${mine ? "bg-white" : "bg-accent"}`} style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={`mt-1 text-sm ${mine ? "text-white/90" : "text-ink-soft"}`}>
          {failed ? "Couldn't play this one" : loading ? "Loading…" : `Voice message · ${clock(length)}`}
        </p>
      </div>
    </div>
  );
}
