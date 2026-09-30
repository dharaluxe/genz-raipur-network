import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zvftcwinvbnavvjfmugr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-TdeOmwQIln5nkM0_ks8HA_Xt_d4pVy';

const IDEMPOTENCY_WINDOW_MS = 12_000;
const RETRY_SAFE_RPCS: Record<string, string> = {
  genz_make_deal_offer: 'genz_make_deal_offer_v2',
  genz_propose_commission_agreement: 'genz_propose_commission_agreement_v2',
  genz_record_commission_activity: 'genz_record_commission_activity_v2',
};

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike | undefined };
type RpcArgs = Record<string, unknown>;
type CachedRequest = { id: string; expiresAt: number };

const recentMutationRequests = new Map<string, CachedRequest>();

function stableValue(value: unknown): JsonLike | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => stableValue(item) ?? null);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return String(value);
}

function requestIdForMutation(name: string, args: RpcArgs) {
  const now = Date.now();
  for (const [key, cached] of recentMutationRequests) {
    if (cached.expiresAt <= now) recentMutationRequests.delete(key);
  }

  const fingerprint = `${name}:${JSON.stringify(stableValue(args) ?? {})}`;
  const cached = recentMutationRequests.get(fingerprint);
  if (cached && cached.expiresAt > now) return cached.id;

  const id = crypto.randomUUID();
  recentMutationRequests.set(fingerprint, { id, expiresAt: now + IDEMPOTENCY_WINDOW_MS });
  return id;
}

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

    // High-value mutations remain source-compatible for existing screens while
    // transparently gaining retry identity. Identical rapid retries reuse one
    // request UUID; a later intentional action receives a fresh UUID.
    const originalRpc = client.rpc.bind(client);
    client.rpc = ((name: string, args?: RpcArgs, options?: unknown) => {
      const mappedName = RETRY_SAFE_RPCS[name];
      if (!mappedName) return originalRpc(name as never, args as never, options as never);

      const sourceArgs = args || {};
      const mappedArgs = {
        ...sourceArgs,
        p_client_request_id: requestIdForMutation(name, sourceArgs),
      };
      return originalRpc(mappedName as never, mappedArgs as never, options as never);
    }) as typeof client.rpc;

    browserClient = client;
  }
  return browserClient;
}
