/** "Thinking…" bubble with three bouncing dots, so a slow AI reply doesn't look frozen. */
export default function TypingIndicator() {
  return (
    <div className="flex w-full animate-fade-up justify-start">
      <div
        role="status"
        aria-label="Thinking"
        className="flex items-center gap-3 rounded-card rounded-bl-md border border-line bg-white px-5 py-4 shadow-soft"
      >
        <span className="flex items-end gap-1.5" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-accent"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="text-lg text-ink-soft">Thinking…</span>
      </div>
    </div>
  );
}
