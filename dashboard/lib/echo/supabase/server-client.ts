import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts).
// Never import it from a Client Component, or any module a Client Component
// imports. SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are deliberately not
// prefixed with NEXT_PUBLIC_ so Next.js never inlines them into a client
// bundle.

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "");
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL environment variable. Set it in .env.local.",
    );
  }

  if (!key) {
    throw new Error(
      "Missing SUPABASE_PUBLISHABLE_KEY environment variable. Set it in .env.local.",
    );
  }

  cachedClient = createClient(normalizeSupabaseUrl(url), key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
