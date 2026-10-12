import { Button } from '@navet/app/components/primitives/button';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { Slider } from '@navet/app/components/primitives/slider';
import { DeviceControlsDialog } from '@navet/app/components/shared/device-controls-dialog';
import { CustomCardTintPicker, IconPicker } from '@navet/app/components/shared/device-editor';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Power, RotateCw, Wind } from 'lucide-react';
import type { ReactNode } from 'react';

export function FanSettingsDialog(props: {
  entityId: string;
  excludeHelperEntityIds?: string[];
  name: string;
  room: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isOn: boolean;
  percentage: number;
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
              onClick={() => props.onPowerChange(!props.isOn)}
            >
              <Power className="h-5 w-5" />
            </RoundControlButton>
          </div>
          {props.supportsSpeed && (
            <div className="space-y-4">
              <Slider
                min={1}
                max={100}
                step={1}
                value={Math.max(1, props.percentage)}
                onValueChange={(value) => props.onSpeedPreview(value)}
                onValueCommit={(value) => props.onSpeedCommit(value)}
                ariaLabel={t('lighting.fanSpeed')}
                trackClassName={`relative h-2 grow rounded-full ${surface.iconBg}`}
                rangeClassName={`absolute h-full rounded-full ${surface.textPrimary} bg-current opacity-40`}
                thumbClassName={`block h-5 w-5 rounded-full border ${surface.borderStrong} bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2`}
                rootClassName="relative flex h-10 w-full touch-none select-none items-center"
              />
              <fieldset
                className="grid min-w-0 grid-cols-3 gap-2"
                aria-label={t('lighting.fanPresets')}
              >
                {(
                  [
                    { value: 33, translationKey: 'lighting.fanSpeed.low' },
                    { value: 66, translationKey: 'lighting.fanSpeed.medium' },
                    { value: 100, translationKey: 'lighting.fanSpeed.high' },
                  ] as const
                ).map((preset, index) => {
                  const selected =
                    props.isOn &&
                    (index === 0
                      ? props.percentage <= 45
                      : index === 1
                        ? props.percentage > 45 && props.percentage <= 80
                        : props.percentage > 80);
                  return (
                    <Button
                      key={preset.value}
                      variant={selected ? 'primary' : 'soft'}
                      size="compact"
                      aria-label={t('lighting.fanPreset', { preset: t(preset.translationKey) })}
                      aria-pressed={selected}
                      onClick={() => props.onSpeedCommit(preset.value)}
                      className="min-w-0"
                    >
                      {t(preset.translationKey)}
                    </Button>
                  );
                })}
              </fieldset>
            </div>
          )}
          {(props.oscillating !== undefined || props.direction !== undefined) && (
            <div className={`divide-y ${surface.divider}`}>
              {props.oscillating !== undefined && (
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Wind className="h-4 w-4" />
                    {t('lighting.fanOscillation')}
                  </span>
                  <Button
                    variant="soft"
                    size="compact"
                    aria-pressed={props.oscillating}
                    onClick={props.onOscillationChange}
                  >
                    {t(props.oscillating ? 'common.on' : 'common.off')}
                  </Button>
                </div>
              )}
              {props.direction !== undefined && (
                <div className="flex items-center justify-between gap-3 py-3">
                  <RotateCw className="h-4 w-4 shrink-0" />
                  <Button
                    variant="soft"
                    size="compact"
                    className="min-w-0"
                    onClick={props.onDirectionChange}
                  >
                    {t(
                      props.direction === 'reverse'
                        ? 'lighting.fanDirection.reverse'
                        : 'lighting.fanDirection.forward'
                    )}
                  </Button>
                </div>
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
