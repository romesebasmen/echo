"use client";

import { useId, useState, type FormEvent } from "react";
import { useConversation } from "@/lib/echo/chat/useConversation";
import { ChatMessageBubble } from "@/components/echo/chat/ChatMessageBubble";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/echo/chat/request";

export function ChatPanel() {
  const { messages, isLoading, isSending, error, sendMessage } = useConversation();
  const [draft, setDraft] = useState("");
  const inputId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    const success = await sendMessage(draft);
    if (success) {
      setDraft("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-accent">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-muted">Loading conversation…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted">
          No messages yet. Say something to Echo to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm text-muted">
          Message Echo
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a message..."
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            disabled={isSending}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending}
            className="rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
