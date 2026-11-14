import { MapScreen } from '@/features/map/presentation/map-screen';
import { OfflineCapsule } from '@/features/shell/presentation/offline-status';

export default function MapTab() {
  return (
    <MapScreen>
      <OfflineCapsule />
    </MapScreen>
  );
}
