import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { integrationStore } from '@navet/app/stores/integration-store';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sliders } from 'lucide-react';
import { act, useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { DeviceControlRow } from './device-control-row';

function ParentHelpersDialog({
  unavailable = false,
  unavailableAction = false,
  helperCount = 3,
}: {
  unavailable?: boolean;
  unavailableAction?: boolean;
  helperCount?: number;
}) {
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
        id: 'home_assistant:button.backup_map',
        canonicalId: 'home_assistant:button.backup_map',
        externalId: 'button.backup_map',
        type: 'helper',
        name: 'Backup saved map',
        availability: unavailable || unavailableAction ? 'unavailable' : 'available',
        attributes: { deviceId: 'kitchen' },
        capabilities: ['press'],
      },
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
    const numberHelper = helpers[1];
    for (let index = helpers.length; index < helperCount; index++) {
      const externalId = `number.extra_${String(index).padStart(3, '0')}`;
      helpers.push({
        ...numberHelper,
        id: `home_assistant:${externalId}`,
        canonicalId: `home_assistant:${externalId}`,
        externalId,
        name: `Helper ${index + 1}`,
      });
    }
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
  }, [unavailable, unavailableAction, helperCount]);
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
export const Unavailable: Story = {
  args: { unavailable: true },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const label = await dialog.findByText('Backup saved map');
    await expect(label.closest('div')?.querySelector('svg')).toBeNull();
    await expect(
      dialog.queryByRole('button', { name: /Backup saved map/ })
    ).not.toBeInTheDocument();
    await expect(dialog.queryByRole('button', { name: 'Turn-off delay' })).not.toBeInTheDocument();
    await expect(dialog.getAllByText('Unavailable')).toHaveLength(3);
  },
};
export const MixedAvailability: Story = {
  args: { unavailableAction: true },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const unavailable = await dialog.findByText('Backup saved map');
    const available = await dialog.findByRole('button', { name: 'Turn-off delay' });
    await expect(
      available.compareDocumentPosition(unavailable) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  },
};
export const LongList: Story = {
  args: { helperCount: 60 },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const viewport = await dialog.findByRole('region', { name: 'Helpers' });
    await expect(getComputedStyle(viewport).maskImage).not.toBe('none');
    const finalHelper = await dialog.findByRole('button', { name: 'Helper 60' });
    await expect(finalHelper).toBeInTheDocument();
    await act(async () => {
      viewport.scrollTop = viewport.scrollHeight;
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(finalHelper).toBeVisible();
    dialog.getByRole('button', { name: 'Helper 59' }).focus();
    await userEvent.tab();
    await expect(finalHelper).toHaveFocus();
    await expect(viewport).toHaveClass('helper-list-top-fade');
    await expect(viewport).not.toHaveClass('helper-list-bottom-fade');
    await expect(getComputedStyle(viewport).maskImage).not.toBe('none');
  },
};
export const LongListMobile: Story = {
  ...LongList,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const Mobile: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
