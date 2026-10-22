import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import { readNavetClimateState } from '@navet/app/core/navet-device-state';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderCard } from '../utils/card-renderer';
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
  afterEach(() => {
    cleanup();
    resetPreviewRuntime();
  });

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

  it('opens light controls when its state value is clicked without changing power', async () => {
    renderWithProviders(
      <CompanionEntityRow entity={entity('light.kitchen_island')} editing={false} />
    );
    const value = await screen.findByText('72%');
    fireEvent.click(value);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(entity('light.kitchen_island').primaryState).toBe('on');
  });

  it.each(['small', 'medium', 'large'] as const)(
    'keeps current temperature prominent on a %s dashboard card',
    async (size) => {
      const climate = entity('climate.main_floor');
      const state = readNavetClimateState(climate);
      if (!state || state.currentTemperature == null) throw new Error('Missing climate reading');
      const device = mapNavetEntitiesToDeviceCollection([climate]).climate[0];
      const card = renderCard({
        device: { ...device, type: 'climate' },
        size,
        handleSizeChange: () => {},
        isEditMode: false,
      });
      if (!card) throw new Error('Missing climate card');
      renderWithProviders(card);
      const reading = await screen.findByText(
        formatTemperatureFromSourceUnit(state.currentTemperature, state.temperatureUnit, 'celsius')
      );
      expect(reading).toHaveClass(size === 'large' ? 'text-4xl' : 'text-3xl');
      if (state.temperature != null && state.temperature !== state.currentTemperature) {
        const target = formatTemperatureFromSourceUnit(
          state.temperature,
          state.temperatureUnit,
          'celsius'
        );
        expect(screen.getByText((text) => text.includes(target))).not.toHaveClass(
          'text-3xl',
          'text-4xl'
        );
      }
    }
  );

  it('keeps current temperature prominent in the panel and target prominent in its dialog', async () => {
    const climate = entity('climate.main_floor');
    const state = readNavetClimateState(climate);
    if (!state || state.currentTemperature == null || state.temperature == null)
      throw new Error('Missing climate temperatures');
    const current = formatTemperatureFromSourceUnit(
      state.currentTemperature,
      state.temperatureUnit,
      'celsius'
    );
    const target = formatTemperatureFromSourceUnit(
      state.temperature,
      state.temperatureUnit,
      'celsius'
    );
    renderWithProviders(<CompanionEntityRow entity={climate} editing={false} />);
    expect(await screen.findByText(current)).toHaveClass('text-xs', 'font-medium');
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^Open settings for ${climate.name}`) })
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(target, { selector: 'dd' })).toHaveClass('text-3xl');
    expect(dialog.getByText(`Current ${current}`)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Increase temperature' }));
    await waitFor(() =>
      expect(dialog.queryByText(target, { selector: 'dd' })).not.toBeInTheDocument()
    );
    expect(dialog.getByText(`Current ${current}`)).toBeInTheDocument();
  });

  it('opens the native sensor dialog directly from a generic entity row', async () => {
    const sensor = entity('sensor.outside_temperature');
    renderWithProviders(<CompanionEntityRow entity={sensor} editing={false} />);
    fireEvent.click(screen.getByRole('button', { name: `Open settings for ${sensor.name}` }));
    const dialog = await screen.findByRole('dialog', { name: sensor.name });
    expect(dialog.querySelector('[data-card-dialog-header]')).toBeInTheDocument();
    expect(within(dialog).getByText('Sensor icon')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getAllByText(sensor.name)).toHaveLength(1);
  });

  it('opens humidifier controls instead of a switch dialog', async () => {
    const humidifier = { ...entity('humidifier.bedroom'), type: 'switch' as const };
    integrationStore.setState((state) => ({
      providerEntitiesByCanonicalId: {
        ...state.providerEntitiesByCanonicalId,
        [humidifier.canonicalId]: humidifier,
      },
      providerEntitiesByProviderId: {
        ...state.providerEntitiesByProviderId,
        [humidifier.providerId]: {
          ...state.providerEntitiesByProviderId[humidifier.providerId],
          [humidifier.canonicalId]: humidifier,
        },
      },
    }));
    renderWithProviders(<CompanionEntityRow entity={humidifier} editing={false} />);
    fireEvent.click(screen.getByRole('button', { name: `Open settings for ${humidifier.name}` }));
    const dialog = await screen.findByRole('dialog', { name: humidifier.name });
    expect(within(dialog).getByRole('radio', { name: 'Auto' })).toBeChecked();
    expect(
      within(dialog).getByRole('button', { name: 'Increase target humidity' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it.each(['lock', 'person', 'scene', 'cover', 'weather', 'vacuum'] as const)(
    'opens the same %s dialog from the dashboard and side panel',
    async (type) => {
      const source = Object.values(integrationStore.getState().providerEntitiesByCanonicalId).find(
        (item) => item.type === type
      );
      if (!source) throw new Error(`Missing preview ${type}`);
      const collection = mapNavetEntitiesToDeviceCollection([source]);
      const cardType = (Object.keys(collection) as (keyof typeof collection)[]).find((key) =>
        collection[key].some((device) => device.id === source.canonicalId)
      );
      if (!cardType) throw new Error(`Missing dashboard card ${type}`);
      const device = collection[cardType].find((item) => item.id === source.canonicalId);
      const card = renderCard({
        device: { ...device, id: source.canonicalId, type: cardType },
        size: 'medium',
        handleSizeChange: () => {},
        isEditMode: false,
      });
      if (!card) throw new Error(`Missing renderer ${type}`);
      renderWithProviders(card);
      const name = type === 'weather' ? 'Stockholm' : source.name;
      const triggerName =
        type === 'cover'
          ? `Open settings for ${name} cover`
          : type === 'vacuum'
            ? 'More actions'
            : name;
      fireEvent.click(await screen.findByRole('button', { name: triggerName }));
      const dashboardDialog = await screen.findByRole('dialog');
      const contents = dashboardDialog.textContent;
      const dialogName = dashboardDialog.getAttribute('aria-labelledby');
      expect(dialogName).toBeTruthy();
      cleanup();

      renderWithProviders(<CompanionEntityRow entity={source} editing={false} />);
      const opener = screen.getByRole('button', { name: `Open settings for ${source.name}` });
      fireEvent.click(opener);
      const panelDialog = await screen.findByRole('dialog');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(panelDialog.textContent).toBe(contents);
      fireEvent.click(within(panelDialog).getAllByRole('button', { name: 'Close' })[0]);
      await waitFor(() => expect(opener).toHaveFocus());
    }
  );

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

  it.each([
    'light.kitchen_island',
    'fan.bedroom_ceiling',
    'climate.main_floor',
    'media_player.living_room_speaker',
    'sensor.outside_temperature',
  ])('disables %s and replaces cached readings when its provider disconnects', async (id) => {
    const source = entity(id);
    renderWithProviders(<CompanionEntityRow entity={source} editing={false} />);
    await screen.findByRole('button', { name: new RegExp(`^Open settings for ${source.name}`) });
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
        },
      }))
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it.each(['unavailable', 'unknown'] as const)(
    'treats %s entity availability as unavailable',
    async (availability) => {
      renderWithProviders(
        <CompanionEntityRow
          entity={{ ...entity('light.kitchen_island'), availability }}
          editing={false}
        />
      );
      expect(await screen.findByText('Unavailable')).toBeInTheDocument();
      for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    }
  );

  it.each(['light.kitchen_island', 'climate.main_floor'])(
    'dismisses open %s controls when the provider disconnects',
    async (id) => {
      const source = entity(id);
      renderWithProviders(<CompanionEntityRow entity={source} editing={false} />);
      fireEvent.click(
        await screen.findByRole('button', { name: new RegExp(`^Open settings for ${source.name}`) })
      );
      await screen.findByRole('dialog');
      act(() =>
        integrationStore.setState((state) => ({
          providerRuntime: {
            ...state.providerRuntime,
            home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
          },
        }))
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
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
