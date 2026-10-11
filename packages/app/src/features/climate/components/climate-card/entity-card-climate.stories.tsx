import { ClimateCard } from '@navet/app/features/climate';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import advancedDialogMeta, * as advancedDialogStories from '../climate-settings-dialog/climate-advanced-controls.story-fixtures';
import dialogMeta, * as dialogStories from '../climate-settings-dialog/climate-settings-dialog.story-fixtures';

function ClimateCardStory(args: Omit<ComponentProps<typeof ClimateCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <ClimateCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Climate',
  component: ClimateCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium'],
    },
  },
  args: {
    id: 'climate.main_floor',
    name: 'Main Floor Climate',
    room: 'Hallway',
    initialTemp: 22,
    initialCurrentTemp: 21,
    initialMode: 'cool',
    initialAction: 'cooling',
    initialState: true,
    size: 'medium',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof ClimateCardStory>;

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

export const Idle: Story = {
  args: {
    name: 'Floor Thermostat',
    initialTemp: 22,
    initialCurrentTemp: 24.7,
    initialMode: 'heat',
    initialAction: 'idle',
    size: 'medium',
  },
};

export const SmallIdle: Story = {
  args: {
    ...Idle.args,
    size: 'small',
  },
};

export const IdleLowEffects: Story = {
  args: Idle.args,
  render: (args) => (
    <div data-navet-effects-quality="low">
      <ClimateCardStory {...args} />
    </div>
  ),
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

export const DialogMobile: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Mobile,
};

export const AdvancedDialogSupported: StoryObj<typeof advancedDialogMeta> = {
  ...advancedDialogMeta,
  ...advancedDialogStories.Supported,
  args: { ...advancedDialogMeta.args, ...advancedDialogStories.Supported.args },
};

export const AdvancedDialogMobile: StoryObj<typeof advancedDialogMeta> = {
  ...advancedDialogMeta,
  ...advancedDialogStories.Mobile,
  args: { ...advancedDialogMeta.args, ...advancedDialogStories.Mobile.args },
};

export const AdvancedDialogPresetOnly: StoryObj<typeof advancedDialogMeta> = {
  ...advancedDialogMeta,
  ...advancedDialogStories.PresetOnly,
  args: { ...advancedDialogMeta.args, ...advancedDialogStories.PresetOnly.args },
};

export const AdvancedDialogUnavailable: StoryObj<typeof advancedDialogMeta> = {
  ...advancedDialogMeta,
  ...advancedDialogStories.Unavailable,
  args: { ...advancedDialogMeta.args, ...advancedDialogStories.Unavailable.args },
};

export const AdvancedDialogUnsupported: StoryObj<typeof advancedDialogMeta> = {
  ...advancedDialogMeta,
  ...advancedDialogStories.Unsupported,
  args: { ...advancedDialogMeta.args, ...advancedDialogStories.Unsupported.args },
};

export const DialogLight: StoryObj<typeof dialogMeta> = {
  ...Dialog,
  globals: { theme: 'light' },
};

export const DialogGlass: StoryObj<typeof dialogMeta> = {
  ...Dialog,
  globals: { theme: 'glass' },
};

export const DialogBlack: StoryObj<typeof dialogMeta> = {
  ...Dialog,
  globals: { theme: 'black' },
};
