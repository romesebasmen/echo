import { getSupabaseServerClient } from "../supabase/server-client.ts";
import type { ServiceRoleRpcCaller } from "../supabase/service-role-client.ts";
import type { ChatMessage, MessageRole } from "../types/index.ts";

export class ConversationBootstrapPersistenceError extends Error {
  readonly code: string | null;

  constructor(code: string | null = null) {
    super("Echo could not load its conversation.");
    this.name = "ConversationBootstrapPersistenceError";
    this.code = code;
  }
}

export class MissingConversationBootstrapMigrationError extends Error {
  constructor() {
    super(
      "The conversation-bootstrap migration has not been applied. Apply the version-controlled Supabase migrations, then try again.",
    );
    this.name = "MissingConversationBootstrapMigrationError";
  }
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

// The `messages` table's `role` column has a check constraint accepting
// only "user" | "assistant" | "system" (confirmed by probing the live
// table) — not "echo". The app-facing MessageRole stays "user" | "echo"
// since that's what the UI already renders; these two functions translate
// at the persistence boundary.
export function toMessage(row: MessageRow): ChatMessage {
  const role: MessageRole = row.role === "assistant" ? "echo" : "user";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function fromRole(role: MessageRole): string {
  return role === "echo" ? "assistant" : "user";
}

export async function getOrCreateConversationId(): Promise<string> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return getOrCreateConversationIdWithRpc(callSupabaseServiceRoleRpc);
}

export async function getOrCreateConversationIdWithRpc(
  callRpc: ServiceRoleRpcCaller,
): Promise<string> {
  const { data, error } = await callRpc("get_or_create_echo_conversation", {});
  if (error) {
    const message = error.message ?? "";
    if (
      (error.code === "PGRST202" || error.code === "42883") &&
      message.toLowerCase().includes("get_or_create_echo_conversation")
    ) {
      throw new MissingConversationBootstrapMigrationError();
    }
    const code =
      typeof error.code === "string" && /^[A-Z0-9]{2,10}$/.test(error.code)
        ? error.code
        : null;
    throw new ConversationBootstrapPersistenceError(code);
  }
  if (
    typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data,
    )
  ) {
    throw new ConversationBootstrapPersistenceError();
  }
  return data;
}

export async function getRecentMessages(limit: number): Promise<ChatMessage[]> {
  const supabase = getSupabaseServerClient();
  const conversationId = await getOrCreateConversationId();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).slice().reverse().map(toMessage);
}
