import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, within } from 'storybook/test';
import type { HistoryQuery, HistoryRecord } from '../history-records';
import { HistoryExplorerDialog } from './history-explorer-dialog';

const entities = [
  {
    id: 'home_assistant:sensor.temperature',
    name: 'Kitchen temperature — main floor climate and ventilation sensor',
    source: 'Home Assistant',
    connected: true,
  },
  {
    id: 'home_assistant:switch.kitchen',
    name: 'Kitchen switch',
    source: 'Home Assistant',
    connected: true,
  },
  { id: 'homey:device#temperature', name: 'Kitchen temperature', source: 'Homey', connected: true },
];
function HistoryStory({
  scenario = 'records',
}: {
  scenario?: 'records' | 'empty' | 'error' | 'unsupported' | 'offline' | 'loading';
}) {
  const [open, setOpen] = useState(true);
  const [load] = useState(() => {
    let failed = false;
    return async (query: HistoryQuery): Promise<HistoryRecord[] | null> => {
      if (scenario === 'error' && !failed) {
        failed = true;
        throw new Error('Connection lost');
      }
      if (scenario === 'loading') return new Promise<HistoryRecord[]>(() => undefined);
      if (scenario === 'unsupported') return null;
      if (scenario === 'empty') return [];
      if (query.mode === 'activity')
        return [
          {
            timestamp: query.startTime,
            value: 'Evening routine started',
            name: 'Kitchen',
            context: { name: 'Evening routine', userId: 'household-user' },
          },
        ];
      return [
        { timestamp: query.startTime, value: query.entityId.includes('sensor') ? '21.4' : 'on' },
        {
          timestamp: new Date(Date.parse(query.startTime) - 1000).toISOString(),
          value: query.entityId.includes('sensor') ? '20.9' : 'off',
          atStart: true,
        },
      ];
    };
  });
  return open ? (
    <HistoryExplorerDialog
      entities={
        scenario === 'offline'
          ? entities.map((entity) => ({ ...entity, connected: false }))
          : entities
      }
      onClose={() => setOpen(false)}
      load={load}
    />
  ) : (
    <p>Closed</p>
  );
}
const meta = {
  title: 'Pages/History/Explorer',
  component: HistoryStory,
  args: { scenario: 'records' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HistoryStory>;
export default meta;
type Story = StoryObj<typeof meta>;
const screenFor = (element: HTMLElement) => within(element.ownerDocument.body);
async function expectLayout(element: HTMLElement) {
  const screen = screenFor(element);
  const content = screen.getByRole('region', { name: 'History and activity' });
  const loadButton = screen.getByRole('button', { name: 'Load records' });
  const view = element.ownerDocument.defaultView;
  if (!view) throw new Error('History story requires a browser viewport');
  await expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth + 1);
  await expect(loadButton.getBoundingClientRect().bottom).toBeLessThanOrEqual(view.innerHeight);
}
async function chooseAndLoad(element: HTMLElement) {
  const screen = screenFor(element);
  await expectLayout(element);
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: /^Entity/ }),
    'home_assistant:sensor.temperature'
  );
  await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
  return screen;
}
export const StateAndActivity: Story = {
  play: async ({ canvasElement }) => {
    const screen = await chooseAndLoad(canvasElement);
    await expect(screen.getByText('21.4')).toBeInTheDocument();
    await expect(screen.getByText('State at the start of the range')).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^Entity/ }),
      'home_assistant:switch.kitchen'
    );
    await expect(screen.queryByText('21.4')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
    await expect(screen.getByText('on', { exact: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
    await expect(screen.getByText('Kitchen: Evening routine started')).toBeInTheDocument();
    await expect(screen.getByText('Evening routine · User action')).toBeInTheDocument();
    await expectLayout(canvasElement);
  },
};
export const Empty: Story = {
  args: { scenario: 'empty' },
  play: async ({ canvasElement }) => {
    const screen = await chooseAndLoad(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('No records for this range');
  },
};
export const FailedRetry: Story = {
  args: { scenario: 'error' },
  play: async ({ canvasElement }) => {
    const screen = await chooseAndLoad(canvasElement);
    await expect(screen.getByRole('alert')).toHaveTextContent('Could not load records');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await expect(screen.getByText('21.4')).toBeInTheDocument();
  },
};
export const Unsupported: Story = {
  args: { scenario: 'unsupported' },
  play: async ({ canvasElement }) => {
    const screen = await chooseAndLoad(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('History is unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Activity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
    await expect(screen.getByRole('status')).toHaveTextContent('Activity is unavailable');
  },
};
export const Offline: Story = {
  args: { scenario: 'offline' },
  play: async ({ canvasElement }) => {
    const screen = screenFor(canvasElement);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^Entity/ }),
      entities[0].id
    );
    await expect(screen.getByRole('button', { name: 'Load records' })).toBeDisabled();
    await expect(screen.getByRole('status')).toHaveTextContent('disconnected');
  },
};
export const InvalidRange: Story = {
  play: async ({ canvasElement }) => {
    const screen = screenFor(canvasElement);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^Entity/ }),
      entities[0].id
    );
    fireEvent.change(screen.getByLabelText(/Start/), { target: { value: '2026-10-13T12:00' } });
    fireEvent.change(screen.getByLabelText(/End/), { target: { value: '2026-10-13T11:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
    await expect(screen.getByRole('alert')).toHaveTextContent('31 days');
  },
};

export const Loading: Story = {
  args: { scenario: 'loading' },
  play: async ({ canvasElement }) => {
    const screen = await chooseAndLoad(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('Loading records');
    await expect(screen.getByRole('button', { name: 'Load records' })).toBeDisabled();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^Entity/ }),
      'home_assistant:switch.kitchen'
    );
    await expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Load records' })).toBeEnabled();
  },
};
