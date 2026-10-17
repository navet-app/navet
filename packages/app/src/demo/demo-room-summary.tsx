import { getRoomSecurityAlertCount } from '@navet/app/features/dashboard/hooks/use-home-security-alert-count';
import { buildRoomStatusSummaryItems } from '@navet/app/features/sensors/components/home-status-summary-model';
import { SummaryBar } from '@navet/app/features/sensors/components/info-badge-strip';
import { useDeviceMap } from '@navet/app/hooks/use-device-map';
import { useAggregatedDevices } from '@navet/app/hooks/use-devices';
import { useI18n } from '@navet/app/i18n';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';

export function DemoRoomSummary({ room }: { room: string }) {
  const { t } = useI18n();
  const devices = useAggregatedDevices({ includeFeatureCollections: false });
  const { deviceMap } = useDeviceMap(devices);
  const temperatureUnit = useSettingsStore((state) => state.temperatureUnit);
  const showSummaryBar = useSettingsStore((state) => state.showHomeSummaryBar);
  const setActiveSection = useNavigationStore((state) => state.setActiveSection);
  const items = buildRoomStatusSummaryItems(
    deviceMap,
    room,
    { temperatureUnit, securityAlertCount: getRoomSecurityAlertCount(devices, [], room) },
    t
  );

  return showSummaryBar ? (
    <SummaryBar
      items={items}
      singleRow
      onNavigate={setActiveSection}
      ariaLabel={t('settings.dashboard.homeSummaryBar.title')}
    />
  ) : null;
}
