import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { integrationStore } from '@navet/app/stores/integration-store';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sliders } from 'lucide-react';
import { useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { DeviceControlRow } from './device-control-row';

function ParentHelpersDialog({ unavailable = false }: { unavailable?: boolean }) {
  useEffect(() => {
    const previous = integrationStore.getState().providerEntitiesByProviderId;
    const parent: NavetEntity = {
      id: 'home_assistant:light.kitchen',
      canonicalId: 'home_assistant:light.kitchen',
      externalId: 'light.kitchen',
      providerId: 'home_assistant',
      type: 'light',
      name: 'Kitchen light',
      primaryState: 'on',
      availability: 'available',
      attributes: { deviceId: 'kitchen' },
      capabilities: ['toggle'],
    };
    const helpers: NavetEntity[] = [
      {
        ...parent,
        id: 'home_assistant:number.delay',
        canonicalId: 'home_assistant:number.delay',
        externalId: 'number.delay',
        type: 'helper',
        name: 'Turn-off delay',
        availability: unavailable ? 'unavailable' : 'available',
        primaryState: 5,
        attributes: {
          deviceId: 'kitchen',
          helperType: 'number',
          writable: true,
          value: 5,
          min: 0,
          max: 60,
          step: 1,
          unit: 's',
        },
        capabilities: ['number_value'],
      },
      {
        ...parent,
        id: 'home_assistant:select.profile',
        canonicalId: 'home_assistant:select.profile',
        externalId: 'select.profile',
        type: 'helper',
        name: 'Profile',
        availability: unavailable ? 'unavailable' : 'available',
        primaryState: 'Quiet',
        attributes: {
          deviceId: 'kitchen',
          helperType: 'select',
          writable: true,
          value: 'Quiet',
          options: ['Quiet', 'Normal'],
        },
        capabilities: ['select_option'],
      },
    ];
    integrationStore.setState({
      providerEntitiesByProviderId: {
        ...previous,
        home_assistant: {
          ...previous.home_assistant,
          [parent.canonicalId]: parent,
          ...Object.fromEntries(helpers.map((entity) => [entity.canonicalId, entity])),
        },
      },
    });
    return () => integrationStore.setState({ providerEntitiesByProviderId: previous });
  }, [unavailable]);
  return (
    <BaseCardDialog
      isOpen
      onOpenChange={() => undefined}
      title="Kitchen light"
      entityId="home_assistant:light.kitchen"
      theme="dark"
      mobileFitContent
      tabs={[
        {
          key: 'controls',
          label: 'Controls',
          icon: Sliders,
          content: <DeviceControlRow kind="reading" label="Light" value="On" />,
        },
      ]}
    />
  );
}
const meta = {
  title: 'Components/Shared/Device Helper Controls',
  component: ParentHelpersDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Reuses the climate advanced-control rows and writable helper editors beneath the parent controls. Device relationships are normalized and provider-scoped. Rendered maintainer acceptance is pending.',
      },
    },
  },
} satisfies Meta<typeof ParentHelpersDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ParentDialog: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const row = await dialog.findByRole('button', { name: 'Turn-off delay' });
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(row);
    await expect(dialog.getByRole('spinbutton')).toHaveValue(5);
  },
};
export const Unavailable: Story = { args: { unavailable: true } };
export const Mobile: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
