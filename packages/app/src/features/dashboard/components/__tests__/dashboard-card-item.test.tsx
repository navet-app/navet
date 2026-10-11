import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import { renderWithProviders } from '@navet/app/test/render';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardCardItem } from '../dashboard-card-item';
import { HomeCardSlot } from '../home-dashboard-overview-card-slot';

const { childAction, renderCardMock, widgetCardMock } = vi.hoisted(() => ({
  childAction: vi.fn(),
  renderCardMock: vi.fn(),
  widgetCardMock: vi.fn(),
}));

vi.mock('../../utils/card-renderer', () => ({
  renderCard: (options: unknown) => {
    renderCardMock(options);
    return (
      <button type="button" onClick={childAction}>
        child action
      </button>
    );
  },
}));

vi.mock('../widget-card', () => ({
  WidgetCard: (props: unknown) => {
    widgetCardMock(props);
    return (
      <button type="button" onClick={childAction}>
        widget action
      </button>
    );
  },
}));

function createLightDevice(): DeviceWithType {
  return {
    id: 'light.kitchen',
    name: 'Kitchen',
    room: 'Kitchen',
    size: 'small',
    state: true,
    brightness: 100,
    temp: 3200,
    type: 'lights',
  };
}

function createSensorDevice(): DeviceWithType {
  return {
    id: 'sensor.kitchen_temperature',
    name: 'Kitchen Temperature',
    room: 'Kitchen',
    size: 'small',
    value: '21',
    unit: '°C',
    type: 'sensors',
  };
}

function createAlarmDevice(): DeviceWithType {
  return {
    id: 'home_assistant:alarm_control_panel.home',
    name: 'Home Alarm',
    room: 'Hall',
    size: 'small',
    value: 'Disarmed',
    unit: '',
    type: 'sensors',
    securityKind: 'alarm',
    deviceClass: 'alarm_control_panel',
  };
}

function createSwitchDevice(): DeviceWithType {
  return {
    id: 'switch.espresso_machine',
    name: 'Espresso Machine',
    room: 'Kitchen',
    size: 'small',
    state: true,
    type: 'switches',
  };
}

function createHumidifierDevice(): DeviceWithType {
  return {
    id: 'humidifier.basement',
    name: 'Basement Dehumidifier',
    room: 'Basement',
    size: 'medium',
    state: true,
    type: 'switches',
    serviceDomain: 'humidifier',
    entityType: 'Dehumidifier',
    deviceClass: 'dehumidifier',
    targetHumidity: 46,
    minHumidity: 35,
    maxHumidity: 70,
    targetHumidityStep: 5,
    mode: 'auto',
    availableModes: ['auto', 'sleep'],
  };
}

function createCameraDevice(): DeviceWithType {
  return {
    id: 'camera.front_door',
    name: 'Front Door',
    room: 'Entrance',
    size: 'large',
    state: 'streaming',
    entityPicture: '/api/camera_proxy/camera.front_door',
    isStreamCapable: true,
    type: 'cameras',
  };
}

function createMediaDevice(): DeviceWithType {
  return {
    id: 'media_player.kitchen',
    name: 'Kitchen speaker',
    room: 'Kitchen',
    size: 'small',
    title: 'Daily mix',
    artist: 'Navet',
    state: 'playing',
    volume: 35,
    isMuted: false,
    type: 'media',
  };
}

describe('DashboardCardItem card locking', () => {
  beforeEach(() => {
    localStorage.clear();
    childAction.mockClear();
    renderCardMock.mockClear();
    widgetCardMock.mockClear();
    useDashboardEntitiesStore.setState(useDashboardEntitiesStore.getInitialState(), true);
  });

  it.each(['device', 'custom', 'tiny'] as const)(
    'disables only the %s card body inside a sortable edit slot, not its dock controls',
    (kind) => {
      const isCustom = kind === 'custom';
      const size = kind === 'tiny' ? 'tiny' : 'small';
      const id = isCustom ? 'custom-rss' : 'switch.espresso_machine';
      const { container } = renderWithProviders(
        <HomeCardSlot
          sortable
          cardId={id}
          isPreviewHidden={false}
          className=""
          content={
            <DashboardCardItem
              id={id}
              size={size}
              isEditMode
              handleSizeChange={vi.fn()}
              device={isCustom ? undefined : createSwitchDevice()}
              card={isCustom ? { id, type: 'rss', size, room: 'Kitchen', createdAt: 1 } : undefined}
              onRemoveFromLayout={vi.fn()}
            />
          }
        />
      );

      const bodyAction = screen.getByRole('button', {
        name: isCustom ? 'widget action' : 'child action',
      });
      expect(bodyAction.closest('[inert]')).not.toBeNull();
      expect(container.querySelector('[data-card-drag-surface="true"]')).not.toHaveAttribute(
        'inert'
      );

      if (kind === 'tiny') {
        const launcher = screen.getByRole('button', { name: 'More actions' });
        expect(launcher.closest('[inert]')).toBeNull();
        fireEvent.click(launcher);
      }

      const dock = document.querySelector('[data-card-edit-dock="true"]');
      expect(dock).not.toBeNull();
      const controls = dock?.querySelectorAll('button') ?? [];
      for (const control of controls) {
        expect(control.closest('[inert]')).toBeNull();
      }
      expect(controls.length).toBeGreaterThanOrEqual(3);
    }
  );

  it('marks locked cards inert and blocks pointer interaction outside edit mode', () => {
    useDashboardEntitiesStore.getState().lockCard('light.kitchen');

    const { container } = renderWithProviders(
      <DashboardCardItem
        id="light.kitchen"
        size="small"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        device={createLightDevice()}
      />
    );

    expect(screen.getByRole('img', { name: 'Card locked' })).toBeInTheDocument();
    expect(container.querySelector('[data-card-locked="true"] [inert]')).toBeTruthy();

    const overlay = container.querySelector<HTMLElement>('[data-card-lock-overlay="true"]');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay as HTMLElement);

    expect(childAction).not.toHaveBeenCalled();
  });

  it('keeps locked cards manageable in edit mode and toggles the lock state', () => {
    useDashboardEntitiesStore.getState().lockCard('light.kitchen');

    renderWithProviders(
      <DashboardCardItem
        id="light.kitchen"
        size="small"
        isEditMode
        handleSizeChange={vi.fn()}
        device={createLightDevice()}
      />
    );

    expect(screen.queryByRole('img', { name: 'Card locked' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-card-edit-dock="true"]')).toBeTruthy();
    const lockButton = screen.getByRole('button', { name: 'Unlock card' });
    fireEvent.click(lockButton);

    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual([]);
  });

  it('shows the locked indicator for custom cards', () => {
    useDashboardEntitiesStore.getState().lockCard('custom-note');

    renderWithProviders(
      <DashboardCardItem
        id="custom-note"
        size="medium"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        card={{
          id: 'custom-note',
          type: 'note',
          size: 'medium',
          room: 'all',
          createdAt: 1,
        }}
      />
    );

    expect(screen.getByRole('img', { name: 'Card locked' })).toBeInTheDocument();
  });

  it('passes header subtitle overrides into entity card rendering', () => {
    renderWithProviders(
      <DashboardCardItem
        id="sensor.kitchen_temperature"
        size="small"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        headerSubtitleOverride="Kitchen"
        device={createSensorDevice()}
      />
    );

    expect(renderCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ headerSubtitleOverride: 'Kitchen' })
    );
  });

  it('rerenders only when the media presentation variant changes', () => {
    const device = createMediaDevice();
    const handleSizeChange = vi.fn();
    const renderItem = (presentationVariant?: 'media-stack') => (
      <DashboardCardItem
        id={device.id}
        size="small"
        isEditMode={false}
        handleSizeChange={handleSizeChange}
        device={device}
        presentationVariant={presentationVariant}
      />
    );
    const { rerender } = renderWithProviders(renderItem());

    expect(renderCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ presentationVariant: undefined })
    );
    renderCardMock.mockClear();

    rerender(renderItem());
    expect(renderCardMock).not.toHaveBeenCalled();

    rerender(renderItem('media-stack'));
    expect(renderCardMock).toHaveBeenCalledTimes(1);
    expect(renderCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ presentationVariant: 'media-stack' })
    );

    rerender(renderItem('media-stack'));
    expect(renderCardMock).toHaveBeenCalledTimes(1);

    rerender(renderItem());
    expect(renderCardMock).toHaveBeenCalledTimes(2);
    expect(renderCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ presentationVariant: undefined })
    );
  });

  it.each([
    ['timer', 'timers'],
    ['counter', 'counters'],
  ] as const)(
    'removes Tiny from %s resize options and renders saved Tiny cards as Small',
    (domain, type) => {
      const id = `home_assistant:${domain}.kitchen`;
      const handleSizeChange = vi.fn();
      const device: DeviceWithType = {
        id,
        name: 'Kitchen control',
        room: 'Kitchen',
        size: 'tiny',
        type,
        normalizedEntity: {
          id,
          canonicalId: id,
          externalId: `${domain}.kitchen`,
          providerId: 'home_assistant',
          name: 'Kitchen control',
          type: domain,
          primaryState: null,
          availability: 'available',
          attributes: {},
          capabilities: [],
        },
      };
      const { container } = renderWithProviders(
        <DashboardCardItem
          id={id}
          size="tiny"
          isEditMode
          handleSizeChange={handleSizeChange}
          device={device}
        />
      );
      expect(renderCardMock).toHaveBeenCalledWith(expect.objectContaining({ size: 'small' }));
      const trigger = container.querySelector<HTMLButtonElement>(
        '[data-card-edit-dock="true"] button.z-500.group'
      );
      expect(trigger).toBeTruthy();
      fireEvent.click(trigger as HTMLButtonElement);
      expect(screen.queryByRole('button', { name: /^tiny\b/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^extra-small\b/i }));
      expect(handleSizeChange).toHaveBeenCalledWith(id, 'extra-small');
    }
  );

  it('upgrades alarm sensor cards to the alarm panel footprint', () => {
    renderWithProviders(
      <DashboardCardItem
        id="home_assistant:alarm_control_panel.home"
        size="small"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        device={createAlarmDevice()}
      />
    );

    expect(renderCardMock).toHaveBeenCalledWith(expect.objectContaining({ size: 'medium' }));
  });

  it('avoids paint containment for camera cards so live video can compose normally', () => {
    const { container } = renderWithProviders(
      <DashboardCardItem
        id="camera.front_door"
        size="large"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        device={createCameraDevice()}
      />
    );

    expect(container.firstElementChild?.className).toContain('[contain:layout_style]');
    expect(container.firstElementChild?.className).not.toContain('[contain:layout_style_paint]');
  });

  it('scopes dense cards to low effects even when the global preference is high', () => {
    document.documentElement.dataset.effectsQuality = 'high';

    const { container } = renderWithProviders(
      <DashboardCardItem
        id="light.kitchen"
        size="small"
        isEditMode={false}
        handleSizeChange={vi.fn()}
        device={createLightDevice()}
        densePerformanceMode
      />
    );

    expect(container.firstElementChild).toHaveAttribute('data-navet-effects-quality', 'low');
    expect(document.documentElement).toHaveAttribute('data-effects-quality', 'high');
  });

  it('adds a settings action to the edit dock for switch cards and forwards the request', () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    renderWithProviders(
      <DashboardCardItem
        id="switch.espresso_machine"
        size="small"
        isEditMode
        handleSizeChange={vi.fn()}
        device={createSwitchDevice()}
      />
    );

    const settingsButton = screen.getByRole('button', {
      name: 'Open settings for Espresso Machine',
    });
    fireEvent.click(settingsButton);

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navet:edit-mode-open-settings',
      })
    );

    dispatchEventSpy.mockRestore();
  });

  it('adds a settings action to the edit dock for custom cards with settings dialogs', () => {
    renderWithProviders(
      <DashboardCardItem
        id="custom-rss"
        size="small"
        isEditMode
        handleSizeChange={vi.fn()}
        card={{
          id: 'custom-rss',
          type: 'rss',
          size: 'small',
          room: 'Kitchen',
          createdAt: 1,
        }}
      />
    );

    const settingsButton = screen.getByRole('button', {
      name: 'Open settings for custom-rss',
    });
    fireEvent.click(settingsButton);

    expect(widgetCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        openSettingsRequestKey: 1,
      })
    );
  });

  it('does not add a settings action to the edit dock for security panel cards', () => {
    renderWithProviders(
      <DashboardCardItem
        id="home_assistant:alarm_control_panel.home"
        size="medium"
        isEditMode
        handleSizeChange={vi.fn()}
        device={createAlarmDevice()}
      />
    );

    expect(
      screen.queryByRole('button', {
        name: 'Open settings for Home Alarm',
      })
    ).not.toBeInTheDocument();
  });

  it('clamps action cards to compact sizes and only exposes compact resize options', () => {
    const { container } = renderWithProviders(
      <DashboardCardItem
        id="custom-button"
        size="medium"
        isEditMode
        handleSizeChange={vi.fn()}
        card={{
          id: 'custom-button',
          type: 'button',
          size: 'medium',
          room: 'Kitchen',
          createdAt: 1,
        }}
      />
    );

    expect(widgetCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          id: 'custom-button',
          size: 'small',
          type: 'button',
        }),
      })
    );

    const resizeTrigger = container.querySelector<HTMLButtonElement>(
      '[data-card-edit-dock="true"] button.z-500.group'
    );
    expect(resizeTrigger).toBeTruthy();

    fireEvent.click(resizeTrigger as HTMLButtonElement);

    expect(screen.getByRole('button', { name: /^tiny\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^extra-small\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^medium\b/i })).not.toBeInTheDocument();
  });

  it('only exposes extra-small and small resize options for single sensor entity cards', () => {
    const { container } = renderWithProviders(
      <DashboardCardItem
        id="sensor.kitchen_temperature"
        size="medium"
        isEditMode
        handleSizeChange={vi.fn()}
        device={{ ...createSensorDevice(), size: 'medium' }}
      />
    );

    expect(renderCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        device: expect.objectContaining({
          id: 'sensor.kitchen_temperature',
          type: 'sensors',
        }),
        size: 'small',
      })
    );

    const resizeTrigger = container.querySelector<HTMLButtonElement>(
      '[data-card-edit-dock="true"] button.z-500.group'
    );
    expect(resizeTrigger).toBeTruthy();

    fireEvent.click(resizeTrigger as HTMLButtonElement);

    expect(screen.getByRole('button', { name: /^extra-small\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^tiny\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^medium\b/i })).not.toBeInTheDocument();
  });

  it('clamps humidifier cards to small and medium sizes and only exposes those resize options', () => {
    const { container } = renderWithProviders(
      <DashboardCardItem
        id="humidifier.basement"
        size="large"
        isEditMode
        handleSizeChange={vi.fn()}
        device={createHumidifierDevice()}
      />
    );

    expect(renderCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        device: expect.objectContaining({
          id: 'humidifier.basement',
          serviceDomain: 'humidifier',
          type: 'switches',
        }),
        size: 'medium',
      })
    );

    const resizeTrigger = container.querySelector<HTMLButtonElement>(
      '[data-card-edit-dock="true"] button.z-500.group'
    );
    expect(resizeTrigger).toBeTruthy();

    fireEvent.click(resizeTrigger as HTMLButtonElement);

    expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^medium\b/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^tiny\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^extra-small\b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^large\b/i })).not.toBeInTheDocument();
  });

  it.each(['climate', 'hvac', 'media'] as const)(
    'offers small, medium, and large sizes for %s cards and keeps a large selection',
    (type) => {
      const device: DeviceWithType =
        type === 'media'
          ? createMediaDevice()
          : {
              id: 'homey:living_room_climate',
              name: 'Living Room Climate',
              room: 'Living Room',
              type,
              size: 'medium',
              temperature: 21,
              currentTemperature: 20,
              mode: 'auto',
            };
      const handleSizeChange = vi.fn();
      renderWithProviders(
        <DashboardCardItem
          id={device.id}
          size="large"
          isEditMode
          handleSizeChange={handleSizeChange}
          device={device}
        />
      );
      expect(renderCardMock).toHaveBeenCalledWith(expect.objectContaining({ size: 'large' }));

      fireEvent.click(screen.getByRole('button', { name: 'Resize card' }));
      expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^medium\s*\(/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^large\b/i }));

      expect(handleSizeChange).toHaveBeenCalledWith(device.id, 'large');
    }
  );

  it('lets single-sensor info cards use extra-small through large', () => {
    const { container } = renderWithProviders(
      <DashboardCardItem
        id="custom-info"
        size="medium"
        isEditMode
        handleSizeChange={vi.fn()}
        card={{
          id: 'custom-info',
          type: 'info',
          size: 'medium',
          room: 'Kitchen',
          createdAt: 1,
          data: {
            sensorEntityIds: ['sensor.kitchen_temperature'],
          },
        }}
      />
    );

    expect(widgetCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          id: 'custom-info',
          size: 'medium',
          type: 'info',
        }),
      })
    );

    const resizeTrigger = container.querySelector<HTMLButtonElement>(
      '[data-card-edit-dock="true"] button.z-500.group'
    );
    expect(resizeTrigger).toBeTruthy();

    fireEvent.click(resizeTrigger as HTMLButtonElement);

    expect(screen.getByRole('button', { name: /^extra-small\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^small\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^medium\b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^large\b/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^tiny\b/i })).not.toBeInTheDocument();
  });

  it('shows a single launcher on tiny cards and expands the edit dock on demand', () => {
    renderWithProviders(
      <DashboardCardItem
        id="switch.espresso_machine"
        size="tiny"
        isEditMode
        handleSizeChange={vi.fn()}
        device={{ ...createSwitchDevice(), size: 'tiny' }}
      />
    );

    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open settings for Espresso Machine' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));

    expect(
      screen.getByRole('button', { name: 'Open settings for Espresso Machine' })
    ).toBeInTheDocument();
  });

  it('keeps the tiny launcher mounted and restores focus after Escape', async () => {
    renderWithProviders(
      <DashboardCardItem
        id="switch.espresso_machine"
        size="tiny"
        isEditMode
        handleSizeChange={vi.fn()}
        device={{ ...createSwitchDevice(), size: 'tiny' }}
      />
    );
    const launcher = screen.getByRole('button', { name: /more actions/i });
    launcher.focus();
    fireEvent.click(launcher);
    expect(launcher.isConnected).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(launcher).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses the custom action label in the tiny edit dock overlay title', () => {
    renderWithProviders(
      <DashboardCardItem
        id="custom-button"
        size="tiny"
        isEditMode
        handleSizeChange={vi.fn()}
        card={{
          id: 'custom-1780100261963-vdq80sr8k',
          type: 'button',
          size: 'tiny',
          room: 'Kitchen',
          createdAt: 1,
          data: {
            label: 'Vishal',
            service: 'script.turn_on',
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));

    expect(screen.getByText('Vishal')).toBeInTheDocument();
    expect(screen.queryByText(/custom-1780100261963/i)).not.toBeInTheDocument();
  });
});
