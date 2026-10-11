import { SwitchCard } from '@navet/app/features/lighting';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import dialogMeta, * as dialogStories from './switch-card-dialog.story-fixtures';

function SwitchCardStory(args: ComponentProps<typeof SwitchCard>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'small'}>
      <SwitchCard {...args} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Switch',
  component: SwitchCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['tiny', 'extra-small', 'small'],
    },
  },
  args: {
    id: 'switch.espresso_machine',
    name: 'Espresso Machine',
    size: 'small',
    initialState: true,
    entityType: 'switch',
    serviceDomain: 'switch',
    serviceAction: 'toggle',
    isEditMode: false,
    power: 1140,
    voltage: 230,
    energy: 2.6,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Active and inactive switch-card states. Use the small active state to review accent border weight against other entity cards in dark theme.',
      },
    },
  },
} satisfies Meta<typeof SwitchCardStory>;

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

export const TinyEditMode: Story = {
  args: {
    size: 'tiny',
    isEditMode: true,
  },
};

export const ExtraSmall: Story = {
  args: {
    size: 'extra-small',
  },
};

export const ExtraSmallEditMode: Story = {
  args: {
    size: 'extra-small',
    isEditMode: true,
  },
};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const InactiveSmall: Story = {
  args: {
    size: 'small',
    initialState: false,
  },
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};
