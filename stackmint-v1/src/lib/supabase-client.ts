// lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createClerkSupabaseClient(getAccessToken?: () => Promise<string | null>): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // use the provided token getter if available
      async accessToken() {
        if (!getAccessToken) return null;
        try {
          return await getAccessToken();
        } catch {
          return null;
        }
      },
    }
  );
}
