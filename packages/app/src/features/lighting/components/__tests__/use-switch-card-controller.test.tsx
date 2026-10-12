import { renderHookWithProviders } from '@navet/app/test/render';
import type { NavetEntity } from '@navet/core/types';
import { describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  siblingIds: [] as string[],
  siblingEntityRecord: {} as Record<string, unknown>,
  providerEntity: null as NavetEntity | null,
  toggleAction: vi.fn(() => vi.fn()),
}));

vi.mock('@navet/app/hooks', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  useProviderEntityModel: vi.fn(() => testState.providerEntity),
  useProviderEntitySnapshot: vi.fn(() => undefined),
  useProviderEntitySnapshotRecord: vi.fn(() => testState.siblingEntityRecord),
  useProviderSwitchTopology: () => ({ deviceId: null, siblingIds: testState.siblingIds }),
  useTheme: () => ({
    accentColor: 'blue',
    colors: {
      switch: {
        on: { accent: 'text-green-500' },
        off: { accent: 'text-slate-500' },
      },
    },
    theme: 'dark',
  }),
}));

vi.mock('@navet/app/components/shared/entity-card-interaction-controller', () => ({
  useEntityCardInteractionController: () => ({
    interactionMode: 'control-first',
    cardProps: {},
    buttonProps: {},
  }),
}));

vi.mock('../use-switch-card-appearance', () => ({
  useSwitchCardAppearance: () => ({
    HeaderIconComponent: null,
    headerIconText: null,
    selectedIcon: '',
    setSelectedIcon: vi.fn(),
    tintColor: '',
    setTintColor: vi.fn(),
  }),
}));

vi.mock('../use-switch-metric-formatters', () => ({
  useSwitchMetricFormatters: () => ({
    formatMetricValue: vi.fn(),
    getMetricLabel: vi.fn(),
    renderMetricIcon: vi.fn(),
  }),
}));

vi.mock('../use-switch-metric-state', () => ({
  useSwitchMetricState: () => ({
    availableMetrics: [],
    handleMetricToggle: vi.fn(),
    hasMetrics: false,
    metricLimit: 0,
    selectedMetricLabels: [],
    selectedMetrics: [],
  }),
}));

vi.mock('../use-switch-reset-timer-cleanup', () => ({
  useSwitchResetTimerCleanup: vi.fn(),
}));

vi.mock('../use-switch-toggle-action', () => ({
  useSwitchToggleAction: testState.toggleAction,
}));

import { useSwitchCardController } from '../use-switch-card-controller';

describe('useSwitchCardController', () => {
  it('uses the normalized press capability and source ownership for standalone action helpers', () => {
    testState.providerEntity = {
      id: 'homey:action.identify',
      canonicalId: 'homey:action.identify',
      externalId: 'action.identify',
      providerId: 'homey',
      type: 'helper',
      name: 'Identify',
      primaryState: null,
      availability: 'available',
      attributes: {},
      capabilities: ['press'],
    };
    try {
      const { unmount } = renderHookWithProviders(() =>
        useSwitchCardController({
          id: 'homey:action.identify',
          name: 'Identify',
          size: 'small',
          serviceAction: 'turn_on',
        })
      );
      expect(testState.toggleAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          providerId: 'homey',
          resolvedServiceAction: 'press',
        })
      );
      unmount();
    } finally {
      testState.providerEntity = null;
    }
  });
  it('does not infer Home Assistant from arbitrary dotted ids', () => {
    testState.siblingIds = [];
    testState.siblingEntityRecord = {};
    const { result } = renderHookWithProviders(() =>
      useSwitchCardController({
        id: 'custom.metric',
        name: 'Custom Metric',
        size: 'small',
        initialState: false,
      })
    );

    expect(result.current.isOn).toBe(false);
    expect(result.current.siblingEntities).toEqual([]);
  });

  it('compacts repeated device prefixes for switch card titles', () => {
    testState.siblingIds = ['switch.pax_calima_power_on_behaviour'];
    testState.siblingEntityRecord = {
      'switch.pax_calima_power_on_behaviour': {
        entityId: 'switch.pax_calima_power_on_behaviour',
        state: 'off',
        attributes: {
          friendly_name: 'Pax Calima Power-on behaviour',
        },
      },
    };

    const { result } = renderHookWithProviders(() =>
      useSwitchCardController({
        id: 'switch.pax_calima_boost_mode',
        name: 'Pax Calima Boost mode',
        size: 'small',
        initialState: false,
      })
    );

    expect(result.current.displayName).toBe('Boost mode');
  });
});
