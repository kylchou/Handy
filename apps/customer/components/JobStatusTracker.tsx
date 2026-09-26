import type { JobStatus } from "@/lib/types";

const STEPS: { status: JobStatus; label: string }[] = [
  { status: "SEARCHING", label: "Request submitted" },
  { status: "MATCHED", label: "Worker matched" },
  { status: "ACCEPTED", label: "Worker accepted" },
  { status: "EN_ROUTE", label: "On the way" },
  { status: "ARRIVED", label: "Arrived" },
  { status: "COMPLETED", label: "Completed" },
];

// IN_PROGRESS visually counts as "arrived and working" on this simplified
// tracker - the customer doesn't need a 7th row for it.
function normalize(status: JobStatus): JobStatus {
  return status === "IN_PROGRESS" ? "ARRIVED" : status;
}

export default function JobStatusTracker({ status }: { status: JobStatus }) {
  const currentIndex = STEPS.findIndex(
    (s) => s.status === normalize(status)
  );

  return (
    <ol className="space-y-4" aria-label="Job status">
      {STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const isCurrent = i === currentIndex && status !== "COMPLETED";
        return (
          <li key={step.status} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                done
                  ? "bg-accent text-white"
                  : "border-2 border-line bg-white text-line"
              }`}
            >
              {done ? "✓" : ""}
            </span>
            <span
              className={`text-lg ${
                done ? "font-bold text-ink" : "text-ink-soft"
              } ${isCurrent ? "text-accent-dark" : ""}`}
            >
              {step.label}
              {isCurrent ? " …" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
