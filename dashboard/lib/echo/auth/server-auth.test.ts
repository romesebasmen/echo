import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EchoAuthConfigurationError,
  handleEchoLogin,
  handleEchoLogout,
  readEchoAuthConfiguration,
} from "./server-auth.ts";
import {
  ECHO_SESSION_COOKIE,
  verifyEchoSessionToken,
} from "./session.ts";

const PASSWORD = "correct horse battery staple";
const SECRET = "a-strong-session-secret-with-at-least-32-characters";
const NOW = new Date("2026-08-09T15:00:00.000Z");

function loginRequest(password?: string): Request {
  const form = new FormData();
  if (password !== undefined) {
    form.set("password", password);
  }
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    body: form,
  });
}

function getConfiguration() {
  return { accessPassword: PASSWORD, sessionSecret: SECRET };
}

test("the correct password creates a signed HttpOnly session", async () => {
  const response = await handleEchoLogin(loginRequest(PASSWORD), {
    getConfiguration,
    now: () => NOW,
    isProduction: false,
  });
  const cookie = response.cookies.get(ECHO_SESSION_COOKIE);
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost:3000/");
  assert.ok(cookie?.value);
  assert.ok(verifyEchoSessionToken(cookie.value, SECRET, NOW));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  assert.doesNotMatch(setCookie, new RegExp(PASSWORD));
  assert.doesNotMatch(setCookie, new RegExp(SECRET));
});

test("production sessions use Secure cookies", async () => {
  const response = await handleEchoLogin(loginRequest(PASSWORD), {
    getConfiguration,
    now: () => NOW,
    isProduction: true,
  });

  assert.match(response.headers.get("set-cookie") ?? "", /Secure/i);
});

test("an incorrect password fails without creating a session", async () => {
  const response = await handleEchoLogin(loginRequest("wrong"), {
    getConfiguration,
    now: () => NOW,
  });

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?error=invalid",
  );
  assert.equal(response.cookies.get(ECHO_SESSION_COOKIE), undefined);
});

test("a missing password fails without creating a session", async () => {
  const response = await handleEchoLogin(loginRequest(), {
    getConfiguration,
    now: () => NOW,
  });

  assert.equal(response.status, 303);
  assert.equal(response.cookies.get(ECHO_SESSION_COOKIE), undefined);
});

test("missing auth configuration fails closed with the same login response", async () => {
  let reported = false;
  const response = await handleEchoLogin(loginRequest(PASSWORD), {
    getConfiguration: () => {
      throw new EchoAuthConfigurationError();
    },
    reportConfigurationError: () => {
      reported = true;
    },
  });

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?error=invalid",
  );
  assert.equal(response.cookies.get(ECHO_SESSION_COOKIE), undefined);
  assert.equal(reported, true);
});

test("auth configuration requires both server-only values to be strong", () => {
  assert.throws(() => readEchoAuthConfiguration({}), EchoAuthConfigurationError);
  assert.throws(
    () =>
      readEchoAuthConfiguration({
        ECHO_ACCESS_PASSWORD: "too-short",
        ECHO_SESSION_SECRET: SECRET,
      }),
    EchoAuthConfigurationError,
  );
  assert.throws(
    () =>
      readEchoAuthConfiguration({
        ECHO_ACCESS_PASSWORD: PASSWORD,
        ECHO_SESSION_SECRET: "too-short",
      }),
    EchoAuthConfigurationError,
  );
  assert.deepEqual(
    readEchoAuthConfiguration({
      ECHO_ACCESS_PASSWORD: PASSWORD,
      ECHO_SESSION_SECRET: SECRET,
    }),
    { accessPassword: PASSWORD, sessionSecret: SECRET },
  );
});

test("logout clears the session cookie", () => {
  const response = handleEchoLogout(
    new Request("http://localhost:3000/api/auth/logout", { method: "POST" }),
    false,
  );
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  assert.match(setCookie, new RegExp(`^${ECHO_SESSION_COOKIE}=`));
  assert.match(setCookie, /Max-Age=0/i);
  assert.match(setCookie, /HttpOnly/i);
});
