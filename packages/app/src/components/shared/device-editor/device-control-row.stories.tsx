import { Input } from '@navet/app/components/primitives/input';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { ClimateTempControls } from '@navet/app/features/climate/components/climate-card/climate-temp-controls';
import { useTheme } from '@navet/app/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Crosshair,
  Droplets,
  Fan,
  Flame,
  MoveHorizontal,
  Snowflake,
  ThermometerSun,
} from 'lucide-react';
import { useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import { DeviceControlOptions } from './device-control-options';
import { DeviceControlRow } from './device-control-row';
import { DeviceTargetControl } from './device-target-control';

function AdvancedControls({
  disabled = false,
  onAction,
  centeredTarget = false,
}: {
  disabled?: boolean;
  onAction: () => void;
  centeredTarget?: boolean;
}) {
  const { theme, accentColor } = useTheme();
  const [target, setTarget] = useState(21);
  const readableTokens = getCardReadableTextTokens({ theme, tone: 'neutral', accentColor });
  const surface = getThemeSurfaceTokens(theme);
  const [mode, setMode] = useState('heat');
  const [fan, setFan] = useState('Auto');
  const [swing, setSwing] = useState(false);
  const [humidity, setHumidity] = useState('45');
  return (
    <div className={`w-full max-w-sm rounded-3xl border p-4 ${surface.panel} ${surface.border}`}>
      <div className="mb-4">
        <DeviceTargetControl
          label="Target"
          value={`${target}°C`}
          currentReading="Current 20°C"
          status="Heating"
          readableTokens={readableTokens}
          renderControls={
            centeredTarget
              ? (value) => (
                  <ClimateTempControls
                    targetTemp={target}
                    onTempChange={setTarget}
                    isOn={!disabled}
                  >
                    {value}
                  </ClimateTempControls>
                )
              : undefined
          }
          controls={
            <ClimateTempControls targetTemp={target} onTempChange={setTarget} isOn={!disabled} />
          }
        />
      </div>
      <DeviceControlOptions
        label="Mode"
        variant="segmented"
        value={mode}
        disabled={disabled}
        onValueChange={setMode}
        options={[
          { value: 'heat', label: 'Heat', icon: <Flame className="h-4 w-4" /> },
          { value: 'cool', label: 'Cool', icon: <Snowflake className="h-4 w-4" /> },
          { value: 'auto', label: 'Auto', icon: <ThermometerSun className="h-4 w-4" /> },
        ]}
      />
      <div className="mt-4">
        <DeviceControlRow
          kind="action"
          label="Locate vacuum"
          icon={<Crosshair className="h-4 w-4" />}
          disabled={disabled}
          onAction={onAction}
        />
        <DeviceControlRow
          kind="disclosure"
          label="Fan mode"
          value={fan}
          icon={<Fan className="h-4 w-4" />}
        >
          <DeviceControlOptions
            label="Fan mode"
            value={fan}
            disabled={disabled}
            onValueChange={setFan}
            options={['Auto', 'Low', 'High'].map((value) => ({ value, label: value }))}
          />
        </DeviceControlRow>
        <DeviceControlRow
          kind="toggle"
          label="Horizontal swing"
          icon={<MoveHorizontal className="h-4 w-4" />}
          checked={swing}
          disabled={disabled}
          onCheckedChange={setSwing}
        />
        <DeviceControlRow
          kind="disclosure"
          label="Target humidity"
          value={`${humidity}%`}
          icon={<Droplets className="h-4 w-4" />}
        >
          <Input
            aria-label="Target humidity"
            type="number"
            min={30}
            max={70}
            trailing="%"
            value={humidity}
            disabled={disabled}
            onChange={(event) => setHumidity(event.target.value)}
          />
        </DeviceControlRow>
        <DeviceControlRow
          kind="reading"
          label="Current humidity"
          value="42%"
          icon={<Droplets className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/Shared/Device Editor/Device Control Row',
  component: AdvancedControls,
  args: { onAction: fn() },
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Secondary controls for card dialogs: a current-value disclosure, an inline boolean switch, a push action, or a reading. Use DeviceControlOptions for primary segmented choices and expanded option lists. The climate dialog (Cards/Entity/Climate/AdvancedDialogSupported) is the first consuming reference; rendered maintainer acceptance remains pending.',
      },
    },
  },
} satisfies Meta<typeof AdvancedControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Controls: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent, args }) => {
    const action = canvas.getByRole('button', { name: 'Run Locate vacuum' });
    action.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onAction).toHaveBeenCalledTimes(2);
    const modes = within(canvas.getByRole('group', { name: 'Mode' }));
    modes.getByRole('radio', { name: 'Heat' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(modes.getByRole('radio', { name: 'Cool' })).toBeChecked();
    const trigger = canvas.getByRole('button', { name: 'Fan mode' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('radio', { name: 'Low' })).not.toBeInTheDocument();
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const options = within(canvas.getByRole('group', { name: 'Fan mode' }));
    await userEvent.click(options.getByRole('radio', { name: 'Low' }));
    await expect(options.getByRole('radio', { name: 'Low' })).toBeChecked();
    await expect(options.getByRole('radio', { name: 'Auto' })).not.toBeChecked();
    const selected = options.getByRole('radio', { name: 'Low' });
    selected.focus();
    await userEvent.keyboard(' ');
    await expect(selected).toBeChecked();
    await userEvent.click(trigger);
    await expect(trigger).toHaveTextContent('Low');
    const toggle = canvas.getByRole('switch', { name: 'Horizontal swing' });
    toggle.focus();
    await userEvent.keyboard(' ');
    await expect(toggle).toBeChecked();
    await expect(
      canvas.queryByRole('button', { name: 'Current humidity' })
    ).not.toBeInTheDocument();
  },
};
export const Unavailable: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent, args }) => {
    const action = canvas.getByRole('button', { name: 'Run Locate vacuum' });
    await expect(action).toBeDisabled();
    await userEvent.click(action);
    await expect(args.onAction).not.toHaveBeenCalled();
  },
};
export const Light: Story = { ...Controls, globals: { theme: 'light' } };
export const CenteredTarget: Story = { args: { centeredTarget: true } };
export const Glass: Story = { ...Controls, globals: { theme: 'glass' } };
export const Black: Story = { ...Controls, globals: { theme: 'black' } };
export const Mobile: Story = {
  ...Controls,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
