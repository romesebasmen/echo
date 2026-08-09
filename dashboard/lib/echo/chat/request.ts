export const MAX_CHAT_MESSAGE_LENGTH = 8_000;

export class InvalidChatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidChatRequestError";
  }
}

export interface ChatPostRequest {
  content: string;
}

export function parseChatPostRequest(value: unknown): ChatPostRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidChatRequestError("Request body must be an object.");
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "content") {
    throw new InvalidChatRequestError("Only content is allowed.");
  }

  if (typeof body.content !== "string") {
    throw new InvalidChatRequestError("Message content is required.");
  }

  const content = body.content.trim();
  if (!content) {
    throw new InvalidChatRequestError("Message content is required.");
  }
  if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new InvalidChatRequestError(
      `Message content must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.`,
    );
  }

  return { content };
}
