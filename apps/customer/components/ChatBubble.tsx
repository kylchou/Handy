import type { SenderType } from "@/lib/types";

export default function ChatBubble({
  senderType,
  content,
}: {
  senderType: SenderType;
  content: string;
}) {
  const isCustomer = senderType === "CUSTOMER";
  return (
    <div
      className={`flex w-full animate-fade-up ${
        isCustomer ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] rounded-card px-5 py-3 text-lg leading-snug shadow-soft ${
          isCustomer
            ? "rounded-br-md bg-accent text-white"
            : "rounded-bl-md border border-line bg-white text-ink"
        }`}
      >
        {content}
      </div>
    </div>
  );
}