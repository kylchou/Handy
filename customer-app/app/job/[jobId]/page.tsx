"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import WorkerCard from "@/components/WorkerCard";
import JobStatusTracker from "@/components/JobStatusTracker";
import {
  getJob,
  getJobMessages,
  rateJob,
  sendJobMessage,
  subscribeToJob,
} from "@/lib/api";
import type { JobDTO, JobMessageDTO } from "@/lib/types";

const STATUS_HEADLINE: Record<string, string> = {
  SEARCHING: "Looking for someone to help…",
  MATCHED: "We've found someone!",
  ACCEPTED: "You're all set.",
  EN_ROUTE: "Your worker is on the way.",
  ARRIVED: "Your worker has arrived.",
  IN_PROGRESS: "Your worker is on the job.",
  COMPLETED: "All done!",
  CANCELLED: "This request was cancelled.",
};

export default function JobPage() {
  const params = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobDTO | null>(null);
  const [messages, setMessages] = useState<JobMessageDTO[]>([]);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    async function load() {
      const j = await getJob(params.jobId);
      setJob(j);
      if (j.status === "ACCEPTED" || j.status === "EN_ROUTE" || j.status === "ARRIVED" || j.status === "IN_PROGRESS") {
        setMessages(await getJobMessages(params.jobId));
      }
      unsubscribe = subscribeToJob(params.jobId, (event) => {
        if (event.type === "MESSAGE_RECEIVED") {
          getJobMessages(params.jobId).then(setMessages);
        } else {
          getJob(params.jobId).then(setJob);
        }
      });
    }
    load();
    return () => unsubscribe?.();
  }, [params.jobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    const msg = await sendJobMessage(params.jobId, content);
    setMessages((m) => [...m, msg]);
  }

  async function handleRate() {
    if (!rating) return;
    await rateJob(params.jobId, rating);
    setRatingSubmitted(true);
  }

  if (!job) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4">
        <p className="text-lg text-ink-soft">Loading your request…</p>
      </main>
    );
  }

  const canMessage = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(
    job.status
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-28 pt-8">
      <h1 className="text-2xl font-bold text-ink">
        {STATUS_HEADLINE[job.status]}
      </h1>

      {job.worker && <WorkerCard worker={job.worker} />}

      <section
        aria-label="Job status"
        className="rounded-card border border-line bg-white p-5 shadow-soft"
      >
        <JobStatusTracker status={job.status} />
      </section>

      {canMessage && (
        <section
          aria-label="Messages with your worker"
          className="rounded-card border border-line bg-white p-5 shadow-soft"
        >
          <h2 className="mb-3 text-lg font-bold text-ink">
            Message {job.worker?.firstName ?? "your worker"}
          </h2>
          <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-ink-soft">
                Let {job.worker?.firstName ?? "your worker"} know anything
                they should know, like where to park or which door to use.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-control px-4 py-2 text-lg ${
                  m.senderType === "CUSTOMER"
                    ? "ml-auto max-w-[85%] bg-accent text-white"
                    : "mr-auto max-w-[85%] border border-line bg-paper text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              aria-label="Type a message"
              className="min-w-0 flex-1 rounded-control border-2 border-line px-4 py-3 text-lg"
            />
            <BigButton type="submit" fullWidth={false} className="px-5">
              Send
            </BigButton>
          </form>
        </section>
      )}

      {job.status === "COMPLETED" && !ratingSubmitted && (
        <section
          aria-label="Rate your service"
          className="rounded-card border-2 border-accent bg-accent-light p-5 text-center"
        >
          <h2 className="mb-3 text-xl font-bold text-ink">
            How did it go?
          </h2>
          <div className="mb-4 flex justify-center gap-2" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                className="tap-target text-4xl"
              >
                {n <= rating ? "★" : "☆"}
              </button>
            ))}
          </div>
          <BigButton onClick={handleRate} disabled={!rating}>
            Submit Rating
          </BigButton>
        </section>
      )}

      {job.status === "COMPLETED" && ratingSubmitted && (
        <p className="text-center text-lg font-bold text-accent-dark">
          Thanks for your feedback!
        </p>
      )}

      <NavBar />
    </main>
  );
}
