// Placeholder for a real AI provider call. Produces a deterministic,
// keyword-based reply so the chat interface is functional before an
// AI API is connected.

const FALLBACK_REPLIES = [
  "Noted. What do you want to do with that?",
  "Sounds like something worth acting on, not just thinking about.",
  "I hear you. Is this a thought for the inbox, or something to build on right now?",
];

export function getMockEchoReply(userMessage: string): string {
  const message = userMessage.toLowerCase();

  if (
    message.includes("idea") ||
    message.includes("content") ||
    message.includes("video")
  ) {
    return "That could be worth developing. Want me to treat it like a possible content idea, or is it just a thought for now?";
  }

  if (
    message.includes("tired") ||
    message.includes("overthink") ||
    message.includes("stuck")
  ) {
    return "Sounds like you're overthinking it. What's the smallest version of this you could just film today?";
  }

  if (message.includes("thanks") || message.includes("thank you")) {
    return "Anytime. Go make something.";
  }

  const index = Math.abs(hashString(message)) % FALLBACK_REPLIES.length;
  return FALLBACK_REPLIES[index];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
