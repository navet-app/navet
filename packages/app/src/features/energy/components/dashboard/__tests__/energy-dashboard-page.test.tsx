import {
  getEnergyDashboardScenario,
  getMockEnergySourceDiagnostics,
} from '@navet/app/features/energy/data/mock-energy-dashboard';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { setMediaQueryMatch, setVisualViewportSize } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import { notifyPersistedStateChanged } from '@navet/app/utils/persisted-state-events';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUntrackedTrend, EnergyDashboardPage } from '../energy-dashboard-page';

const { getIntegrationStatisticsHistoryMock } = vi.hoisted(() => ({
  getIntegrationStatisticsHistoryMock: vi.fn(),
}));

vi.mock('@navet/app/services/integration-history.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@navet/app/services/integration-history.service')>()),
  getIntegrationStatisticsHistory: getIntegrationStatisticsHistoryMock,
}));

let intersectionObserverCallback: IntersectionObserverCallback | null = null;
let autoIntersectEnergySparklines = true;
const PORTRAIT_TABLET_QUERY = '(orientation: portrait) and (min-width: 768px)';
const PHONE_QUERY = '(max-width: 639px)';

class EnergyIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionObserverCallback = callback;
  }

  disconnect() {}

  observe() {
    if (autoIntersectEnergySparklines) {
      intersectionObserverCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
  }

  takeRecords() {
    return [];
  }

  unobserve() {}
}

vi.mock('@navet/app/features/dashboard/components/dashboard-card-item', () => ({
  DashboardCardItem: ({
    card,
    onUpdateCard,
  }: {
    card: { id: string };
    onUpdateCard?: (cardId: string, updates: Record<string, unknown>) => void;
  }) => (
    <div>
      <div>Energy card {card.id}</div>
      <button
        type="button"
        onClick={() =>
          onUpdateCard?.(card.id, {
            data: {
              sensorCategoryFilter: 'energy',
              sensorEntityIds: ['home_assistant:sensor.remaining_electricity'],
            },
          })
        }
      >
        Update energy card
      </button>
    </div>
  ),
}));

function renderDashboardPage(
  storyId: string,
  props: Partial<ComponentProps<typeof EnergyDashboardPage>> = {}
) {
  const scenario = getEnergyDashboardScenario(storyId);

  return renderWithProviders(
    <EnergyDashboardPage
      dashboard={scenario.dashboard}
      sourceDiagnostics={getMockEnergySourceDiagnostics(scenario.dashboard)}
      {...props}
    />
  );
}

describe('EnergyDashboardPage', () => {
  beforeEach(() => {
    localStorage.clear();
    setMediaQueryMatch(PORTRAIT_TABLET_QUERY, false);
    setMediaQueryMatch(PHONE_QUERY, false);
    setVisualViewportSize(1024, 768);
    const start = Date.now() - 2 * 60 * 60 * 1000;
    getIntegrationStatisticsHistoryMock.mockImplementation(
      async ({ entityIds }: { entityIds: string[] }) =>
        Object.fromEntries(
          entityIds.map((entityId, entityIndex) => [
            entityId,
            [
              {
                startMs: start,
                endMs: start + 60 * 60 * 1000,
                mean: entityIndex === 0 ? 1200 : 240,
                min: entityIndex === 0 ? 220 : 0,
                max: entityIndex === 0 ? 2800 : 800,
              },
              {
                startMs: start + 60 * 60 * 1000,
                endMs: start + 2 * 60 * 60 * 1000,
                mean: entityIndex === 0 ? 1800 : 360,
                min: entityIndex === 0 ? 340 : 0,
                max: entityIndex === 0 ? 3764 : 1000,
              },
            ],
          ])
        )
    );
    autoIntersectEnergySparklines = true;
    intersectionObserverCallback = null;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: EnergyIntersectionObserver,
    });
    useSettingsStore.getState().resetSettings();
    // Rich-rendering fixtures must not depend on the runner's detected device tier.
    useSettingsStore.getState().updateSettings({ effectsQuality: 'high' });
    useThemeStore.setState({
      ...useThemeStore.getState(),
      theme: 'dark',
      followSystemTheme: false,
      primaryColor: 'orange',
      customPrimaryColor: null,
      wallpaper: null,
    });
  });

  it('renders ripple dots from inner to outer rings around the load orb', () => {
    renderDashboardPage('default');

    const dots = screen.getAllByTestId('load-orb-dot');
    expect(dots.length).toBeGreaterThan(0);
    expect(dots[0]).toHaveAttribute('data-ring', '0');
    expect(dots.at(-1)).toHaveAttribute('data-ring', '4');
  });

  it('uses the orb as the device color key for keyboard and pointer-independent inspection', () => {
    renderDashboardPage('default');

    const orb = screen.getByTestId('load-orb');
    const dots = screen.getAllByTestId('load-orb-dot');
    const artwork = orb.querySelector('svg');
    const topDot = dots.find(
      (dot) => Math.abs(Number(dot.getAttribute('cx'))) < 1 && Number(dot.getAttribute('cy')) < 0
    );
    const upperLeftDot = dots.find(
      (dot) => Number(dot.getAttribute('cx')) < 0 && Number(dot.getAttribute('cy')) < 0
    );

    expect(topDot).toBeDefined();
    expect(upperLeftDot).toBeDefined();
    expect(orb).not.toHaveClass('overflow-hidden');
    expect(artwork).toHaveClass('overflow-hidden');
    expect(upperLeftDot).toHaveAttribute(
      'data-segment-id',
      topDot?.getAttribute('data-segment-id')
    );
    expect(orb).toHaveAttribute('tabindex', '0');
    expect(orb).toHaveAccessibleName(/Live Energy.*Heating loop: 3600 W/i);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.keyDown(orb, { key: 'ArrowRight' });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Heating loop');
    expect(screen.getByRole('tooltip')).toHaveTextContent(/3600 W · 49% of current load/i);
    expect(
      screen
        .getAllByTestId('load-orb-dot')
        .some((dot) => dot.style.getPropertyValue('--load-orb-dot-opacity') === '0.22')
    ).toBe(true);

    fireEvent.keyDown(orb, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Water heater');

    fireEvent.keyDown(orb, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('collapses the low-power orb to one static ring', () => {
    useSettingsStore.getState().updateSettings({
      disableAnimations: true,
      effectsQuality: 'low',
      lowPowerMode: true,
    });

    renderDashboardPage('default');

    const dots = screen.getAllByTestId('load-orb-dot');
    expect(dots).toHaveLength(26);
    expect(dots.every((dot) => dot.dataset.ring === '0')).toBe(true);
    expect(dots.every((dot) => dot.style.animationName === '')).toBe(true);
    expect(dots[0]).toHaveAttribute('cx');
    expect(dots[0]).toHaveAttribute('cy');
  });

  it('defers the full sparkline tree until it approaches the viewport', () => {
    autoIntersectEnergySparklines = false;

    const { container } = renderDashboardPage('default');
    const sparklineLane = container.querySelector('[data-energy-sparklines-ready]');

    expect(sparklineLane).toHaveAttribute('data-energy-sparklines-ready', 'false');
    expect(screen.queryAllByTestId('energy-now-chart-layer')).toHaveLength(0);

    act(() => {
      intersectionObserverCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(sparklineLane).toHaveAttribute('data-energy-sparklines-ready', 'true');
    expect(screen.getAllByTestId('energy-now-chart-layer')).toHaveLength(3);
  });

  it('shows total tracked consumption without imported or generated energy', () => {
    renderDashboardPage('default');

    expect(screen.getByTestId('load-orb-consumption')).toHaveTextContent('48.4 kWh today');
  });

  it('keeps Live Energy on today when the dashboard insight period is historical', () => {
    const scenario = getEnergyDashboardScenario('default');
    const dashboard = structuredClone(scenario.dashboard);
    dashboard.selectedRange = 'week';
    dashboard.ranges.week.totalUsageKWh = 999;

    renderWithProviders(
      <EnergyDashboardPage
        dashboard={dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(dashboard)}
      />
    );

    expect(screen.getByTestId('load-orb-consumption')).toHaveTextContent('48.4 kWh today');
    expect(screen.getByTestId('load-orb-consumption')).not.toHaveTextContent('999');
    expect(
      within(screen.getByTestId('energy-insights-period-control')).getByRole('button', {
        name: 'Week',
      })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('separates the dashboard insights period from the Energy usage live view', async () => {
    const scenario = getEnergyDashboardScenario('default');
    const onRangeChange = vi.fn();
    renderWithProviders(
      <EnergyDashboardPage
        dashboard={scenario.dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(scenario.dashboard)}
        currentLoadStatisticId="sensor.house_power"
        onRangeChange={onRangeChange}
      />
    );

    expect(await screen.findByText('Energy usage')).toBeInTheDocument();
    const usageCard = screen.getByTestId('energy-usage-card');
    const usageHeading = within(usageCard).getByRole('heading', { name: 'Energy usage' });
    expect(usageHeading).toHaveClass('text-[12px]');
    expect(usageHeading.nextElementSibling).toHaveTextContent('Live power demand');
    expect(within(usageCard).getByText('Live power demand')).toHaveClass('text-[11px]');
    expect(screen.getByTestId('energy-usage-metric-grid')).toBeInTheDocument();
    expect(within(usageCard).queryByText('Average')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-history-bars')).not.toBeInTheDocument();
    expect(within(usageCard).getByRole('img', { name: 'Power sparkline' })).toBeInTheDocument();
    expect(screen.queryByText('Trends over time')).not.toBeInTheDocument();
    expect(screen.queryByText('Historical usage')).not.toBeInTheDocument();

    const insightsPeriod = screen.getByTestId('energy-insights-period-control');
    expect(within(insightsPeriod).queryByText('Insights')).not.toBeInTheDocument();
    expect(within(insightsPeriod).getByRole('button', { name: 'Day' })).toHaveClass(
      'h-9',
      'px-3.5',
      'text-xs'
    );
    expect(within(insightsPeriod).getByRole('button', { name: 'Custom' })).toHaveClass(
      'h-9',
      'px-3.5',
      'text-xs'
    );
    fireEvent.click(within(insightsPeriod).getByRole('button', { name: 'Week' }));

    expect(await screen.findByTestId('energy-history-bars')).toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-energy')).toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-low')).toHaveTextContent('1.2 kWh');
    expect(screen.getByTestId('energy-usage-metric-average')).toHaveTextContent('1.5 kWh');
    expect(screen.getByTestId('energy-usage-metric-peak')).toHaveTextContent('1.8 kWh');
    expect(screen.getByTestId('energy-usage-metric-energy')).toHaveTextContent('Week total');
    expect(screen.queryByTestId('energy-usage-metric-now')).not.toBeInTheDocument();
    expect(onRangeChange).toHaveBeenCalledWith('week');
    expect(
      within(usageCard).queryByRole('img', { name: 'Power sparkline' })
    ).not.toBeInTheDocument();

    const historyChart = within(usageCard).getByRole('slider', { name: 'Energy usage by period' });
    vi.spyOn(historyChart, 'getBoundingClientRect').mockReturnValue({
      bottom: 240,
      height: 200,
      left: 0,
      right: 700,
      top: 40,
      width: 700,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });
    fireEvent.click(historyChart, { clientX: 699 });

    const selectedPeriodDetails = await screen.findByTestId('energy-selected-period-details');
    expect(selectedPeriodDetails).toHaveAccessibleName('Selected period details');
    expect(
      within(usageCard).getByRole('heading', { name: /Selected (hour|day)/ })
    ).toBeInTheDocument();
    const backButton = within(usageCard).getByRole('button', { name: 'Back to chart' });
    expect(backButton).toHaveClass('h-8', 'w-8');
    expect(backButton.parentElement).toHaveClass('items-start');
    expect(selectedPeriodDetails).toHaveTextContent('What used the most');
    expect(selectedPeriodDetails).toHaveTextContent('Heating loop');
    expect(
      within(selectedPeriodDetails).getByRole('heading', { name: 'Energy used' })
    ).toBeInTheDocument();
    expect(within(selectedPeriodDetails).queryByRole('img', { name: /identified/ })).toBeNull();
    expect(selectedPeriodDetails).toHaveTextContent('Average');
    expect(selectedPeriodDetails).toHaveTextContent('Peak');
    expect(screen.queryByText('Period context')).not.toBeInTheDocument();
    expect(screen.queryByText('Peak intensity')).not.toBeInTheDocument();
    expect(screen.getByTestId('energy-selected-period-metrics')).toHaveClass('mt-auto', 'pt-4');
    expect(screen.getByTestId('energy-selected-period-device-panel')).toHaveClass(
      'overflow-hidden'
    );
    expect(screen.getByTestId('energy-selected-period-device-scroll')).toHaveClass(
      'overflow-y-auto'
    );
    expect(screen.getByTestId('energy-selected-period-divider')).toHaveClass(
      'inset-x-3',
      'sm:inset-y-3'
    );
    expect(screen.getByTestId('energy-usage-metric-energy')).toHaveTextContent('Week total');
    expect(screen.getByTestId('energy-usage-metric-energy')).not.toHaveTextContent('Selected day');
    expect(usageCard.parentElement?.style.gridRow).toBe('span 4');
    expect(usageCard).not.toHaveClass('sm:row-span-3');
    expect(
      within(usageCard).queryByRole('slider', { name: 'Energy usage by period' })
    ).not.toBeInTheDocument();

    fireEvent.click(within(usageCard).getByRole('button', { name: 'Back to chart' }));
    expect(screen.queryByTestId('energy-selected-period-details')).not.toBeInTheDocument();
    expect(usageCard.parentElement?.style.gridRow).toBe('span 4');
    expect(usageCard).not.toHaveClass('sm:row-span-3');
    expect(
      within(usageCard).getByRole('slider', { name: 'Energy usage by period' })
    ).toBeInTheDocument();

    fireEvent.click(within(usageCard).getByRole('button', { name: 'Live' }));

    expect(within(usageCard).getByRole('img', { name: 'Power sparkline' })).toBeInTheDocument();
    expect(within(insightsPeriod).getByRole('button', { name: 'Week' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(onRangeChange).toHaveBeenCalledTimes(1);
  });

  it('labels the displayed month and navigates through calendar months', async () => {
    renderDashboardPage('default', { currentLoadStatisticId: 'sensor.house_power' });

    const now = new Date();
    const currentMonthLabel = now.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthLabel = previousMonth.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const insightsPeriod = screen.getByTestId('energy-insights-period-control');

    fireEvent.click(within(insightsPeriod).getByRole('button', { name: 'Month' }));

    await screen.findByTestId('energy-history-bars');
    expect(screen.getByText(currentMonthLabel, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    await waitFor(() => {
      expect(screen.getByText(previousMonthLabel, { exact: true })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    await waitFor(() => {
      expect(screen.getByText(currentMonthLabel, { exact: true })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('offers the same period navigation for day and week views', async () => {
    renderDashboardPage('default', { currentLoadStatisticId: 'sensor.house_power' });

    const usageCard = screen.getByTestId('energy-usage-card');
    fireEvent.click(within(usageCard).getByRole('button', { name: 'Day' }));

    expect(
      await within(usageCard).findByRole('slider', { name: 'Energy usage by period' })
    ).toHaveAttribute('aria-valuemax', '287');
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled());

    fireEvent.click(
      within(screen.getByTestId('energy-insights-period-control')).getByRole('button', {
        name: 'Week',
      })
    );

    await screen.findByTestId('energy-history-bars');
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled());
  });

  it('shows history source pills only when supply paths can differ', async () => {
    const gridOnly = getEnergyDashboardScenario('normal-household');
    const { unmount } = renderWithProviders(
      <EnergyDashboardPage
        dashboard={gridOnly.dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(gridOnly.dashboard)}
        currentLoadStatisticId="sensor.house_power"
        historySources={[
          {
            id: 'home',
            label: 'Home use',
            entityId: 'sensor.house_power',
            color: '#f97316',
            valueKind: 'power',
          },
          {
            id: 'grid',
            label: 'Grid import',
            entityId: 'sensor.grid_import_power',
            color: '#60a5fa',
            valueKind: 'power',
          },
        ]}
      />
    );

    fireEvent.click(
      within(screen.getByTestId('energy-insights-period-control')).getByRole('button', {
        name: 'Week',
      })
    );
    await screen.findByTestId('energy-history-bars');
    const gridOnlyUsageCard = screen.getByTestId('energy-usage-card');
    expect(within(gridOnlyUsageCard).queryByRole('button', { name: 'Home use' })).toBeNull();
    expect(within(gridOnlyUsageCard).queryByRole('button', { name: 'Grid import' })).toBeNull();

    unmount();

    const solarHome = getEnergyDashboardScenario('solar-battery-household');
    renderWithProviders(
      <EnergyDashboardPage
        dashboard={solarHome.dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(solarHome.dashboard)}
        currentLoadStatisticId="sensor.house_power"
        historySources={[
          {
            id: 'home',
            label: 'Home use',
            entityId: 'sensor.house_power',
            color: '#f97316',
            valueKind: 'power',
          },
          {
            id: 'grid',
            label: 'Grid import',
            entityId: 'sensor.grid_import_power',
            color: '#60a5fa',
            valueKind: 'power',
          },
          {
            id: 'solar',
            label: 'Solar production',
            entityId: 'sensor.solar_power',
            color: '#facc15',
            valueKind: 'power',
          },
        ]}
      />
    );

    fireEvent.click(
      within(screen.getByTestId('energy-insights-period-control')).getByRole('button', {
        name: 'Week',
      })
    );
    await screen.findByTestId('energy-history-bars');
    const multiSourceUsageCard = screen.getByTestId('energy-usage-card');
    expect(within(multiSourceUsageCard).getByRole('button', { name: 'Home use' })).toBeVisible();
    expect(within(multiSourceUsageCard).getByRole('button', { name: 'Grid import' })).toBeVisible();
    expect(
      within(multiSourceUsageCard).getByRole('button', { name: 'Solar production' })
    ).toBeVisible();
  });

  it('labels and navigates calendar years in Year view', async () => {
    renderDashboardPage('default', { currentLoadStatisticId: 'sensor.house_power' });

    fireEvent.click(
      within(screen.getByTestId('energy-insights-period-control')).getByRole('button', {
        name: 'Year',
      })
    );

    await screen.findByTestId('energy-history-bars');
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(String(currentYear), { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));

    await waitFor(() => {
      expect(screen.getByText(String(currentYear - 1), { exact: true })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Next year' })).toBeEnabled();
  });

  it('applies a custom range from a popup and exposes it as a dismissible filter pill', async () => {
    const scenario = getEnergyDashboardScenario('default');
    const onRangeChange = vi.fn();
    renderWithProviders(
      <EnergyDashboardPage
        dashboard={scenario.dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(scenario.dashboard)}
        currentLoadStatisticId="sensor.house_power"
        onRangeChange={onRangeChange}
      />
    );

    const insightsPeriod = screen.getByTestId('energy-insights-period-control');
    fireEvent.click(within(insightsPeriod).getByRole('button', { name: 'Custom' }));

    expect(screen.getByText('Custom range')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2024-08-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2024-08-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await screen.findByTestId('energy-history-bars');
    const clearRange = await within(insightsPeriod).findByRole('button', {
      name: 'Clear custom range Aug 1–7, 2024',
    });
    expect(clearRange).toBeInTheDocument();
    expect(
      screen.queryByText('Choose the dates used across Energy insights.')
    ).not.toBeInTheDocument();
    expect(onRangeChange).not.toHaveBeenCalled();

    fireEvent.click(clearRange);

    await waitFor(() => {
      expect(within(insightsPeriod).queryByText('Aug 1–7, 2024')).not.toBeInTheDocument();
      expect(within(insightsPeriod).getByRole('button', { name: 'Day' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });
    expect(onRangeChange).toHaveBeenCalledWith('today');
  });

  it('uses the shared cover sheet for custom ranges on phones', () => {
    setMediaQueryMatch(PHONE_QUERY, true);
    renderDashboardPage('default');

    const customTrigger = screen.getByRole('button', { name: 'Custom' });
    expect(customTrigger.querySelector('svg')).toBeNull();
    fireEvent.click(customTrigger);

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Custom range' })).toBeInTheDocument();
    expect(sheet.querySelector('[data-sheet-surface-header]')).toHaveClass(
      'px-4',
      'py-3',
      'max-sm:pt-2',
      'max-sm:pr-4',
      'border-b'
    );
    expect(within(sheet).getByLabelText('From')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('To')).toBeInTheDocument();
    expect(within(sheet).getAllByRole('button', { name: /close custom range/i })).toHaveLength(2);
  });

  it('prioritizes available solar, battery, and cost signals in the live KPI row', () => {
    renderDashboardPage('default');

    expect(screen.getByTestId('energy-usage-metric-solar')).toHaveTextContent('Solar production');
    expect(screen.getByTestId('energy-usage-metric-battery')).toHaveTextContent('Battery');
    expect(screen.getByTestId('energy-usage-metric-cost')).toHaveTextContent('Energy cost');
    expect(screen.getByTestId('energy-usage-metric-grid')).toHaveTextContent('Grid import');
    expect(screen.queryByTestId('energy-usage-metric-now')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-low')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-average')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-peak')).not.toBeInTheDocument();
  });

  it('keeps low, average, and peak as fallbacks when richer energy signals are unavailable', () => {
    const scenario = getEnergyDashboardScenario('normal-household');
    const dashboard = structuredClone(scenario.dashboard);
    dashboard.dataCoverage.hasCost = false;
    dashboard.totals.costToday = 0;
    dashboard.totals.projectedMonthCost = 0;

    renderWithProviders(
      <EnergyDashboardPage
        dashboard={dashboard}
        sourceDiagnostics={getMockEnergySourceDiagnostics(dashboard)}
      />
    );

    expect(screen.getByTestId('energy-usage-metric-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-now')).not.toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-low')).toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-average')).toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-peak')).toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-solar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-battery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('energy-usage-metric-cost')).not.toBeInTheDocument();
  });

  it('keeps historical usage in the overview without secondary detail cards', async () => {
    const scenario = getEnergyDashboardScenario('default');
    renderDashboardPage('default', {
      currentLoadStatisticId: 'sensor.house_power',
      dashboard: {
        ...scenario.dashboard,
        topConsumers: scenario.dashboard.topConsumers.map((consumer, index) => ({
          ...consumer,
          room: index === 0 ? 'Bathroom' : 'Kitchen',
        })),
      },
    });

    expect(await screen.findByText('Energy usage')).toBeInTheDocument();
    const insightsPeriod = screen.getByTestId('energy-insights-period-control');
    fireEvent.click(within(insightsPeriod).getByRole('button', { name: 'Week' }));

    expect(await screen.findByTestId('energy-history-bars')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Selected energy period details' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Energy by room')).not.toBeInTheDocument();
    expect(screen.queryByText('Device contribution')).not.toBeInTheDocument();
    expect(getIntegrationStatisticsHistoryMock).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });

  it('keeps Energy customization free of section separator banners', () => {
    const { container } = renderDashboardPage('default', { isEditMode: true });
    expect(container.querySelector('[data-overview-edit-banner]')).not.toBeInTheDocument();
    expect(screen.queryByText('Device cards')).not.toBeInTheDocument();
    expect(container.querySelector('[data-overview-module="devices"]')).toBeInTheDocument();
  });

  it('keeps Energy layout templates out of the dashboard grid', () => {
    renderDashboardPage('default', { isEditMode: true });

    expect(screen.queryByText('Energy layout')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Essentials' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Balanced' })).not.toBeInTheDocument();
  });

  it('hides all KPIs without hiding the usage chart and restores the selected KPIs', async () => {
    localStorage.setItem('navet-energy-kpis-hidden', 'true');
    localStorage.setItem(
      'navet-energy-kpi-preferences-v1',
      JSON.stringify({
        version: 1,
        byProvider: {
          home_assistant: { mode: 'custom', metricIds: ['energy', 'peak', 'low', 'average'] },
        },
      })
    );
    renderDashboardPage('default', { isEditMode: true });
    expect(screen.queryAllByTestId(/^energy-usage-metric-/)).toHaveLength(0);
    expect(screen.getByTestId('energy-usage-card')).toBeInTheDocument();
    act(() => notifyPersistedStateChanged('navet-energy-kpis-hidden', false));
    await waitFor(() => expect(screen.getAllByTestId(/^energy-usage-metric-/)).toHaveLength(4));
    expect(screen.getByTestId('energy-usage-metric-energy')).toBeInTheDocument();
    expect(localStorage.getItem('navet-energy-kpis-hidden')).toBe('false');
  });

  it('replaces one KPI from its edit dock using the shared card picker and persists the choice', async () => {
    renderDashboardPage('default', { isEditMode: true });
    const originalIds = screen
      .getAllByTestId(/^energy-usage-metric-/)
      .map((card) => card.getAttribute('data-testid'));
    const solar = screen
      .getByTestId('energy-usage-metric-solar')
      .closest('[data-energy-card-id]') as HTMLElement;
    fireEvent.click(within(solar).getByRole('button', { name: 'Edit Solar production' }));
    const dialog = await screen.findByRole('dialog', { name: 'Energy KPIs' });
    expect(within(dialog).queryByRole('button', { name: 'Manual' })).not.toBeInTheDocument();
    const row = within(dialog)
      .getByText('Energy used')
      .closest('[data-dashboard-library-row]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Save: Energy used' }));
    await waitFor(() =>
      expect(screen.getByTestId('energy-usage-metric-energy')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('energy-usage-metric-solar')).not.toBeInTheDocument();
    for (const id of originalIds.filter((id) => id !== 'energy-usage-metric-solar')) {
      expect(screen.getByTestId(id as string)).toBeInTheDocument();
    }
    expect(localStorage.getItem('navet-energy-kpi-preferences-v1')).toContain('"mode":"custom"');
  });

  it('subtracts device histories point-by-point from the whole-home sparkline', () => {
    const scenario = getEnergyDashboardScenario('default');
    const [bathroom, toilet] = scenario.dashboard.topConsumers;
    if (!bathroom || !toilet) {
      throw new Error('Expected at least two demo energy consumers');
    }
    const consumers = [
      { ...bathroom, id: 'bathroom', powerW: 1280 },
      { ...toilet, id: 'toilet', powerW: 750 },
    ];

    const trend = buildUntrackedTrend({
      consumers,
      consumerTrends: {
        bathroom: [
          { label: 'Earlier', value: 1000 },
          { label: 'Now', value: 1280 },
        ],
        toilet: [
          { label: 'Earlier', value: 500 },
          { label: 'Now', value: 750 },
        ],
      },
      wholeHomeCurrentW: 4000,
      wholeHomePoints: [
        { label: 'Earlier', value: 3 },
        { label: 'Now', value: 4 },
      ],
    });

    expect(trend.at(-1)?.value).toBe(1970);
  });

  it('hides untracked when whole-home consumption minus devices is not positive', () => {
    renderDashboardPage('default');

    expect(screen.queryByText('Untracked')).not.toBeInTheDocument();
  });

  it('shows consumption share and device state together on row two', () => {
    renderDashboardPage('default');

    const activeStatus = screen.getByTestId('energy-device-status-hvac');
    expect(activeStatus).toHaveTextContent(/% · Active/);
    expect(activeStatus.parentElement?.querySelector('span[aria-hidden="true"]')).toBeNull();
    expect(screen.getByTestId('energy-device-status-laundry')).toHaveTextContent(/% · Idle/);
    expect(screen.queryByText('No consumption today')).not.toBeInTheDocument();
  });

  it('keeps sub-kWh device totals in kWh in Live Energy', () => {
    const scenario = getEnergyDashboardScenario('default');
    const dashboard = {
      ...scenario.dashboard,
      topConsumers: scenario.dashboard.topConsumers.map((consumer, index) =>
        index === 0 ? { ...consumer, energyKWh: 0.18 } : consumer
      ),
    };

    renderDashboardPage('default', { dashboard });

    expect(screen.getAllByText('0.18 kWh').length).toBeGreaterThan(0);
    expect(screen.queryByText('180 Wh')).not.toBeInTheDocument();
  });

  it('shows zero live power for idle demo devices', () => {
    const scenario = getEnergyDashboardScenario('default');
    const idleConsumers = scenario.dashboard.topConsumers.filter(
      (consumer) => consumer.status === 'idle'
    );

    expect(idleConsumers).not.toHaveLength(0);
    expect(idleConsumers.every((consumer) => consumer.powerW === 0)).toBe(true);
  });

  it('does not include idle devices in the live-load orb', () => {
    renderDashboardPage('default');

    const orbColors = new Set(
      screen.getAllByTestId('load-orb-dot').map((dot) => dot.getAttribute('fill'))
    );
    expect(orbColors).not.toContain('#10b981');
    expect(orbColors).not.toContain('#f43f5e');
  });

  it('shows untracked consumption in gray when no device has tracked consumption', async () => {
    const scenario = getEnergyDashboardScenario('default');
    const dashboard = {
      ...scenario.dashboard,
      topConsumers: scenario.dashboard.topConsumers.map((consumer) => ({
        ...consumer,
        energyKWh: 0,
        powerW: 0,
        status: 'idle' as const,
      })),
    };

    renderDashboardPage('default', { dashboard });

    const dots = screen.getAllByTestId('load-orb-dot');
    expect(dots).not.toHaveLength(0);
    expect(dots.every((dot) => dot.getAttribute('fill') === '#94a3b8')).toBe(true);
    expect(screen.getAllByText('Untracked')).toHaveLength(2);
    expect(screen.getByText('100% of consumption today')).toBeInTheDocument();
    expect(screen.queryByText('Not assigned to a tracked device')).not.toBeInTheDocument();
    expect(screen.getByTestId('load-orb-consumption')).toHaveTextContent('22.6 kWh today');
    await waitFor(() => {
      expect(screen.getAllByTestId('energy-now-chart-layer')).toHaveLength(1);
    });
  });

  it('subtracts tracked devices from whole-home consumption to calculate untracked energy', () => {
    const scenario = getEnergyDashboardScenario('default');
    const selectedRange = scenario.dashboard.selectedRange;
    const dashboard = {
      ...scenario.dashboard,
      topConsumers: scenario.dashboard.topConsumers.map((consumer, index) => ({
        ...consumer,
        energyKWh: index < 3 ? 4 : 0,
      })),
      ranges: {
        ...scenario.dashboard.ranges,
        [selectedRange]: {
          ...scenario.dashboard.ranges[selectedRange],
          totalUsageKWh: 20,
        },
      },
    };

    renderDashboardPage('default', { dashboard });

    expect(screen.getAllByText('8.0 kWh')).toHaveLength(2);
    expect(screen.getByTestId('load-orb-consumption')).toHaveTextContent('20.0 kWh today');
  });

  it('allows arranging Energy usage and KPI cards in Customize and restores their order', () => {
    localStorage.setItem('navet-energy-usage-card-order', JSON.stringify(['usage', 'kpi:peak']));
    renderDashboardPage('default', { isEditMode: true });
    const usage = screen.getByTestId('energy-usage-card');
    expect(screen.getByRole('button', { name: 'Arrange Energy usage' })).toBeInTheDocument();
    const metrics = screen.getAllByTestId(/^energy-usage-metric-/);
    for (const metric of metrics) {
      expect(
        metric.closest('[data-energy-card-id]')?.querySelector('[data-dashboard-drag-handle]')
      ).toBeInTheDocument();
      expect(usage.compareDocumentPosition(metric)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('keeps device cards in the overview grid during Customize so they can fill gaps beside Live Energy', () => {
    renderDashboardPage('default', { isEditMode: true });
    expect(screen.getByTestId('energy-overview-grid')).toHaveClass('grid-flow-row-dense');
    const devices = document.querySelector('[data-overview-module="devices"]') as HTMLElement;
    expect(devices).toHaveClass('contents');
    expect(devices.style.gridColumn).toBe('');
    const card = devices.querySelector('[data-energy-card-id]');
    expect(card).toBeInTheDocument();
    let ancestor = card?.parentElement;
    while (ancestor && ancestor !== devices) {
      expect(ancestor).toHaveClass('contents');
      ancestor = ancestor.parentElement;
    }
  });

  it('places Energy modules in the shared flowing dashboard grid', () => {
    renderDashboardPage('default');

    const grid = screen.getByTestId('energy-overview-grid');
    const usage = screen.getByTestId('energy-usage-card');
    const usageMetrics = screen.getAllByTestId(/^energy-usage-metric-/);
    const live = document.querySelector('[data-overview-module="live"]');
    const devices = document.querySelector('[data-overview-module="devices"]');
    expect(grid).toHaveClass('grid-flow-row-dense');
    expect(grid.style.gridTemplateColumns).toContain('repeat(');
    expect(document.querySelector('[data-overview-module="trend"]')).not.toBeInTheDocument();
    expect(usageMetrics).toHaveLength(4);
    expect(
      usageMetrics.every(
        (metric) =>
          metric.classList.contains('col-span-2') && metric.classList.contains('row-span-2')
      )
    ).toBe(true);
    expect(usage.parentElement?.style.gridColumn).toContain('span');
    expect(usage.parentElement?.style.gridRow).toBe('span 4');
    expect((live as HTMLElement).style.gridColumn).toContain('span');
    expect(devices).toHaveClass('contents');
    expect((live as HTMLElement).compareDocumentPosition(usage)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(usageMetrics[0]?.compareDocumentPosition(usage)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('fits the Energy grid into the available width beside an expanded companion panel', async () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1366 });
    setVisualViewportSize(1366, 1024);
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(962);
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    try {
      renderDashboardPage('default');
      const grid = screen.getByTestId('energy-overview-grid');
      const inner = grid.parentElement;
      expect(grid.style.gridTemplateColumns).toBe('repeat(12, minmax(80px, 1fr))');
      await waitFor(() => expect(inner?.style.transform).toBe(`scale(${962 / 1136})`));
      expect(inner?.style.width).toBe('1136px');
      await waitFor(() =>
        expect(inner?.parentElement?.style.height).toBe(`${600 * (962 / 1136)}px`)
      );
    } finally {
      width.mockRestore();
      height.mockRestore();
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: previousInnerWidth,
      });
    }
  });

  it('uses the phone card-grid gap so four minimum tracks fit the available width', () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    setVisualViewportSize(390, 844);
    setMediaQueryMatch(PHONE_QUERY, true);
    try {
      renderDashboardPage('default');
      expect(screen.getByTestId('energy-overview-grid')).toHaveStyle({ gap: '8px' });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: previousInnerWidth,
      });
    }
  });

  it('uses the active accent for whole-home Energy usage', () => {
    useThemeStore.setState({
      ...useThemeStore.getState(),
      primaryColor: 'blue',
      customPrimaryColor: null,
    });
    renderDashboardPage('default', {
      currentLoadStatisticId: 'sensor.house_power',
      historySources: [
        {
          id: 'home',
          label: 'Home use',
          entityId: 'sensor.house_power',
          color: '#f97316',
          valueKind: 'power',
        },
      ],
    });

    const usage = screen.getByTestId('energy-usage-card');
    const chart = usage.querySelector('svg[role="img"]');

    expect(chart?.querySelector('path[stroke]')).toHaveAttribute('stroke', '#3b82f6');
  });

  it('expands the KPI row across the wide Energy lane before dense-flow device cards', () => {
    setVisualViewportSize(1800, 1000);
    renderDashboardPage('default');

    const usageMetrics = screen.getAllByTestId(/^energy-usage-metric-/);
    expect(usageMetrics).toHaveLength(4);
    expect(
      usageMetrics.every((metric) => metric.parentElement?.style.gridColumn === 'span 3')
    ).toBe(true);
  });

  it('uses the full Home grid width for Live Energy and Energy usage in portrait', () => {
    setMediaQueryMatch(PORTRAIT_TABLET_QUERY, true);
    renderDashboardPage('default');

    const grid = screen.getByTestId('energy-overview-grid');
    const live = document.querySelector('[data-overview-module="live"]') as HTMLElement;
    const usage = screen.getByTestId('energy-usage-card');
    const liveLayout = screen.getByTestId('energy-live-layout');

    expect(grid).toHaveAttribute('data-orientation-layout', 'portrait');
    expect(live.style.gridColumn).toBe('span 8 / span 8');
    expect(live.style.gridRow).toBe('span 5 / span 5');
    expect(usage.parentElement?.style.gridColumn).toBe('span 8 / span 8');
    expect(liveLayout).toHaveAttribute('data-layout', 'split');
    expect(liveLayout).toHaveClass('grid');
  });

  it('keeps range controls in the summary lane without duplicate source pills', () => {
    renderDashboardPage('default');

    const summary = screen.getByRole('navigation', { name: 'Energy' });
    expect(within(summary).queryByText('Now')).not.toBeInTheDocument();
    expect(within(summary).queryByText('Grid import')).not.toBeInTheDocument();
    expect(screen.getByTestId('energy-usage-metric-grid')).toHaveTextContent('Grid import');
    const layout = screen.getByTestId('energy-live-layout');
    expect(layout).toHaveClass('flex-col');
    expect(within(layout).getByTestId('load-orb-consumption')).toBeInTheDocument();
    expect(within(layout).getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    expect(within(layout).queryByText('Imported today')).not.toBeInTheDocument();
    expect(within(layout).queryByText('Generated today')).not.toBeInTheDocument();
    expect(within(layout).queryByText('Status')).not.toBeInTheDocument();
    expect(
      within(layout).queryByText(
        'Wrong sensors or missing sources should be corrected in Home Assistant Energy.'
      )
    ).not.toBeInTheDocument();
  });

  it('switches live energy between device, room, and source views', () => {
    renderDashboardPage('default');

    expect(screen.getByRole('button', { name: 'Devices' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Device')).toBeInTheDocument();
    expect(screen.queryByTestId('energy-sources-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rooms' }));

    expect(screen.getByRole('button', { name: 'Rooms' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Device')).not.toBeInTheDocument();
    const roomRows = screen.getAllByTestId('energy-room-row');
    expect(roomRows.length).toBeGreaterThan(0);
    expect(within(roomRows[0] as HTMLElement).getByText('Whole house')).toBeInTheDocument();
    expect(within(roomRows[0] as HTMLElement).getByText('3600 W')).toBeInTheDocument();
    expect(within(roomRows[0] as HTMLElement).getByText('18.9 kWh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));

    expect(screen.getByRole('button', { name: 'Sources' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Device')).not.toBeInTheDocument();
    const sourceCard = screen.getByTestId('energy-sources-card');
    expect(sourceCard).toBeInTheDocument();
    expect(within(sourceCard).getByText('Grid import')).toBeInTheDocument();
  });

  it('keeps Energy Flow and explanatory insight sections out of Overview', () => {
    renderDashboardPage('default');

    expect(screen.queryByText('Energy Flow')).not.toBeInTheDocument();
    expect(screen.queryByText('Why it looks this way')).not.toBeInTheDocument();
    expect(screen.queryByText(/biggest live driver/)).not.toBeInTheDocument();
  });

  it('keeps the sources card on the theme-native shell instead of forcing an accent shell', () => {
    useThemeStore.setState({
      ...useThemeStore.getState(),
      theme: 'dark',
      followSystemTheme: false,
      primaryColor: 'custom',
      customPrimaryColor: '#12abef',
      wallpaper: null,
    });

    renderDashboardPage('default');

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));

    const sourcesCard = screen.getByTestId('energy-sources-card');
    expect(sourcesCard.className).not.toContain('bg-gradient-to-br');
    expect(sourcesCard.className).not.toContain('from-blue-900/90');
    expect(sourcesCard.className).not.toContain('to-blue-950/95');
    expect(sourcesCard.className).not.toContain('border-blue-700/30');
    expect(sourcesCard.getAttribute('style')).toBeNull();
  });

  it('does not render the energy dashboard hero', () => {
    renderDashboardPage('default');

    expect(screen.queryByText('Energy at a glance.')).not.toBeInTheDocument();
    expect(screen.queryByText('See where power is flowing right now.')).not.toBeInTheDocument();
  });

  it('renders custom energy cards in their own lane', () => {
    renderDashboardPage('default', {
      energyCustomCards: [
        {
          id: 'custom-energy-card',
          type: 'info',
          size: 'medium',
          room: '__energy__',
          createdAt: 1,
          data: {
            sensorEntityIds: ['home_assistant:sensor.remaining_electricity'],
            sensorCategoryFilter: 'energy',
          },
        },
      ],
      energyOrderedCardIds: ['custom-energy-card'],
    });

    expect(screen.getByText('Energy card custom-energy-card')).toBeInTheDocument();
  });

  it('progressively mounts many custom energy cards in low-power mode', async () => {
    useSettingsStore.getState().updateSettings({
      disableAnimations: true,
      effectsQuality: 'low',
      lowPowerMode: true,
    });
    let idleCallback:
      | ((deadline: { didTimeout: boolean; timeRemaining: () => number }) => void)
      | undefined;
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: vi.fn(
        (callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
          idleCallback = callback;
          return 1;
        }
      ),
    });
    const scenario = getEnergyDashboardScenario('default');
    const energyCustomCards = Array.from({ length: 6 }, (_, index) => ({
      id: `custom-energy-card-${index + 1}`,
      type: 'info' as const,
      size: 'medium' as const,
      room: '__energy__',
      createdAt: index + 1,
      data: {
        sensorCategoryFilter: 'energy',
      },
    }));

    renderDashboardPage('default', {
      dashboard: {
        ...scenario.dashboard,
        topConsumers: [],
      },
      energyCustomCards,
      energyOrderedCardIds: energyCustomCards.map((card) => card.id),
    });

    expect(await screen.findByText('Energy card custom-energy-card-1')).toBeInTheDocument();
    expect(screen.queryByText('Energy card custom-energy-card-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Energy card custom-energy-card-6')).not.toBeInTheDocument();
    await waitFor(() => expect(idleCallback).toBeTypeOf('function'));

    act(() => {
      idleCallback?.({ didTimeout: false, timeRemaining: () => 8 });
    });

    expect(await screen.findByText('Energy card custom-energy-card-2')).toBeInTheDocument();
    expect(screen.queryByText('Energy card custom-energy-card-3')).not.toBeInTheDocument();
  });

  it('passes custom energy card updates through without nesting the data payload again', () => {
    const onUpdateCard = vi.fn();

    renderDashboardPage('default', {
      energyCustomCards: [
        {
          id: 'custom-energy-card',
          type: 'info',
          size: 'medium',
          room: '__energy__',
          createdAt: 1,
          data: {
            sensorCategoryFilter: 'energy',
          },
        },
      ],
      energyOrderedCardIds: ['custom-energy-card'],
      onUpdateCard,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update energy card' }));

    expect(onUpdateCard).toHaveBeenCalledWith('custom-energy-card', {
      data: {
        sensorCategoryFilter: 'energy',
        sensorEntityIds: ['home_assistant:sensor.remaining_electricity'],
      },
    });
  });
});
