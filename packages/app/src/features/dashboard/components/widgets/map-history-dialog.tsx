import { FieldBlock } from '@navet/app/components/patterns';
import {
  BaseCardDialog,
  Button,
  LoadingSpinner,
  MessageBar,
  Select,
} from '@navet/app/components/primitives';
import { DialogHeader } from '@navet/app/components/shared/device-editor';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetTypographyTokens } from '@navet/app/components/system/tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { getIntegrationLocationHistory } from '@navet/app/services/integration-map.service';
import type {
  PlatformLocationHistoryRequest,
  PlatformLocationPoint,
} from '@navet/core/provider-feature-models';
import { useId, useState } from 'react';
import type { MapMarker } from './map-types';
import { useMapLocationHistory } from './use-map-location-history';

export interface MapHistoryOverlay {
  markerId: string;
  name: string;
  hours: number;
  endTime: string;
  segments: PlatformLocationPoint[][];
}
export function MapHistoryDialog({
  markers,
  onClose,
  onApply,
  load = getIntegrationLocationHistory,
}: {
  markers: readonly MapMarker[];
  onClose: () => void;
  onApply: (overlay: MapHistoryOverlay) => void;
  load?: typeof getIntegrationLocationHistory;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const prefix = useId();
  const sources = markers.filter((marker) => marker.canShowHistory);
  const [markerId, setMarkerId] = useState(() => sources[0]?.id ?? '');
  const [hours, setHours] = useState(24);
  const [query, setQuery] = useState<PlatformLocationHistoryRequest | null>(null);
  const selected = sources.find((source) => source.id === markerId);
  const result = useMapLocationHistory(selected ? query : null, load);
  const pointCount = result.segments.reduce((count, segment) => count + segment.length, 0);
  return (
    <BaseCardDialog
      isOpen
      variant="modal"
      height="capped"
      contentClassName="flex flex-col"
      bodyClassName="min-h-0 overflow-y-auto overscroll-contain"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      theme={theme}
      title={t('widgets.map.history')}
    >
      <DialogHeader title={t('widgets.map.history')} isOn={theme !== 'light'} />
      <div className={`space-y-4 ${surface.textPrimary}`}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) return;
            const end = new Date();
            setQuery({
              entityId: markerId,
              startTime: new Date(end.getTime() - hours * 60 * 60 * 1000).toISOString(),
              endTime: end.toISOString(),
            });
          }}
        >
          <FieldBlock label={t('history.entity')} htmlFor={`${prefix}-source`}>
            <Select
              id={`${prefix}-source`}
              value={markerId}
              onChange={(event) => {
                setMarkerId(event.currentTarget.value);
                setQuery(null);
              }}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </FieldBlock>
          <FieldBlock label={t('widgets.map.period')} htmlFor={`${prefix}-period`}>
            <Select
              id={`${prefix}-period`}
              value={hours}
              onChange={(event) => {
                setHours(Number(event.currentTarget.value));
                setQuery(null);
              }}
            >
              {[6, 24].map((value) => (
                <option key={value} value={value}>
                  {t('widgets.map.lastHours', { hours: value })}
                </option>
              ))}
            </Select>
          </FieldBlock>
          <Button type="submit" size="small" disabled={!selected || result.status === 'loading'}>
            {t('history.load')}
          </Button>
        </form>
        <p className={`${navetTypographyTokens.helper} ${surface.textSecondary}`}>
          {t('widgets.map.samples')}
        </p>
        {!selected ? (
          <MessageBar>{t('widgets.map.historyUnavailable')}</MessageBar>
        ) : result.status === 'loading' ? (
          <div role="status">
            <LoadingSpinner message={t('history.loading')} />
          </div>
        ) : result.status === 'error' ? (
          <div className="space-y-2">
            <MessageBar tone="error">{t('history.failed')}</MessageBar>
            <Button
              size="small"
              variant="soft"
              onClick={() => {
                if (query) setQuery({ ...query });
              }}
            >
              {t('household.retry')}
            </Button>
          </div>
        ) : result.status === 'unsupported' ? (
          <MessageBar>{t('widgets.map.historyUnavailable')}</MessageBar>
        ) : result.status === 'loaded' && pointCount === 0 ? (
          <MessageBar>{t('widgets.map.noHistory')}</MessageBar>
        ) : null}
        {pointCount > 0 && selected && query ? (
          <div className="space-y-2">
            <p>{t('widgets.map.pointCount', { count: pointCount })}</p>
            <Button
              size="small"
              onClick={() => {
                onApply({
                  markerId,
                  name: selected.name,
                  hours,
                  endTime: query.endTime,
                  segments: result.segments,
                });
                onClose();
              }}
            >
              {t('widgets.map.showHistory')}
            </Button>
          </div>
        ) : null}
      </div>
    </BaseCardDialog>
  );
}
