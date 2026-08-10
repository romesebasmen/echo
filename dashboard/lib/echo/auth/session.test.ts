import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEchoSessionToken,
  ECHO_SESSION_DURATION_SECONDS,
  verifyEchoSessionToken,
} from "./session.ts";

const SECRET = "a-strong-session-secret-with-at-least-32-characters";
const NOW = new Date("2026-08-09T15:00:00.000Z");

test("a valid signed session is accepted", () => {
  const token = createEchoSessionToken(SECRET, NOW);
  const session = verifyEchoSessionToken(token, SECRET, NOW);

  assert.equal(session?.subject, "sebastian");
  assert.equal(
    session?.expiresAt,
    Math.floor(NOW.getTime() / 1000) + ECHO_SESSION_DURATION_SECONDS,
  );
});

test("an expired session is rejected", () => {
  const token = createEchoSessionToken(SECRET, NOW);
  const afterExpiration = new Date(
    NOW.getTime() + ECHO_SESSION_DURATION_SECONDS * 1000,
  );

  assert.equal(verifyEchoSessionToken(token, SECRET, afterExpiration), null);
});

test("a tampered session is rejected", () => {
  const token = createEchoSessionToken(SECRET, NOW);
  const [payload, signature] = token.split(".");
  const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;

  assert.equal(
    verifyEchoSessionToken(`${tamperedPayload}.${signature}`, SECRET, NOW),
    null,
  );
});

test("a malformed session is rejected", () => {
  assert.equal(verifyEchoSessionToken("not-a-session", SECRET, NOW), null);
  assert.equal(verifyEchoSessionToken(undefined, SECRET, NOW), null);
});

test("the token contains identity and timestamps but no password or secret", () => {
  const token = createEchoSessionToken(SECRET, NOW);
  const [payload] = token.split(".");
  const decoded = Buffer.from(payload, "base64url").toString("utf8");

  assert.doesNotMatch(decoded, new RegExp(SECRET));
  assert.doesNotMatch(decoded, /password/i);
  assert.match(decoded, /sebastian/);
});
