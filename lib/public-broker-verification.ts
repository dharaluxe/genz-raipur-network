export type PublicBrokerStatus = 'active' | 'under_review' | 'suspended' | 'removed';

export function normalizeBrokerCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidBrokerCode(value: string) {
  return /^BR-[A-Z0-9]{8}$/.test(normalizeBrokerCode(value));
}

export function brokerInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'G';
}

export function publicStatusPresentation(status: PublicBrokerStatus) {
  switch (status) {
    case 'under_review':
      return {
        label: 'Under review',
        tone: 'amber' as const,
        explanation: 'GENZ is reviewing an account-related matter. This status is not a finding of wrongdoing.',
      };
    case 'suspended':
      return {
        label: 'Suspended',
        tone: 'rose' as const,
        explanation: 'This broker account is currently suspended from GENZ network activity.',
      };
    case 'removed':
      return {
        label: 'Removed from GENZ',
        tone: 'rose' as const,
        explanation: 'This account is no longer an active GENZ network member.',
      };
    default:
      return {
        label: 'Active GENZ member',
        tone: 'emerald' as const,
        explanation: 'This Broker ID currently belongs to an active GENZ network member.',
      };
  }
}
