import { integrationStore } from '@navet/app/stores/integration-store';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetTimerState } from '@navet/core/household-device-state';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TimerCard } from './timer-card';

const idle: NavetTimerState = {
  phase: 'idle',
  durationSeconds: 300,
  remainingSeconds: null,
  finishesAt: null,
  canStart: true,
  canPause: false,
  canCancel: false,
  canFinish: false,
};
function TimerCardStory(
  args: ComponentProps<typeof TimerCard> & {
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
      type: 'timer',
      primaryState: (args.timer ?? idle).phase,
      availability: args.availability ?? 'available',
      attributes: { ...(args.timer ?? idle) },
      capabilities: ['timer_start', 'timer_pause', 'timer_cancel', 'timer_finish'],
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
  }, [args.id, args.name, args.timer, args.providerId, args.availability, args.missing]);
  return (
    <EntityCardStoryFrame size={args.size}>
      <TimerCard {...args} />
    </EntityCardStoryFrame>
  );
}
const meta = {
  title: 'Cards/Entity/Timer',
  component: TimerCardStory,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:timer.tea',
    name: 'Tea timer',
    providerId: 'home_assistant',
    timer: idle,
    size: 'small',
    isEditMode: false,
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['tiny', 'extra-small', 'small', 'medium'] },
  },
} satisfies Meta<typeof TimerCardStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Idle: Story = {};
export const Active: Story = {
  args: {
    timer: {
      ...idle,
      phase: 'active',
      finishesAt: new Date(Date.now() + 180000).toISOString(),
      remainingSeconds: 180,
      canPause: true,
      canCancel: true,
      canFinish: true,
    },
  },
};
export const Paused: Story = {
  args: {
    timer: { ...idle, phase: 'paused', remainingSeconds: 125, canCancel: true, canFinish: true },
  },
};
export const Tiny: Story = {
  args: { size: 'tiny', room: 'Kitchen' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByRole('button', { name: 'Tea timer, Idle' });
    await expect(card).toHaveAccessibleName('Tea timer, Idle');
    await expect(canvas.getByText('Kitchen')).toBeVisible();
    const clock = canvas.getByText('00:05:00', { exact: true });
    const clockBounds = clock.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    await expect(clockBounds.right).toBeLessThanOrEqual(cardBounds.right);
    await expect(clockBounds.bottom).toBeLessThanOrEqual(cardBounds.bottom);
  },
};
export const Medium: Story = { args: { size: 'medium' } };
export const KeyboardWriteFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByRole('button', { name: 'Tea timer' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog'));
    const duration = dialog.getByLabelText('Duration (seconds)');
    await userEvent.clear(duration);
    await userEvent.type(duration, '60');
    const root = canvasElement.ownerDocument.documentElement;
    const runtime = root.dataset.navetPreviewRuntime;
    const storybook = root.dataset.navetStorybook;
    delete root.dataset.navetPreviewRuntime;
    delete root.dataset.navetStorybook;
    try {
      await userEvent.click(dialog.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent('Could not update'));
      await expect(duration).toHaveValue(60);
      await userEvent.click(dialog.getByRole('button', { name: 'Start' }));
      await waitFor(() => expect(dialog.getByRole('button', { name: 'Start' })).toBeEnabled());
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
    const card = await within(canvasElement).findByRole('button', { name: 'Tea timer' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    await expect(within(canvasElement.ownerDocument.body).getByRole('dialog')).toBeVisible();
  },
};
export const MobileControlsDialog: Story = {
  ...ControlsDialog,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
