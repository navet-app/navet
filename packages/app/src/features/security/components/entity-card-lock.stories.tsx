import { LockCard } from '@navet/app/features/security';
import { createPreviewStoryScenario, replacePreviewEntity } from '@navet/app/preview/runtime';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { expect } from 'storybook/test';

function LockCardStory(args: ComponentProps<typeof LockCard>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'small'}>
      <LockCard {...args} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Lock',
  component: LockCardStory,
  tags: ['autodocs'],
  argTypes: {
    id: {
      control: 'select',
      options: ['lock.front_door', 'lock.car_trunk'],
    },
    name: {
      control: 'select',
      options: ['Front Door', 'Car Trunk'],
    },
    initialState: {
      control: 'boolean',
    },
    size: {
      control: 'inline-radio',
      options: ['small'],
    },
  },
  args: {
    id: 'lock.front_door',
    name: 'Front Door',
    initialState: true,
    size: 'small',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof LockCardStory>;

const richComponentDocsDescription = getStoryDocsDescription(meta.title);

meta.parameters = {
  ...meta.parameters,
  docs: {
    ...meta.parameters?.docs,
    description: {
      ...meta.parameters?.docs?.description,
      component: richComponentDocsDescription,
    },
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: 'small',
    initialState: true,
    id: 'lock.front_door',
    name: 'Front Door',
  },
  play: async ({ canvas, userEvent, step }) => {
    const actionButton = canvas.getByRole('button', { name: /slide to unlock/i });

    await step('shows the lock as locked initially', async () => {
      await expect(canvas.getByText(/locked/i)).toBeInTheDocument();
    });

    await step('enters the provider-confirmed unlock state when pressed', async () => {
      actionButton.focus();
      await userEvent.keyboard('[Space]');
      await expect(
        canvas.findByText(/unlocking/i, {}, { timeout: 2000 })
      ).resolves.toBeInTheDocument();
      await expect(actionButton).toBeDisabled();
    });
  },
};

export const Small: Story = {
  args: {
    size: 'small',
    initialState: true,
    id: 'lock.front_door',
    name: 'Front Door',
  },
};

export const SmallUnlocked: Story = {
  args: {
    size: 'small',
    initialState: false,
    id: 'lock.front_door',
    name: 'Front Door',
  },
  parameters: {
    previewRuntime: {
      scenario: replacePreviewEntity(createPreviewStoryScenario(), {
        id: 'home_assistant:lock.front_door',
        canonicalId: 'home_assistant:lock.front_door',
        providerId: 'home_assistant',
        externalId: 'lock.front_door',
        type: 'lock',
        name: 'Front Door',
        room: 'Entrance',
        primaryState: 'unlocked',
        availability: 'available',
        attributes: {
          value: 'unlocked',
          locked: false,
          room: 'Entrance',
          deviceId: 'device-entrance-lock',
        },
        capabilities: [],
        lastUpdated: '2026-05-16T08:00:00.000Z',
      }),
    },
  },
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const Dialog: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: args.name }));
  },
};
