import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useDashboardEntityVisibility } from '../use-dashboard-entity-visibility';

beforeEach(async () => {
  await resetAppStores();
});

it('waits for provider hydration before preserving legacy helpers and keeps newly discovered helpers opt-in', () => {
  useDashboardEntitiesStore
    .getState()
    .replaceDashboardEntitiesState({ hiddenEntityIds: [], onboardingCompleted: true });
  const helper: NavetEntity = {
    id: 'home_assistant:number.legacy',
    canonicalId: 'home_assistant:number.legacy',
    providerId: 'home_assistant',
    externalId: 'number.legacy',
    type: 'helper',
    name: 'Legacy',
    primaryState: 5,
    availability: 'available',
    attributes: {},
    capabilities: ['number_value'],
  };
  const runtime = integrationStore.getState().providerRuntime;
  const lock: NavetEntity = {
    ...helper,
    id: 'home_assistant:lock.front_door',
    canonicalId: 'home_assistant:lock.front_door',
    externalId: 'lock.front_door',
    type: 'lock',
    attributes: { deviceId: 'front-door' },
    capabilities: ['lock'],
  };
  const attachedAction: NavetEntity = {
    ...helper,
    id: 'home_assistant:button.identify',
    canonicalId: 'home_assistant:button.identify',
    externalId: 'button.identify',
    attributes: { deviceId: 'front-door' },
    capabilities: ['press'],
  };
  const configValue: NavetEntity = {
    ...helper,
    id: 'home_assistant:number.configuration',
    canonicalId: 'home_assistant:number.configuration',
    attributes: {
      entityCategory: 'config',
      helperType: 'number',
      value: 5,
      writable: true,
      min: 0,
      max: 10,
      step: 1,
    },
  };
  integrationStore.setState({
    providerRuntime: {
      ...runtime,
      home_assistant: { ...runtime.home_assistant, entitiesHydrated: false },
    },
    providerEntitiesByProviderId: { home_assistant: {} },
  });
  const { result } = renderHook(() => useDashboardEntityVisibility());
  expect(useDashboardEntitiesStore.getState().legacyHelperVisibilityProviderIds).toContain(
    'home_assistant'
  );
  act(() =>
    integrationStore.setState({
      providerRuntime: {
        ...runtime,
        home_assistant: { ...runtime.home_assistant, entitiesHydrated: true },
      },
      providerEntitiesByProviderId: {
        home_assistant: Object.fromEntries(
          [helper, lock, attachedAction, configValue].map((entity) => [entity.canonicalId, entity])
        ),
      },
    })
  );
  expect(result.current.explicitlyShownEntityIds).toEqual([helper.canonicalId]);
  expect(useDashboardEntitiesStore.getState().legacyHelperVisibilityProviderIds).not.toContain(
    'home_assistant'
  );
  act(() =>
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: {
          [helper.canonicalId]: helper,
          'home_assistant:number.new': {
            ...helper,
            id: 'home_assistant:number.new',
            canonicalId: 'home_assistant:number.new',
            externalId: 'number.new',
          },
        },
      },
    })
  );
  expect(result.current.explicitlyShownEntityIds).toEqual([helper.canonicalId]);
});
