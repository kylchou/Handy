"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import WorkerCard from "@/components/WorkerCard";
import JobStatusTracker from "@/components/JobStatusTracker";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { formatDate, formatTime, type JobDetailDTO, type JobMessageDTO } from "@/lib/types";

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

const ACTIVE = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

export default function JobPage() {
  useRequireLogin();
  const params = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobDetailDTO | null>(null);
  const [messages, setMessages] = useState<JobMessageDTO[]>([]);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [j, m] = await Promise.all([api.jobs.get(params.jobId), api.jobs.messages(params.jobId)]);
        if (!active) return;
        setJob(j);
        setMessages(m);
        if (j.rating) setRatingSubmitted(true);
      } catch (err) {
        if (active) setError(friendlyError(err));
      }
    }
    refresh();
    // Status changes and new messages show up live.
    const stop = api.realtime.subscribe(
      (event) => {
        if (!("jobId" in event.data) || event.data.jobId !== params.jobId) return;
        if (event.type === "MESSAGE_RECEIVED") {
          const incoming = event.data.message;
          setMessages((m) => (m.some((x) => x.id === incoming.id) ? m : [...m, incoming]));
        } else {
          refresh();
        }
      },
      { onResync: refresh },
    );
    return () => {
      active = false;
      stop();
    };
  }, [params.jobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    try {
      const msg = await api.jobs.sendMessage(params.jobId, content);
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
    } catch (err) {
      setText(content);
      setError(friendlyError(err));
    }
  }

  async function handleRate() {
    if (!rating) return;
    try {
      await api.jobs.rate(params.jobId, { score: rating });
      setRatingSubmitted(true);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (!job && error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4">
        <p role="alert" className="text-lg text-danger">{error}</p>
        <NavBar />
      </main>
    );
  }

  if (!job) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4">
        <p className="text-lg text-ink-soft">Loading your request…</p>
      </main>
    );
  }

  const canMessage = ACTIVE.includes(job.status);
  const showCode = job.arrivalCode && (job.status === "ACCEPTED" || job.status === "EN_ROUTE");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-28 pt-8">
      <h1 className="text-2xl font-bold text-ink">
        {STATUS_HEADLINE[job.status]}
      </h1>

      <WorkerCard worker={job.worker} distanceMiles={job.distanceMiles} />

      <p className="-mt-2 text-lg text-ink-soft">
        {formatDate(job.request.requestedDate)} at {formatTime(job.request.requestedStartTime)}
      </p>

      {showCode && (
        <section
          aria-label="Arrival code"
          className="rounded-card border-2 border-accent bg-accent-light p-5 text-center"
        >
          <p className="text-lg text-ink">Your arrival code</p>
          <p className="my-2 text-5xl font-bold tracking-[0.3em] text-accent-dark">{job.arrivalCode}</p>
          <p className="text-ink-soft">
            Read this code to {job.worker.firstName} when they arrive, so you know it's really them.
          </p>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
          {error}
        </p>
      )}

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
            Message {job.worker.firstName}
          </h2>
          <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-ink-soft">
                Let {job.worker.firstName} know anything
                they should know, like where to park or which door to use.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.senderRole === "CUSTOMER" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}>
                <div
                  className={`rounded-control px-4 py-2 text-lg ${
                    m.senderRole === "CUSTOMER" ? "bg-accent text-white" : "border border-line bg-paper text-ink"
                  }`}
                >
                  {m.content}
                </div>
                {m.warning && (
                  <p role="alert" className="mt-1 rounded-control border-2 border-danger bg-danger-light px-3 py-2 text-danger">
                    {m.warning}
                  </p>
                )}
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
