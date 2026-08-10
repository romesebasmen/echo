import { after } from "next/server";
import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import {
  ChatProviderUnavailableError,
  getClaudeReply,
  InvalidChatProviderResponseError,
} from "@/lib/echo/ai/claude-responder";
import {
  fromRole,
  getOrCreateConversationId,
  getRecentMessages,
  toMessage,
} from "@/lib/echo/chat/conversation-store";
import { getRelevantMemories } from "@/lib/echo/memories/retrieval";
import { extractAndApplyMemories } from "@/lib/echo/memories/extraction-service";
import { formatError } from "@/lib/echo/errors";
import {
  releaseChatRequestLock,
  tryAcquireChatRequestLock,
} from "@/lib/echo/chat/request-lock";
import {
  InvalidChatRequestError,
  parseChatPostRequest,
} from "@/lib/echo/chat/request";
import type { Memory } from "@/lib/echo/types";
import {
  AiOperationInProgressError,
  AiOperationLeaseUnavailableError,
  createAiOperationKey,
} from "@/lib/echo/ai/operation-lease";
import { runWithAiOperationLease } from "@/lib/echo/ai/operation-lease-server";

const RECENT_HISTORY_LIMIT = 20;
const RELEVANT_MEMORY_LIMIT = 20;

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return Response.json({
      conversationId,
      messages: (data ?? []).map(toMessage),
    });
  } catch (error) {
    console.error("GET /api/chat failed:", formatError(error));
    return Response.json(
      { error: "Could not load conversation." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let lockedConversationId: string | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    const { content } = parseChatPostRequest(body);

    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();
    if (!tryAcquireChatRequestLock(conversationId)) {
      return Response.json(
        { error: "Echo is already responding to this conversation." },
        { status: 409 },
      );
    }
    lockedConversationId = conversationId;

    const exchange = await runWithAiOperationLease(
      createAiOperationKey("chat", conversationId),
      async () => {
        // The new message is passed separately to the provider, so it is not
        // included in this history query.
        const recentHistory = await getRecentMessages(RECENT_HISTORY_LIMIT);

        let relevantMemories: Memory[];
        try {
          relevantMemories = await getRelevantMemories(RELEVANT_MEMORY_LIMIT);
        } catch (memoryError) {
          console.error(
            "Fetching relevant memories failed, continuing without them:",
            formatError(memoryError),
          );
          relevantMemories = [];
        }

        const replyText = await getClaudeReply(
          recentHistory,
          content,
          relevantMemories,
        );

        // One PostgreSQL insert statement keeps the exchange atomic: a provider
        // failure writes neither side, and a database failure cannot leave only
        // one half of a successfully generated exchange.
        const { data: messageRows, error: messageError } = await supabase
          .from("messages")
          .insert([
            {
              conversation_id: conversationId,
              role: fromRole("user"),
              content,
            },
            {
              conversation_id: conversationId,
              role: fromRole("echo"),
              content: replyText,
            },
          ])
          .select("*");

        if (messageError) throw messageError;
        const userRow = messageRows?.find(
          (row) => row.role === fromRole("user"),
        );
        const echoRow = messageRows?.find(
          (row) => row.role === fromRole("echo"),
        );
        if (!userRow || !echoRow) {
          throw new Error("The saved chat exchange was incomplete.");
        }

        const { error: touchError } = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (touchError) {
          // The exchange is already safely persisted. Conversation recency is
          // useful metadata, but its failure must not encourage a duplicate retry.
          console.error(
            "Updating conversation recency failed:",
            formatError(touchError),
          );
        }

        // Memory extraction runs after the response is sent — its failure must
        // never affect the chat reply the user already received.
        after(async () => {
          try {
            const appliedCount = await extractAndApplyMemories({
              userMessage: content,
              echoReply: replyText,
              sourceMessageId: userRow.id as string,
            });
            if (appliedCount > 0) {
              console.log(
                `Memory extraction applied ${appliedCount} operation(s).`,
              );
            }
          } catch (extractionError) {
            console.error(
              "Memory extraction failed:",
              formatError(extractionError),
            );
          }
        });

        return {
          userMessage: toMessage(userRow),
          echoMessage: toMessage(echoRow),
        };
      },
    );

    return Response.json(exchange, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidChatRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof AiOperationInProgressError) {
      return Response.json(
        { error: "Echo is already responding to this conversation." },
        { status: 409 },
      );
    }

    if (error instanceof AiOperationLeaseUnavailableError) {
      console.error("POST /api/chat failed:", formatError(error));
      return Response.json(
        { error: "Echo couldn't safely coordinate this response." },
        { status: 503 },
      );
    }

    console.error("POST /api/chat failed:", formatError(error));

    if (
      error instanceof ChatProviderUnavailableError ||
      error instanceof InvalidChatProviderResponseError
    ) {
      return Response.json(
        {
          error:
            "Echo couldn't respond because its AI provider is unavailable.",
        },
        { status: 502 },
      );
    }

    return Response.json({ error: "Could not send message." }, { status: 500 });
  } finally {
    if (lockedConversationId) {
      releaseChatRequestLock(lockedConversationId);
    }
  }
}

export async function DELETE() {
  let lockedConversationId: string | null = null;

  try {
    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();
    if (!tryAcquireChatRequestLock(conversationId)) {
      return Response.json(
        { error: "Wait for Echo to finish responding before clearing the chat." },
        { status: 409 },
      );
    }
    lockedConversationId = conversationId;

    await runWithAiOperationLease(
      createAiOperationKey("chat", conversationId),
      async () => {
        const { error } = await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", conversationId);

        if (error) throw error;
      },
    );

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AiOperationInProgressError) {
      return Response.json(
        { error: "Wait for Echo to finish responding before clearing the chat." },
        { status: 409 },
      );
    }

    if (error instanceof AiOperationLeaseUnavailableError) {
      console.error("DELETE /api/chat failed:", formatError(error));
      return Response.json(
        { error: "Echo couldn't safely coordinate clearing this conversation." },
        { status: 503 },
      );
    }

    console.error("DELETE /api/chat failed:", formatError(error));
    return Response.json(
      { error: "Could not clear conversation." },
      { status: 500 },
    );
  } finally {
    if (lockedConversationId) {
      releaseChatRequestLock(lockedConversationId);
    }
  }
}
