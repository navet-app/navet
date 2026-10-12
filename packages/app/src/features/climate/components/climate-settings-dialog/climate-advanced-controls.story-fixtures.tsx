import { Button } from '@navet/app/components/primitives/button';
import { integrationStore } from '@navet/app/stores/integration-store';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ClimateSettingsDialog } from './index';

const advancedControls: NavetClimateControlState = {
  writable: true,
  preset: { value: 'Comfort', options: ['Comfort', 'Away', 'Sleep'] },
  fanMode: { value: 'Auto', options: ['Auto', 'Low', 'High'] },
  swingMode: { value: 'Off', options: ['Off', 'Vertical'] },
  swingHorizontalMode: { value: 'Off', options: ['Off', 'Horizontal'] },
  targetHumidity: { value: 45, min: 30, max: 70, step: 1 },
  currentHumidity: 42,
};
const capabilities: NavetEntity['capabilities'] = [
  'climate_preset',
  'climate_fan_mode',
  'climate_swing_mode',
  'climate_swing_horizontal_mode',
  'climate_target_humidity',
];
function ClimateAdvancedDialogStory({
  availability = 'available',
  supported = capabilities,
  targetHumidity = advancedControls.targetHumidity,
}: {
  availability?: NavetEntity['availability'];
  supported?: NavetEntity['capabilities'];
  targetHumidity?: NavetClimateControlState['targetHumidity'];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('heat');
  const [temperature, setTemperature] = useState(21);
  useEffect(() => {
    const previous = integrationStore.getState();
    const entity: NavetEntity = {
      id: 'home_assistant:climate.advanced',
      canonicalId: 'home_assistant:climate.advanced',
      externalId: 'climate.advanced',
      providerId: 'home_assistant',
      name: 'Living room climate',
      type: 'climate',
      primaryState: 'heat',
      availability,
      attributes: { climateControls: { ...advancedControls, targetHumidity } },
      capabilities: supported,
    };
    integrationStore.setState({
      providerEntitiesByProviderId: {
        ...previous.providerEntitiesByProviderId,
        home_assistant: {
          ...previous.providerEntitiesByProviderId.home_assistant,
          [entity.canonicalId]: entity,
        },
      },
    });
    return () =>
      integrationStore.setState({
        providerEntitiesByProviderId: previous.providerEntitiesByProviderId,
      });
  }, [availability, supported, targetHumidity]);
  return (
    <SettingsDialogStoryFrame>
      <div className="flex items-start justify-center p-6">
        <Button onClick={() => setOpen(true)}>Open Climate dialog</Button>
      </div>
      <ClimateSettingsDialog
        entityId="home_assistant:climate.advanced"
        isOpen={open}
        onOpenChange={setOpen}
        name="Living room climate"
        isOn
        mode={mode}
        targetTemp={temperature}
        currentTemp={20}
        supportedClimateModes={['heat', 'cool', 'off']}
        onModeChange={setMode}
        onTargetTempChange={setTemperature}
      />
    </SettingsDialogStoryFrame>
  );
}
const meta = {
  component: ClimateAdvancedDialogStory,
  render: (args) => <ClimateAdvancedDialogStory {...args} />,
  tags: ['!autodocs'],
  args: { availability: 'available', supported: capabilities },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ClimateAdvancedDialogStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Supported: Story = {
  args: { targetHumidity: { value: 45, min: 30.5, max: 70.5, step: 1 } },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open Climate dialog' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByRole('button', { name: 'Preset' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(dialog.queryByRole('radio', { name: 'Comfort' })).not.toBeInTheDocument();
    // Measure the complete collapsed row, including status space and its divider.
    for (const label of [
      'Preset',
      'Fan mode',
      'Vertical swing',
      'Horizontal swing',
      'Target humidity',
    ]) {
      const row = dialog.getByRole('button', { name: label }).parentElement;
      if (!row) throw new Error(`Missing control row: ${label}`);
      await expect(row.getBoundingClientRect().height).toBe(41);
    }
    await userEvent.click(dialog.getByRole('button', { name: 'Fan mode' }));
    const fanOptions = within(dialog.getByRole('group', { name: 'Fan mode' }));
    const field = fanOptions.getByRole('radio', { name: 'Low' });
    const root = document.documentElement;
    const runtime = root.dataset.navetPreviewRuntime;
    const storybook = root.dataset.navetStorybook;
    delete root.dataset.navetPreviewRuntime;
    delete root.dataset.navetStorybook;
    try {
      await userEvent.click(field);
      await waitFor(() =>
        expect(dialog.getByRole('alert')).toHaveTextContent(
          'Unable to update the climate control. Try again.'
        )
      );
      await expect(fanOptions.getByRole('radio', { name: 'Auto' })).toBeChecked();
      await expect(field).toBeEnabled();
      await userEvent.click(field);
      await waitFor(() => expect(field).toBeEnabled());
      await userEvent.click(dialog.getByRole('button', { name: 'Target humidity' }));
      const humidity = dialog.getByRole('spinbutton', {
        name: 'Target humidity',
      }) as HTMLInputElement;
      const formElement = humidity.closest('form');
      if (!formElement) throw new Error('Humidity form is missing');
      const form = within(formElement);
      await userEvent.clear(humidity);
      await userEvent.type(humidity, '31');
      await expect(humidity.checkValidity()).toBe(true);
      await userEvent.click(form.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(humidity).toHaveAccessibleDescription(
          'Unable to update the climate control. Try again.'
        )
      );
      await expect(humidity).toHaveValue(31);
      await userEvent.clear(humidity);
      await userEvent.type(humidity, '31.5');
      await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    } finally {
      if (runtime === undefined) delete root.dataset.navetPreviewRuntime;
      else root.dataset.navetPreviewRuntime = runtime;
      if (storybook === undefined) delete root.dataset.navetStorybook;
      else root.dataset.navetStorybook = storybook;
    }
  },
};
export const Mobile: Story = {
  ...Supported,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const PresetOnly: Story = { args: { supported: ['climate_preset'] } };
export const Unavailable: Story = {
  args: { availability: 'unavailable' },
  play: async ({ canvas, userEvent: interaction }) => {
    await interaction.click(canvas.getByRole('button', { name: 'Open Climate dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await interaction.click(dialog.getByRole('button', { name: 'Fan mode' }));
    await expect(
      within(dialog.getByRole('group', { name: 'Fan mode' })).getByRole('radio', { name: 'Low' })
    ).toBeDisabled();
    await interaction.click(dialog.getByRole('button', { name: 'Target humidity' }));
    await expect(dialog.getByRole('spinbutton', { name: 'Target humidity' })).toBeDisabled();
  },
};
export const Unsupported: Story = {
  args: { supported: [] },
  play: async ({ canvas, userEvent: interaction }) => {
    await interaction.click(canvas.getByRole('button', { name: 'Open Climate dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.queryByRole('button', { name: 'Preset' })).not.toBeInTheDocument();
    await expect(dialog.queryByRole('spinbutton')).not.toBeInTheDocument();
    await expect(dialog.queryByRole('slider')).not.toBeInTheDocument();
    await expect(dialog.getByRole('button', { name: 'Increase temperature' })).toBeEnabled();
  },
};
