import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { renderWithProviders } from '@navet/app/test/render';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimateDashboardSection } from '../types/climate-dashboard';
import { ClimateDashboard } from './climate-dashboard';

const scrollIntoViewMock = vi.fn();

vi.mock('@navet/app/features/dashboard/device-grid', () => ({
  DeviceGrid: ({
    orderedCardIds,
    deviceMap,
  }: {
    orderedCardIds: string[];
    deviceMap: Map<string, DeviceWithType>;
  }) => (
    <div data-testid="device-grid">
      {orderedCardIds.map((id) => (
        <button
          key={id}
          id={`dashboard-entity-${encodeURIComponent(id)}`}
          type="button"
          title={deviceMap.get(id)?.name}
        >
          {id}
        </button>
      ))}
    </div>
  ),
}));

const sections: ClimateDashboardSection[] = [
  {
    key: 'climate',
    titleKey: 'sections.climate.title',
    orderedIds: ['climate.living_room'],
  },
  {
    key: 'temperature',
    titleKey: 'sections.climate.temperature.title',
    orderedIds: ['sensor.living_temperature'],
  },
  {
    key: 'airQuality',
    titleKey: 'sections.climate.airQuality.title',
    orderedIds: ['sensor.office_air_quality'],
  },
];

function climateDevice(
  overrides: Partial<Extract<DeviceWithType, { type: 'climate' }>> = {}
): Extract<DeviceWithType, { type: 'climate' }> {
  return {
    id: 'climate.living_room',
    type: 'climate',
    name: 'Living room thermostat',
    room: 'Living room',
    size: 'medium',
    temperature: 21,
    currentTemperature: 21,
    temperatureUnit: 'celsius',
    mode: 'heat',
    action: 'idle',
    supportedClimateModes: ['off', 'heat'],
    ...overrides,
  };
}

function sensor(
  overrides: Partial<Extract<DeviceWithType, { type: 'sensors' }>> &
    Pick<Extract<DeviceWithType, { type: 'sensors' }>, 'id' | 'name' | 'deviceClass'>
): Extract<DeviceWithType, { type: 'sensors' }> {
  return {
    type: 'sensors',
    room: 'Office',
    size: 'small',
    value: '21',
    unit: '',
    status: 'measurement',
    ...overrides,
  };
}

function renderDashboard(devices: DeviceWithType[]) {
  return renderWithProviders(
    <ClimateDashboard
      deviceMap={new Map(devices.map((device) => [device.id, device]))}
      sections={sections}
      temperatureUnit="celsius"
      cardSizes={{}}
      updateCardSize={vi.fn()}
      isEditMode={false}
      onRemoveEntity={vi.fn()}
      densePerformanceMode={false}
      optimizeOffscreenPaint={false}
    />
  );
}

describe('ClimateDashboard', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it('retains the saved weather source without showing a source selector', () => {
    const weather: Extract<DeviceWithType, { type: 'weather' }> = {
      id: 'home_assistant:weather.forecast_home',
      name: 'Forecast Home',
      type: 'weather',
      room: 'Outside',
      size: 'large',
      temperature: 15.6,
      temperatureUnit: 'celsius',
      location: 'Home',
      condition: 'cloudy',
      humidity: 70,
      windSpeed: 3,
      pressure: 1012,
      precipitation: 0,
      precipitationUnit: 'mm',
      sunrise: '',
      sunset: '',
      daylight: '',
      rainForecast: '',
      highTemp: 16,
      lowTemp: 10,
      forecastMode: 'weekly',
      forecast: [],
    };
    const north = {
      ...weather,
      id: 'home_assistant:weather.demo_north',
      name: 'Demo Weather North',
      temperature: -24.4,
    };
    localStorage.setItem(STORAGE_KEYS.climateWeatherSource, JSON.stringify(weather.id));
    const { unmount } = renderDashboard([climateDevice(), north, weather]);
    expect(screen.queryByRole('combobox', { name: 'Weather' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Weather: 15.6°')).toBeInTheDocument();
    unmount();
    const restored = renderDashboard([climateDevice(), north, weather]);
    expect(screen.queryByRole('combobox', { name: 'Weather' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Weather: 15.6°')).toBeInTheDocument();
    restored.unmount();
    renderDashboard([climateDevice(), north]);
    expect(screen.queryByText('-24.4°')).not.toBeInTheDocument();
  });

  it('keeps normal climate calm and collapses missing optional environment data', () => {
    renderDashboard([climateDevice()]);

    expect(screen.queryByRole('status', { name: 'Needs Attention' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mostly comfortable' })).toBeInTheDocument();
    expect(screen.queryByText(/1\/1/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-climate-comfort-banner]')).toBeInTheDocument();
    expect(
      document.querySelector('[data-climate-comfort-metric="temperature"]')
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-climate-comfort-metric="humidity"]')
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-climate-comfort-metric="outdoor"]')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Environmental')).not.toBeInTheDocument();
  });

  it('shows an off room current temperature without presenting its target as an issue', () => {
    renderDashboard([
      climateDevice({ mode: 'off', currentTemperature: 16, temperature: 21 }),
      sensor({
        id: 'sensor.living_temperature',
        name: 'Living temperature',
        room: 'Living room',
        value: '16',
        unit: '°C',
        deviceClass: 'temperature',
      }),
    ]);

    expect(screen.getByRole('heading', { name: 'Mostly comfortable' })).toBeInTheDocument();
    expect(screen.queryByText(/Target 21°/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\/1/)).not.toBeInTheDocument();
  });

  it('uses the device name in the Temperature section while preserving the full entity name', () => {
    const temperature = sensor({
      id: 'sensor.living_temperature',
      name: 'Bedroom radiator valve · Temperature',
      sourceDeviceName: 'Bedroom radiator valve',
      deviceClass: 'temperature',
      unit: '°C',
      value: '18.8',
    });
    renderDashboard([climateDevice(), temperature]);

    fireEvent.click(screen.getByRole('tab', { name: 'Temperature' }));
    expect(screen.getByTitle('Bedroom radiator valve')).toBeInTheDocument();
    expect(temperature.name).toBe('Bedroom radiator valve · Temperature');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Group cards by: Type' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Room' }));
    fireEvent.click(screen.getByRole('tab', { name: /Office/ }));
    expect(screen.getByTitle('Bedroom radiator valve · Temperature')).toBeInTheDocument();
  });

  it('groups cards by type by default and can regroup them by room', () => {
    renderDashboard([
      climateDevice(),
      sensor({
        id: 'sensor.living_temperature',
        name: 'Living temperature',
        room: 'Living room',
        value: '21',
        unit: '°C',
        deviceClass: 'temperature',
      }),
      sensor({
        id: 'sensor.office_air_quality',
        name: 'Office air quality',
        value: 'Poor',
        deviceClass: 'air_quality',
        securitySeverity: 'critical',
      }),
    ]);

    const groupingTrigger = screen.getByRole('button', { name: 'Group cards by: Type' });
    expect(groupingTrigger).not.toHaveTextContent('Type');
    expect(screen.getByTestId('device-grid')).toHaveTextContent('climate.living_room');

    const airQualityTab = screen.getByRole('tab', { name: 'Air Quality' });
    expect(airQualityTab).toHaveTextContent(/^Air Quality$/);
    fireEvent.click(airQualityTab);
    expect(screen.getByTestId('device-grid')).toHaveTextContent('sensor.office_air_quality');

    fireEvent.pointerDown(groupingTrigger, { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Room' }));
    expect(groupingTrigger).toHaveAccessibleName('Group cards by: Room');
    fireEvent.click(screen.getByRole('tab', { name: /Office/ }));
    expect(screen.getByTestId('device-grid')).toHaveTextContent('sensor.office_air_quality');
    expect(screen.getByTestId('device-grid')).not.toHaveTextContent('sensor.living_temperature');
  });
  it('remembers explicit room navigation on reload and supports keyboard tab selection', () => {
    const devices = [
      climateDevice(),
      sensor({
        id: 'sensor.living_temperature',
        name: 'Living temperature',
        room: 'Living room',
        deviceClass: 'temperature',
      }),
      sensor({
        id: 'sensor.office_air_quality',
        name: 'Office air',
        deviceClass: 'carbon_dioxide',
      }),
    ];
    const { unmount } = renderDashboard(devices);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Group cards by: Type' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Room' }));
    const living = screen.getByRole('tab', { name: 'Living room' });
    living.focus();
    fireEvent.keyDown(living, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Office' })).toHaveAttribute('aria-selected', 'true');
    unmount();
    renderDashboard(devices);
    expect(screen.getByRole('button', { name: 'Group cards by: Room' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Office' })).toHaveAttribute('aria-selected', 'true');
  });
});
