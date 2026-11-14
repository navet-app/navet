import type { PlatformLocationPoint } from '@navet/core/provider-feature-models';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { MapHistoryDialog } from './map-history-dialog';

const markers = [
  {
    id: 'home_assistant:person.alex',
    name: 'Alex',
    latitude: 55,
    longitude: 13,
    state: 'home',
    canShowHistory: true,
  },
  {
    id: 'home_assistant:person.sam',
    name: 'Sam',
    latitude: 55.1,
    longitude: 13.1,
    state: 'away',
    canShowHistory: true,
  },
];
function HistoryStory({
  mode = 'loaded',
}: {
  mode?: 'loaded' | 'empty' | 'failed' | 'unsupported' | 'loading';
}) {
  const [open, setOpen] = useState(true);
  const [load] = useState(() => {
    let failed = false;
    return async (): Promise<PlatformLocationPoint[][] | null> => {
      if (mode === 'failed' && !failed) {
        failed = true;
        throw new Error('Recorder offline');
      }
      if (mode === 'empty') return [];
      if (mode === 'unsupported') return null;
      if (mode === 'loading') return new Promise(() => undefined);
      return [
        [
          { latitude: 55, longitude: 13, timestamp: '2026-10-14T10:00:00Z' },
          { latitude: 55.1, longitude: 13.1, timestamp: '2026-10-14T10:10:00Z' },
        ],
      ];
    };
  });
  return open ? (
    <MapHistoryDialog
      markers={markers}
      load={load}
      onClose={() => setOpen(false)}
      onApply={() => undefined}
    />
  ) : (
    <p>History applied</p>
  );
}
const meta = {
  title: 'Cards/Widgets/Map/History',
  component: HistoryStory,
  args: { mode: 'loaded' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HistoryStory>;
export default meta;
type Story = StoryObj<typeof meta>;
async function loadRecords(element: HTMLElement) {
  const screen = within(element.ownerDocument.body);
  await userEvent.click(screen.getByRole('button', { name: 'Load records' }));
  return screen;
}
export const Recorded: Story = {
  play: async ({ canvasElement }) => {
    const screen = await loadRecords(canvasElement);
    await expect(screen.getByText('2 recorded locations')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    await expect(screen.getByText('History applied')).toBeInTheDocument();
  },
};
export const Empty: Story = {
  args: { mode: 'empty' },
  play: async ({ canvasElement }) => {
    const screen = await loadRecords(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('Not enough recorded locations');
    await expect(screen.queryByRole('button', { name: 'Show on map' })).not.toBeInTheDocument();
  },
};
export const FailedRetry: Story = {
  args: { mode: 'failed' },
  play: async ({ canvasElement }) => {
    const screen = await loadRecords(canvasElement);
    await expect(screen.getByRole('alert')).toHaveTextContent('Could not load records');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await expect(screen.getByText('2 recorded locations')).toBeInTheDocument();
  },
};
export const Unsupported: Story = {
  args: { mode: 'unsupported' },
  play: async ({ canvasElement }) => {
    const screen = await loadRecords(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('Location history is unavailable');
  },
};
export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => {
    const screen = await loadRecords(canvasElement);
    await expect(screen.getByRole('status')).toHaveTextContent('Loading records');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Entity' }), markers[1].id);
    await expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Load records' })).toBeEnabled();
  },
};
