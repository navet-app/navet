import { integrationAdminService } from '@navet/app/services/integration-admin.service';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderHookWithProviders, renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderCard, useCardIsUnavailable } from '../card-renderer';

vi.mock('@navet/app/features/security', () => ({
  CameraCard: ({ id }: { id: string }) => <div data-testid="camera-card">{id}</div>,
  SecurityPanelCard: ({
    alarms,
    size,
  }: {
    alarms: Array<{ id: string; name: string }>;
    size: string;
  }) => (
    <div data-testid="security-panel-card">
      {alarms[0]?.id}:{alarms[0]?.name}:{size}
    </div>
  ),
}));

vi.mock('@navet/app/features/lighting', () => ({
  LightCard: ({ id }: { id: string }) => <div data-testid="light-card">{id}</div>,
  FanCard: () => null,
  SwitchCard: () => null,
}));

vi.mock('@navet/app/features/vacuum', () => ({
  LawnMowerCard: ({ id }: { id: string }) => <div data-testid="lawn-mower-card">{id}</div>,
  VacuumCard: ({ id }: { id: string }) => <div data-testid="vacuum-card">{id}</div>,
}));

describe('card availability lookup', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetAppStores();
  });

  // Keep: unavailable cards must expose recovery without enabling device controls.
  it('opens integration recovery from the unavailable card surface', async () => {
    vi.spyOn(integrationAdminService, 'canReloadEntityIntegration').mockReturnValue(true);
    const reload = vi.spyOn(integrationAdminService, 'reloadEntityIntegration').mockResolvedValue();
    const card = renderCard({
      device: {
        id: 'home_assistant:light.kitchen',
        name: 'Kitchen',
        type: 'lights',
        state: 'unavailable',
      },
      size: 'small',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });
    if (!card) throw new Error('Expected an unavailable light card');
    renderWithProviders(card);
    expect((await screen.findByTestId('light-card')).closest('[inert]')).not.toBeNull();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More actions' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reload integration' }));
    expect(await screen.findByRole('alertdialog', { name: 'Reload integration?' })).toBeVisible();
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload integration' }));
    });
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('home_assistant:light.kitchen'));
  });

  it.each([
    { available: false, isEditMode: false },
    { available: true, isEditMode: true },
  ])(
    'does not expose recovery for an unsupported session or in edit mode: %j',
    async ({ available, isEditMode }) => {
      vi.spyOn(integrationAdminService, 'canReloadEntityIntegration').mockReturnValue(available);
      const card = renderCard({
        device: {
          id: 'home_assistant:light.kitchen',
          name: 'Kitchen',
          type: 'lights',
          state: 'unavailable',
        },
        size: 'tiny',
        handleSizeChange: () => undefined,
        isEditMode,
      });
      if (!card) throw new Error('Expected an unavailable light card');
      renderWithProviders(card);
      await screen.findByText('Unavailable');
      expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    }
  );

  it('does not rerender for unrelated provider entity updates', () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:camera.front_door': {
            id: 'home_assistant:camera.front_door',
            canonicalId: 'home_assistant:camera.front_door',
            providerId: 'home_assistant',
            externalId: 'camera.front_door',
            type: 'camera',
            name: 'Front Door',
            room: 'Entry',
            primaryState: 'unavailable',
            availability: 'available',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'camera.front_door': 'home_assistant:camera.front_door',
          'home_assistant:camera.front_door': 'home_assistant:camera.front_door',
        },
      },
    });

    let renderCount = 0;
    const { result } = renderHookWithProviders(() => {
      renderCount += 1;
      return useCardIsUnavailable(['camera.front_door'], 'home_assistant');
    });

    expect(result.current).toBe(true);

    integrationStore.setState({
      ...integrationStore.getState(),
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {}),
          'home_assistant:light.kitchen': {
            id: 'home_assistant:light.kitchen',
            canonicalId: 'home_assistant:light.kitchen',
            providerId: 'home_assistant',
            externalId: 'light.kitchen',
            type: 'light',
            name: 'Kitchen Light',
            room: 'Kitchen',
            primaryState: 'on',
            availability: 'available',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          ...(integrationStore.getState().providerEntityLookupByProviderId.home_assistant ?? {}),
          'light.kitchen': 'home_assistant:light.kitchen',
          'home_assistant:light.kitchen': 'home_assistant:light.kitchen',
        },
      },
    });

    expect(renderCount).toBe(1);
    expect(result.current).toBe(true);
  });

  it('updates a grouped-source card only when the combined unavailable state changes', () => {
    const entityIds = ['binary_sensor.front_door', 'binary_sensor.back_door'];
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:binary_sensor.front_door': {
            id: 'home_assistant:binary_sensor.front_door',
            canonicalId: 'home_assistant:binary_sensor.front_door',
            providerId: 'home_assistant',
            externalId: 'binary_sensor.front_door',
            type: 'binary_sensor',
            name: 'Front Door',
            room: 'Entry',
            primaryState: 'unavailable',
            availability: 'unavailable',
            capabilities: [],
            attributes: {},
          },
          'home_assistant:binary_sensor.back_door': {
            id: 'home_assistant:binary_sensor.back_door',
            canonicalId: 'home_assistant:binary_sensor.back_door',
            providerId: 'home_assistant',
            externalId: 'binary_sensor.back_door',
            type: 'binary_sensor',
            name: 'Back Door',
            room: 'Entry',
            primaryState: 'off',
            availability: 'available',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'binary_sensor.front_door': 'home_assistant:binary_sensor.front_door',
          'binary_sensor.back_door': 'home_assistant:binary_sensor.back_door',
        },
      },
    });

    let renderCount = 0;
    const { result } = renderHookWithProviders(() => {
      renderCount += 1;
      return useCardIsUnavailable(entityIds, 'home_assistant');
    });

    expect(result.current).toBe(false);

    act(() => {
      integrationStore.setState({
        ...integrationStore.getState(),
        providerEntitiesByProviderId: {
          ...integrationStore.getState().providerEntitiesByProviderId,
          home_assistant: {
            ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {}),
            'home_assistant:binary_sensor.back_door': {
              ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant?.[
                'home_assistant:binary_sensor.back_door'
              ] ?? {}),
              id: 'home_assistant:binary_sensor.back_door',
              canonicalId: 'home_assistant:binary_sensor.back_door',
              providerId: 'home_assistant',
              externalId: 'binary_sensor.back_door',
              type: 'binary_sensor',
              name: 'Back Door',
              room: 'Entry',
              primaryState: 'unavailable',
              availability: 'unavailable',
              capabilities: [],
              attributes: {},
            },
          },
        },
      });
    });

    expect(result.current).toBe(true);
    expect(renderCount).toBe(2);
  });

  it('renders alarm control panel sensors with the security panel card', async () => {
    const card = renderCard({
      device: {
        id: 'home_assistant:alarm_control_panel.home',
        name: 'Home Alarm',
        room: 'Hall',
        type: 'sensors',
        value: 'Disarmed',
        unit: '',
        securityKind: 'alarm',
        deviceClass: 'alarm_control_panel',
        alarmState: 'disarmed',
        alarmSupportedActions: ['arm_away', 'disarm'],
        alarmCodeFormat: 'none',
        providerId: 'home_assistant',
        availability: 'available',
      },
      size: 'large',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });

    expect(card).not.toBeNull();
    if (!card) {
      throw new Error('Expected renderCard to return a security panel card');
    }

    renderWithProviders(card);

    expect(await screen.findByTestId('security-panel-card')).toHaveTextContent(
      'home_assistant:alarm_control_panel.home:Home Alarm:large'
    );
  });

  it('uses a compact unavailable overlay pill on tiny cards', async () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:light.kitchen': {
            id: 'home_assistant:light.kitchen',
            canonicalId: 'home_assistant:light.kitchen',
            providerId: 'home_assistant',
            externalId: 'light.kitchen',
            type: 'light',
            name: 'Kitchen Light',
            room: 'Kitchen',
            primaryState: 'unavailable',
            availability: 'unavailable',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'light.kitchen': 'home_assistant:light.kitchen',
          'home_assistant:light.kitchen': 'home_assistant:light.kitchen',
        },
      },
    });

    const card = renderCard({
      device: {
        id: 'light.kitchen',
        name: 'Kitchen Light',
        room: 'Kitchen',
        type: 'lights',
        state: false,
      },
      size: 'tiny',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });

    expect(card).not.toBeNull();
    if (!card) {
      throw new Error('Expected renderCard to return a light card');
    }

    renderWithProviders(card);

    const unavailablePill = await screen.findByText('Unavailable');
    expect(unavailablePill).toHaveClass(
      'max-w-[calc(100%-1rem)]',
      'px-1.5',
      'py-0.5',
      'text-[10px]'
    );
    expect(unavailablePill).not.toHaveClass('uppercase');
  });

  it('does not add the generic unavailable overlay pill on camera cards', async () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:camera.front_door': {
            id: 'home_assistant:camera.front_door',
            canonicalId: 'home_assistant:camera.front_door',
            providerId: 'home_assistant',
            externalId: 'camera.front_door',
            type: 'camera',
            name: 'Front Door',
            room: 'Entry',
            primaryState: 'unavailable',
            availability: 'unavailable',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'camera.front_door': 'home_assistant:camera.front_door',
          'home_assistant:camera.front_door': 'home_assistant:camera.front_door',
        },
      },
    });

    const card = renderCard({
      device: {
        id: 'camera.front_door',
        name: 'Front Door',
        room: 'Entry',
        type: 'cameras',
        state: 'unavailable',
      },
      size: 'small',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });

    expect(card).not.toBeNull();
    if (!card) {
      throw new Error('Expected renderCard to return a camera card');
    }

    renderWithProviders(card);

    expect(await screen.findByTestId('camera-card')).toHaveTextContent('camera.front_door');
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it('skips extra unavailable blur and saturation when low-power mode forces effective low quality', async () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:light.kitchen': {
            id: 'home_assistant:light.kitchen',
            canonicalId: 'home_assistant:light.kitchen',
            providerId: 'home_assistant',
            externalId: 'light.kitchen',
            type: 'light',
            name: 'Kitchen Light',
            room: 'Kitchen',
            primaryState: 'unavailable',
            availability: 'unavailable',
            capabilities: [],
            attributes: {},
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'light.kitchen': 'home_assistant:light.kitchen',
          'home_assistant:light.kitchen': 'home_assistant:light.kitchen',
        },
      },
    });
    useSettingsStore.getState().updateSettings({
      effectsQuality: 'high',
      lowPowerMode: true,
    });

    const card = renderCard({
      device: {
        id: 'light.kitchen',
        name: 'Kitchen Light',
        room: 'Kitchen',
        type: 'lights',
        state: false,
      },
      size: 'small',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });

    expect(card).not.toBeNull();
    if (!card) {
      throw new Error('Expected renderCard to return a light card');
    }

    const { container } = renderWithProviders(card);

    await screen.findByText('Unavailable');

    expect(container.innerHTML).not.toContain('saturate-50');
    expect(container.innerHTML).not.toContain('backdrop-blur-[1px]');
  });

  it('renders provider-scoped lawn mower devices with the mower card instead of the vacuum card', async () => {
    const card = renderCard({
      device: {
        id: 'home_assistant:lawn_mower.backyard',
        name: 'Backyard Mower',
        room: 'Garden',
        type: 'vacuums',
        providerId: 'home_assistant',
        status: 'cleaning',
        battery: 88,
      },
      size: 'small',
      handleSizeChange: () => undefined,
      isEditMode: false,
    });

    expect(card).not.toBeNull();
    if (!card) {
      throw new Error('Expected renderCard to return a mower card');
    }

    renderWithProviders(card);

    expect(await screen.findByTestId('lawn-mower-card')).toHaveTextContent(
      'home_assistant:lawn_mower.backyard'
    );
    expect(screen.queryByTestId('vacuum-card')).not.toBeInTheDocument();
  });
});
