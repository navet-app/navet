import { SceneCard } from '@navet/app/features/scenes';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

function SceneCardStory(args: Omit<ComponentProps<typeof SceneCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'small'}>
      <SceneCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Scene',
  component: SceneCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['tiny', 'extra-small', 'small', 'medium'],
    },
  },
  args: {
    id: 'scene.movie_mode',
    name: 'Movie Mode',
    room: 'Living Room',
    size: 'small',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof SceneCardStory>;

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

export const Playground: Story = {};

export const Tiny: Story = {
  args: {
    size: 'tiny',
  },
};

export const ExtraSmall: Story = {
  args: {
    size: 'extra-small',
  },
};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Medium: Story = {
  args: {
    size: 'medium',
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
