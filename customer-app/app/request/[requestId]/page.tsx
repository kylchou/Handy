"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getJobForRequest, getRequest, subscribeToJob } from "@/lib/api";
import type { JobDTO, ServiceRequestDTO } from "@/lib/types";

export default function RequestStatusPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<ServiceRequestDTO | null>(null);
  const [job, setJob] = useState<JobDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const req = await getRequest(params.requestId);
      if (cancelled) return;
      setRequest(req);

      // Poll briefly for the job to be created, then switch to
      // realtime events once we have a jobId.
      pollTimer = setInterval(async () => {
        const j = await getJobForRequest(params.requestId);
        if (!j) return;
        clearInterval(pollTimer);
        setJob(j);
        if (j.status !== "SEARCHING") {
          router.replace(`/job/${j.id}`);
          return;
        }
        unsubscribe = subscribeToJob(j.id, (event) => {
          if (event.type !== "REQUEST_CREATED") {
            router.replace(`/job/${j.id}`);
          }
        });
      }, 800);
    }
    load();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      unsubscribe?.();
    };
  }, [params.requestId, router]);

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
        <p className="max-w-sm text-lg text-ink-soft">
          We're finding a qualified, available worker near you for your{" "}
          {request.requestedDate} request. This usually only takes a moment.
        </p>
      )}
      <NavBar />
    </main>
  );
}
