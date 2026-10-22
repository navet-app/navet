import { Button } from '@navet/app/components/primitives/button';
import { DeviceControlsDialog } from '@navet/app/components/shared/device-controls-dialog';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { CoverControlMode } from '@navet/app/stores/settings-store';
import { ChevronDown, ChevronUp, Square } from 'lucide-react';
import { CoverWindowVisualization } from './cover-window-visualization';
import type { DeviceClass, DeviceClassConfig } from './types';

export function CoverSettingsDialog(props: {
  showPosition: boolean;
  hasPosition: boolean;
  controlMode: CoverControlMode;
  onControlModeChange: (mode: CoverControlMode) => void;
  entityId: string;
  name: string;
  room: string;
  isOpen: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenChange: (open: boolean) => void;
  position: number;
  stateLabel: string;
  deviceClass: DeviceClass;
  deviceClassConfig: Record<DeviceClass, DeviceClassConfig>;
  onDeviceClassChange: (type: DeviceClass) => void;
  onPreviewPosition: (position: number) => void;
  onCommitPosition: (position: number) => void;
  onOpen: () => void;
  onStop: () => void;
  onClose: () => void;
  canOpen: boolean;
  supportsStop: boolean;
  canStop: boolean;
  canClose: boolean;
  canSetPosition: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  return (
    <DeviceControlsDialog
      onCloseAutoFocus={props.onCloseAutoFocus}
      entityId={props.entityId}
      name={props.name}
      room={props.room}
      status={props.stateLabel}
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      controls={
        <div className={`space-y-5 ${surface.textPrimary}`}>
          <div
            className={
              props.showPosition ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5' : ''
            }
          >
            {props.showPosition && (
              <CoverWindowVisualization
                handleAlignment="center"
                position={props.position}
                theme={theme}
                ariaLabel={t('cover.ariaLabel', { name: props.name })}
                onPreviewPosition={props.onPreviewPosition}
                onCommitPosition={props.onCommitPosition}
                disabled={!props.canSetPosition}
              />
            )}
            <div className="flex min-w-0 flex-col justify-between gap-5">
              <div>
                <div
                  className={
                    props.showPosition
                      ? 'text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl'
                      : 'break-words text-2xl font-semibold'
                  }
                >
                  {props.showPosition ? `${props.position}%` : props.stateLabel}
                </div>
                {props.showPosition && (
                  <div className={`mt-1 text-xs ${surface.textSecondary}`}>{props.stateLabel}</div>
                )}
              </div>
              <fieldset className="flex min-w-0 flex-col gap-2" aria-label={t('common.controls')}>
                <Button
                  variant="soft"
                  size="compact"
                  className="w-full rounded-full"
                  leading={<ChevronUp className="h-4 w-4" />}
                  disabled={!props.canOpen}
                  onClick={props.onOpen}
                >
                  {t('cover.open')}
                </Button>
                {props.supportsStop && (
                  <Button
                    variant="soft"
                    size="compact"
                    className="w-full rounded-full"
                    leading={<Square className="h-3 w-3" />}
                    disabled={!props.canStop}
                    onClick={props.onStop}
                  >
                    {t('cover.stop')}
                  </Button>
                )}
                <Button
                  variant="soft"
                  size="compact"
                  className="w-full rounded-full"
                  leading={<ChevronDown className="h-4 w-4" />}
                  disabled={!props.canClose}
                  onClick={props.onClose}
                >
                  {t('cover.close')}
                </Button>
              </fieldset>
            </div>
          </div>
          {props.canSetPosition && (
            <fieldset className="flex min-w-0 flex-wrap gap-2" aria-label={t('climate.presets')}>
              {[0, 25, 50, 75, 100].map((value) => (
                <Button
                  key={value}
                  size="compact"
                  variant={props.position === value ? 'primary' : 'soft'}
                  className="min-w-0 flex-1 rounded-full px-2"
                  aria-pressed={props.position === value}
                  onClick={() => props.onCommitPosition(value)}
                >
                  {value}%
                </Button>
              ))}
            </fieldset>
          )}
        </div>
      }
      customize={
        <div className={`space-y-3 ${surface.textPrimary}`}>
          {props.hasPosition && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('common.controls')}</legend>
              <div className="flex flex-wrap gap-2">
                {(['simple', 'position'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={props.controlMode === mode ? 'primary' : 'soft'}
                    aria-pressed={props.controlMode === mode}
                    onClick={() => props.onControlModeChange(mode)}
                  >
                    {t(mode === 'simple' ? 'cover.settings.simple' : 'cover.settings.position')}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          <h3 className="text-sm font-medium">{t('cover.settings.deviceType')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(props.deviceClassConfig) as DeviceClass[]).map((type) => {
              const { icon: Icon, labelKey } = props.deviceClassConfig[type];
              return (
                <Button
                  key={type}
                  variant={props.deviceClass === type ? 'primary' : 'soft'}
                  leading={<Icon className="h-4 w-4 shrink-0" />}
                  aria-pressed={props.deviceClass === type}
                  onClick={() => props.onDeviceClassChange(type)}
                >
                  {t(labelKey)}
                </Button>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
