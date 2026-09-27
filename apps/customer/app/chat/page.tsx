"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Plus } from "lucide-react";
import ChatBubble from "@/components/ChatBubble";
import ConfirmationCard from "@/components/ConfirmationCard";
import Header from "@/components/Header";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import TypingIndicator from "@/components/TypingIndicator";
import { ApiRequestError, type PriceQuoteDTO } from "@handy/contracts";
import { api, friendlyError, saveAccessibility, useRequireLogin } from "@/lib/api";
import { useSpeech } from "@/lib/useSpeech";
import { useVoiceInput } from "@/lib/useVoiceInput";
import type { ConversationDetailResponse, ConversationSummaryDTO, SafetyStatus, SenderType, ServiceRequestDraft } from "@/lib/types";

interface DisplayMessage {
  id: string;
  senderType: SenderType;
  content: string;
}

function newId() {
  return Math.random().toString(36).slice(2);
}

/** The unfinished chat, so leaving the page and coming back picks up where it stopped. */
const ACTIVE_CHAT_KEY = "handy_active_chat";

function storedChatId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

function storeChatId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_CHAT_KEY, id);
    else window.localStorage.removeItem(ACTIVE_CHAT_KEY);
  } catch {
    // Storage blocked: the chat just won't reopen on its own.
  }
}

function callNumberFor(text: string, fallback = "911") {
  return text.includes("988") ? "988" : fallback;
}

function chatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ChatPage() {
  useRequireLogin();
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<ServiceRequestDraft>({});
  const [priceQuote, setPriceQuote] = useState<PriceQuoteDTO | null>(null);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus | null>(null);
  const [callNumber, setCallNumber] = useState("911");
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  /** Set when the chat already became a request (or was dropped): read-only. */
  const [closed, setClosed] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pastChats, setPastChats] = useState<ConversationSummaryDTO[]>([]);
  const [readAloud, setReadAloud] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Refs, not state: two quick calls in a row would both see the old state.
  const sendingRef = useRef(false);
  const initRef = useRef(false);

  const { supported, listening, toggle: toggleVoice, error: voiceError } = useVoiceInput((transcript) => {
    setInput(transcript);
  });
  const speech = useSpeech();

  function toggleMic() {
    speech.stop();
    toggleVoice();
  }

  useEffect(() => {
    api.customers
      .getProfile()
      .then((p) => {
        if (p.accessibilityPreferences?.voiceResponses === false) setReadAloud(false);
      })
      .catch(() => {
        // Keep the default (on). Chat still works without the profile.
      });
  }, []);

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    if (!next) speech.stop();
    saveAccessibility({ voiceResponses: next }).catch(() => {
      // Setting still applies for this visit; it just won't be remembered.
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, readyToSubmit]);

  function loadPastChats() {
    api.conversations
      .list()
      .then(setPastChats)
      .catch(() => {
        // The list is extra; the chat works without it.
      });
  }

  function showConversation({ conversation, messages: stored }: ConversationDetailResponse) {
    // Skip the greeting at the top; a new chat doesn't show it either.
    const firstCustomer = stored.findIndex((m) => m.senderType === "CUSTOMER");
    setMessages(stored.slice(Math.max(firstCustomer, 0)).map((m) => ({ id: m.id, senderType: m.senderType, content: m.content })));
    setConversationId(conversation.id);
    setDraft(conversation.draft);
    setPriceQuote(conversation.priceQuote);
    setReadyToSubmit(conversation.status === "ACTIVE" && conversation.readyToSubmit);
    setSafetyStatus(conversation.safetyStatus);
    const lastAI = [...stored].reverse().find((m) => m.senderType === "AI");
    setCallNumber(callNumberFor(lastAI?.content ?? ""));
    setClosed(conversation.status !== "ACTIVE");
    setRequestId(conversation.serviceRequestId);
    setStarted(true);
  }

  async function openConversation(id: string, { onlyUnfinished = false } = {}) {
    try {
      const detail = await api.conversations.get(id);
      const unfinished = detail.conversation.status === "ACTIVE" && detail.messages.some((m) => m.senderType === "CUSTOMER");
      if (onlyUnfinished && !unfinished) {
        storeChatId(null);
        return;
      }
      speech.stop();
      showConversation(detail);
      storeChatId(unfinished ? id : null);
    } catch {
      storeChatId(null);
    }
  }

  function startNewChat() {
    speech.stop();
    storeChatId(null);
    setConversationId(null);
    setMessages([]);
    setInput("");
    setDraft({});
    setPriceQuote(null);
    setReadyToSubmit(false);
    setSafetyStatus(null);
    setCallNumber("911");
    setClosed(false);
    setRequestId(null);
    setStarted(false);
    loadPastChats();
  }

  useEffect(() => {
    // Strict mode runs effects twice in development; without this guard,
    // "Book again" sent its message twice.
    if (initRef.current) return;
    initRef.current = true;
    loadPastChats();
    // "Book again" links open the chat with the first message already written.
    const first = new URLSearchParams(window.location.search).get("message");
    if (first) {
      // Drop it from the address so a reload doesn't send it again.
      window.history.replaceState(null, "", "/chat");
      send(first);
      return;
    }
    const unfinished = storedChatId();
    if (unfinished) openConversation(unfinished, { onlyUnfinished: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    // Before any await: iPhone Safari only allows speech that starts from a tap.
    speech.stop();
    if (readAloud) speech.unlock();
    setStarted(true);
    setSending(true);
    setInput("");
    setMessages((m) => [
      ...m,
      { id: newId(), senderType: "CUSTOMER", content: trimmed },
    ]);
    try {
      // The backend keeps the conversation, so start one with the first message.
      let id = conversationId;
      if (!id) {
        id = (await api.conversations.create()).conversation.id;
        setConversationId(id);
        storeChatId(id);
      }
      const response = await api.conversations.sendMessage(id, trimmed);
      setMessages((m) => [
        ...m,
        { id: response.assistantMessage.id, senderType: "AI", content: response.assistantMessage.content },
      ]);
      setDraft(response.conversation.draft);
      setPriceQuote(response.conversation.priceQuote);
      setReadyToSubmit(response.conversation.readyToSubmit);
      setSafetyStatus(response.conversation.safetyStatus);
      // Emergencies are always read out, even with read-aloud off.
      if (readAloud || response.conversation.safetyStatus === "POTENTIAL_EMERGENCY") {
        speech.speak(response.assistantMessage.content);
      }
      if (response.conversation.safetyStatus === "POTENTIAL_EMERGENCY") {
        setCallNumber(callNumberFor(response.assistantMessage.content, response.emergency?.callNumber));
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          senderType: "AI",
          content: friendlyError(err, "Sorry, something went wrong on our end. Could you try saying that again?"),
        },
      ]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  async function handleConfirm(agreedTotalCents: number) {
    if (!conversationId) return;
    setSubmitting(true);
    try {
      const { request } = await api.requests.create({ conversationId, agreedTotalCents });
      storeChatId(null);
      router.push(`/request/${request.id}`);
    } catch (err) {
      setSubmitting(false);
      // The price moved: show the new one on the card and have them agree again.
      const newQuote = err instanceof ApiRequestError && err.code === "PRICE_CHANGED" ? (err.details as { priceQuote?: PriceQuoteDTO })?.priceQuote : undefined;
      if (newQuote) setPriceQuote(newQuote);
      else setReadyToSubmit(false);
      setMessages((m) => [...m, { id: newId(), senderType: "AI", content: friendlyError(err) }]);
    }
  }

  function handleEdit() {
    setReadyToSubmit(false);
    setMessages((m) => [
      ...m,
      {
        id: newId(),
        senderType: "AI",
        content: "No problem. What would you like to change?",
      },
    ]);
  }

  const isEmergency = safetyStatus === "POTENTIAL_EMERGENCY";

  return (
    <>
    <Header
      right={
        started && (
          <button
            type="button"
            onClick={startNewChat}
            className="tap-target flex items-center gap-1 rounded-control border-2 border-field bg-white px-3 py-2 text-lg font-bold text-ink hover:border-accent"
          >
            <Plus aria-hidden="true" size={22} strokeWidth={2.5} />
            New chat
          </button>
        )
      }
    />
    <main className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-2xl flex-col px-4 pb-32 pt-6">
      {speech.supported && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={toggleReadAloud}
            aria-pressed={readAloud}
            className="tap-target rounded-control border-2 border-field bg-white px-4 py-2 text-lg font-bold text-ink hover:border-accent"
          >
            {readAloud ? "🔊 Reading replies aloud" : "🔇 Replies are silent"}
          </button>
        </div>
      )}
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
            onMic={toggleMic}
            voiceError={voiceError}
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

          {pastChats.length > 0 && (
            <div className="w-full space-y-2 text-left">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                Your past chats
              </h2>
              <ul className="space-y-2">
                {pastChats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => openConversation(chat.id)}
                      className="tap-target block w-full rounded-control border-2 border-line bg-white px-4 py-3 text-left hover:border-accent"
                    >
                      <span className="block truncate text-lg font-bold text-ink">{chat.title}</span>
                      <span className="block text-ink-soft">
                        {chatDate(chat.updatedAt)} ·{" "}
                        {chat.serviceRequestId ? "Request sent" : chat.status === "ACTIVE" ? "Not finished" : "Closed"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
            {sending && <TypingIndicator />}

            {isEmergency && (
              <div
                role="alert"
                className="rounded-card border-2 border-danger bg-danger-light p-5 text-lg text-danger"
              >
                <p className="font-bold">This may be an emergency.</p>
                <p className="mb-4">
                  Please call {callNumber} right away. Our helpers aren't able
                  to help with emergencies.
                </p>
                <a
                  href={`tel:${callNumber}`}
                  className="tap-target block rounded-control bg-danger px-4 py-4 text-center text-xl font-bold text-white"
                >
                  Call {callNumber}
                </a>
              </div>
            )}

            {readyToSubmit && !isEmergency && (
              <ConfirmationCard
                draft={draft}
                priceQuote={priceQuote}
                onConfirm={handleConfirm}
                onEdit={handleEdit}
                submitting={submitting}
              />
            )}
            <div ref={scrollRef} />
          </div>

          {closed && (
            <div className="fixed bottom-16 left-0 right-0 border-t border-line bg-paper px-4 py-3">
              <div className="mx-auto max-w-2xl space-y-2">
                <p className="text-lg text-ink-soft">
                  {requestId ? "This chat already became a request." : "This chat is finished."}
                </p>
                <div className="flex gap-2">
                  {requestId && (
                    <BigButton onClick={() => router.push(`/request/${requestId}`)}>See the request</BigButton>
                  )}
                  <BigButton variant="secondary" onClick={startNewChat}>
                    New chat
                  </BigButton>
                </div>
              </div>
            </div>
          )}

          {!closed && !readyToSubmit && !isEmergency && (
            <div className="fixed bottom-16 left-0 right-0 border-t border-line bg-paper px-4 py-3">
              <div className="mx-auto max-w-2xl">
                <ChatComposer
                  input={input}
                  setInput={setInput}
                  onSubmit={handleSubmit}
                  supported={supported}
                  listening={listening}
                  onMic={toggleMic}
                  voiceError={voiceError}
                />
              </div>
            </div>
          )}
        </>
      )}

      <NavBar />
    </main>
    </>
  );
}

function ChatComposer({
  input,
  setInput,
  onSubmit,
  supported,
  listening,
  onMic,
  voiceError,
  large,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  supported: boolean;
  listening: boolean;
  onMic: () => void;
  voiceError?: string | null;
  large?: boolean;
}) {
  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex w-full gap-2">
        {supported && (
          <button
            type="button"
            onClick={onMic}
            aria-label={listening ? "Stop listening" : "Tap to speak"}
            aria-pressed={listening}
            className={`tap-target flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
              listening
                ? "animate-pulse-ring bg-warm text-white"
                : "border-2 border-accent bg-white text-accent"
            }`}
          >
            <Mic aria-hidden="true" size={26} strokeWidth={2.25} />
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type what you need…"
          aria-label="What can we help you with?"
          className={`min-w-0 flex-1 rounded-control border-2 border-field bg-white px-4 text-lg text-ink ${
            large ? "py-4" : "py-3"
          }`}
        />
        <BigButton type="submit" fullWidth={false} className="px-5">
          Send
        </BigButton>
      </form>
      {listening && (
        // Visible, not just for screen readers: people need to see the mic is on.
        <p role="status" className="mt-2 flex items-center gap-2 text-lg font-bold text-warm">
          <span className="flex h-5 items-center gap-1" aria-hidden="true">
            {[0, 120, 240, 360].map((delay) => (
              <span
                key={delay}
                className="h-full w-1 origin-center animate-wave rounded-full bg-warm"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          Listening… tap the microphone again when you&apos;re done.
        </p>
      )}
      {!listening && voiceError && (
        // Why the mic stopped, in plain words (blocked, no mic, no internet, nothing heard).
        <p role="alert" className="mt-2 text-lg text-danger">
          {voiceError}
        </p>
      )}
    </div>
  );
}
