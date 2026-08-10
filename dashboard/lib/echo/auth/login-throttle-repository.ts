import "server-only";

import { callSupabaseServiceRoleRpc } from "../supabase/service-role-client.ts";
import { registerEchoLoginAttemptWithRpc } from "./login-throttle.ts";

export async function registerEchoLoginAttempt(
  passwordValid: boolean,
): Promise<boolean> {
  return registerEchoLoginAttemptWithRpc(
    passwordValid,
    callSupabaseServiceRoleRpc,
  );
}
