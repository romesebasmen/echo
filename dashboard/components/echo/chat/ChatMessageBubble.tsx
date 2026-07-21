import type { ChatMessage } from "@/lib/echo/types";

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isEcho = message.role === "echo";

  return (
    <li className={`flex flex-col gap-1 ${isEcho ? "items-start" : "items-end"}`}>
      <span className="text-xs uppercase tracking-wide text-muted">
        {isEcho ? "Echo" : "You"}
      </span>
      <p
        className={`max-w-prose rounded-lg px-4 py-2 text-base leading-relaxed text-foreground ${
          isEcho ? "bg-surface" : "border border-border"
        }`}
      >
        {message.content}
      </p>
    </li>
  );
}
