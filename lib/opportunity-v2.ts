export type OpportunitySearchRecord = {
  id: string;
  headline: string;
  note?: string | null;
  city?: string | null;
  locality?: string | null;
  propertyType?: string | null;
  brokerName?: string | null;
  brokerFirm?: string | null;
};

export type BrokerRelevanceInput = {
  id: string;
  name: string;
  cities: string[];
  specialties: string[];
  verified: boolean;
  trustScore: number;
};

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function opportunityMatchesQuery(record: OpportunitySearchRecord, query: string) {
  const q = norm(query);
  if (!q) return true;
  const haystack = [
    record.id,
    record.headline,
    record.note,
    record.city,
    record.locality,
    record.propertyType,
    record.brokerName,
    record.brokerFirm,
  ].map(norm).join(' ');
  return q.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
}

export function daysUntilExpiry(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - nowMs) / 86_400_000);
}

export function rankBrokerRelevance(
  brokers: BrokerRelevanceInput[],
  query: { city?: string; propertyType?: string },
) {
  const city = norm(query.city);
  const propertyType = norm(query.propertyType);
  return brokers.map((broker) => {
    const cityMatch = !city ? 0 : broker.cities.some((item) => norm(item).includes(city) || city.includes(norm(item))) ? 35 : 0;
    const specialtyMatch = !propertyType ? 0 : broker.specialties.some((item) => norm(item) === propertyType || norm(item).includes(propertyType) || propertyType.includes(norm(item))) ? 35 : 0;
    const verification = broker.verified ? 5 : 0;
    const trust = Math.round(Math.max(0, Math.min(100, broker.trustScore)) * 0.25);
    const score = cityMatch + specialtyMatch + verification + trust;
    const reasons: string[] = [];
    if (cityMatch) reasons.push('location match');
    if (specialtyMatch) reasons.push('specialty match');
    if (broker.verified) reasons.push('verified');
    reasons.push(`trust ${Math.round(broker.trustScore)}`);
    return { ...broker, score, reasons };
  }).sort((a, b) => b.score - a.score || b.trustScore - a.trustScore || a.name.localeCompare(b.name));
}
