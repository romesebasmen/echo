import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type { ChatMessage, MessageRole } from "@/lib/echo/types";

const USER_ID = "sebastian";

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
  const supabase = getSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({ user_id: USER_ID, title: "Echo chat" })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id as string;
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
