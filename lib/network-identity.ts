import { normalizePhone } from './domain';

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns a privacy-safe network identifier for customer deduplication.
 *
 * This MUST be keyed. A plain SHA-256 of a phone number is reversible in practice
 * because the Indian mobile-number search space is small enough to enumerate.
 * Keep `secret` server-only and rotate it only through an explicit migration.
 */
export async function customerFingerprint(phone: string, secret: string) {
  const normalized = normalizePhone(phone);
  const keyMaterial = secret.trim();
  if (keyMaterial.length < 32) {
    throw new Error('Customer fingerprint secret must be at least 32 characters.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`genz:buyer:v1:${normalized}`),
  );
  return `v1:${toHex(signature)}`;
}

export function maskedPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return `${normalized.slice(0, 2)}******${normalized.slice(-2)}`;
}

export type ClaimState = 'active' | 'expired' | 'released' | 'disputed';

export type BuyerClaim = {
  brokerId: string;
  startsAt: string;
  expiresAt: string;
  state: ClaimState;
};

export function claimStateAt(claim: BuyerClaim, at = new Date()) {
  if (claim.state !== 'active') return claim.state;
  const expires = Date.parse(claim.expiresAt);
  if (!Number.isFinite(expires)) throw new Error('Invalid claim expiry.');
  return expires <= at.getTime() ? 'expired' : 'active';
}

export function protectionExpiry(startsAt: string, protectionDays: number) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new Error('Invalid claim start date.');
  if (!Number.isInteger(protectionDays) || protectionDays < 1 || protectionDays > 365) {
    throw new Error('Protection days must be a whole number between 1 and 365.');
  }
  return new Date(start + protectionDays * 86_400_000).toISOString();
}

export function canCreateSourceClaim(existing: BuyerClaim | null, brokerId: string, at = new Date()) {
  if (!existing) return { allowed: true as const, reason: 'no_existing_claim' as const };
  const state = claimStateAt(existing, at);
  if (state === 'expired' || state === 'released') {
    return { allowed: true as const, reason: state as 'expired' | 'released' };
  }
  if (existing.brokerId === brokerId) {
    return { allowed: false as const, reason: 'already_owned_by_broker' as const };
  }
  return { allowed: false as const, reason: state === 'disputed' ? 'claim_under_dispute' as const : 'protected_by_other_broker' as const };
}
