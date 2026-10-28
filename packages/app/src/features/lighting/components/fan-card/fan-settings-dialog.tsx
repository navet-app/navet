import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { Slider } from '@navet/app/components/primitives/slider';
import { DeviceControlsDialog } from '@navet/app/components/shared/device-controls-dialog';
import { CustomCardTintPicker, IconPicker } from '@navet/app/components/shared/device-editor';
import { DeviceControlOptions } from '@navet/app/components/shared/device-editor/device-control-options';
import { DeviceControlRow } from '@navet/app/components/shared/device-editor/device-control-row';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Power, RotateCw, Wind } from 'lucide-react';
import type { ReactNode } from 'react';

export function FanSettingsDialog(props: {
  entityId: string;
  commandFeedback?: ReactNode;
  writable?: boolean;
  canToggle?: boolean;
  excludeHelperEntityIds?: string[];
  name: string;
  room: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isOn: boolean;
  percentage: number;
  percentageStep?: number;
  presetModes?: string[];
  presetMode?: string;
  onPresetChange?: (preset: string) => void;
  supportsSpeed: boolean;
  onPowerChange: (on: boolean) => void;
  onSpeedPreview: (percentage: number) => void;
  onSpeedCommit: (percentage: number) => void;
  direction?: string;
  oscillating?: boolean;
  onDirectionChange: () => void;
  onOscillationChange: () => void;
  selectedIcon: string;
  onIconChange: (icon: string) => void;
  tintColor: string;
  onTintColorChange: (color: string) => void;
  siblingControls?: ReactNode;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const oscillationLabel = t('lighting.fanOscillationLabel');
  const directionLabel = t('lighting.fanDirectionLabel');
  const speedStep = props.percentageStep ?? 1;
  const discreteSpeeds =
    speedStep >= 100 / 6
      ? Array.from({ length: Math.round(100 / speedStep) }, (_, index) =>
          index === Math.round(100 / speedStep) - 1
            ? 100
            : Number(Math.min(100, (index + 1) * speedStep).toFixed(3))
        )
      : null;
  const selectedSpeed = props.isOn ? String(props.percentage) : null;
  return (
    <DeviceControlsDialog
      entityId={props.entityId}
      excludeHelperEntityIds={props.excludeHelperEntityIds}
      name={props.name}
      room={props.room}
      status={t(props.isOn ? 'common.on' : 'common.off')}
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      tintColor={props.tintColor}
      controls={
        <div className={`space-y-6 ${surface.textPrimary}`}>
          {props.commandFeedback}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {props.supportsSpeed
                  ? `${props.percentage}%`
                  : t(props.isOn ? 'common.on' : 'common.off')}
              </div>
              {props.supportsSpeed && (
                <div className={`mt-1 text-xs ${surface.textSecondary}`}>
                  {t('lighting.fanSpeed')}
                </div>
              )}
            </div>
            <RoundControlButton
              theme={theme}
              style={{ width: 40, height: 40 }}
              variant={props.isOn ? 'emphasis' : 'soft'}
              aria-label={t(
                props.isOn ? 'lighting.dashboard.turnOff' : 'lighting.dashboard.turnOn'
              )}
              aria-pressed={props.isOn}
              disabled={props.writable === false || props.canToggle === false}
              onClick={() => props.onPowerChange(!props.isOn)}
            >
              <Power className="h-5 w-5" />
            </RoundControlButton>
          </div>
          {props.supportsSpeed && (
            <div className="space-y-4">
              {!discreteSpeeds ? (
                <Slider
                  min={speedStep}
                  max={100}
                  step={speedStep}
                  value={Math.max(1, props.percentage)}
                  disabled={props.writable === false}
                  onValueChange={(value) => props.onSpeedPreview(value)}
                  onValueCommit={(value) => props.onSpeedCommit(value)}
                  ariaLabel={t('lighting.fanSpeed')}
                  trackClassName={`relative h-2 grow rounded-full ${surface.iconBg}`}
                  rangeClassName={`absolute h-full rounded-full ${surface.textPrimary} bg-current opacity-40`}
                  thumbClassName={`block h-5 w-5 rounded-full border ${surface.borderStrong} bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2`}
                  rootClassName="relative flex h-10 w-full touch-none select-none items-center"
                />
              ) : null}
              <DeviceControlOptions
                variant="segmented"
                label={t('lighting.fanSpeed')}
                disabled={props.writable === false}
                value={selectedSpeed}
                options={
                  discreteSpeeds
                    ? discreteSpeeds.map((value) => ({ value: String(value), label: `${value}%` }))
                    : [
                        { value: '33', label: t('lighting.fanSpeed.low') },
                        { value: '66', label: t('lighting.fanSpeed.medium') },
                        { value: '100', label: t('lighting.fanSpeed.high') },
                      ]
                }
                onValueChange={(value) => props.onSpeedCommit(Number(value))}
              />
            </div>
          )}
          {(props.presetModes?.length ?? 0) > 0 ? (
            <DeviceControlOptions
              label={t('lighting.fanPresets')}
              value={props.presetMode ?? null}
              options={(props.presetModes ?? []).map((value) => ({ value, label: value }))}
              disabled={props.writable === false}
              onValueChange={(value) => props.onPresetChange?.(value)}
            />
          ) : null}
          {(props.oscillating !== undefined || props.direction !== undefined) && (
            <div>
              {props.oscillating !== undefined && (
                <DeviceControlRow
                  kind="toggle"
                  label={oscillationLabel}
                  icon={<Wind className="h-4 w-4" />}
                  checked={props.oscillating}
                  onCheckedChange={props.onOscillationChange}
                />
              )}
              {props.direction !== undefined && (
                <DeviceControlRow
                  kind="disclosure"
                  label={directionLabel}
                  icon={<RotateCw className="h-4 w-4" />}
                  value={t(
                    props.direction === 'reverse'
                      ? 'lighting.fanDirection.reverse'
                      : 'lighting.fanDirection.forward'
                  )}
                >
                  <DeviceControlOptions
                    label={directionLabel}
                    value={props.direction}
                    options={(['forward', 'reverse'] as const).map((value) => ({
                      value,
                      label: t(`lighting.fanDirection.${value}`),
                    }))}
                    disabled={props.writable === false}
                    onValueChange={(value) => {
                      if (value !== props.direction) props.onDirectionChange();
                    }}
                  />
                </DeviceControlRow>
              )}
            </div>
          )}
          {props.siblingControls}
        </div>
      }
      customize={
        <div className="space-y-6">
          <CustomCardTintPicker
            surfaceTheme={theme}
            value={props.tintColor}
            onChange={props.onTintColorChange}
            isOn={props.isOn}
          />
          <IconPicker
            label={t('interactionPreview.iconTitle')}
            surfaceTheme={theme}
            selectedIcon={props.selectedIcon}
            onIconChange={props.onIconChange}
            isLightOn={props.isOn}
          />
        </div>
      }
    />
  );
}
