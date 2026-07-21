import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/echo/types";

interface ChatGetResponse {
  conversationId: string;
  messages: ChatMessage[];
}

interface ChatPostResponse {
  userMessage: ChatMessage;
  echoMessage: ChatMessage;
}

interface ErrorResponse {
  error: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

export function useConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat");
      const body = (await response.json()) as ChatGetResponse | ErrorResponse;
      if (!response.ok || !("messages" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
      setMessages(body.messages);
    } catch {
      setError("Could not load the conversation. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching data on mount is a legitimate use of an Effect (React docs,
    // "You Might Not Need an Effect" -> "Fetching data"); the setState calls
    // happen after the request resolves, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversation();
  }, [loadConversation]);

  async function sendMessage(content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) return false;

    setError(null);
    setIsSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const body = (await response.json()) as ChatPostResponse | ErrorResponse;
      if (!response.ok || !("userMessage" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
      setMessages((previous) => [...previous, body.userMessage, body.echoMessage]);
      return true;
    } catch {
      setError("Echo couldn't respond just now. Please try again.");
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function clearConversation(): Promise<void> {
    setError(null);
    const previousMessages = messages;
    setMessages([]);

    try {
      const response = await fetch("/api/chat", { method: "DELETE" });
      if (!response.ok) throw new Error(GENERIC_ERROR);
    } catch {
      setMessages(previousMessages);
      setError("Could not clear the conversation. Please try again.");
    }
  }

  return {
    messages,
    isLoading,
    isSending,
    error,
    sendMessage,
    clearConversation,
  };
}
