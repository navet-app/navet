import { defaultSettings, useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClimateRoomContext, getClimateRoomContextKey } from './climate-room-context';

const sensor: Extract<DeviceWithType, { type: 'sensors' }> = {
  id: 'openhab:living_temp',
  name: 'Living sensor',
  type: 'sensors',
  size: 'small',
  room: 'Living room',
  roomId: 'room-1',
  value: '68',
  unit: '°F',
  deviceClass: 'temperature',
  availability: 'available',
};
const humidity = {
  ...sensor,
  id: 'homey:humidity',
  name: 'Humidity sensor',
  value: '45',
  unit: '%',
  deviceClass: 'humidity',
};
const otherTemperature = {
  ...sensor,
  id: 'home_assistant:sensor.other',
  name: 'Other sensor',
  value: '22',
  unit: '°C',
};
function renderContext(
  devices: DeviceWithType[] = [sensor, humidity, otherTemperature],
  isEditMode = false
) {
  return renderWithProviders(
    <ClimateRoomContext
      room="Living room"
      roomKey="room-1"
      deviceMap={new Map(devices.map((device) => [device.id, device]))}
      temperatureUnit="celsius"
      isEditMode={isEditMode}
    />
  );
}

describe('household climate room sources', () => {
  beforeEach(() => useSettingsStore.setState({ ...defaultSettings, climateRoomSources: {} }));

  it('uses room identity across renames and normalizes label-only rooms', () => {
    expect(getClimateRoomContextKey('Living room', [sensor])).toBe(
      getClimateRoomContextKey('Lounge', [{ ...sensor, room: 'Lounge' }])
    );
    expect(getClimateRoomContextKey(' Living Room ', [{ ...sensor, roomId: undefined }])).toBe(
      'name:living room'
    );
  });

  it('does not choose a sensor implicitly', () => {
    renderContext();
    expect(screen.getAllByText('— · No sensor selected')).toHaveLength(2);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('saves both explicit choices and renders converted measurements with their source', () => {
    const view = renderContext(undefined, true);
    fireEvent.click(screen.getByRole('button', { name: 'Room temperature' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Living sensor · Living room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Room humidity' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Humidity sensor · Living room' }));
    expect(useSettingsStore.getState().climateRoomSources).toEqual({
      'room-1': { temperature: sensor.id, humidity: humidity.id },
    });
    expect(screen.getByText('20 °C · Living sensor')).toBeInTheDocument();
    expect(screen.getByText('45 % · Humidity sensor')).toBeInTheDocument();
    view.unmount();
    renderContext();
    expect(screen.getByText('20 °C · Living sensor')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it.each([
    ['removed', []],
    ['unavailable', [{ ...sensor, availability: 'unavailable' as const }]],
    ['unknown', [{ ...sensor, availability: 'unknown' as const }]],
    ['invalid', [{ ...sensor, value: '' }]],
    ['unknown unit', [{ ...sensor, unit: '' }]],
    ['wrong measurement', [{ ...sensor, deviceClass: 'humidity' }]],
  ])('keeps a %s selection without substituting another reading', (_state, devices) => {
    useSettingsStore
      .getState()
      .updateSettings({ climateRoomSources: { 'room-1': { temperature: sensor.id } } });
    renderContext([...devices, otherTemperature]);
    expect(screen.queryByText(/22 °C/)).not.toBeInTheDocument();
    expect(useSettingsStore.getState().climateRoomSources['room-1'].temperature).toBe(sensor.id);
    expect(
      screen.getByText(/— · (Selected sensor missing|Living sensor · Unavailable)/)
    ).toBeInTheDocument();
  });

  it('clears a source explicitly without losing the other measurement', () => {
    useSettingsStore.getState().updateSettings({
      climateRoomSources: {
        'room-1': { temperature: sensor.id, humidity: humidity.id },
        'room-2': { temperature: otherTemperature.id },
      },
    });
    renderContext(undefined, true);
    fireEvent.click(screen.getByRole('button', { name: 'Room temperature' }));
    const radios = screen.getAllByRole('radio', { name: 'No sensor selected' });
    fireEvent.click(radios[0]);
    expect(useSettingsStore.getState().climateRoomSources).toEqual({
      'room-1': { humidity: humidity.id },
      'room-2': { temperature: otherTemperature.id },
    });
  });
});
