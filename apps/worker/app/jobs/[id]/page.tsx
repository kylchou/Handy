"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, Navigation } from "lucide-react";
import { nextWorkerJobStatus, type JobDetailDTO, type JobMessageDTO, type JobOfferDTO, type JobStatus } from "@handy/contracts";
import Button from "@/components/Button";
import JobChat from "@/components/JobChat";
import Page, { ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { CATEGORY_LABELS, formatDay, formatMiles, formatPay, formatWindow, STATUS_LABELS } from "@/lib/format";
import { timeLeft, useNow } from "@/lib/useNow";

/** The button for each step, in the order the spec lists them. */
const STEP_LABELS: Partial<Record<JobStatus, string>> = {
  EN_ROUTE: "I'm On My Way",
  ARRIVED: "I've Arrived",
  IN_PROGRESS: "Start Job",
  COMPLETED: "Complete Job",
};

const HEADLINES: Record<string, string> = {
  ACCEPTED: "You got the job",
  EN_ROUTE: "Heading there",
  ARRIVED: "You're there",
  IN_PROGRESS: "Working on it",
  COMPLETED: "Job done",
  CANCELLED: "This job was cancelled",
};

/** /jobs/[id] shows an open offer (with ?offer=1) or a job you've accepted. */
export default function JobPage() {
  useRequireLogin();
  const params = useParams<{ id: string }>();
  const isOffer = useSearchParams().get("offer") === "1";
  return isOffer ? <OfferDetails offerId={params.id} /> : <JobDetails jobId={params.id} />;
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-lg text-ink">
      <span className="mt-1 text-ink-soft">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function OfferDetails({ offerId }: { offerId: string }) {
  const router = useRouter();
  const now = useNow();
  const [offer, setOffer] = useState<JobOfferDTO | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    api.jobs
      .available()
      .then((all) => setOffer(all.find((o) => o.id === offerId) ?? null))
      .catch((err) => setError(friendlyError(err)));
    // If someone else takes it while they're looking, say so right away.
    return api.realtime.subscribe((event) => {
      if (event.type === "JOB_NO_LONGER_AVAILABLE" && event.data.offerId === offerId) setOffer(null);
    });
  }, [offerId]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const job = await api.jobs.acceptOffer(offerId);
      router.replace(`/jobs/${job.id}`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      await api.jobs.declineOffer(offerId);
    } catch {
      // Already gone is fine, it's off their list either way.
    }
    router.replace("/dashboard");
  }

  if (offer === undefined) return <Page title="Job details">{error ? <ErrorNote>{error}</ErrorNote> : <p className="text-ink-soft">Loading…</p>}</Page>;
  if (offer === null) {
    return (
      <Page title="Job details">
        <div className="space-y-4 text-center">
          <p className="text-lg text-ink">This job isn't available anymore. Someone else may have taken it, or the offer ran out.</p>
          <Link href="/dashboard" className="inline-block rounded-control bg-accent px-5 py-3 font-bold text-white">
            Back to jobs
          </Link>
        </div>
      </Page>
    );
  }

  const left = timeLeft(offer.expiresAt, now);
  return (
    <Page title="Job details">
      <div className="space-y-4">
        <section className="space-y-2 rounded-card border border-line bg-white p-5 shadow-card">
          <p className="text-2xl font-bold text-ink">{offer.serviceName}</p>
          {formatMiles(offer.distanceMiles) && <Row icon={<MapPin size={18} />}>{formatMiles(offer.distanceMiles)} · {offer.approximateLocation}</Row>}
          <Row icon={<Calendar size={18} />}>
            {formatDay(offer.requestedDate)}, {formatWindow(offer.requestedStartTime, offer.requestedEndTime)}
          </Row>
          <div className="pt-2">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{offer.customer.firstName}'s request</p>
            <p className="text-lg text-ink">"{offer.description}"</p>
          </div>
          {offer.specialRequirements.length > 0 && (
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">Good to know</p>
              <ul className="list-inside list-disc text-ink">
                {offer.specialRequirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-end justify-between border-t border-line pt-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">You'll earn</p>
              <p className="text-3xl font-bold text-accent">{formatPay(offer.estimatedPayCents)}</p>
            </div>
            <p className={`font-bold ${left ? "text-warm" : "text-danger"}`}>{left ?? "Offer expired"}</p>
          </div>
          <dl className="space-y-0.5 text-ink-soft">
            <div className="flex justify-between">
              <dt>{offer.serviceName}</dt>
              <dd>{formatPay(offer.estimatedPayCents - offer.urgentBonusCents - offer.tipCents)}</dd>
            </div>
            {offer.urgentBonusCents > 0 && (
              <div className="flex justify-between">
                <dt>Urgent bonus</dt>
                <dd>+{formatPay(offer.urgentBonusCents)}</dd>
              </div>
            )}
            {offer.tipCents > 0 && (
              <div className="flex justify-between font-bold text-accent">
                <dt>Tip from {offer.customer.firstName}</dt>
                <dd>+{formatPay(offer.tipCents)}</dd>
              </div>
            )}
          </dl>
          <p className="text-sm text-ink-soft">
            {offer.customer.firstName} already agreed to this price. It's paid to you through Handy once you complete the job.
          </p>
        </section>
        <p className="text-sm text-ink-soft">You'll see the exact address after you accept.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={accept} disabled={busy || !left}>
            Accept for {formatPay(offer.estimatedPayCents)}
          </Button>
          <Button variant="secondary" onClick={decline} disabled={busy}>
            Decline
          </Button>
        </div>
      </div>
    </Page>
  );
}

function JobDetails({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetailDTO | null>(null);
  const [messages, setMessages] = useState<JobMessageDTO[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [j, m] = await Promise.all([api.jobs.get(jobId), api.jobs.messages(jobId)]);
      setJob(j);
      setMessages(m);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [jobId]);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    refresh();
    return api.realtime.subscribe(
      (event) => {
        if (event.type === "DEMO_RESET") return router.replace("/dashboard");
        if (!("jobId" in event.data) || event.data.jobId !== jobId) return;
        if (event.type === "MESSAGE_RECEIVED") {
          const incoming = event.data.message;
          setMessages((m) => (m.some((x) => x.id === incoming.id) ? m : [...m, incoming]));
        } else refresh();
      },
      { onResync: refresh },
    );
  }, [jobId, refresh, router]);

  async function advance(e?: FormEvent) {
    e?.preventDefault();
    if (!job) return;
    const next = nextWorkerJobStatus(job.status);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setJob(next === "ARRIVED" ? await api.jobs.arrive(jobId, code.trim()) : await api.jobs.updateStatus(jobId, next));
      setCode("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this job? It goes back out to other workers, and cancelling often can affect your account.")) return;
    setBusy(true);
    try {
      setJob(await api.jobs.updateStatus(jobId, "CANCELLED", { reason: "Worker cancelled" }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!job) return <Page title="Your job">{error ? <ErrorNote>{error}</ErrorNote> : <p className="text-ink-soft">Loading…</p>}</Page>;

  const next = nextWorkerJobStatus(job.status);
  const active = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(job.status);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.request.location)}`;

  return (
    <Page title={HEADLINES[job.status] ?? "Your job"}>
      <div className="space-y-4">
        <section className="space-y-2 rounded-card border border-line bg-white p-5 shadow-card">
          <p className="text-sm font-bold uppercase tracking-wide text-accent">{STATUS_LABELS[job.status]}</p>
          <p className="text-2xl font-bold text-ink">
            {CATEGORY_LABELS[job.request.serviceCategoryId] ?? "Job"} for {job.customer.displayName}
          </p>
          <p className="text-lg text-ink">"{job.request.description}"</p>
          <Row icon={<Calendar size={18} />}>
            {formatDay(job.request.requestedDate)}, {formatWindow(job.request.requestedStartTime, job.request.requestedEndTime)}
          </Row>
          <Row icon={<MapPin size={18} />}>
            {job.request.location}
            {job.distanceMiles != null && <span className="text-ink-soft"> · {job.distanceMiles.toFixed(1)} mi</span>}
          </Row>
          {active && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-accent underline">
              <Navigation aria-hidden="true" size={16} /> Directions
            </a>
          )}
          {job.request.specialRequirements.length > 0 && (
            <ul className="list-inside list-disc text-ink">
              {job.request.specialRequirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="border-t border-line pt-2 text-lg">
            {job.status === "COMPLETED" ? "You earned" : "You'll earn"}: <strong>{formatPay(job.finalPriceCents ?? job.request.workerPayCents)}</strong>
            {job.request.tipCents > 0 && <span className="text-base text-ink-soft"> (includes a {formatPay(job.request.tipCents)} tip)</span>}
            {active && <span className="text-base text-ink-soft"> · paid through Handy once you complete the job</span>}
          </p>
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}

        {next === "ARRIVED" ? (
          <form onSubmit={advance} className="space-y-2 rounded-card border-2 border-accent bg-accent-light p-4">
            <label htmlFor="code" className="block text-lg font-bold text-ink">
              Ask {job.customer.firstName} for their 4-digit arrival code
            </label>
            <p className="text-ink-soft">It proves you're at the right door. They have it in their app.</p>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-40 rounded-control border-2 border-field/60 bg-white px-4 py-3 text-center text-3xl font-bold tracking-[0.4em]"
            />
            <Button type="submit" disabled={busy || code.length !== 4}>
              I've Arrived
            </Button>
          </form>
        ) : (
          next && (
            <Button onClick={() => advance()} disabled={busy}>
              {STEP_LABELS[next]}
            </Button>
          )
        )}

        {job.status === "COMPLETED" && (
          <div className="rounded-card border-2 border-accent bg-accent-light p-4 text-center">
            <p className="text-xl font-bold text-ink">Nice work! {formatPay(job.finalPriceCents ?? job.request.workerPayCents)} earned.</p>
            {job.rating ? (
              <p className="text-lg text-ink">
                {job.customer.firstName} gave you {"★".repeat(job.rating.score)}
                {job.rating.comment && <span className="block text-ink-soft">"{job.rating.comment}"</span>}
              </p>
            ) : (
              <p className="text-ink-soft">{job.customer.firstName} hasn't rated this job yet.</p>
            )}
          </div>
        )}

        <JobChat jobId={jobId} customerName={job.customer.firstName} messages={messages} open={active} onSent={(m) => setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]))} />

        {active && job.status !== "IN_PROGRESS" && (
          <Button variant="danger" onClick={cancel} disabled={busy}>
            Cancel Job
          </Button>
        )}
      </div>
    </Page>
  );
}
