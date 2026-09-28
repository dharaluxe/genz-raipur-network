import { UsersRound } from 'lucide-react';
import ModulePage from '@/components/network/module-page';

export default function BrokersPage() {
  return (
    <ModulePage
      eyebrow="Network"
      title="Broker Directory & Trust"
      description="Let brokers discover collaborators by markets, inventory and performance while keeping ratings explainable and resistant to simple popularity gaming."
      icon={UsersRound}
      actions={[
        { title: 'Verified broker profile', description: 'Identity, firm, service markets, specialties, verification status and broker ID.' },
        { title: 'Evidence-based Trust Score', description: 'Combine verified profile, closed collaborations, site visits, response rate, reviews and dispute penalties.' },
        { title: 'Market coverage', description: 'A broker can serve multiple cities and states. Coverage is metadata, not an access restriction.' },
        { title: 'Inventory & requirement stats', description: 'Show useful network activity without leaking buyer PII or owner-sensitive information.' },
        { title: 'Collaboration reviews', description: 'Only parties from a completed or verified collaboration can review each other; suspicious duplicates are excluded.' },
        { title: 'Badges & milestones', description: 'Use objective badges such as Verified, Fast Responder, Clean Deal History and Cross-Market Collaborator.' },
      ]}
      note="The V2 Trust Score engine is already committed. Next we will persist its input events rather than storing a manually editable rating number."
    />
  );
}
