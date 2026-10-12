import { dispatchEntityCommand } from '@navet/app/commands';
import * as topologyHooks from '@navet/app/hooks/use-registry-device-topology';
import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { fanEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/fan';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetCapabilityId } from '@navet/core/capabilities';
import type { NavetEntity } from '@navet/core/types';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FanCard } from '..';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    callService: vi.fn().mockResolvedValue(undefined),
    getEntities: vi.fn(() => homeAssistantStore.getState().entities),
    getEntityRegistry: vi.fn(() => []),
    getConfig: vi.fn(() => ({ unit_system: { temperature: 'C' } })),
    getPanelHass: vi.fn(() => null),
    getConnection: vi.fn(() => null),
    addListener: vi.fn(() => () => undefined),
    disconnect: vi.fn(),
  },
}));

vi.mock('@navet/app/services/home-assistant.service', () => ({
  homeAssistantService: serviceMock,
}));

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: vi.fn(
    async ({
      type,
      entityId,
      percentage,
    }: {
      type: 'turn_on' | 'turn_off' | 'set_fan_speed';
      entityId: string;
      percentage?: number;
    }) => {
      const domain = entityId.split('.', 1)[0] || 'fan';
      if (type === 'set_fan_speed') {
        await serviceMock.callService(
          'fan',
          'set_percentage',
          { percentage },
          { entity_id: entityId }
        );
      } else {
        await serviceMock.callService(domain, type, {}, { entity_id: entityId });
      }
      return {
        accepted: true,
        requiresEventConfirmation: true,
      };
    }
  ),
}));

vi.mock('@navet/app/services/integration-native-action.service', () => ({
  invokeIntegrationNativeAction: async ({
    entityId,
    domain,
    service,
    serviceData = {},
  }: {
    entityId?: string;
    domain: string;
    service: string;
    serviceData?: Record<string, unknown>;
  }) =>
    await serviceMock.callService(
      domain,
      service,
      serviceData,
      entityId ? { entity_id: entityId } : {}
    ),
}));

function createFanEntity(percentage: number, state = 'on') {
  const entity = fanEntityFactory({
    friendly_name: 'Ceiling Fan',
    percentage,
  });
  entity.entity_id = 'fan.ceiling_fan';
  entity.state = state;
  return entity;
}

function createOnOffOnlyFanEntity(state = 'on') {
  const entity = fanEntityFactory({
    friendly_name: 'Ceiling Fan',
    percentage: undefined,
    percentage_step: undefined,
    preset_modes: undefined,
  });
  delete entity.attributes.percentage;
  delete entity.attributes.percentage_step;
  delete entity.attributes.preset_modes;
  entity.entity_id = 'fan.ceiling_fan';
  entity.state = state;
  return entity;
}

function setFanProviderEntity(capabilities: NavetCapabilityId[]) {
  integrationStore.setState({
    ...integrationStore.getState(),
    currentProviderId: 'home_assistant',
    providerEntitiesByProviderId: {
      ...integrationStore.getState().providerEntitiesByProviderId,
      home_assistant: {
        ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {}),
        'home_assistant:fan.ceiling_fan': {
          id: 'home_assistant:fan.ceiling_fan',
          canonicalId: 'home_assistant:fan.ceiling_fan',
          providerId: 'home_assistant',
          externalId: 'fan.ceiling_fan',
          type: 'fan',
          name: 'Ceiling Fan',
          room: 'Bedroom',
          capabilities,
          primaryState: 'on',
          availability: 'available',
          attributes: {
            value: 'on',
            percentage: 66,
          },
        },
      },
    },
    providerEntityLookupByProviderId: {
      ...integrationStore.getState().providerEntityLookupByProviderId,
      home_assistant: {
        ...(integrationStore.getState().providerEntityLookupByProviderId.home_assistant ?? {}),
        'fan.ceiling_fan': 'home_assistant:fan.ceiling_fan',
        'home_assistant:fan.ceiling_fan': 'home_assistant:fan.ceiling_fan',
      },
    },
  });
}

function updateFanProviderEntity(attributes: NavetEntity['attributes']) {
  const existingEntity =
    integrationStore.getState().providerEntitiesByProviderId.home_assistant?.[
      'home_assistant:fan.ceiling_fan'
    ];

  if (!existingEntity) {
    throw new Error('Expected fan provider entity to exist before updating it');
  }

  integrationStore.setState({
    ...integrationStore.getState(),
    providerEntitiesByProviderId: {
      ...integrationStore.getState().providerEntitiesByProviderId,
      home_assistant: {
        ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {}),
        'home_assistant:fan.ceiling_fan': {
          ...existingEntity,
          attributes,
        },
      },
    },
  });
}

describe('FanCard', () => {
  beforeEach(async () => {
    await resetAppStores();
    vi.clearAllMocks();
  });

  it('uses card click for power and exposes a shared slider plus preset speed buttons', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(66),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={66}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Fan Medium' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '66'
    );
    expect(screen.queryByRole('button', { name: 'Fan Off' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open settings for Ceiling Fan' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fan High' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_percentage',
      { percentage: 100 },
      { entity_id: 'fan.ceiling_fan' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ceiling Fan' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'turn_off',
      {},
      { entity_id: 'fan.ceiling_fan' }
    );
  });

  it('opens the fan settings dialog from the card settings action', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(66),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={66}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Ceiling Fan' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Ceiling Fan').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '66'
    );
    fireEvent.click(dialog.getByRole('radio', { name: 'High' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_percentage',
      { percentage: 100 },
      { entity_id: 'fan.ceiling_fan' }
    );
    expect(dialog.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '100'
    );
    fireEvent.click(dialog.getByRole('button', { name: 'Turn off' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'turn_off',
      {},
      { entity_id: 'fan.ceiling_fan' }
    );
  });

  it('routes sibling toggles to the fan owner when another provider is current', async () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    integrationStore.setState({ currentProviderId: 'openhab' });
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(66),
        'switch.fan_light': {
          ...createFanEntity(0, 'off'),
          entity_id: 'switch.fan_light',
          attributes: { friendly_name: 'Fan light' },
        },
      },
    });
    const topology = vi.spyOn(topologyHooks, 'useProviderClimateTopology').mockReturnValue({
      deviceId: 'fan-device',
      siblingIds: ['switch.fan_light'],
    });
    try {
      renderWithProviders(
        <FanCard
          id="home_assistant:fan.ceiling_fan"
          name="Ceiling Fan"
          room="Bedroom"
          providerId="home_assistant"
          initialState
          initialPercentage={66}
          size="medium"
          onSizeChange={vi.fn()}
          isEditMode={false}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Open settings for Ceiling Fan' }));
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Fan light' })
      );
      expect(dispatchEntityCommand).toHaveBeenCalledWith(
        { type: 'turn_on', entityId: 'switch.fan_light' },
        'home_assistant'
      );
    } finally {
      topology.mockRestore();
    }
  });

  it('uses compact speed controls and settings on extra-small cards', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(66),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={66}
        size="extra-small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '66'
    );
    expect(
      screen.getByRole('button', { name: 'Open settings for Ceiling Fan' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan Medium' })).not.toBeInTheDocument();
  });

  it('hides speed presets, slider, and settings when fan speed is unsupported', () => {
    setFanProviderEntity(['toggle']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createOnOffOnlyFanEntity(),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={0}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.queryByRole('slider', { name: 'Fan Speed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan Low' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan Medium' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan High' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open settings for Ceiling Fan' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ceiling Fan' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'turn_off',
      {},
      { entity_id: 'fan.ceiling_fan' }
    );
  });

  it('shows direction and oscillation inline plus cycling fan speed when advanced fan controls are supported', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': {
          ...createFanEntity(66),
          attributes: {
            ...createFanEntity(66).attributes,
            direction: 'forward',
            oscillating: true,
          },
        },
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={66}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fan direction Forward' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fan oscillation On' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fan Speed: Medium' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan Low' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan Medium' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fan High' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open settings for Ceiling Fan' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fan direction Forward' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_direction',
      { direction: 'reverse' },
      { entity_id: 'fan.ceiling_fan' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fan oscillation On' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'oscillate',
      { oscillating: false },
      { entity_id: 'fan.ceiling_fan' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed: Medium' }));
    expect(serviceMock.callService).toHaveBeenLastCalledWith(
      'fan',
      'set_percentage',
      { percentage: 100 },
      { entity_id: 'fan.ceiling_fan' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed: High' }));
    expect(serviceMock.callService).toHaveBeenLastCalledWith(
      'fan',
      'set_percentage',
      { percentage: 33 },
      { entity_id: 'fan.ceiling_fan' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed: Low' }));
    expect(serviceMock.callService).toHaveBeenLastCalledWith(
      'fan',
      'set_percentage',
      { percentage: 66 },
      { entity_id: 'fan.ceiling_fan' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Ceiling Fan' }));
    const dialog = within(screen.getByRole('dialog'));
    const oscillation = dialog.getByRole('switch', { name: 'Fan oscillation' });
    expect(oscillation).toBeChecked();
    fireEvent.click(oscillation);
    expect(serviceMock.callService).toHaveBeenLastCalledWith(
      'fan',
      'oscillate',
      { oscillating: false },
      { entity_id: 'fan.ceiling_fan' }
    );
    const direction = dialog.getByRole('button', { name: 'Fan direction' });
    expect(direction).toHaveAttribute('aria-expanded', 'false');
    expect(direction).toHaveTextContent('Forward');
    fireEvent.click(direction);
    serviceMock.callService.mockClear();
    fireEvent.click(dialog.getByRole('radio', { name: 'Forward' }));
    expect(serviceMock.callService).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('radio', { name: 'Reverse' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_direction',
      { direction: 'reverse' },
      { entity_id: 'fan.ceiling_fan' }
    );
  });

  it('shows 0 percent and mutes quick controls when the fan is off', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': {
          ...createFanEntity(66, 'off'),
          attributes: {
            ...createFanEntity(66, 'off').attributes,
            direction: 'reverse',
            oscillating: true,
          },
        },
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState={false}
        initialPercentage={66}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fan direction Reverse' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fan oscillation On' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fan Speed: Off' })).toBeDisabled();
  });

  it('restores the remembered speed immediately when turning the fan on', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(67, 'off'),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState={false}
        initialPercentage={67}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Ceiling Fan' }));

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '67'
    );
    expect(screen.getByRole('button', { name: 'Fan Medium' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'turn_on',
      {},
      { entity_id: 'fan.ceiling_fan' }
    );
  });

  it('prefers the live raw fan percentage over a stale provider percentage while off', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    updateFanProviderEntity({
      value: 'off',
      percentage: 67,
    });
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(40, 'off'),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState={false}
        initialPercentage={67}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Ceiling Fan' }));

    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
  });

  it('prefers the live raw off state over a stale provider on state while turning off', () => {
    setFanProviderEntity(['toggle', 'fan_speed']);
    updateFanProviderEntity({
      value: 'on',
      percentage: 67,
    });
    homeAssistantStore.setState({
      entities: {
        'fan.ceiling_fan': createFanEntity(40, 'off'),
      },
    });

    renderWithProviders(
      <FanCard
        id="fan.ceiling_fan"
        name="Ceiling Fan"
        room="Bedroom"
        initialState
        initialPercentage={40}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Ceiling Fan' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('slider', { name: 'Fan Speed' })).toHaveAttribute('aria-valuenow', '0');
  });
});
