import { createHmac, timingSafeEqual } from "node:crypto";

export const ECHO_SESSION_COOKIE = "echo_session";
export const ECHO_SESSION_DURATION_SECONDS = 12 * 60 * 60;

const SESSION_VERSION = 1;
const SESSION_SUBJECT = "sebastian";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type SessionPayload = {
  version: typeof SESSION_VERSION;
  subject: typeof SESSION_SUBJECT;
  issuedAt: number;
  expiresAt: number;
};

export type EchoSession = {
  subject: typeof SESSION_SUBJECT;
  issuedAt: number;
  expiresAt: number;
};

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const expectedKeys = ["expiresAt", "issuedAt", "subject", "version"];

  return (
    Object.keys(record).sort().join(",") === expectedKeys.join(",") &&
    record.version === SESSION_VERSION &&
    record.subject === SESSION_SUBJECT &&
    Number.isInteger(record.issuedAt) &&
    Number.isInteger(record.expiresAt)
  );
}

export function createEchoSessionToken(
  secret: string,
  now = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    version: SESSION_VERSION,
    subject: SESSION_SUBJECT,
    issuedAt,
    expiresAt: issuedAt + ECHO_SESSION_DURATION_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyEchoSessionToken(
  token: string | undefined,
  secret: string,
  now = new Date(),
): EchoSession | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    !BASE64URL_PATTERN.test(parts[0]) ||
    !BASE64URL_PATTERN.test(parts[1])
  ) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload: unknown = JSON.parse(decoded);
    if (!isSessionPayload(payload)) {
      return null;
    }

    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      payload.issuedAt > nowSeconds ||
      payload.expiresAt <= nowSeconds ||
      payload.expiresAt - payload.issuedAt !== ECHO_SESSION_DURATION_SECONDS
    ) {
      return null;
    }

    return {
      subject: payload.subject,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
