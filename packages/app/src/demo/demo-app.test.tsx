import { dispatchEntityCommand } from '@navet/app/commands';
import { EntityHelperControls } from '@navet/app/components/shared/device-editor/entity-helper-controls';
import { UpsWidget } from '@navet/app/features/dashboard/components/widgets/ups-widget';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import { invokeIntegrationNativeAction } from '@navet/app/services/integration-native-action.service';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_ROOM_ENTITY_IDS } from '../preview/demo-room-entities';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '../preview/runtime';
import { demoHomeLibraryCards } from './demo-card-library';

describe('demo preview runtime', () => {
  afterEach(() => {
    resetPreviewRuntime();
    delete document.documentElement.dataset.navetPreviewRuntime;
  });

  it('hydrates the demo preview through the provider-backed runtime', () => {
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));

    const state = integrationStore.getState();
    const homeAssistantEntities = state.providerEntitiesByProviderId.home_assistant;

    expect(state.currentProviderId).toBe('home_assistant');
    expect(state.selectedProviderIds).toEqual(['home_assistant']);
    expect(homeAssistantEntities?.['home_assistant:camera.front_door']).toEqual(
      expect.objectContaining({
        type: 'camera',
        name: 'Front Door',
      })
    );
    expect(homeAssistantEntities?.['home_assistant:input_boolean.guest_mode']).toEqual(
      expect.objectContaining({
        type: 'helper',
        name: 'Guest mode',
      })
    );
    expect(homeAssistantEntities?.['home_assistant:light.kitchen_island']).toEqual(
      expect.objectContaining({
        type: 'light',
        name: 'Kitchen island',
        attributes: expect.objectContaining({
          brightnessPct: 72,
          supportedColorModes: ['brightness'],
        }),
      })
    );
  });

  it('backs every named-room card with an entity in its room and compatibility registries', () => {
    const scenario = getPreviewRuntimeScenario('demo');
    for (const [room, ids] of Object.entries(DEMO_ROOM_ENTITY_IDS)) {
      const providerRoom = scenario.rooms.find((entry) => entry.name === room);
      expect(providerRoom, room).toBeDefined();
      for (const id of ids) {
        const entity = scenario.entities.find((entry) => entry.externalId === id);
        expect(entity, `${room}: ${id}`).toBeDefined();
        expect(entity?.room).toBe(room);
        expect(providerRoom?.memberIds).toContain(entity?.canonicalId);
        expect(scenario.homeAssistant.entities?.[id]).toBeDefined();
        const registryEntry = scenario.homeAssistant.entityRegistry.find(
          (entry) => entry.entity_id === id
        );
        expect(registryEntry?.area_id).toBe(providerRoom?.externalId);
        expect(
          scenario.homeAssistant.deviceRegistry.some(
            (device) =>
              device.id === registryEntry?.device_id && device.area_id === registryEntry?.area_id
          )
        ).toBe(true);
      }
    }
    expect(new Set(scenario.entities.map((entity) => entity.canonicalId)).size).toBe(
      scenario.entities.length
    );
    expect(
      getPreviewRuntimeScenario().entities.some(
        (entity) => entity.externalId === 'light.bathroom_mirror'
      )
    ).toBe(false);
  });

  it('keeps room controls in shared provider state and restores defaults on reset', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    await dispatchEntityCommand({
      type: 'turn_off',
      entityId: 'home_assistant:light.bathroom_mirror',
    });
    await dispatchEntityCommand({
      type: 'set_temperature',
      entityId: 'home_assistant:climate.bathroom_floor',
      temperature: 25,
    });
    await dispatchEntityCommand({
      type: 'set_position',
      entityId: 'home_assistant:cover.office_blind',
      position: 20,
    });
    await dispatchEntityCommand({ type: 'turn_on', entityId: 'home_assistant:switch.spare_plug' });
    const entities = integrationStore.getState().providerEntitiesByCanonicalId;
    expect(entities['home_assistant:light.bathroom_mirror']?.primaryState).toBe('off');
    expect(entities['home_assistant:climate.bathroom_floor']?.attributes.temperature).toBe(25);
    expect(entities['home_assistant:cover.office_blind']?.attributes.position).toBe(20);
    expect(entities['home_assistant:switch.spare_plug']?.primaryState).toBe(true);
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    expect(
      integrationStore.getState().providerEntitiesByCanonicalId[
        'home_assistant:climate.bathroom_floor'
      ]?.attributes.temperature
    ).toBe(24);
  });

  it('saves linked helper values and keeps unavailable helpers without an editor', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    renderWithProviders(<EntityHelperControls entityId="home_assistant:light.kitchen_island" />);

    fireEvent.click(screen.getByRole('button', { name: 'Turn-off delay' }));
    const numberInput = screen.getByRole('spinbutton');
    const numberForm = numberInput.closest('form');
    if (!numberForm) throw new Error('Expected number helper form');
    fireEvent.change(numberInput, { target: { value: '10' } });
    fireEvent.click(within(numberForm).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        integrationStore.getState().providerEntitiesByCanonicalId[
          'home_assistant:number.kitchen_turn_off_delay'
        ]?.attributes.value
      ).toBe(10)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Power-on behavior' }));
    const selectInput = screen.getByRole('combobox');
    const selectForm = selectInput.closest('form');
    if (!selectForm) throw new Error('Expected selection helper form');
    fireEvent.change(selectInput, { target: { value: 'Off' } });
    fireEvent.click(within(selectForm).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        integrationStore.getState().providerEntitiesByCanonicalId[
          'home_assistant:select.kitchen_power_on_behavior'
        ]?.attributes.value
      ).toBe('Off')
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Night mode' }));
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'Run Identify light' }));
    await waitFor(() =>
      expect(
        integrationStore.getState().providerEntitiesByCanonicalId[
          'home_assistant:button.kitchen_identify'
        ]?.primaryState
      ).toEqual(expect.any(String))
    );
    expect(screen.getByText('Transition time')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transition time' })).not.toBeInTheDocument();
    expect(
      getProviderRuntimeRegistration('home_assistant').entityRuntimeService?.getEntitySnapshot?.(
        'number.kitchen_turn_off_delay'
      )?.state
    ).toBe('10');
  });

  it('acknowledges advanced climate edits and restores sample defaults on reinstall', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    const scenario = getPreviewRuntimeScenario('demo');
    installPreviewRuntime(scenario);
    for (const command of [
      { type: 'set_climate_preset', preset: 'Away' },
      { type: 'set_climate_fan_mode', mode: 'High' },
      { type: 'set_climate_swing_mode', mode: 'Vertical' },
      { type: 'set_climate_swing_horizontal_mode', mode: 'Horizontal' },
      { type: 'set_climate_humidity', humidity: 50 },
    ] as const) {
      await act(() =>
        dispatchEntityCommand({ ...command, entityId: 'home_assistant:climate.main_floor' })
      );
    }
    expect(
      integrationStore.getState().providerEntitiesByCanonicalId['home_assistant:climate.main_floor']
        ?.attributes.climateControls
    ).toMatchObject({
      preset: { value: 'Away' },
      fanMode: { value: 'High' },
      swingMode: { value: 'Vertical' },
      swingHorizontalMode: { value: 'Horizontal' },
      targetHumidity: { value: 50 },
    });
    resetPreviewRuntime();
    installPreviewRuntime(scenario);
    expect(
      integrationStore.getState().providerEntitiesByCanonicalId['home_assistant:climate.main_floor']
        ?.attributes.climateControls
    ).toMatchObject({ preset: { value: 'Comfort' }, targetHumidity: { value: 45 } });
  });

  it('keeps fan speed, direction and oscillation synchronized with provider snapshots', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    await dispatchEntityCommand({
      type: 'set_fan_speed',
      entityId: 'home_assistant:fan.bedroom_ceiling',
      percentage: 33,
    });
    await invokeIntegrationNativeAction({
      entityId: 'home_assistant:fan.bedroom_ceiling',
      domain: 'fan',
      service: 'set_direction',
      serviceData: { direction: 'reverse' },
    });
    await invokeIntegrationNativeAction({
      entityId: 'fan.bedroom_ceiling',
      domain: 'fan',
      service: 'oscillate',
      serviceData: { oscillating: false },
    });
    expect(
      getProviderRuntimeRegistration('home_assistant').entityRuntimeService?.getEntitySnapshot?.(
        'fan.bedroom_ceiling'
      )?.attributes
    ).toMatchObject({ percentage: 33, direction: 'reverse', oscillating: false });
    expect(
      integrationStore.getState().providerEntitiesByCanonicalId[
        'home_assistant:fan.bedroom_ceiling'
      ]?.attributes
    ).toMatchObject({ percentage: 33, direction: 'reverse', oscillating: false });
  });

  it('renders the seeded UPS through the production widget', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    renderWithProviders(<UpsWidget size="medium" data={{ deviceId: 'device-ups' }} />);
    expect(await screen.findByText('Rack UPS')).toBeInTheDocument();
    expect(screen.getByText('97')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('offers available demo device families in the library', () => {
    const scenario = getPreviewRuntimeScenario('demo');
    const entities = new Map(scenario.entities.map((entity) => [entity.canonicalId, entity]));
    expect(demoHomeLibraryCards.map((card) => card.entityType)).toEqual(
      expect.arrayContaining([
        'fan',
        'hvac',
        'helper',
        'vacuum',
        'weather',
        'cover',
        'media_player',
      ])
    );
    for (const card of demoHomeLibraryCards) {
      expect(entities.has(card.id)).toBe(true);
    }
    expect(new Set(demoHomeLibraryCards.map((card) => card.id)).size).toBe(
      demoHomeLibraryCards.length
    );
  });
});
