import { integrationStore } from '@navet/app/stores/integration-store';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryEntityOptions } from '../use-history-entity-options';

const temperature: NavetEntity = {
  id: 'homey:kitchen-temperature',
  canonicalId: 'homey:kitchen-temperature',
  externalId: 'kitchen-temperature',
  providerId: 'homey',
  type: 'sensor',
  name: 'Kitchen temperature',
  primaryState: 21,
  availability: 'available',
  attributes: {},
  capabilities: [],
};
const humidity: NavetEntity = {
  ...temperature,
  id: 'home_assistant:sensor.humidity',
  canonicalId: 'home_assistant:sensor.humidity',
  externalId: 'sensor.humidity',
  providerId: 'home_assistant',
  name: 'Humidity',
};

beforeEach(async () => {
  await resetAppStores();
  integrationStore.setState({
    selectedProviderIds: ['homey'],
    providerEntitiesByCanonicalId: {
      [temperature.canonicalId]: temperature,
      [humidity.canonicalId]: humidity,
    },
  });
});

describe('history entity option subscriptions', () => {
  it('keeps the consumer idle during live sensor updates', () => {
    const render = vi.fn();
    const { result } = renderHook(() => {
      render();
      return useHistoryEntityOptions();
    });
    const initialOptions = result.current;
    const initialRenders = render.mock.calls.length;

    for (let reading = 22; reading < 47; reading += 1) {
      act(() => {
        integrationStore.setState({
          providerEntitiesByCanonicalId: {
            [temperature.canonicalId]: {
              ...temperature,
              primaryState: reading,
              attributes: { battery: reading },
              lastUpdated: `2026-10-14T10:${reading}:00Z`,
            },
            [humidity.canonicalId]: { ...humidity, name: `Unselected sensor ${reading}` },
          },
        });
      });
    }

    expect(render).toHaveBeenCalledTimes(initialRenders);
    expect(result.current).toBe(initialOptions);
  });

  it('refreshes renamed, added and removed entities and keeps options sorted', () => {
    const { result } = renderHook(useHistoryEntityOptions);
    const second = { ...temperature, canonicalId: 'homey:bedroom', name: 'Bedroom' };
    const renamed = { ...temperature, name: 'Living room' };
    act(() => {
      integrationStore.setState({
        providerEntitiesByCanonicalId: { [temperature.canonicalId]: renamed },
      });
    });
    expect(result.current.map(({ name }) => name)).toEqual(['Living room']);

    act(() => {
      integrationStore.setState({
        providerEntitiesByCanonicalId: {
          [temperature.canonicalId]: renamed,
          [second.canonicalId]: second,
        },
      });
    });
    expect(result.current.map(({ name }) => name)).toEqual(['Bedroom', 'Living room']);

    act(() => {
      integrationStore.setState({
        providerEntitiesByCanonicalId: { [second.canonicalId]: second },
      });
    });
    expect(result.current.map(({ id }) => id)).toEqual([second.canonicalId]);
  });

  it('refreshes selected sources and their connection status', () => {
    const { result } = renderHook(useHistoryEntityOptions);
    act(() => {
      integrationStore.setState({ selectedProviderIds: ['home_assistant', 'homey'] });
    });
    expect(result.current.map(({ id }) => id)).toEqual([
      humidity.canonicalId,
      temperature.canonicalId,
    ]);
    expect(result.current.find(({ id }) => id === temperature.canonicalId)?.connected).toBe(false);

    act(() => {
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          homey: { ...state.providerRuntime.homey, connected: true },
        },
      }));
    });
    expect(result.current.find(({ id }) => id === temperature.canonicalId)?.connected).toBe(true);

    act(() => {
      integrationStore.setState({ selectedProviderIds: ['home_assistant'] });
    });
    expect(result.current.map(({ id }) => id)).toEqual([humidity.canonicalId]);
  });
});
