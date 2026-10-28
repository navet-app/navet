import { Button, MessageBar } from '@navet/app/components/primitives';
import { useI18n } from '@navet/app/hooks';

export function DeviceCommandFeedback({
  label,
  reported,
  requested,
  pending,
  failed,
  unconfirmed,
  retry,
}: {
  label: string;
  reported: string;
  requested?: string;
  pending: boolean;
  failed: boolean;
  unconfirmed?: boolean;
  retry: () => void;
}) {
  const { t } = useI18n();
  if (!pending && !failed) return null;
  return (
    <MessageBar tone={failed ? 'error' : 'info'}>
      <span aria-live="polite" className="block space-y-1">
        <span className="block">
          {label} · {t('deviceControls.reported', { value: reported })}
        </span>
        {requested !== undefined ? (
          <span className="block">{t('deviceControls.requested', { value: requested })}</span>
        ) : null}
        <span className="block">
          {t(
            unconfirmed
              ? 'deviceControls.unconfirmed'
              : failed
                ? 'deviceControls.failed'
                : 'climate.advanced.updating'
          )}
        </span>
        {failed ? (
          <Button size="small" variant="soft" onClick={retry}>
            {t('household.retry')}
          </Button>
        ) : null}
      </span>
    </MessageBar>
  );
}
