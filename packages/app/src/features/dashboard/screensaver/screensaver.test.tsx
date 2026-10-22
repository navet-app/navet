import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import Screensaver from './screensaver';
import { ScreensaverGate } from './screensaver-gate';
import { useScreensaverStore } from './screensaver-store';

describe('screensaver content and dismissal', () => {
  beforeEach(async () => {
    await resetAppStores();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    useScreensaverStore.getState().stop();
  });
  afterEach(() => resetPreviewRuntime());

  it('uses live weather and unit preferences, and reports disconnection', () => {
    renderWithProviders(<Screensaver />);
    expect(screen.getByRole('dialog', { name: 'Screensaver' })).toBeInTheDocument();
    expect(screen.getByText('64.4°F')).toBeInTheDocument();
    act(() => useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' }));
    expect(screen.getByText('18°C')).toBeInTheDocument();
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
        },
      }))
    );
    expect(screen.queryByText('18°C')).not.toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('honors a hidden or missing explicit weather source without substituting another', () => {
    const collection = useDashboardCollectionStore.getState();
    collection.updateCompanion(collection.activeDashboardId, {
      weatherEntityId: 'home_assistant:weather.removed',
      showSecurity: true,
    });
    renderWithProviders(<Screensaver />);
    expect(screen.getByText('Weather is unavailable')).toBeInTheDocument();
    expect(screen.queryByText('64.4°F')).not.toBeInTheDocument();
    act(() =>
      collection.updateCompanion(collection.activeDashboardId, {
        weatherEntityId: null,
        showSecurity: false,
      })
    );
    expect(screen.queryByText('Weather is unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Screensaver' })).toHaveAccessibleDescription(
      'Tap anywhere or press a key to return'
    );
  });

  it('prioritizes a triggered alarm over an active timer and omits cached disconnected alerts', () => {
    const entities = integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {};
    const weather = Object.values(entities).find((entity) => entity.type === 'weather');
    const alarm = Object.values(entities).find((entity) => entity.attributes.alarmState);
    if (!weather || !alarm)
      throw new Error('Preview must include normalized weather and alarm sources');
    const timer: NavetEntity = {
      ...weather,
      id: 'home_assistant:timer.kitchen',
      canonicalId: 'home_assistant:timer.kitchen',
      externalId: 'timer.kitchen',
      type: 'timer',
      name: 'Kitchen timer',
      primaryState: 'active',
      attributes: { phase: 'active', finishesAt: new Date(Date.now() + 180000).toISOString() },
    };
    integrationStore.setState({
      providerEntitiesByProviderId: { home_assistant: { ...entities, [timer.canonicalId]: timer } },
    });
    renderWithProviders(<Screensaver />);
    expect(screen.getByText('Kitchen timer')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
    act(() =>
      integrationStore.setState({
        providerEntitiesByProviderId: {
          home_assistant: {
            ...entities,
            [timer.canonicalId]: timer,
            [alarm.canonicalId]: {
              ...alarm,
              attributes: { ...alarm.attributes, alarmState: 'triggered' },
            },
          },
        },
      })
    );
    expect(screen.getByText('Triggered')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen timer')).not.toBeInTheDocument();
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
        },
      }))
    );
    expect(screen.queryByText('Triggered')).not.toBeInTheDocument();
    expect(screen.queryByText('Kitchen timer')).not.toBeInTheDocument();
  });

  it('restores the preview launcher after responsive settings remount it', async () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    const view = (key: string) => (
      <>
        <button
          type="button"
          key={key}
          data-screensaver-preview
          onClick={() => useScreensaverStore.getState().start()}
        >
          Preview launcher
        </button>
        <ScreensaverGate />
      </>
    );
    const { rerender } = renderWithProviders(view('original'));
    screen.getByRole('button', { name: 'Preview launcher' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Preview launcher' }));
    rerender(view('remounted'));
    fireEvent.click(screen.getByRole('button', { name: 'Return to dashboard' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview launcher' })).toHaveFocus()
    );
  });

  it.each(['click', 'keyboard'])(
    'dismisses with %s without firing the dashboard action underneath',
    (method) => {
      const action = vi.fn();
      useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
      renderWithProviders(
        <>
          <button type="button" onClick={action}>
            Device control
          </button>
          <ScreensaverGate />
        </>
      );
      const control = screen.getByRole('button', { name: 'Device control' });
      control.focus();
      act(() => useScreensaverStore.getState().start());
      const dismiss = screen.getByRole('button', { name: 'Return to dashboard' });
      fireEvent.pointerDown(dismiss);
      expect(screen.getByRole('dialog', { name: 'Screensaver' })).toBeInTheDocument();
      if (method === 'click') fireEvent.click(dismiss);
      else fireEvent.keyDown(dismiss, { key: 'x' });
      expect(useScreensaverStore.getState().active).toBe(false);
      expect(screen.queryByRole('dialog', { name: 'Screensaver' })).not.toBeInTheDocument();
      expect(action).not.toHaveBeenCalled();
    }
  );
});
