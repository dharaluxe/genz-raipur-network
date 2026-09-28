import { Building2 } from 'lucide-react';
import ModulePage from '@/components/network/module-page';

export default function PropertiesPage() {
  return (
    <ModulePage
      eyebrow="Supply"
      title="Master Properties & Mandates"
      description="Replace duplicate broker listings with one property identity and multiple authorized broker relationships, while preserving owner mandate evidence and price history."
      icon={Building2}
      actions={[
        { title: 'Master property identity', description: 'Deduplicate by normalized address, map location and property characteristics before creating another listing.' },
        { title: 'Broker authorization', description: 'Attach one or more brokers to the same property with their mandate scope, source and validity period.' },
        { title: 'Owner confirmation', description: 'Keep the existing exact-price owner confirmation concept, but move it into a versioned mandate model.' },
        { title: 'Price revisions', description: 'Never overwrite the old asking/net terms. Store revisions with evidence and timestamps.' },
        { title: 'Map discovery', description: 'Use map and listing-grid patterns from permissively licensed Next.js property projects for faster browsing.' },
        { title: 'Visibility controls', description: 'Public network cards show safe listing data; owner PII and sensitive mandate documents remain permission-scoped.' },
      ]}
      note="The current pilot property record can be replaced rather than migrated one-for-one. The new schema should separate property identity from broker mandate records."
    />
  );
}
