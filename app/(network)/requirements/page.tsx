import { Search } from 'lucide-react';
import ModulePage from '@/components/network/module-page';

export default function RequirementsPage() {
  return (
    <ModulePage
      eyebrow="Buyer demand"
      title="Requirements & Buyer Passport"
      description="Register a buyer requirement once, protect the originating broker and match the demand against verified inventory across any city instead of limiting brokers by location."
      icon={Search}
      actions={[
        { title: 'Private buyer identity', description: 'Normalize and HMAC the phone number so duplicates can be detected without exposing the raw buyer number network-wide.' },
        { title: 'Source protection claim', description: 'Record which broker introduced the buyer, claim start/expiry, status and dispute history.' },
        { title: 'Structured requirement', description: 'Capture locations, property types, budget range, size range, purpose, urgency and negotiable preferences.' },
        { title: 'Explainable matching', description: 'Rank properties using locality, budget, size and type components and show why each match scored as it did.' },
        { title: 'Opportunity broadcast', description: 'Show qualified demand to relevant brokers while keeping protected buyer details hidden until collaboration is accepted.' },
        { title: 'Requirement history', description: 'Requirement edits create versions so older introductions and broker protections are not silently rewritten.' },
      ]}
      note="The identity and matching engines already exist on this V2 branch. Database persistence and protected reveal rules are the next integration step."
    />
  );
}
