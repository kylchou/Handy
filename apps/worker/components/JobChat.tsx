"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { JobMessageDTO } from "@handy/contracts";
import { Mic } from "lucide-react";
import Button from "./Button";
import VoiceMessage from "./VoiceMessage";
import { api, friendlyError } from "@/lib/api";
import { clock, useVoiceRecorder } from "@/lib/useVoiceRecorder";

/** Messages with the customer. New ones arrive live through the parent's subscription. */
export default function JobChat({
  jobId,
  customerName,
  messages,
  onSent,
  open,
}: {
  jobId: string;
  customerName: string;
  messages: JobMessageDTO[];
  onSent: (m: JobMessageDTO) => void;
  open: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    setError(null);
    try {
      onSent(await api.jobs.sendMessage(jobId, content));
    } catch (err) {
      setText(content);
      setError(friendlyError(err));
    }
  }

  const [sendingVoice, setSendingVoice] = useState(false);
  const recorder = useVoiceRecorder(async (recording) => {
    setSendingVoice(true);
    setError(null);
    try {
      onSent(await api.jobs.sendVoiceMessage(jobId, recording));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSendingVoice(false);
    }
  });

  return (
    <section aria-label={`Messages with ${customerName}`} className="rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="mb-2 text-lg font-bold text-ink">Messages with {customerName}</h2>
      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
        {messages.length === 0 && <p className="text-ink-soft">No messages yet. Say hi, or ask anything you need to know before you arrive.</p>}
        {messages.map((m) => {
          const mine = m.senderRole === "WORKER";
          return (
            <div key={m.id} className={mine ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}>
              {m.voiceSeconds != null ? (
                <VoiceMessage message={m} mine={mine} />
              ) : (
                <p className={`rounded-control px-3 py-2 ${mine ? "bg-accent text-white" : "border border-line bg-paper text-ink"}`}>{m.content}</p>
              )}
              {mine && m.flags.length > 0 && (
                <p className="mt-1 text-sm text-danger">
                  Flagged: the customer was reminded to only pay through Handy. Never ask for payment, gift cards, or personal info.
                </p>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="mb-2 rounded-control bg-danger-light p-2 text-danger">
          {error}
        </p>
      )}
      {open && recorder.recording ? (
        <div role="status" className="flex items-center gap-2 rounded-control border-2 border-danger bg-danger-light p-2">
          <span aria-hidden="true" className="ml-1 h-3 w-3 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 font-bold text-danger">Recording {clock(recorder.seconds)}</span>
          <button type="button" onClick={recorder.cancel} className="min-h-[44px] px-3 font-bold text-ink-soft">
            Cancel
          </button>
          <Button type="button" fullWidth={false} onClick={recorder.stop}>
            Send
          </Button>
        </div>
      ) : open ? (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            aria-label="Type a message"
            className="min-w-0 flex-1 rounded-control border-2 border-field/60 px-3 py-2 text-lg"
          />
          {recorder.supported && !text.trim() && (
            <button
              type="button"
              onClick={recorder.start}
              disabled={sendingVoice}
              aria-label="Record a voice message"
              className="flex min-h-[48px] w-12 shrink-0 items-center justify-center rounded-control border-2 border-accent text-accent disabled:opacity-50"
            >
              <Mic aria-hidden="true" size={22} />
            </button>
          )}
          <Button type="submit" fullWidth={false}>
            Send
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-soft">Messaging is closed for this job.</p>
      )}
      {sendingVoice && <p className="mt-2 text-sm text-ink-soft">Sending your voice message…</p>}
      {recorder.error && (
        <p role="alert" className="mt-2 text-danger">
          {recorder.error}
        </p>
      )}
    </section>
  );
}
