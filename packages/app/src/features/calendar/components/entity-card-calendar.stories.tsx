import { CalendarCard } from '@navet/app/features/calendar';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import {
  EntityCardStoryFrame,
  getEntityCardStoryFrameStyle,
} from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import dialogMeta, * as dialogStories from './calendar/calendar-settings-dialog.story-fixtures';

function toIsoDate(dayOffset: number, hours: number, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function CalendarCardStory(args: Omit<ComponentProps<typeof CalendarCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame
      size={args.size ?? 'medium'}
      className="overflow-hidden rounded-3xl"
      style={getEntityCardStoryFrameStyle(args.size ?? 'medium')}
    >
      <CalendarCard {...args} onSizeChange={() => undefined} />
    </EntityCardStoryFrame>
  );
}

const events = [
  {
    id: '0',
    title: 'Waste pickup',
    startTime: '--',
    endTime: '--',
    timeDisplay: '--',
    startDateTime: toIsoDate(0, 0, 0),
    isAllDay: true,
    type: 'event' as const,
    color: '#f59e0b',
    sortKey: toIsoDate(0, 0, 0),
  },
  {
    id: '1',
    title: 'Design review',
    startTime: '10:00',
    endTime: '10:45',
    timeDisplay: '10:00',
    startDateTime: toIsoDate(0, 10, 0),
    endDateTime: toIsoDate(0, 10, 45),
    type: 'meeting' as const,
    color: '#60a5fa',
    sortKey: toIsoDate(0, 10, 0),
  },
  {
    id: '2',
    title: 'Call with installer',
    startTime: '13:00',
    endTime: '13:30',
    timeDisplay: '13:00',
    startDateTime: toIsoDate(1, 13, 0),
    endDateTime: toIsoDate(1, 13, 30),
    type: 'call' as const,
    color: '#34d399',
    sortKey: toIsoDate(1, 13, 0),
  },
];

const meta = {
  title: 'Cards/Entity/Calendar',
  component: CalendarCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium', 'large'],
    },
  },
  args: {
    id: 'calendar.family',
    name: 'Family Calendar',
    room: 'Home',
    events,
    inEditMode: false,
    size: 'medium',
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof CalendarCardStory>;

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

export const Large: Story = {
  args: {
    size: 'large',
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
