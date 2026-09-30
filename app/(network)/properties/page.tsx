import MasterPropertyWorkspaceV2 from '@/components/network/master-property-workspace-v2';
import PropertyListingManager from '@/components/network/property-listing-manager';

export default function PropertiesPage() {
  return <div className="space-y-8">
    <PropertyListingManager />
    <MasterPropertyWorkspaceV2 />
  </div>;
}
