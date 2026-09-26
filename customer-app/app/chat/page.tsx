"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatBubble from "@/components/ChatBubble";
import ConfirmationCard from "@/components/ConfirmationCard";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { confirmServiceRequest, sendChatMessage } from "@/lib/api";
import { useVoiceInput } from "@/lib/useVoiceInput";
import type {
  ChatSenderType,
  SafetyStatus,
  ServiceRequestDTO,
} from "@/lib/types";

interface DisplayMessage {
  id: string;
  senderType: ChatSenderType;
  content: string;
}

function newId() {
  return Math.random().toString(36).slice(2);
}

export default function ChatPage() {
  const router = useRouter();
  const [conversationId] = useState(() => newId());
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<Partial<ServiceRequestDTO>>({});
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { supported, listening, start } = useVoiceInput((transcript) => {
    setInput(transcript);
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, readyToSubmit]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setStarted(true);
    setSending(true);
    setInput("");
    setMessages((m) => [
      ...m,
      { id: newId(), senderType: "CUSTOMER", content: trimmed },
    ]);
    try {
      const response = await sendChatMessage(conversationId, trimmed);
      setMessages((m) => [
        ...m,
        { id: newId(), senderType: "AI", content: response.message },
      ]);
      setDraft((d) => ({ ...d, ...response.extractedData }));
      setReadyToSubmit(response.readyToSubmit);
      setSafetyStatus(response.safetyStatus);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          senderType: "AI",
          content:
            "Sorry, something went wrong on our end. Could you try saying that again?",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const request = await confirmServiceRequest(
        "customer_demo_1",
        conversationId,
        draft
      );
      router.push(`/request/${request.id}`);
    } catch {
      setSubmitting(false);
    }
  }

  function handleEdit() {
    setReadyToSubmit(false);
    setMessages((m) => [
      ...m,
      {
        id: newId(),
        senderType: "AI",
        content: "No problem — what would you like to change?",
      },
    ]);
  }

  const isEmergency = safetyStatus === "POTENTIAL_EMERGENCY";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-32 pt-8">
      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <h1 className="text-3xl font-bold text-ink">
            What can we help you with?
          </h1>
          <p className="max-w-sm text-lg text-ink-soft">
            Type what you need, or tap the microphone to speak. There's
            nothing else to fill out.
          </p>
          <ChatComposer
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            supported={supported}
            listening={listening}
            onMic={start}
            large
          />
          <div className="w-full space-y-2 text-left text-ink-soft">
            <p className="text-sm font-bold uppercase tracking-wide">
              For example
            </p>
            {[
              "I need someone to take my dog to the vet.",
              "My sink is leaking.",
              "I need a ride to my doctor's appointment.",
            ].map((example) => (
              <button
                key={example}
                onClick={() => send(example)}
                className="tap-target block w-full rounded-control border border-line bg-white px-4 py-3 text-left text-lg hover:border-accent"
              >
                “{example}”
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4">
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                senderType={m.senderType}
                content={m.content}
              />
            ))}
            {sending && (
              <ChatBubble senderType="AI" content="Thinking…" />
            )}

            {isEmergency && (
              <div
                role="alert"
                className="rounded-card border-2 border-danger bg-danger-light p-5 text-lg text-danger"
              >
                <p className="font-bold">This may be an emergency.</p>
                <p>
                  Please call 911 or your local emergency number right away.
                  This platform is not able to help with medical emergencies.
                </p>
              </div>
            )}

            {readyToSubmit && !isEmergency && (
              <ConfirmationCard
                draft={draft}
                onConfirm={handleConfirm}
                onEdit={handleEdit}
                submitting={submitting}
              />
            )}
            <div ref={scrollRef} />
          </div>

          {!readyToSubmit && !isEmergency && (
            <div className="fixed bottom-16 left-0 right-0 border-t border-line bg-paper px-4 py-3">
              <div className="mx-auto max-w-2xl">
                <ChatComposer
                  input={input}
                  setInput={setInput}
                  onSubmit={handleSubmit}
                  supported={supported}
                  listening={listening}
                  onMic={start}
                />
              </div>
            </div>
          )}
        </>
      )}

      <NavBar />
    </main>
  );
}

function ChatComposer({
  input,
  setInput,
  onSubmit,
  supported,
  listening,
  onMic,
  large,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  supported: boolean;
  listening: boolean;
  onMic: () => void;
  large?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="flex w-full gap-2">
      {supported && (
        <button
          type="button"
          onClick={onMic}
          aria-label={listening ? "Listening…" : "Tap to speak"}
          className={`tap-target flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl ${
            listening
              ? "bg-warm text-white"
              : "bg-white text-accent border-2 border-accent"
          }`}
        >
          🎤
        </button>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type what you need…"
        aria-label="What can we help you with?"
        className={`min-w-0 flex-1 rounded-control border-2 border-line bg-white px-4 text-lg text-ink ${
          large ? "py-4" : "py-3"
        }`}
      />
      <BigButton type="submit" fullWidth={false} className="px-5">
        Send
      </BigButton>
    </form>
  );
}
