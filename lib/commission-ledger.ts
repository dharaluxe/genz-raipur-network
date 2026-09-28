export type CommissionLedgerEntry = {
  entry_type: 'expected' | 'earned' | 'invoice' | 'payment' | 'refund' | 'adjustment';
  status: 'pending' | 'confirmed' | 'disputed' | 'void';
  amount: number | string;
};

const amountOf = (value: number | string) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const active = (status: CommissionLedgerEntry['status']) => status === 'pending' || status === 'confirmed';

export function summarizeCommissionLedger(entries: CommissionLedgerEntry[]) {
  let earned = 0;
  let invoiced = 0;
  let paymentsConfirmed = 0;
  let paymentsPending = 0;
  let refundsConfirmed = 0;
  let refundsPending = 0;

  for (const entry of entries) {
    const amount = amountOf(entry.amount);
    if (entry.entry_type === 'earned' && entry.status === 'confirmed') earned += amount;
    if (entry.entry_type === 'invoice' && active(entry.status)) invoiced += amount;
    if (entry.entry_type === 'payment' && entry.status === 'confirmed') paymentsConfirmed += amount;
    if (entry.entry_type === 'payment' && entry.status === 'pending') paymentsPending += amount;
    if (entry.entry_type === 'refund' && entry.status === 'confirmed') refundsConfirmed += amount;
    if (entry.entry_type === 'refund' && entry.status === 'pending') refundsPending += amount;
  }

  const activePayments = paymentsConfirmed + paymentsPending;
  const activeRefunds = refundsConfirmed + refundsPending;
  return {
    earned: round2(earned),
    invoiced: round2(invoiced),
    paymentsConfirmed: round2(paymentsConfirmed),
    paymentsPending: round2(paymentsPending),
    refundsConfirmed: round2(refundsConfirmed),
    refundsPending: round2(refundsPending),
    outstanding: round2(Math.max(0, earned - paymentsConfirmed + refundsConfirmed)),
    availableToInvoice: round2(Math.max(0, earned - invoiced)),
    availableToReportPayment: round2(Math.max(0, earned + activeRefunds - activePayments)),
  };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
