import { HelperValueControl } from '@navet/app/components/shared/device-editor/helper-value-control';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Shared/Helper Controls',
  component: HelperValueControl,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:input_number.target',
    name: 'Target temperature',
    providerId: 'home_assistant',
    helper: {
      helperType: 'number',
      value: 21.5,
      writable: true,
      min: 15,
      max: 30,
      step: 0.5,
      unit: '°C',
    },
  },
  parameters: {
    docs: { description: { component: getStoryDocsDescription('Cards/Entity/Helper') } },
  },
} satisfies Meta<typeof HelperValueControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Numeric: Story = {};
export const Selector: Story = {
  args: {
    name: 'House mode',
    helper: {
      helperType: 'select',
      value: 'Home',
      writable: true,
      options: ['Home', 'Away', 'Guests'],
    },
  },
};
export const EmptyOptions: Story = {
  args: {
    name: 'House mode',
    helper: { helperType: 'select', value: null, writable: false, options: [] },
  },
};
export const Text: Story = {
  args: {
    name: 'Household note',
    helper: {
      helperType: 'text',
      value: 'Please close the garage door',
      writable: true,
      minLength: 0,
      maxLength: 255,
      mode: 'text',
    },
  },
};
export const DateOnly: Story = {
  args: { name: 'Next visit', helper: { helperType: 'date', value: '2026-10-11', writable: true } },
};
export const Time: Story = {
  args: { name: 'Wake up', helper: { helperType: 'time', value: '07:30:00', writable: true } },
};
export const DateTime: Story = {
  args: {
    name: 'Heating schedule',
    helper: { helperType: 'datetime', value: '2026-10-11 07:30:00', writable: true },
  },
};
export const NativeDateTime: Story = {
  args: {
    id: 'home_assistant:datetime.departure',
    name: 'Departure',
    helper: {
      helperType: 'datetime',
      value: '2026-10-25 00:30:00',
      writable: true,
      timeZone: 'UTC',
    },
  },
};
export const Unavailable: Story = { args: { unavailable: true } };
export const ReadOnly: Story = {
  args: {
    helper: {
      helperType: 'number',
      value: 21.5,
      writable: false,
      min: 15,
      max: 30,
      step: 0.5,
      unit: '°C',
    },
  },
};
