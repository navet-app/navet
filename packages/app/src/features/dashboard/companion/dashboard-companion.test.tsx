import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it.each(['lock', 'weather', 'alarm'])(
    'opens the selected %s card without navigating or changing its state',
    async (type) => {
      const entity = Object.values(integrationStore.getState().providerEntitiesByCanonicalId).find(
        (item) => (type === 'alarm' ? Boolean(item.attributes.alarmState) : item.type === type)
      );
      if (!entity) throw new Error(`Missing preview ${type}`);
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: true,
        cards: [{ id: 'selected', type: 'entity', entityId: entity.canonicalId }],
      });
      const section = useNavigationStore.getState().activeSection;
      renderWithProviders(<DashboardCompanion />);
      const opener = screen.getByRole('button', { name: `Open settings for ${entity.name}` });
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog', { name: entity.name });
      // Wait for the existing entity card to load, rather than accepting an empty modal shell.
      if (type === 'weather') {
        expect(
          await within(dialog).findByRole('button', { name: 'Stockholm' })
        ).toBeInTheDocument();
      } else {
        await waitFor(() =>
          expect(within(dialog).getAllByText(entity.name).length).toBeGreaterThan(1)
        );
      }
      expect(useNavigationStore.getState().activeSection).toBe(section);
      expect(
        integrationStore.getState().providerEntitiesByCanonicalId[entity.canonicalId].primaryState
      ).toBe(entity.primaryState);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(opener).toHaveFocus());
    }
  );

  it('disables security and weather dialog triggers while customizing', () => {
    renderWithProviders(<DashboardCompanion editing />);
    const openers = screen.getAllByRole('button', { name: /^Open settings for / });
    expect(openers.length).toBeGreaterThan(1);
    for (const opener of openers) expect(opener).toBeDisabled();
  });

  it('renders normalized weather, camera and security from the selected sources', () => {
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit panel' })).not.toBeInTheDocument();
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

  it('reveals panel tools only during customization and retains an empty panel without changing dashboard content', async () => {
    const before = useDashboardCollectionStore.getState();
    const homeLayout = before.collection.dashboardsById[before.activeDashboardId].homeLayout;
    const view = renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    while (screen.queryAllByRole('button', { name: /^More actions:/ }).length) {
      fireEvent.pointerDown(screen.getAllByRole('button', { name: /^More actions:/ })[0], {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Remove / }));
    }
    const state = useDashboardCollectionStore.getState();
    expect(state.collection.dashboardsById[state.activeDashboardId].companion?.cards).toEqual([]);
    expect(state.collection.dashboardsById[state.activeDashboardId].homeLayout).toEqual(homeLayout);
    view.unmount();
    act(() => useEditModeStore.getState().setEditMode(false));
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Add items to your side panel.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses a focused card editor and keyboard-accessible menu actions during customization', async () => {
    renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'note' } });
    const form = screen.getByRole('button', { name: 'Cancel' }).closest('form');
    if (!form) throw new Error('Expected the add-card form');
    fireEvent.submit(form);
    fireEvent.change(screen.getByLabelText('Note text'), {
      target: { value: 'Remember the plants' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Note' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move Note up' }));
    const state = useDashboardCollectionStore.getState();
    const cards = state.collection.dashboardsById[state.activeDashboardId].companion?.cards;
    expect(cards?.[cards.length - 2]).toMatchObject({ type: 'note', text: 'Remember the plants' });
    act(() => useEditModeStore.getState().setEditMode(false));
    expect(screen.getByText('Remember the plants')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note text')).not.toBeInTheDocument();
  });

  it('can select a light from the full device catalog while customizing', () => {
    renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const select = within(screen.getByRole('dialog')).getByLabelText('Device');
    const light = Array.from(select.querySelectorAll('option')).find((option) =>
      option.value.includes(':light.')
    );
    if (!light) throw new Error('Expected a light in the device catalog');
    fireEvent.change(select, { target: { value: light.value } });
    const form = select.closest('form');
    if (!form) throw new Error('Expected the add-card form');
    fireEvent.submit(form);
    const state = useDashboardCollectionStore.getState();
    expect(
      state.collection.dashboardsById[state.activeDashboardId].companion?.cards?.slice(-1)[0]
    ).toMatchObject({ type: 'entity', entityId: light.value });
    expect(useEditModeStore.getState().isEditMode).toBe(true);
  });

  it('shows a thermostat value with separate power and dialog buttons', async () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'thermostat', type: 'entity', entityId: 'home_assistant:climate.main_floor' }],
    });
    useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('21°C')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Toggle Main floor/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Open settings for Main floor/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Increase temperature/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('keeps humidifiers as state rows rather than inventing a thermostat target', () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'humidity', type: 'entity', entityId: 'home_assistant:humidifier.bedroom' }],
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Increase temperature/ })).not.toBeInTheDocument();
  });

  it.each(['calendar', 'chores'])('adds %s through the panel editor', (type) => {
    renderWithProviders(<DashboardCompanion editing />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: type } });
    const dialog = screen.getByRole('dialog');
    if (type === 'calendar') expect(within(dialog).getByLabelText('Device')).toBeInTheDocument();
    else expect(within(dialog).queryByLabelText('Device')).not.toBeInTheDocument();
    const form = within(dialog).getByRole('button', { name: 'Add item' }).closest('form');
    if (!form) throw new Error('Expected panel item form');
    fireEvent.submit(form);
    const state = useDashboardCollectionStore.getState();
    expect(
      state.collection.dashboardsById[state.activeDashboardId].companion?.cards?.at(-1)
    ).toMatchObject({ type });
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
