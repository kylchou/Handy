"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { formatDate, formatPrice, formatTime, type ServiceRequestDTO } from "@/lib/types";

export default function RequestStatusPage() {
  useRequireLogin();
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<ServiceRequestDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const req = await api.requests.get(params.requestId);
        if (!active) return;
        // Someone accepted: the job page takes it from here.
        if (req.jobId) router.replace(`/job/${req.jobId}`);
        else setRequest(req);
      } catch (err) {
        if (active) setError(friendlyError(err));
      }
    }

    refresh();
    // Live updates from the backend. Anything about this request means something changed.
    const stop = api.realtime.subscribe(
      (event) => {
        if ("requestId" in event.data && event.data.requestId === params.requestId) refresh();
        if (event.type === "DEMO_RESET") router.replace("/chat");
      },
      { onResync: refresh },
    );
    return () => {
      active = false;
      stop();
    };
  }, [params.requestId, router]);

  async function handleCancel() {
    setCancelling(true);
    try {
      setRequest(await api.requests.cancel(params.requestId));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCancelling(false);
    }
  }

  if (error || request?.status === "CANCELLED" || request?.status === "EXPIRED") {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 pb-24 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {error ? "Something went wrong" : request?.status === "EXPIRED" ? "We couldn't find anyone in time" : "Your request was cancelled"}
        </h1>
        <p className="max-w-sm text-lg text-ink-soft">
          {error ?? (request?.status === "EXPIRED" ? "Nobody was free for that time. Want to try a different day or time?" : "Nothing else to do here.")}
        </p>
        <Link href="/chat" className="tap-target rounded-control bg-accent px-6 py-3 text-lg font-bold text-white">
          Ask for something else
        </Link>
        <NavBar />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 pb-24 text-center">
      <div
        aria-hidden="true"
        className="h-16 w-16 animate-spin rounded-full border-4 border-accent-light border-t-accent motion-reduce:animate-none"
      />
      <h1 className="text-2xl font-bold text-ink">
        Looking for someone to help…
      </h1>
      {request && (
        <>
          <p className="max-w-sm text-lg text-ink-soft">
            We're finding a qualified, available worker near you for{" "}
            {formatDate(request.requestedDate)} at {formatTime(request.requestedStartTime)}.
            {request.pendingOfferCount > 0 && ` We've asked ${request.pendingOfferCount} ${request.pendingOfferCount === 1 ? "person" : "people"} so far.`}
          </p>
          <p className="text-lg text-ink-soft">
            Price you agreed to: <strong className="text-ink">{formatPrice(request.totalPriceCents)}</strong>
          </p>
          <div className="w-full max-w-sm">
            <BigButton variant="secondary" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </BigButton>
          </div>
        </>
      )}
      <NavBar />
    </main>
  );
}
