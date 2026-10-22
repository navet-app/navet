import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CompanionEntityRow } from './companion-entity-row';

function entity(id: string) {
  const value = integrationStore.getState().providerEntitiesByCanonicalId[`home_assistant:${id}`];
  if (!value) throw new Error(`Missing preview entity ${id}`);
  return value;
}

describe('companion card rows', () => {
  beforeEach(async () => {
    await resetAppStores();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' });
  });
  afterEach(() => resetPreviewRuntime());

  it.each([
    ['light.kitchen_island', 'Kitchen island'],
    ['fan.bedroom_ceiling', 'Bedroom fan'],
    ['climate.main_floor', 'Main floor'],
    ['media_player.living_room_speaker', 'Living Room Speaker'],
  ])('opens the existing dialog from the %s name without toggling power', async (id, name) => {
    const before = entity(id).primaryState;
    renderWithProviders(<CompanionEntityRow entity={entity(id)} editing={false} />);
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(`^Open settings for ${name}`, 'i') })
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(entity(id).primaryState).toBe(before);
  });

  it.each([
    ['light.kitchen_island', 'Kitchen island'],
    ['fan.bedroom_ceiling', 'Bedroom fan'],
    ['climate.main_floor', 'Main floor'],
  ])('toggles %s from its icon without opening a dialog', async (id, name) => {
    renderWithProviders(<CompanionEntityRow entity={entity(id)} editing={false} />);
    const power = await screen.findByRole('button', { name: new RegExp(`^Toggle ${name}`, 'i') });
    expect(power).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(power);
    await waitFor(() => expect(entity(id).primaryState).toBe('off'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps light brightness as a value with no slider', async () => {
    renderWithProviders(
      <CompanionEntityRow entity={entity('light.kitchen_island')} editing={false} />
    );
    await screen.findByRole('button', { name: 'Toggle Kitchen island' });
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'disables power and dialog access during editing or disconnection (editing: %s)',
    async (editing) => {
      if (!editing)
        act(() =>
          integrationStore.setState((state) => ({
            providerRuntime: {
              ...state.providerRuntime,
              home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
            },
          }))
        );
      renderWithProviders(
        <CompanionEntityRow entity={entity('light.kitchen_island')} editing={editing} />
      );
      expect(await screen.findByRole('button', { name: 'Toggle Kitchen island' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: /Open settings for Kitchen island/ })
      ).toBeDisabled();
      if (!editing) expect(screen.getByText('Unavailable')).toBeInTheDocument();
    }
  );

  it('shows music details without power or playback controls', async () => {
    renderWithProviders(
      <CompanionEntityRow entity={entity('media_player.living_room_speaker')} editing={false} />
    );
    const name = await screen.findByRole('button', {
      name: /Open settings for Living Room Speaker/,
    });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /Toggle|playback|Next track/i })
    ).not.toBeInTheDocument();
    expect(name.textContent).toContain('Morning Mix');
    expect(screen.queryByText('On', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Off', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(name);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(entity('media_player.living_room_speaker').primaryState).toBe('playing');
  });
});
