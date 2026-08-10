import type { ServiceRoleRpcCaller } from "../supabase/service-role-client.ts";

export class EchoLoginThrottleUnavailableError extends Error {
  readonly code: string | null;

  constructor(code?: string) {
    super("Echo login protection is unavailable.");
    this.name = "EchoLoginThrottleUnavailableError";
    this.code = code?.slice(0, 32) ?? null;
  }
}

export async function registerEchoLoginAttemptWithRpc(
  passwordValid: boolean,
  callRpc: ServiceRoleRpcCaller,
): Promise<boolean> {
  const { data, error } = await callRpc("register_echo_login_attempt", {
    p_password_valid: passwordValid,
  });

  if (error) {
    throw new EchoLoginThrottleUnavailableError(error.code);
  }
  if (typeof data !== "boolean") {
    throw new EchoLoginThrottleUnavailableError();
  }

  return data;
}
