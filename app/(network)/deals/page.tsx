import AdvancedDealRoom from '@/components/network/advanced-deal-room';
import DealParticipantAccess from '@/components/network/deal-participant-access';

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <AdvancedDealRoom />
      <DealParticipantAccess />
    </div>
  );
}
