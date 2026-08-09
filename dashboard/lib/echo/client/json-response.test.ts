import { test } from "node:test";
import assert from "node:assert/strict";
import { hasResponseField, parseJsonResponse } from "./json-response.ts";

interface ItemResponse {
  item: string;
}

const options = {
  fallbackMessage: "The request could not be completed.",
  isSuccessBody: (body: unknown): body is ItemResponse =>
    hasResponseField(body, "item") && typeof body.item === "string",
};

test("returns a validated JSON success body", async () => {
  const result = await parseJsonResponse(
    Response.json({ item: "saved" }),
    options,
  );

  assert.deepEqual(result, { item: "saved" });
});

test("preserves a safe server-provided JSON error", async () => {
  await assert.rejects(
    () => parseJsonResponse(
      Response.json({ error: "The proposal is stale." }, { status: 409 }),
      options,
    ),
    /The proposal is stale\./,
  );
});

test("replaces an HTML error response with the stable fallback", async () => {
  await assert.rejects(
    () => parseJsonResponse(
      new Response("<!DOCTYPE html><title>Internal error</title>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
      options,
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "The request could not be completed." &&
      !error.message.includes("Unexpected token"),
  );
});

test("preserves status through a caller-specific typed error", async () => {
  class StatusError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  await assert.rejects(
    () => parseJsonResponse(
      Response.json({ error: "Conflict" }, { status: 409 }),
      {
        ...options,
        createError: (message, status) => new StatusError(message, status),
      },
    ),
    (error: unknown) => error instanceof StatusError && error.status === 409,
  );
});

test("rejects malformed success JSON instead of trusting its type assertion", async () => {
  await assert.rejects(
    () => parseJsonResponse(Response.json({ wrong: "shape" }), options),
    /The request could not be completed\./,
  );
});
