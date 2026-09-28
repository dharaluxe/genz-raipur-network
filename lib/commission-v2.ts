export type CommissionMethod = 'fixed' | 'percentage';
export type CommissionRole = 'buyer_broker' | 'listing_broker' | 'referral_broker';

export type CommissionTerms = {
  method: CommissionMethod;
  fixedAmount?: number;
  percentage?: number;
  finalPrice?: number;
};

export type CommissionAllocation = {
  brokerUserId: string;
  role: CommissionRole;
  sharePercent: number;
};

export type CommissionLedgerEntry = {
  brokerUserId: string;
  entryType: 'expected' | 'earned' | 'invoice' | 'payment' | 'refund' | 'adjustment';
  amount: number;
  status?: 'pending' | 'confirmed' | 'disputed' | 'void';
};

const MAX_RUPEES = 100_000_000_000;

function paise(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_RUPEES) throw new Error('Invalid monetary amount');
  return BigInt(Math.round(value * 100));
}

function fromPaise(value: bigint) {
  return Number(value) / 100;
}

function percentageOfPaise(value: bigint, rate: number) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Invalid percentage');
  const basisPoints = BigInt(Math.round(rate * 100));
  return (value * basisPoints + 5_000n) / 10_000n;
}

export function calculateCommissionPool(terms: CommissionTerms) {
  if (terms.method === 'fixed') {
    const fixed = terms.fixedAmount ?? 0;
    if (fixed <= 0) throw new Error('Fixed commission must be greater than zero');
    return fromPaise(paise(fixed));
  }

  const rate = terms.percentage ?? 0;
  const finalPrice = terms.finalPrice ?? 0;
  if (rate <= 0 || rate > 100) throw new Error('Commission percentage must be between 0 and 100');
  if (finalPrice <= 0) throw new Error('Final selling price is required for percentage commission');
  return fromPaise(percentageOfPaise(paise(finalPrice), rate));
}

export function validateCommissionAllocations(allocations: CommissionAllocation[]) {
  if (!Array.isArray(allocations) || allocations.length < 2 || allocations.length > 10) {
    throw new Error('Commission requires between 2 and 10 allocations');
  }

  const seen = new Set<string>();
  let totalBasisPoints = 0;
  let hasBuyerBroker = false;
  let hasListingBroker = false;

  for (const allocation of allocations) {
    if (!allocation.brokerUserId?.trim()) throw new Error('Every allocation needs a broker');
    if (!['buyer_broker', 'listing_broker', 'referral_broker'].includes(allocation.role)) throw new Error('Invalid commission role');
    if (!Number.isFinite(allocation.sharePercent) || allocation.sharePercent <= 0 || allocation.sharePercent > 100) {
      throw new Error('Allocation share must be greater than 0 and at most 100');
    }
    const key = `${allocation.brokerUserId}:${allocation.role}`;
    if (seen.has(key)) throw new Error('Duplicate broker allocation role');
    seen.add(key);
    totalBasisPoints += Math.round(allocation.sharePercent * 100);
    if (allocation.role === 'buyer_broker') hasBuyerBroker = true;
    if (allocation.role === 'listing_broker') hasListingBroker = true;
  }

  if (!hasBuyerBroker || !hasListingBroker) throw new Error('Buyer and listing broker allocations are required');
  if (totalBasisPoints !== 10_000) throw new Error('Commission allocations must total exactly 100%');
  return true;
}

export function allocateCommission(pool: number, allocations: CommissionAllocation[]) {
  validateCommissionAllocations(allocations);
  const poolPaise = paise(pool);
  let allocated = 0n;
  return allocations.map((allocation, index) => {
    let amount: bigint;
    if (index === allocations.length - 1) {
      amount = poolPaise - allocated;
    } else {
      amount = percentageOfPaise(poolPaise, allocation.sharePercent);
      allocated += amount;
    }
    return { ...allocation, amount: fromPaise(amount) };
  });
}

export function summarizeCommissionLedger(entries: CommissionLedgerEntry[]) {
  const byBroker = new Map<string, { expected: number; earned: number; invoiced: number; paid: number; disputed: number; outstanding: number }>();
  const ensure = (id: string) => {
    if (!byBroker.has(id)) byBroker.set(id, { expected: 0, earned: 0, invoiced: 0, paid: 0, disputed: 0, outstanding: 0 });
    return byBroker.get(id)!;
  };

  for (const entry of entries) {
    if (!entry.brokerUserId) continue;
    if (!Number.isFinite(entry.amount) || entry.amount < 0) throw new Error('Invalid ledger amount');
    if (entry.status === 'void') continue;
    const row = ensure(entry.brokerUserId);
    const amount = fromPaise(paise(entry.amount));
    if (entry.status === 'disputed') row.disputed += amount;
    if (entry.entryType === 'expected') row.expected += amount;
    if (entry.entryType === 'earned') row.earned += amount;
    if (entry.entryType === 'invoice') row.invoiced += amount;
    if (entry.entryType === 'payment') row.paid += amount;
    if (entry.entryType === 'refund') row.paid -= amount;
    if (entry.entryType === 'adjustment') row.earned += amount;
  }

  return Object.fromEntries([...byBroker.entries()].map(([brokerUserId, row]) => {
    const earned = fromPaise(paise(Math.max(0, row.earned)));
    const paid = fromPaise(paise(Math.max(0, row.paid)));
    return [brokerUserId, {
      expected: fromPaise(paise(row.expected)),
      earned,
      invoiced: fromPaise(paise(row.invoiced)),
      paid,
      disputed: fromPaise(paise(row.disputed)),
      outstanding: fromPaise(paise(Math.max(0, earned - paid))),
      overpaid: fromPaise(paise(Math.max(0, paid - earned))),
    }];
  }));
}
