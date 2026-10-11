import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen } from '@testing-library/react';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetCard } from '../widget-card';

function entity(
  entityId: string,
  state: string,
  attributes: HassEntity['attributes'] = {}
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes,
    context: { id: 'context', parent_id: null, user_id: null },
    last_changed: '2026-05-21T00:00:00.000Z',
    last_updated: '2026-05-21T00:00:00.000Z',
  };
}

const upsEntities: HassEntities = {
  'sensor.nutdev1_battery_charge': entity('sensor.nutdev1_battery_charge', '97', {
    friendly_name: 'Battery charge',
    device_class: 'battery',
    unit_of_measurement: '%',
  }),
  'sensor.nutdev1_load': entity('sensor.nutdev1_load', '14', {
    friendly_name: 'Load',
    unit_of_measurement: '%',
  }),
  'sensor.nutdev1_status': entity('sensor.nutdev1_status', 'Online', {
    friendly_name: 'Status',
  }),
  'sensor.nutdev1_status_data': entity('sensor.nutdev1_status_data', 'OL', {
    friendly_name: 'Status data',
  }),
  'sensor.nutdev1_input_voltage': entity('sensor.nutdev1_input_voltage', '232', {
    friendly_name: 'Input voltage',
    unit_of_measurement: 'V',
  }),
  'sensor.nutdev1_output_voltage': entity('sensor.nutdev1_output_voltage', '230', {
    friendly_name: 'Output voltage',
    unit_of_measurement: 'V',
  }),
  'sensor.nutdev1_battery_runtime': entity('sensor.nutdev1_battery_runtime', '1320', {
    friendly_name: 'Battery runtime',
    unit_of_measurement: 's',
  }),
};

describe('WidgetCard UPS', () => {
  beforeEach(() => {
    homeAssistantStore.setState({
      ...homeAssistantStore.getInitialState(),
      entities: upsEntities,
      areas: [{ area_id: 'server-room', name: 'Server Room' }],
      deviceRegistry: [{ id: 'device-ups', area_id: 'server-room', name: 'Rack UPS' }],
      entityRegistry: Object.keys(upsEntities).map((entityId) => ({
        entity_id: entityId,
        device_id: 'device-ups',
      })),
    });
  });

  it('renders a discovered UPS card using the default device and metrics', async () => {
    renderWithProviders(
      <WidgetCard
        isEditMode
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    expect(await screen.findByText('Rack UPS')).toBeInTheDocument();
    expect((await screen.findByText('97')).parentElement).toHaveTextContent('97 %');
    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(await screen.findByText('Input voltage')).toBeInTheDocument();
  });

  it('keeps runtime and load visible in a small card', async () => {
    renderWithProviders(
      <WidgetCard
        isEditMode={false}
        card={{
          id: 'compact-ups',
          type: 'ups',
          size: 'small',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    expect((await screen.findByText('97')).parentElement).toHaveTextContent('97 %');
    expect(await screen.findByText('Runtime')).toBeInTheDocument();
    expect((await screen.findByText('14')).parentElement).toHaveTextContent('14 %');
    expect(screen.queryByText('Input voltage')).not.toBeInTheDocument();
  });

  it('falls back to status data when the status sensor is unavailable', async () => {
    homeAssistantStore.setState({
      ...homeAssistantStore.getInitialState(),
      entities: {
        'sensor.nutdev1_battery_charge': upsEntities['sensor.nutdev1_battery_charge'],
        'sensor.nutdev1_status_data': upsEntities['sensor.nutdev1_status_data'],
      },
      deviceRegistry: [{ id: 'device-ups', area_id: 'server-room', name: 'Rack UPS' }],
      entityRegistry: [
        { entity_id: 'sensor.nutdev1_battery_charge', device_id: 'device-ups' },
        { entity_id: 'sensor.nutdev1_status_data', device_id: 'device-ups' },
      ],
    });

    renderWithProviders(
      <WidgetCard
        isEditMode
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    expect(await screen.findByText('OL')).toBeInTheDocument();
  });

  it('renders without runtime when the NUT device does not expose one', async () => {
    homeAssistantStore.setState({
      ...homeAssistantStore.getInitialState(),
      entities: {
        'sensor.nutdev1_battery_charge': upsEntities['sensor.nutdev1_battery_charge'],
        'sensor.nutdev1_load': upsEntities['sensor.nutdev1_load'],
        'sensor.nutdev1_status': upsEntities['sensor.nutdev1_status'],
      },
      deviceRegistry: [{ id: 'device-ups', area_id: 'server-room', name: 'Rack UPS' }],
      entityRegistry: [
        { entity_id: 'sensor.nutdev1_battery_charge', device_id: 'device-ups' },
        { entity_id: 'sensor.nutdev1_load', device_id: 'device-ups' },
        { entity_id: 'sensor.nutdev1_status', device_id: 'device-ups' },
      ],
    });

    renderWithProviders(
      <WidgetCard
        isEditMode
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    expect(await screen.findByText('Rack UPS')).toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
  });

  it('shows the empty state when no UPS-capable devices are available', async () => {
    homeAssistantStore.setState({
      ...homeAssistantStore.getInitialState(),
      entities: {
        'sensor.server_room_temperature': entity('sensor.server_room_temperature', '21.5', {
          friendly_name: 'Server Room Temperature',
          device_class: 'temperature',
          unit_of_measurement: '°C',
        }),
      },
      entityRegistry: [{ entity_id: 'sensor.server_room_temperature', device_id: 'device-temp' }],
    });

    renderWithProviders(
      <WidgetCard
        isEditMode
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    expect(await screen.findByText('No UPS sensors found')).toBeInTheDocument();
  });

  it('shows unavailable messaging when a persisted device is missing', async () => {
    renderWithProviders(
      <WidgetCard
        isEditMode
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
          data: {
            deviceId: 'missing-device',
          },
        }}
      />
    );

    expect(await screen.findByText('UPS device unavailable')).toBeInTheDocument();
  });

  it('persists selected status and metric ids from settings', async () => {
    const onUpdate = vi.fn();

    renderWithProviders(
      <WidgetCard
        isEditMode
        onUpdate={onUpdate}
        card={{
          id: 'custom-ups',
          type: 'ups',
          size: 'medium',
          room: 'Server Room',
          createdAt: 1,
        }}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open settings for UPS Monitor' }));
    fireEvent.change(screen.getByLabelText('Status source'), {
      target: { value: 'sensor.nutdev1_status' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Output voltage/i }));

    expect(onUpdate).toHaveBeenCalledWith('custom-ups', {
      data: {
        deviceId: 'device-ups',
        metricEntityIds: [
          'sensor.nutdev1_battery_charge',
          'sensor.nutdev1_load',
          'sensor.nutdev1_input_voltage',
          'sensor.nutdev1_output_voltage',
          'sensor.nutdev1_battery_runtime',
        ],
        statusEntityId: 'sensor.nutdev1_status',
      },
    });

    expect(onUpdate).toHaveBeenCalledWith('custom-ups', {
      data: {
        deviceId: 'device-ups',
        metricEntityIds: [
          'sensor.nutdev1_battery_charge',
          'sensor.nutdev1_load',
          'sensor.nutdev1_input_voltage',
          'sensor.nutdev1_battery_runtime',
        ],
        statusEntityId: 'sensor.nutdev1_status',
      },
    });
  });
});
