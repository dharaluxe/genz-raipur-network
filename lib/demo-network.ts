export type DemoBroker = {
  id: string;
  name: string;
  firm: string;
  cities: string[];
  specialties: string[];
  verified: boolean;
  completedDeals: number;
  successfulCollaborations: number;
  verifiedVisits: number;
  collaborationRequests: number;
  collaborationResponses: number;
  rating: number;
  reviewCount: number;
  unresolvedDisputes: number;
};

export type DemoRequirement = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  sourceBrokerId: string;
  city: string;
  type: string;
  maxBudget: number;
  minSize: number;
  status: 'active' | 'closed';
  createdAt: string;
  expiresAt: string;
};

export type DemoProperty = {
  id: string;
  title: string;
  city: string;
  type: string;
  size: number;
  asking: number;
  ownerName: string;
  listingBrokerId: string;
  mandateStatus: 'verified' | 'pending';
  status: 'active' | 'archived';
};

export type DemoDealEvent = {
  id: string;
  type: string;
  label: string;
  at: string;
};

export type DemoDeal = {
  id: string;
  requirementId: string;
  propertyId: string;
  buyerBrokerId: string;
  listingBrokerId: string;
  status: 'requested' | 'accepted' | 'visit_verified' | 'negotiation' | 'closed';
  listingShare: number;
  lastOffer?: number;
  events: DemoDealEvent[];
};

export type DemoNetworkState = {
  brokers: DemoBroker[];
  requirements: DemoRequirement[];
  properties: DemoProperty[];
  deals: DemoDeal[];
};

export const PROPERTY_TYPES = [
  'Residential plot',
  'Independent house',
  'Apartment',
  'Commercial',
  'Agricultural land',
] as const;

const now = new Date('2026-09-28T11:30:00.000Z');
const plusDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

export const DEMO_NETWORK_SEED: DemoNetworkState = {
  brokers: [
    {
      id: 'BR-1001', name: 'Krishna Tripathi', firm: 'GENZ Buildcon', cities: ['Raipur', 'Bhopal'],
      specialties: ['Residential plot', 'Independent house'], verified: true, completedDeals: 7,
      successfulCollaborations: 9, verifiedVisits: 18, collaborationRequests: 24, collaborationResponses: 22,
      rating: 4.8, reviewCount: 12, unresolvedDisputes: 0,
    },
    {
      id: 'BR-1002', name: 'Aman Verma', firm: 'Central Realty', cities: ['Raipur', 'Bilaspur'],
      specialties: ['Apartment', 'Commercial'], verified: true, completedDeals: 11,
      successfulCollaborations: 8, verifiedVisits: 26, collaborationRequests: 31, collaborationResponses: 28,
      rating: 4.6, reviewCount: 19, unresolvedDisputes: 0,
    },
    {
      id: 'BR-1003', name: 'Neha Sharma', firm: 'MP Property Connect', cities: ['Bhopal', 'Indore'],
      specialties: ['Residential plot', 'Apartment'], verified: true, completedDeals: 5,
      successfulCollaborations: 7, verifiedVisits: 16, collaborationRequests: 20, collaborationResponses: 17,
      rating: 4.9, reviewCount: 10, unresolvedDisputes: 0,
    },
  ],
  requirements: [
    {
      id: 'REQ-2401', buyerName: 'R. Mehta', buyerPhone: '9876500011', sourceBrokerId: 'BR-1001',
      city: 'Raipur', type: 'Residential plot', maxBudget: 4_500_000, minSize: 1500,
      status: 'active', createdAt: now.toISOString(), expiresAt: plusDays(30),
    },
    {
      id: 'REQ-2402', buyerName: 'S. Jain', buyerPhone: '9981800022', sourceBrokerId: 'BR-1003',
      city: 'Bhopal', type: 'Apartment', maxBudget: 7_000_000, minSize: 1100,
      status: 'active', createdAt: now.toISOString(), expiresAt: plusDays(30),
    },
  ],
  properties: [
    {
      id: 'PR-3101', title: 'Kamal Vihar 1500 sqft Plot', city: 'Raipur', type: 'Residential plot',
      size: 1500, asking: 4_300_000, ownerName: 'Verified Owner A', listingBrokerId: 'BR-1002',
      mandateStatus: 'verified', status: 'active',
    },
    {
      id: 'PR-3102', title: 'Kolar Road 2BHK', city: 'Bhopal', type: 'Apartment',
      size: 1180, asking: 6_800_000, ownerName: 'Verified Owner B', listingBrokerId: 'BR-1003',
      mandateStatus: 'verified', status: 'active',
    },
  ],
  deals: [
    {
      id: 'DL-4101', requirementId: 'REQ-2401', propertyId: 'PR-3101', buyerBrokerId: 'BR-1001',
      listingBrokerId: 'BR-1002', status: 'accepted', listingShare: 50,
      events: [
        { id: 'EV-1', type: 'introduction', label: 'Buyer introduction protected', at: now.toISOString() },
        { id: 'EV-2', type: 'agreement', label: 'Co-broker terms accepted · 50/50 split', at: plusDays(1) },
      ],
    },
  ],
};

const STORAGE_KEY = 'genz-network-v2-demo';

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  return phone;
}

export function maskPhone(value: string) {
  const phone = normalizeIndianPhone(value);
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

export function loadDemoNetwork(): DemoNetworkState {
  if (typeof window === 'undefined') return DEMO_NETWORK_SEED;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_NETWORK_SEED));
    return structuredClone(DEMO_NETWORK_SEED);
  }
  try {
    return JSON.parse(raw) as DemoNetworkState;
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_NETWORK_SEED));
    return structuredClone(DEMO_NETWORK_SEED);
  }
}

export function saveDemoNetwork(state: DemoNetworkState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('genz-network-demo-updated'));
}

export function resetDemoNetwork() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_NETWORK_SEED));
  window.dispatchEvent(new CustomEvent('genz-network-demo-updated'));
}

export function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function money(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(value || 0);
}
