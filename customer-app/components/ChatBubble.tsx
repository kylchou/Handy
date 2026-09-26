import type { ChatSenderType } from "@/lib/types";

export default function ChatBubble({
  senderType,
  content,
}: {
  senderType: ChatSenderType;
  content: string;
}) {
  const isCustomer = senderType === "CUSTOMER";
  return (
    <div
      className={`flex w-full ${isCustomer ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-card px-5 py-3 text-lg leading-snug shadow-soft ${
          isCustomer
            ? "bg-accent text-white"
            : "border border-line bg-white text-ink"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
