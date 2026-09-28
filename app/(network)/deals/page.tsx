import { Handshake } from 'lucide-react';
import ModulePage from '@/components/network/module-page';

export default function DealsPage() {
  return (
    <ModulePage
      eyebrow="Execution"
      title="Deal Rooms & Proof Timeline"
      description="Every serious broker collaboration gets a structured deal room where parties, commission terms, visits, offers, proofs and settlement events are frozen into an auditable history."
      icon={Handshake}
      actions={[
        { title: 'Protected introduction', description: 'Bind the buyer claim, property mandate and participating brokers before contact details are revealed.' },
        { title: 'Accepted commission terms', description: 'Support fixed, percentage and above-owner-net brokerage models with explicit split and versioned amendments.' },
        { title: 'Realtime room', description: 'Add broker chat and presence using Supabase Realtime patterns, while important deal events are persisted separately from chat.' },
        { title: 'Visit proof', description: 'Record scheduled visit, attendance, location/time evidence and later add OTP/QR confirmation.' },
        { title: 'Offer & negotiation log', description: 'Capture buyer offers, counteroffers and accepted value without rewriting prior positions.' },
        { title: 'Settlement & dispute trail', description: 'Keep brokerage receipts, co-broker transfers, refunds, holds and disputes as append-only financial events.' },
      ]}
      note="The existing brokerage calculation logic is useful and can survive the reset. The old all-purpose records table should not; deal events deserve typed V2 tables."
    />
  );
}
