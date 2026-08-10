import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EchoLoginThrottleUnavailableError,
  registerEchoLoginAttemptWithRpc,
} from "./login-throttle.ts";
import type { ServiceRoleRpcCaller } from "../supabase/service-role-client.ts";

test("login attempts send only the password comparison result to the service-role RPC", async () => {
  let captured: { functionName: string; parameters: Record<string, unknown> } | null = null;
  const callRpc: ServiceRoleRpcCaller = async (functionName, parameters) => {
    captured = { functionName, parameters };
    return { data: true, error: null };
  };

  assert.equal(await registerEchoLoginAttemptWithRpc(true, callRpc), true);
  assert.deepEqual(captured, {
    functionName: "register_echo_login_attempt",
    parameters: { p_password_valid: true },
  });
});

test("a denied login attempt remains denied", async () => {
  const callRpc: ServiceRoleRpcCaller = async () => ({ data: false, error: null });

  assert.equal(await registerEchoLoginAttemptWithRpc(false, callRpc), false);
});

test("database failures fail closed without exposing database details", async () => {
  const callRpc: ServiceRoleRpcCaller = async () => ({
    data: null,
    error: {
      code: "PGRST202",
      message: "schema cache contains private details",
      details: "private row data",
    },
  });

  await assert.rejects(
    () => registerEchoLoginAttemptWithRpc(true, callRpc),
    (error: unknown) =>
      error instanceof EchoLoginThrottleUnavailableError &&
      error.code === "PGRST202" &&
      !error.message.includes("private"),
  );
});

test("malformed RPC output fails closed", async () => {
  const callRpc: ServiceRoleRpcCaller = async () => ({ data: null, error: null });

  await assert.rejects(
    () => registerEchoLoginAttemptWithRpc(true, callRpc),
    EchoLoginThrottleUnavailableError,
  );
});
