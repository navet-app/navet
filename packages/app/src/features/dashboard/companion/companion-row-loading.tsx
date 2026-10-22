import {
  companionEntityDisabledClassName,
  companionEntityIconClassName,
  companionEntityNameTypography,
  companionEntityRowClassName,
  companionEntityValueClassName,
  companionRowHighlight,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Activity, type LucideIcon } from 'lucide-react';

export function CompanionRowLoading({
  name,
  icon: Icon = Activity,
}: {
  name: string;
  icon?: LucideIcon;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  return (
    <div
      role="status"
      aria-busy="true"
      className={`${companionEntityRowClassName} ${companionRowHighlight} ${companionEntityDisabledClassName}`}
    >
      <Icon aria-hidden="true" className={`${companionEntityIconClassName} ${surface.textMuted}`} />
      <span
        className={`min-w-0 flex-1 break-words ${companionEntityNameTypography} ${surface.textPrimary}`}
      >
        {name}
      </span>
      <span className={`${companionEntityValueClassName} ${surface.textMuted}`}>
        {t('common.loading')}
      </span>
    </div>
  );
}
