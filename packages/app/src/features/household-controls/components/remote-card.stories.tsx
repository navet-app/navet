import { integrationStore } from '@navet/app/stores/integration-store';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { RemoteCard } from './remote-card';

const defaultCapabilities: NavetEntity['capabilities'] = ['toggle'];
function RemoteStory({
  isOn = false,
  capabilities = defaultCapabilities,
  availability = 'available',
  ...props
}: ComponentProps<typeof RemoteCard> & {
  isOn?: boolean | null;
  capabilities?: NavetEntity['capabilities'];
  availability?: NavetEntity['availability'];
}) {
  useEffect(() => {
    const previous = integrationStore.getState().providerEntitiesByProviderId;
    const entity: NavetEntity = {
      id: props.id,
      canonicalId: props.id,
      externalId: 'remote.living_room',
      providerId: props.providerId,
      type: 'remote',
      name: props.name,
      primaryState: isOn,
      attributes: { isOn },
      capabilities,
      availability,
    };
    integrationStore.setState({
      providerEntitiesByProviderId: {
        ...previous,
        [props.providerId]: { ...previous[props.providerId], [props.id]: entity },
      },
    });
    return () => integrationStore.setState({ providerEntitiesByProviderId: previous });
  }, [props.id, props.name, props.providerId, isOn, capabilities, availability]);
  return (
    <EntityCardStoryFrame size={props.size}>
      <RemoteCard {...props} />
    </EntityCardStoryFrame>
  );
}
const meta = {
  title: 'Cards/Entity/Remote',
  component: RemoteStory,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:remote.living_room',
    name: 'Living room remote',
    room: 'Living room',
    providerId: 'home_assistant',
    size: 'small',
    isEditMode: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Reuses the Switch card power action and existing card/dialog primitives. The remote advertises only supported on/off actions. Live state remains authoritative; no activity, learning or universal button controls are added.',
      },
    },
  },
} satisfies Meta<typeof RemoteStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const On: Story = { args: { isOn: true } };
export const Tiny: Story = {
  args: { size: 'tiny' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Controls for Living room remote, Off',
    });
    await expect(within(canvasElement).getByText('Living room', { exact: true })).toBeVisible();
    await expect(within(canvasElement).queryByText('Off', { exact: true })).not.toBeInTheDocument();
    await expect(
      within(canvasElement)
        .getByRole('heading', { name: 'Living room remote' })
        .getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(trigger.getBoundingClientRect().bottom);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByRole('button', { name: 'Turn on Living room remote' })).toBeEnabled();
  },
};
export const Medium: Story = {
  args: { size: 'medium', name: 'Living room entertainment cabinet remote control' },
};
export const ReadOnly: Story = { args: { capabilities: [] } };
export const Unavailable: Story = {
  args: { availability: 'unavailable' },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('button', { name: 'Turn on Living room remote' })
      ).toBeDisabled()
    );
  },
};
export const ControlsDialog: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Controls for Living room remote',
    });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = within(document.body).getByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Turn on Living room remote' })
      ).toBeEnabled()
    );
    expect(
      within(dialog).queryByRole('button', { name: /learn|activity/i })
    ).not.toBeInTheDocument();
  },
};
export const MobileControlsDialog: Story = {
  ...ControlsDialog,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
