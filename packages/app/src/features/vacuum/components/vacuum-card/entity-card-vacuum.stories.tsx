import { VacuumCard } from '@navet/app/features/vacuum';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import dialogMeta, * as dialogStories from '../vacuum/vacuum-settings-dialog.story-fixtures';

function VacuumCardStory(args: Omit<ComponentProps<typeof VacuumCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <VacuumCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const baseVacuumArgs: Omit<ComponentProps<typeof VacuumCard>, 'onSizeChange'> = {
  id: 'vacuum.robby',
  name: 'Robby',
  room: 'Ground Floor',
  status: 'cleaning',
  battery: 74,
  cleanedArea: '42 m²',
  cleaningTime: '38 min',
  size: 'medium',
  isEditMode: false,
};

const meta = {
  title: 'Cards/Entity/Vacuum',
  component: VacuumCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium', 'large'],
    },
    status: {
      control: 'select',
      options: [
        'cleaning',
        'mopping',
        'drying',
        'returning',
        'docked',
        'charging',
        'charging-complete',
        'paused',
        'idle',
        'error',
      ],
    },
  },
  args: baseVacuumArgs,
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof VacuumCardStory>;

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

export const Cleaning: Story = {};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Charging: Story = {
  args: {
    status: 'charging',
    battery: 82,
    cleanedArea: '42 m²',
    cleaningTime: '38 min',
    size: 'medium',
  },
};

export const ChargingComplete: Story = {
  args: {
    status: 'charging-complete',
    battery: 100,
    cleanedArea: '54 m²',
    cleaningTime: '49 min',
    size: 'medium',
  },
};

export const Mopping: Story = {
  args: {
    status: 'mopping',
    battery: 68,
    cleanedArea: '36 m²',
    cleaningTime: '31 min',
    size: 'medium',
  },
};

export const Drying: Story = {
  args: {
    status: 'drying',
    battery: 94,
    cleanedArea: '54 m²',
    cleaningTime: '49 min',
    size: 'medium',
  },
};

export const LowBattery: Story = {
  args: {
    status: 'idle',
    battery: 18,
    cleanedArea: '0 m²',
    cleaningTime: '0 min',
    size: 'medium',
  },
};

export const PausedAttention: Story = {
  args: {
    status: 'paused',
    battery: 56,
    cleanedArea: '51 m²',
    cleaningTime: '46 min',
    size: 'medium',
  },
};

export const PartialCapabilities: Story = {
  args: {
    status: 'idle',
    battery: undefined,
    cleanedArea: undefined,
    cleaningTime: undefined,
    size: 'medium',
  },
};

export const Unavailable: Story = {
  args: {
    status: 'idle',
    availability: 'unavailable',
    battery: undefined,
    cleanedArea: undefined,
    cleaningTime: undefined,
    size: 'medium',
  },
};

export const Returning: Story = {
  args: {
    status: 'returning',
    battery: 63,
    cleanedArea: '29 m²',
    cleaningTime: '24 min',
    size: 'medium',
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
  args: { ...dialogMeta.args, ...dialogStories.Default.args },
};

export const DialogMultiSpeed: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.MultiSpeed,
  args: { ...dialogMeta.args, ...dialogStories.MultiSpeed.args },
};

export const DialogNoFanSpeedSupport: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.NoFanSpeedSupport,
  args: { ...dialogMeta.args, ...dialogStories.NoFanSpeedSupport.args },
};

export const DialogNoMappedAreas: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.NoMappedAreas,
  args: { ...dialogMeta.args, ...dialogStories.NoMappedAreas.args },
};

export const DialogOrderedAreaCleaning: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.OrderedAreaCleaning,
  args: { ...dialogMeta.args, ...dialogStories.OrderedAreaCleaning.args },
};

export const DialogOverflowNavigation: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.OverflowNavigation,
  args: { ...dialogMeta.args, ...dialogStories.OverflowNavigation.args },
};

export const DialogMobileOverflowNavigation: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.MobileOverflowNavigation,
  args: { ...dialogMeta.args, ...dialogStories.MobileOverflowNavigation.args },
};
