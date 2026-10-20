import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import { DashboardCompanion } from './dashboard-companion';

vi.mock('@navet/app/hooks/use-resource-url', () => ({
  useResourceUrl: (url: string | null) => url,
}));

describe('dashboard companion connected state', () => {
  beforeEach(async () => {
    await resetAppStores();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
  });
  afterEach(() => resetPreviewRuntime());

  it('renders normalized weather, camera and security from the selected sources', () => {
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('64.4°F')).toBeInTheDocument();
    act(() => useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' }));
    expect(screen.getByText('18°C')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeEnabled();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('Armed Home')).toBeInTheDocument();
  });

  it('reports a disconnected source instead of showing cached weather and security as available', () => {
    integrationStore.setState((state) => ({
      providerRuntime: {
        ...state.providerRuntime,
        home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
      },
    }));
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByText('64.4°F')).not.toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeDisabled();
  });

  it('keeps a missing selected camera unavailable rather than silently showing a different camera', () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      cameraEntityId: 'home_assistant:camera.removed',
      showSecurity: false,
      weatherEntityId: null,
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Camera is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lets each dashboard hide selected content and retains choices when the panel remounts', () => {
    const view = renderWithProviders(<DashboardCompanion />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize sidebar' }));
    fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'hidden' } });
    fireEvent.change(screen.getByLabelText('Weather'), { target: { value: 'hidden' } });
    fireEvent.click(screen.getByLabelText('Show security status'));
    const state = useDashboardCollectionStore.getState();
    expect(state.collection.dashboardsById[state.activeDashboardId].companion).toEqual({
      cameraEntityId: null,
      weatherEntityId: null,
      showSecurity: false,
    });
    view.unmount();
    renderWithProviders(<DashboardCompanion />);
    expect(
      screen.getByText('Choose weather, a camera or security status for this sidebar.')
    ).toBeInTheDocument();
  });

  it('shows a fallback after an image failure and clears stale state on a source switch', () => {
    const { unmount } = renderWithProviders(<DashboardCompanion />);
    fireEvent.error(screen.getByRole('img', { name: 'Front Door' }));
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeDisabled();
    unmount();
    act(() => {
      const state = useDashboardCollectionStore.getState();
      state.updateCompanion(state.activeDashboardId, {
        cameraEntityId: null,
        showSecurity: false,
        weatherEntityId: null,
      });
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
