// Fast single-process rejection for duplicate submissions. The route also
// holds a database-backed AI operation lease, which provides the authoritative
// cross-instance boundary around provider work and message persistence.
const inFlightConversations = new Set<string>();

export function tryAcquireChatRequestLock(conversationId: string): boolean {
  if (inFlightConversations.has(conversationId)) return false;
  inFlightConversations.add(conversationId);
  return true;
}

export function releaseChatRequestLock(conversationId: string): void {
  inFlightConversations.delete(conversationId);
}
