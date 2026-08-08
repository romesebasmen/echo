import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ServiceRoleRpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ServiceRoleRpcResult {
  data: unknown;
  error: ServiceRoleRpcError | null;
}

export type ServiceRoleRpcCaller = (
  functionName: string,
  parameters: Record<string, unknown>,
) => Promise<ServiceRoleRpcResult>;

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "");
}

let cachedClient: SupabaseClient | null = null;

function getSupabaseServiceRoleClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL environment variable. Set it in .env.local.");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Set it in .env.local.",
    );
  }

  cachedClient = createClient(normalizeSupabaseUrl(url), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

export const callSupabaseServiceRoleRpc: ServiceRoleRpcCaller = async (
  functionName,
  parameters,
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    functionName,
    parameters,
  );

  return { data, error };
};
