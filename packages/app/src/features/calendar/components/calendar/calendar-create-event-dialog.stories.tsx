import { useTheme } from '@navet/app/hooks';
import type { PlatformCalendarCreateEvent } from '@navet/core/provider-feature-models';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { CalendarCreateEventDialog } from './calendar-create-event-dialog';

const createEvent = fn(async (_id: string, _event: PlatformCalendarCreateEvent) => undefined);
function CreateEventStory({
  fail = false,
  unavailable = false,
}: {
  fail?: boolean;
  unavailable?: boolean;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(true);
  return open ? (
    <CalendarCreateEventDialog
      theme={theme}
      calendars={[
        {
          id: 'home_assistant:calendar.family',
          name: 'Family',
          canCreate: true,
          available: !unavailable,
        },
        {
          id: 'home_assistant:calendar.holidays',
          name: 'Holidays',
          canCreate: false,
          available: true,
        },
      ]}
      onClose={() => setOpen(false)}
      onCreate={async (id, event) => {
        await createEvent(id, event);
        if (fail) throw new Error('Permission denied');
      }}
    />
  ) : (
    <p>Event created</p>
  );
}
const meta = {
  title: 'Cards/Entity/Calendar/Create event',
  component: CreateEventStory,
  args: { fail: false, unavailable: false },
  beforeEach: () => {
    createEvent.mockClear();
  },
} satisfies Meta<typeof CreateEventStory>;
export default meta;
type Story = StoryObj<typeof meta>;

async function fillAllDay(canvasElement: HTMLElement) {
  const screen = within(canvasElement.ownerDocument.body);
  await userEvent.type(screen.getByLabelText(/Event title/), 'Holiday');
  await userEvent.click(screen.getByRole('switch', { name: 'All day' }));
  fireEvent.change(screen.getByLabelText(/Start/), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText(/Last day/), { target: { value: '2026-10-25' } });
  return screen;
}

export const AllDay: Story = {
  play: async ({ canvasElement }) => {
    const screen = await fillAllDay(canvasElement);
    await expect(screen.queryByRole('option', { name: 'Holidays' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await expect(createEvent).toHaveBeenCalledWith(
      'home_assistant:calendar.family',
      expect.objectContaining({ allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' })
    );
    await expect(screen.getByText('Event created')).toBeInTheDocument();
  },
};
export const FailedRetry: Story = {
  args: { fail: true },
  play: async ({ canvasElement }) => {
    const screen = await fillAllDay(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await expect(screen.getByRole('alert')).toHaveTextContent('Could not create');
    await expect(screen.getByLabelText(/Event title/)).toHaveValue('Holiday');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await expect(createEvent).toHaveBeenCalledTimes(2);
  },
};
export const Unavailable: Story = {
  args: { unavailable: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(screen.getByRole('button', { name: 'Create event' })).toBeDisabled();
    await expect(screen.getByRole('status')).toHaveTextContent('unavailable');
  },
};
