import { integrationStore } from '@navet/app/stores/integration-store';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ValveCard } from './valve-card';

const defaultCapabilities: NavetEntity['capabilities'] = [
  'valve_open',
  'valve_close',
  'valve_stop',
  'position',
];
function ValveStory({
  phase = 'closed',
  position = 0,
  capabilities = defaultCapabilities,
  availability = 'available',
  ...props
}: ComponentProps<typeof ValveCard> & {
  phase?: string;
  position?: number | null;
  capabilities?: NavetEntity['capabilities'];
  availability?: NavetEntity['availability'];
}) {
  useEffect(() => {
    const previous = integrationStore.getState().providerEntitiesByProviderId;
    const entity: NavetEntity = {
      id: props.id,
      canonicalId: props.id,
      externalId: 'valve.water',
      providerId: props.providerId,
      type: 'valve',
      name: props.name,
      primaryState: phase,
      attributes: { phase, position },
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
  }, [props.id, props.name, props.providerId, phase, position, capabilities, availability]);
  return (
    <EntityCardStoryFrame size={props.size}>
      <ValveCard {...props} />
    </EntityCardStoryFrame>
  );
}
const meta = {
  title: 'Cards/Entity/Valve',
  component: ValveStory,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:valve.water',
    name: 'Garden water valve',
    room: 'Garden',
    providerId: 'home_assistant',
    size: 'small',
    isEditMode: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Reuses the Cover card action row and the existing controls dialog shell. Only normalized advertised valve actions appear. Stop remains reachable during a position write; live state confirms commands.',
      },
    },
  },
} satisfies Meta<typeof ValveStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Tiny: Story = {
  args: { size: 'tiny' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Controls for Garden water valve, 0%, Closed',
    });
    await expect(within(canvasElement).getByText('Garden', { exact: true })).toBeVisible();
    await expect(within(canvasElement).queryByText('0%', { exact: true })).not.toBeInTheDocument();
    await expect(
      within(canvasElement)
        .getByRole('heading', { name: 'Garden water valve' })
        .getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(trigger.getBoundingClientRect().bottom);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await expect(within(document.body).getByRole('dialog')).toBeVisible();
    await expect(
      within(document.body).getByRole('spinbutton', { name: 'Position for Garden water valve' })
    ).toBeEnabled();
  },
};
export const Medium: Story = {
  args: { size: 'medium', name: 'Garden irrigation and greenhouse supply valve' },
};
export const Positionless: Story = {
  args: { position: null, capabilities: ['valve_open', 'valve_close'] },
};
export const Open: Story = { args: { phase: 'open', position: 100 } };
export const PartiallyOpen: Story = { args: { phase: 'open', position: 30 } };
export const PositionlessOpen: Story = {
  args: { phase: 'open', position: null, capabilities: ['valve_open', 'valve_close'] },
};
export const Opening: Story = { args: { phase: 'opening', position: 35 } };
export const Unavailable: Story = {
  args: { availability: 'unavailable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Open' })).toBeDisabled());
    expect(canvas.getByRole('button', { name: 'Close' })).toBeDisabled();
  },
};
export const ControlsDialog: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Controls for Garden water valve',
    });
    button.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = within(document.body).getByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByRole('spinbutton', { name: 'Position for Garden water valve' })
      ).toBeEnabled()
    );
  },
};
export const MobileControlsDialog: Story = {
  ...ControlsDialog,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
