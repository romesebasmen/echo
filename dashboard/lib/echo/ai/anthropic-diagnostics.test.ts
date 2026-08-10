import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";

import {
  callAnthropicWithDiagnostics,
  MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH,
  summarizeAnthropicError,
} from "./anthropic-diagnostics.ts";

function apiError(
  status: number,
  type: "authentication_error" | "permission_error" | "invalid_request_error",
  requestId = "req-safe-123",
): APIError {
  return APIError.generate(
    status,
    {
      type: "error",
      error: {
        type,
        message: "Response body details must not be logged.",
      },
    },
    undefined,
    new Headers({ "request-id": requestId }),
  );
}

for (const scenario of [
  { status: 401, type: "authentication_error", sdkErrorName: "AuthenticationError" },
  { status: 403, type: "permission_error", sdkErrorName: "PermissionDeniedError" },
  { status: 400, type: "invalid_request_error", sdkErrorName: "BadRequestError" },
] as const) {
  test(`sanitizes Anthropic ${scenario.status} errors without response content`, () => {
    const summary = summarizeAnthropicError(
      apiError(scenario.status, scenario.type),
    );

    assert.deepEqual(summary, {
      sdkErrorName: scenario.sdkErrorName,
      status: scenario.status,
      type: scenario.type,
      requestId: "req-safe-123",
      safeMessage: `Anthropic API request failed (${scenario.type}).`,
    });
    assert.doesNotMatch(JSON.stringify(summary), /response body details/i);
  });
}

test("redacts keys and truncates connection messages", () => {
  const summary = summarizeAnthropicError(
    new APIConnectionError({
      message: `Connection failed using sk-ant-api03-super-secret-value ${"x".repeat(1_000)}`,
    }),
  );

  assert.equal(summary.status, null);
  assert.equal(summary.type, "connection_error");
  assert.doesNotMatch(summary.safeMessage, /sk-ant-/i);
  assert.match(summary.safeMessage, /\[REDACTED\]/);
  assert.equal(summary.safeMessage.length, MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH);
});

test("diagnostic boundary logs once, attempts once, and preserves the failure", async () => {
  const upstream = apiError(401, "authentication_error", "req-one-attempt");
  const messages: string[] = [];
  let attempts = 0;

  await assert.rejects(
    () =>
      callAnthropicWithDiagnostics(
        "Chat",
        async () => {
          attempts += 1;
          throw upstream;
        },
        (message) => messages.push(message),
      ),
    (error: unknown) => error === upstream,
  );

  assert.equal(attempts, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /^Chat Anthropic request failed: /);
  assert.doesNotMatch(messages[0]!, /response body details/i);
});

test("every production Anthropic provider uses the shared diagnostic boundary", () => {
  for (const file of [
    "claude-briefing.ts",
    "claude-day-plan-regeneration.ts",
    "claude-memory-extraction.ts",
    "claude-responder.ts",
    "claude-tiktok-package.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(
      source,
      /callAnthropicWithDiagnostics/,
      `${file} bypasses safe Anthropic diagnostics`,
    );
  }
});
