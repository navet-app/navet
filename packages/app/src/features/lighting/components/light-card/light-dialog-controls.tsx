import {
  SelectableCheckboxList,
  SelectableCheckboxRow,
} from '@navet/app/components/patterns/selectable-checkbox-row';
import { ColorPickerPanel } from '@navet/app/components/primitives/color-picker-panel';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { Slider } from '@navet/app/components/primitives/slider';
import { TabList, TabPanel, Tabs, TabTrigger } from '@navet/app/components/primitives/tabs';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { PRESET_COLORS } from '@navet/app/constants/light-constants';
import { useI18n, useTheme } from '@navet/app/hooks';
import { kelvinToColor } from '@navet/app/utils/light-color-temperature';
import * as RadixSlider from '@radix-ui/react-slider';
import { Power } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSelectedLightEffectOptionValue } from './light-card-effect-utils';
import type { LightSettingsDialogProps } from './light-settings-dialog';

type ControlProps = Pick<
  LightSettingsDialogProps,
  | 'isOn'
  | 'onPowerChange'
  | 'brightness'
  | 'brightnessPresets'
  | 'supportsBrightness'
  | 'onBrightnessChange'
  | 'onBrightnessCommit'
  | 'supportsColorTemperature'
  | 'colorTemp'
  | 'minColorTemp'
  | 'maxColorTemp'
  | 'tempOptions'
  | 'onTempChange'
  | 'onTempCommit'
  | 'supportsColorControl'
  | 'selectedColor'
  | 'customColor'
  | 'onColorChange'
  | 'onCustomColorChange'
  | 'supportsEffects'
  | 'currentEffect'
  | 'effectOptions'
  | 'onEffectSelect'
>;

export function LightDialogControls(props: ControlProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const modes = [
    ...(props.supportsColorTemperature ? [{ key: 'white', label: t('lighting.warmth') }] : []),
    ...(props.supportsColorControl ? [{ key: 'color', label: t('lighting.colors') }] : []),
    ...(props.supportsEffects && props.effectOptions.length
      ? [{ key: 'effects', label: t('lighting.effects') }]
      : []),
  ];
  const [mode, setMode] = useState(
    props.currentEffect ? 'effects' : props.selectedColor ? 'color' : 'white'
  );
  const visibleMode = modes.some((item) => item.key === mode) ? mode : modes[0]?.key;
  const lightColor = props.selectedColor ?? kelvinToColor(props.colorTemp);
  const [draftColor, setDraftColor] = useState(props.selectedColor ?? props.customColor);
  useEffect(() => {
    const color = props.selectedColor ?? props.customColor;
    setDraftColor(color);
  }, [props.selectedColor, props.customColor]);
  const commitColor = (color: string) => {
    if (PRESET_COLORS.some((preset) => preset.toLowerCase() === color.toLowerCase())) {
      props.onColorChange(color);
    } else {
      props.onCustomColorChange(color);
    }
  };
  const commitBrightness = props.onBrightnessCommit ?? props.onBrightnessChange;
  const brightnessProgress = Math.max(0, Math.min(1, (props.brightness - 1) / 99));
  const power = (
    <RoundControlButton
      theme={theme}
      style={{ width: 48, height: 48 }}
      variant={props.isOn ? 'emphasis' : 'soft'}
      aria-label={t(props.isOn ? 'lighting.dashboard.turnOff' : 'lighting.dashboard.turnOn')}
      aria-pressed={props.isOn}
      onClick={() => props.onPowerChange(!props.isOn)}
    >
      <Power className="h-5 w-5" aria-hidden="true" />
    </RoundControlButton>
  );

  return (
    <div className={`space-y-6 ${surface.textPrimary}`}>
      {props.supportsBrightness ? (
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6">
          <RadixSlider.Root
            orientation="vertical"
            min={1}
            max={100}
            step={1}
            value={[props.brightness]}
            disabled={!props.isOn}
            onValueChange={([value]) => props.onBrightnessChange(value)}
            onValueCommit={([value]) => commitBrightness(value)}
            className="relative flex h-52 w-full touch-none select-none items-center justify-center"
          >
            <RadixSlider.Track
              className={`relative h-full w-full overflow-hidden rounded-3xl border ${surface.borderStrong} ${surface.iconBg}`}
            >
              <RadixSlider.Range
                data-light-brightness-fill
                className="absolute bottom-0 w-full"
                style={{
                  backgroundColor: props.isOn ? lightColor : undefined,
                  opacity: theme === 'light' ? 0.65 : 0.8,
                }}
              />
            </RadixSlider.Track>
            <RadixSlider.Thumb
              aria-label={t('lighting.brightness')}
              className="flex h-10 w-12 items-center justify-center rounded-full outline-none focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-4 focus-visible:[&>span]:outline-current"
            >
              <span
                data-light-brightness-handle
                className="pointer-events-none h-1 w-7 rounded-full bg-white shadow-[0_0_0_1px_#0005]"
                // Compensate for the 40px touch target, leaving 4px for the marker and shadow at each end.
                style={{ transform: `translateY(${(0.5 - brightnessProgress) * 32}px)` }}
              />
            </RadixSlider.Thumb>
          </RadixSlider.Root>
          <div className="flex min-w-0 flex-col">
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-sans text-5xl font-semibold tracking-tight tabular-nums">
                  {props.brightness}%
                </div>
                {power}
              </div>
              <div className={`mt-1 text-xs ${surface.textSecondary}`}>
                {t('lighting.brightness')}
              </div>
            </div>
            <SelectableCheckboxList>
              {props.brightnessPresets.map((preset) => (
                <li key={preset.key}>
                  <SelectableCheckboxRow
                    size="compact"
                    disabled={!props.isOn}
                    checked={props.isOn && preset.brightness === props.brightness}
                    onCheckedChange={() => commitBrightness(preset.brightness)}
                    label={
                      <span>
                        {preset.label}
                        <span className="sr-only"> {preset.brightness}%</span>
                      </span>
                    }
                    labelClassName="truncate"
                    trailing={
                      <span
                        aria-hidden="true"
                        className={`text-xs tabular-nums ${surface.textSecondary}`}
                      >
                        {preset.brightness}%
                      </span>
                    }
                  />
                </li>
              ))}
            </SelectableCheckboxList>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {power}
          <span className="text-sm">{t(props.isOn ? 'common.on' : 'common.off')}</span>
        </div>
      )}

      <Tabs value={visibleMode ?? ''} defaultValue={visibleMode ?? ''} onValueChange={setMode}>
        {modes.length > 1 && (
          <TabList
            variant="segmented"
            size="compact"
            className="rounded-full"
            aria-label={t('common.controls')}
            style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
          >
            {modes.map((item) => (
              <TabTrigger
                variant="segmented"
                key={item.key}
                value={item.key}
                size="small"
                className="min-w-0 px-2"
              >
                {item.label}
              </TabTrigger>
            ))}
          </TabList>
        )}
        <div
          className={modes.length > 1 ? 'mt-6 grid grid-cols-1' : 'grid grid-cols-1'}
          hidden={visibleMode === 'effects'}
        >
          {props.supportsColorTemperature && (
            <TabPanel
              value="white"
              className="min-w-0 col-start-1 row-start-1 space-y-3"
              preserveLayout
            >
              <div className="flex h-9 items-center justify-between gap-3 text-sm">
                <span className="font-medium">{t('lighting.warmth')}</span>
                <span className="tabular-nums">{Math.round(props.colorTemp)} K</span>
              </div>
              <Slider
                value={props.colorTemp}
                min={props.minColorTemp}
                max={props.maxColorTemp}
                step={100}
                ariaLabel={t('lighting.colorTemperature')}
                disabled={!props.isOn}
                onValueChange={props.onTempChange}
                onValueCommit={props.onTempCommit ?? props.onTempChange}
                rootClassName="relative flex h-9 w-full touch-none select-none items-center"
                trackClassName="relative h-3 grow rounded-full border border-current/10"
                trackStyle={{
                  background: `linear-gradient(to right, ${kelvinToColor(props.minColorTemp)}, ${kelvinToColor(props.maxColorTemp)})`,
                  opacity: props.isOn ? 1 : 0.4,
                }}
                rangeStyle={{ background: 'transparent' }}
                thumbClassName="block h-6 w-6 rounded-full border border-black/10 bg-white shadow-[0_2px_6px_#0003] outline-none focus-visible:ring-2 focus-visible:ring-current"
              />
              <div className="space-y-2">
                <div
                  className={`flex justify-between text-xs tabular-nums ${surface.textSecondary}`}
                >
                  <span>{props.minColorTemp} K</span>
                  <span>{props.maxColorTemp} K</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {props.tempOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!props.isOn}
                      aria-label={`${option.label} (${option.value}K)`}
                      aria-pressed={props.colorTemp === option.value}
                      onClick={() => {
                        props.onTempChange(option.value);
                        props.onTempCommit?.(option.value);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-40"
                    >
                      <span
                        className={`h-7 w-7 rounded-full border border-current/20 ${props.colorTemp === option.value ? 'ring-2 ring-current ring-offset-2 ring-offset-transparent' : ''}`}
                        style={{ background: option.color }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </TabPanel>
          )}
          {props.supportsColorControl && (
            <TabPanel value="color" className="min-w-0 col-start-1 row-start-1" preserveLayout>
              <fieldset disabled={!props.isOn} className="min-w-0 disabled:opacity-40">
                <legend className="sr-only">{t('lighting.lightColor')}</legend>
                <div inert={!props.isOn}>
                  <ColorPickerPanel
                    compact
                    showDetailedColor={false}
                    value={draftColor}
                    presets={PRESET_COLORS}
                    onChange={(color) => {
                      setDraftColor(color);
                    }}
                    onCommit={commitColor}
                  />
                </div>
              </fieldset>
            </TabPanel>
          )}
        </div>
        {props.supportsEffects && props.effectOptions.length > 0 && (
          <TabPanel value="effects" className={modes.length > 1 ? 'mt-6 space-y-2' : 'space-y-2'}>
            <p className={`text-xs ${surface.textSecondary}`}>
              {t('lighting.effect.current', {
                effect:
                  props.effectOptions.find(
                    (option) =>
                      option.value === getSelectedLightEffectOptionValue(props.currentEffect)
                  )?.label ?? t('lighting.noEffect'),
              })}
            </p>
            <SelectableCheckboxList>
              {props.effectOptions.map((option) => (
                <li key={option.value}>
                  <SelectableCheckboxRow
                    size="compact"
                    disabled={!props.isOn}
                    checked={
                      option.value === getSelectedLightEffectOptionValue(props.currentEffect)
                    }
                    onCheckedChange={() => props.onEffectSelect(option.value)}
                    label={option.label}
                    labelClassName="truncate"
                  />
                </li>
              ))}
            </SelectableCheckboxList>
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
}
