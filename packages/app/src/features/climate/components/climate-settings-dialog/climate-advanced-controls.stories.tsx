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
  title: 'Cards/Dialogs/Climate Advanced Controls',
  component: ClimateAdvancedDialogStory,
  tags: ['autodocs'],
  args: { availability: 'available', supported: capabilities },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Extends Cards/Dialogs/Climate with normalized capability-gated controls, reusing its existing dialog section rows and input primitives.',
      },
    },
  },
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
    await expect(dialog.getByRole('combobox', { name: 'Preset' })).toBeEnabled();
    await expect(dialog.getByRole('combobox', { name: 'Horizontal swing' })).toBeEnabled();
    const field = dialog.getByRole('combobox', { name: 'Fan mode' });
    const root = document.documentElement;
    const runtime = root.dataset.navetPreviewRuntime;
    const storybook = root.dataset.navetStorybook;
    delete root.dataset.navetPreviewRuntime;
    delete root.dataset.navetStorybook;
    try {
      await userEvent.selectOptions(field, 'Low');
      await waitFor(() =>
        expect(dialog.getByRole('alert')).toHaveTextContent(
          'Unable to update the climate control. Try again.'
        )
      );
      await expect(field).toHaveValue('Auto');
      await expect(field).toBeEnabled();
      await userEvent.selectOptions(field, 'Low');
      await waitFor(() => expect(field).toBeEnabled());
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
        expect(form.getByRole('alert')).toHaveTextContent(
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
    await expect(dialog.getByRole('combobox', { name: 'Fan mode' })).toBeDisabled();
    await expect(dialog.getByRole('spinbutton', { name: 'Target humidity' })).toBeDisabled();
  },
};
export const Unsupported: Story = {
  args: { supported: [] },
  play: async ({ canvas, userEvent: interaction }) => {
    await interaction.click(canvas.getByRole('button', { name: 'Open Climate dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.queryByRole('combobox')).not.toBeInTheDocument();
    await expect(dialog.queryByRole('spinbutton')).not.toBeInTheDocument();
    await expect(dialog.getByRole('slider')).toBeInTheDocument();
  },
};
