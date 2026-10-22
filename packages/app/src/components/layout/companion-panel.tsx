import { OverlayScrollArea } from '@navet/app/components/primitives/overlay-scroll-area';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { DashboardCompanion } from '@navet/app/features/dashboard/companion/dashboard-companion';
import { useTheme } from '@navet/app/hooks';
import type { HeaderController } from './use-header-controller';

export function CompanionPanel({
  controller,
  editing,
}: {
  controller: HeaderController;
  editing: boolean;
}) {
  const { theme } = useTheme();
  return (
    <div
      className={`flex h-full max-h-dvh min-h-0 flex-col overflow-hidden ${controller.surface.textPrimary}`}
    >
      <OverlayScrollArea
        className="min-h-0 flex-1"
        viewportClassName={`overscroll-y-contain ${getThemeFocusRingClassName(theme)} focus-visible:ring-inset focus-visible:ring-offset-0`}
        viewportProps={{ tabIndex: 0, 'data-companion-scroll-viewport': 'true' }}
        contentClassName="px-5 py-4"
      >
        <DashboardCompanion editing={editing} />
      </OverlayScrollArea>
    </div>
  );
}
