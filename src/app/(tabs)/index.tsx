import { MapScreen } from '@/features/map/presentation/map-screen';
import { MapMenu } from '@/features/shell/presentation/map-menu';
import { OfflineCapsule } from '@/features/shell/presentation/offline-status';

export default function MapTab() {
  return (
    <MapScreen>
      <OfflineCapsule />
      <MapMenu />
    </MapScreen>
  );
}
