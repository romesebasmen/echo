import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts) and
// the server repositories they call. Never import it from a Client Component,
// or any module a Client Component imports. The private environment variables
// are deliberately not prefixed with NEXT_PUBLIC_ so Next.js never inlines
// them into a client bundle.

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "");
}

let cachedClient: SupabaseClient | null = null;

export interface SupabaseServerConfiguration {
  url: string;
  serviceRoleKey: string;
}

export function resolveSupabaseServerConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseServerConfiguration {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL environment variable. Set it in .env.local.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Set it in .env.local.",
    );
  }

  return {
    url: normalizeSupabaseUrl(url),
    serviceRoleKey,
  };
}

export function getSupabaseServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The privileged Supabase client is server-only.");
  }

  if (cachedClient) {
    return cachedClient;
  }

  const { url, serviceRoleKey } = resolveSupabaseServerConfiguration();

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}
