import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import { renderWithProviders } from '@navet/app/test/render';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RestoreEntitiesDialog from './restore-entities-dialog';

vi.mock('@navet/app/hooks/use-devices', () => ({ useDevices: () => ({}) }));
vi.mock('@navet/app/hooks/use-device-map', () => ({
  useDeviceMap: () => ({
    deviceMap: new Map([
      [
        'home_assistant:weather.home',
        {
          id: 'home_assistant:weather.home',
          name: 'Home weather',
          room: 'Home',
          type: 'weather',
        },
      ],
    ]),
  }),
}));

const weatherId = 'home_assistant:weather.home';
const missingId = 'home_assistant:light.disconnected';
const previous = useDashboardEntitiesStore.getState();

beforeEach(() => {
  useDashboardEntitiesStore.setState({
    hiddenEntityIds: [weatherId, missingId],
    shownSensorEntityIds: [],
    explicitlyShownEntityIds: [],
  });
});
afterEach(() => {
  cleanup();
  act(() => useDashboardEntitiesStore.setState(previous));
});

// Restore behavior uses the real visibility mutations and the existing library picker.
describe('RestoreEntitiesDialog', () => {
  it('restores just the chosen entity and keeps other hidden entities available', () => {
    renderWithProviders(<RestoreEntitiesDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore: Home weather' }));
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual([missingId]);
    expect(useDashboardEntitiesStore.getState().explicitlyShownEntityIds).toContain(weatherId);
    expect(screen.queryByRole('button', { name: 'Restore: Home weather' })).toBeNull();
    expect(screen.getByRole('button', { name: `Restore: ${missingId}` })).toBeInTheDocument();
  });

  it('restores all hidden entities even when search narrows the list', () => {
    const onClose = vi.fn();
    renderWithProviders(<RestoreEntitiesDialog onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Search entities'), {
      target: { value: 'weather' },
    });
    expect(screen.queryByRole('button', { name: `Restore: ${missingId}` })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not change visibility when dismissed', () => {
    const onClose = vi.fn();
    renderWithProviders(<RestoreEntitiesDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual([weatherId, missingId]);
  });
});
