import { integrationStore } from '@navet/app/stores/integration-store';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetCounterState } from '@navet/core/household-device-state';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CounterCard } from './counter-card';

const counter: NavetCounterState = {
  value: 4,
  min: 0,
  max: 10,
  step: 2,
  initial: 0,
  canIncrement: true,
  canDecrement: true,
  canReset: true,
  canSetValue: true,
};
function CounterCardStory(
  args: ComponentProps<typeof CounterCard> & {
    availability?: NavetEntity['availability'];
    missing?: boolean;
  }
) {
  useEffect(() => {
    const previous = integrationStore.getState().providerEntitiesByProviderId;
    const entity: NavetEntity = {
      id: args.id,
      canonicalId: args.id,
      providerId: args.providerId,
      externalId: args.id.split(':').at(-1) ?? args.id,
      name: args.name,
      type: 'counter',
      primaryState: (args.counter ?? counter).value,
      availability: args.availability ?? 'available',
      attributes: { ...(args.counter ?? counter) },
      capabilities: ['counter_increment', 'counter_decrement', 'counter_reset', 'counter_value'],
    };
    const entities = { ...previous[args.providerId] };
    delete entities[args.id];
    if (!args.missing) entities[args.id] = entity;
    integrationStore.setState({
      providerEntitiesByProviderId: {
        ...previous,
        [args.providerId]: entities,
      },
    });
    return () => integrationStore.setState({ providerEntitiesByProviderId: previous });
  }, [args.id, args.name, args.counter, args.providerId, args.availability, args.missing]);
  return (
    <EntityCardStoryFrame size={args.size}>
      <CounterCard {...args} />
    </EntityCardStoryFrame>
  );
}
const meta = {
  title: 'Cards/Entity/Counter',
  component: CounterCardStory,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:counter.visits',
    name: 'Visits',
    providerId: 'home_assistant',
    counter,
    size: 'small',
    isEditMode: false,
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['extra-small', 'small', 'medium'] },
  },
} satisfies Meta<typeof CounterCardStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AtMaximum: Story = {
  args: { counter: { ...counter, value: 10, canIncrement: false } },
};
export const ExtraSmall: Story = { args: { size: 'extra-small' } };
export const Medium: Story = { args: { size: 'medium' } };
export const KeyboardWriteFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas
      .findAllByRole('button', { name: 'Open settings for Visits' })
      .then((buttons) => buttons[0]);
    card.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog'));
    const value = dialog.getByLabelText('Value');
    await userEvent.clear(value);
    await userEvent.type(value, '5');
    await expect(dialog.getByRole('button', { name: 'Set value' })).toBeDisabled();
    await userEvent.clear(value);
    await userEvent.type(value, '6');
    const root = canvasElement.ownerDocument.documentElement;
    const runtime = root.dataset.navetPreviewRuntime;
    const storybook = root.dataset.navetStorybook;
    delete root.dataset.navetPreviewRuntime;
    delete root.dataset.navetStorybook;
    try {
      await userEvent.click(dialog.getByRole('button', { name: 'Set value' }));
      await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent('Could not update'));
      await expect(value).toHaveValue(6);
    } finally {
      if (runtime === undefined) delete root.dataset.navetPreviewRuntime;
      else root.dataset.navetPreviewRuntime = runtime;
      if (storybook === undefined) delete root.dataset.navetStorybook;
      else root.dataset.navetStorybook = storybook;
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
  },
};

export const Unavailable: Story = { args: { availability: 'unavailable' } };
export const Loading: Story = { args: { missing: true } };
export const ControlsDialog: Story = {
  play: async ({ canvasElement }) => {
    const card = await within(canvasElement)
      .findAllByRole('button', { name: 'Open settings for Visits' })
      .then((buttons) => buttons[0]);
    card.focus();
    await userEvent.keyboard('{Enter}');
    await expect(within(canvasElement.ownerDocument.body).getByRole('dialog')).toBeVisible();
  },
};
export const MobileControlsDialog: Story = {
  ...ControlsDialog,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
