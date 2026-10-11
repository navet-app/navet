import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoCard } from '../sensor-card';

const { useSensorStatisticsHistoryMock } = vi.hoisted(() => ({
  useSensorStatisticsHistoryMock: vi.fn(),
}));

vi.mock('../../hooks/use-sensor-statistics-history', () => ({
  useSensorStatisticsHistory: useSensorStatisticsHistoryMock,
}));

describe('InfoCard', () => {
  // Keep: keyboard activation of a footer action must not trigger the card's settings action.
  it.each(['Enter', ' '])(
    'keeps %s activation of footer controls separate from settings',
    (key) => {
      const openSettings = vi.fn();
      const action = vi.fn();
      renderWithProviders(
        <InfoCard
          id="counter.household"
          name="Household counter"
          room="Kitchen"
          value="4"
          unit=""
          size="medium"
          onSizeChange={() => undefined}
          isEditMode={false}
          onOpenSettings={openSettings}
          bottomActionBar={
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                action();
              }}
            >
              Increase
            </button>
          }
        />
      );
      const button = screen.getByRole('button', { name: 'Increase' });
      expect(fireEvent.keyDown(button, { key })).toBe(true);
      fireEvent.click(button);
      expect(action).toHaveBeenCalledOnce();
      expect(openSettings).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Open settings for Household counter' })[0]
      );
      expect(openSettings).toHaveBeenCalledOnce();
    }
  );

  beforeEach(() => {
    localStorage.clear();
    useSensorStatisticsHistoryMock.mockClear();
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [],
      hasHistory: false,
      canFetch: false,
    });
  });

  it('shows a sparkline by default when the entity supports history', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [
        { value: 20.8, timestampMs: 1, endTimestampMs: 2, minValue: 20.1, maxValue: 21.1 },
        { value: 21.4, timestampMs: 2, endTimestampMs: 3, minValue: 21.1, maxValue: 21.6 },
      ],
      canFetch: true,
      hasHistory: true,
    });

    renderWithProviders(
      <InfoCard
        id="sensor.kitchen_temperature"
        name="Kitchen Temperature"
        room="Kitchen"
        value="21.4"
        unit="°C"
        subtitle="temperature"
        deviceClass="temperature"
        size="medium"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(screen.getByTestId('sensor-history-sparkline')).toBeInTheDocument();
  });

  it('keeps standard small temperature cards value-only', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [
        { value: 20.8, timestampMs: 1, endTimestampMs: 2, minValue: 20.1, maxValue: 21.1 },
        { value: 21.4, timestampMs: 2, endTimestampMs: 3, minValue: 21.1, maxValue: 21.6 },
      ],
      canFetch: true,
      hasHistory: true,
    });

    renderWithProviders(
      <InfoCard
        id="sensor.kitchen_temperature"
        name="Kitchen Temperature"
        room="Kitchen"
        value="21.4"
        unit="°C"
        subtitle="temperature"
        deviceClass="temperature"
        size="small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(screen.queryByTestId('sensor-history-sparkline')).not.toBeInTheDocument();
    expect(screen.getByTitle('21.4 °C')).toBeInTheDocument();
  });

  it('uses a quality bar instead of history for humidity', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [],
      canFetch: false,
      hasHistory: false,
    });

    renderWithProviders(
      <InfoCard
        id="sensor.kitchen_humidity"
        name="Kitchen Humidity"
        room="Kitchen"
        value="46"
        unit="%"
        subtitle="humidity"
        deviceClass="humidity"
        size="small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('meter', { name: 'Kitchen Humidity: 46 %' })).toBeInTheDocument();
    expect(screen.queryByTestId('sensor-history-sparkline')).not.toBeInTheDocument();
  });

  it('uses a threshold quality bar for numeric carbon dioxide readings', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [],
      canFetch: true,
      hasHistory: false,
    });

    renderWithProviders(
      <InfoCard
        id="sensor.office_co2"
        name="Office air quality"
        room="Office"
        value="1420"
        unit="ppm"
        subtitle="carbon dioxide"
        deviceClass="carbon_dioxide"
        securitySeverity="critical"
        size="small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('meter', { name: 'Office air quality: 1420 ppm' })).toBeInTheDocument();
    expect(screen.getByText('>1,200 ppm')).toBeInTheDocument();
  });

  it('does not add a sparkline to unrelated environmental readings', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [
        { value: 1010, timestampMs: 1, endTimestampMs: 2, minValue: 1008, maxValue: 1011 },
        { value: 1012, timestampMs: 2, endTimestampMs: 3, minValue: 1010, maxValue: 1013 },
      ],
      canFetch: true,
      hasHistory: true,
    });

    renderWithProviders(
      <InfoCard
        id="sensor.outdoor_pressure"
        name="Outdoor pressure"
        room="Outside"
        value="1012"
        unit="hPa"
        subtitle="pressure"
        deviceClass="pressure"
        size="small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(screen.queryByTestId('sensor-history-sparkline')).not.toBeInTheDocument();
    expect(useSensorStatisticsHistoryMock).toHaveBeenCalledWith(undefined);
  });

  it('preserves dense identity chrome for extra-small sensor cards', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [],
      canFetch: false,
      hasHistory: false,
    });

    const { container } = renderWithProviders(
      <InfoCard
        id="sensor.kitchen_temperature"
        name="Kitchen Temperature"
        room="Kitchen"
        value="21.4"
        unit="°C"
        subtitle="temperature"
        deviceClass="temperature"
        size="extra-small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(container.querySelector('.navet-card-header-control-dense')).not.toBeNull();
    const heading = screen.getByRole('heading', { name: 'Kitchen Temperature' });
    expect(heading).toHaveClass('text-[11px]');
    expect(heading.previousElementSibling).toHaveTextContent('Temperature');
    expect(screen.getByText('Temperature')).toHaveClass('text-[10px]');
  });

  it('uses a radar icon for motion sensors and migrates the legacy person icon', () => {
    useSensorStatisticsHistoryMock.mockReturnValue({
      points: [],
      canFetch: false,
      hasHistory: false,
    });
    localStorage.setItem(
      'navet-sensor-card-icons:binary_sensor.hall_motion',
      JSON.stringify('PersonStanding')
    );

    const { container } = renderWithProviders(
      <InfoCard
        id="binary_sensor.hall_motion"
        name="Hall Motion"
        room="Hall"
        value="Clear"
        unit=""
        subtitle="motion"
        deviceClass="motion"
        status="clear"
        size="small"
        onSizeChange={() => undefined}
        isEditMode={false}
      />
    );

    expect(container.querySelector('.lucide-radar')).not.toBeNull();
    expect(container.querySelector('.lucide-person-standing')).toBeNull();
  });
});
