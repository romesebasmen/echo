// Single-process serialization for the current single-user deployment. This
// prevents rapid duplicate submissions from creating concurrent paid model
// calls or replies based on the same stale conversation history. A durable
// distributed lock would be required before running multiple server instances.
const inFlightConversations = new Set<string>();

export function tryAcquireChatRequestLock(conversationId: string): boolean {
  if (inFlightConversations.has(conversationId)) return false;
  inFlightConversations.add(conversationId);
  return true;
}

export function releaseChatRequestLock(conversationId: string): void {
  inFlightConversations.delete(conversationId);
}
