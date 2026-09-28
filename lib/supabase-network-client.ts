import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zvftcwinvbnavvjfmugr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-TdeOmwQIln5nkM0_ks8HA_Xt_d4pVy';

let browserClient: SupabaseClient | null = null;

export function getSupabaseNetworkClient() {
  if (!browserClient) {
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    // Supabase getUser() returns AuthSessionMissingError when the visitor is
    // simply signed out. GENZ treats that as a normal logged-out state so the
    // membership gate can render the sign-in/invite UI instead of a red error.
    const originalGetUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
      const result = await originalGetUser(...args);
      const missingSession = Boolean(
        result.error &&
          (result.error.name === 'AuthSessionMissingError' ||
            result.error.message.includes('Auth session missing')),
      );

      if (missingSession) {
        return { data: { user: null }, error: null };
      }

      return result;
    }) as typeof client.auth.getUser;

    browserClient = client;
  }
  return browserClient;
}
