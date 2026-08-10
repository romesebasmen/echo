import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import {
  EchoAuthConfigurationError,
  gateEchoRequest,
} from "./server-auth.ts";
import {
  createEchoSessionToken,
  ECHO_SESSION_COOKIE,
} from "./session.ts";

const SECRET = "a-strong-session-secret-with-at-least-32-characters";
const NOW = new Date("2026-08-09T15:00:00.000Z");

function request(path: string, token?: string, method = "GET"): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set("cookie", `${ECHO_SESSION_COOKIE}=${token}`);
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers, method });
}

const dependencies = {
  getSessionSecret: () => SECRET,
  now: () => NOW,
};

test("every application page redirects unauthenticated access to login", async () => {
  for (const path of ["/", "/chat", "/memories", "/tasks", "/tiktok"]) {
    const response = await gateEchoRequest(request(path), dependencies);

    assert.equal(response.status, 307, path);
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/login",
      path,
    );
  }
});

test("every application API family rejects unauthenticated requests", async () => {
  const protectedRequests: Array<[string, string]> = [
    ["/api/briefing", "GET"],
    ["/api/chat", "POST"],
    ["/api/creative-works", "GET"],
    ["/api/creative-works/work-id", "PATCH"],
    ["/api/creative-works/work-id/generate", "POST"],
    ["/api/day-plan", "PUT"],
    ["/api/day-plan/generate", "POST"],
    ["/api/day-plan/regenerate", "POST"],
    ["/api/day-plan/regenerate/apply", "POST"],
    ["/api/memories", "GET"],
    ["/api/memories/memory-id", "DELETE"],
    ["/api/tasks", "POST"],
    ["/api/tasks/task-id", "PATCH"],
    ["/api/thoughts", "POST"],
    ["/api/thoughts/thought-id", "DELETE"],
  ];

  for (const [path, method] of protectedRequests) {
    const response = await gateEchoRequest(
      request(path, undefined, method),
      dependencies,
    );
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});

test("the paid Anthropic endpoint cannot be reached unauthenticated", async () => {
  const response = await gateEchoRequest(
    request("/api/day-plan/regenerate", undefined, "POST"),
    dependencies,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
});

test("the privileged planning write endpoint cannot be reached unauthenticated", async () => {
  const response = await gateEchoRequest(
    request("/api/day-plan", undefined, "PUT"),
    dependencies,
  );

  assert.equal(response.status, 401);
});

test("authenticated API access proceeds", async () => {
  const token = createEchoSessionToken(SECRET, NOW);
  const response = await gateEchoRequest(
    request("/api/tasks", token),
    dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("missing configuration fails closed before protected APIs", async () => {
  let reported = false;
  const response = await gateEchoRequest(request("/api/chat"), {
    getSessionSecret: () => {
      throw new EchoAuthConfigurationError();
    },
    reportConfigurationError: () => {
      reported = true;
    },
  });

  assert.equal(response.status, 503);
  assert.equal(reported, true);
});

test("only login routes remain public", async () => {
  for (const path of ["/login", "/api/auth/login"]) {
    const response = await gateEchoRequest(request(path), dependencies);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }

  const logoutResponse = await gateEchoRequest(
    request("/api/auth/logout", undefined, "POST"),
    dependencies,
  );
  assert.equal(logoutResponse.status, 401);
});

test("only required static assets bypass the gate", async () => {
  for (const path of [
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Ffile.svg&w=64&q=75",
    "/_next/webpack-hmr",
    "/favicon.ico",
    "/file.svg",
  ]) {
    const response = await gateEchoRequest(request(path), dependencies);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }

  const dataResponse = await gateEchoRequest(
    request("/_next/data/build-id/tasks.json"),
    dependencies,
  );
  assert.equal(dataResponse.status, 307);
});
