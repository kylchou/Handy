"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { JobMessageDTO } from "@handy/contracts";
import Button from "./Button";
import { api, friendlyError } from "@/lib/api";

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

  return (
    <section aria-label={`Messages with ${customerName}`} className="rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="mb-2 text-lg font-bold text-ink">Messages with {customerName}</h2>
      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
        {messages.length === 0 && <p className="text-ink-soft">No messages yet. Say hi, or ask anything you need to know before you arrive.</p>}
        {messages.map((m) => {
          const mine = m.senderRole === "WORKER";
          return (
            <div key={m.id} className={mine ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}>
              <p className={`rounded-control px-3 py-2 ${mine ? "bg-accent text-white" : "border border-line bg-paper text-ink"}`}>{m.content}</p>
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
      {open ? (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            aria-label="Type a message"
            className="min-w-0 flex-1 rounded-control border-2 border-field/60 px-3 py-2 text-lg"
          />
          <Button type="submit" fullWidth={false}>
            Send
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-soft">Messaging is closed for this job.</p>
      )}
    </section>
  );
}
