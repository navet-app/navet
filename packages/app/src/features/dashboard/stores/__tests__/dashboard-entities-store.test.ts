import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardEntitiesStore } from '../dashboard-entities-store';

describe('useDashboardEntitiesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDashboardEntitiesStore.setState(useDashboardEntitiesStore.getInitialState(), true);
  });

  it('requires an explicit add for helpers, including after onboarding and visibility resets', async () => {
    const store = () => useDashboardEntitiesStore.getState();
    store().completeOnboarding(['light.kitchen', 'input_number.target'], false);
    expect(store().explicitlyShownEntityIds).toEqual([]);
    store().showAllEntities();
    expect(store().explicitlyShownEntityIds).toEqual([]);
    store().showEntity('input_number.target');
    store().showEntity('input_number.target');
    expect(store().explicitlyShownEntityIds).toEqual(['home_assistant:input_number.target']);
    await useDashboardEntitiesStore.persist.rehydrate();
    expect(store().explicitlyShownEntityIds).toEqual(['home_assistant:input_number.target']);
    store().hideEntity('input_number.target');
    store().resetHiddenEntities();
    expect(store().explicitlyShownEntityIds).toEqual([]);
    store().replaceDashboardEntitiesState({ hiddenEntityIds: [], onboardingCompleted: true });
    expect(store().explicitlyShownEntityIds).toEqual([]);
  });

  it('locks, unlocks, and toggles cards without duplicating ids', () => {
    useDashboardEntitiesStore.getState().lockCard('light.kitchen');
    useDashboardEntitiesStore.getState().lockCard('light.kitchen');

    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual(['light.kitchen']);

    useDashboardEntitiesStore.getState().toggleCardLock('light.kitchen');
    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual([]);

    useDashboardEntitiesStore.getState().toggleCardLock('custom-note');
    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual(['custom-note']);

    useDashboardEntitiesStore.getState().unlockCard('custom-note');
    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual([]);
  });

  it('hydrates persisted locked card ids and drops invalid entries', async () => {
    localStorage.setItem(
      'navet-dashboard-entities',
      JSON.stringify({
        state: {
          hiddenEntityIds: ['light.hidden'],
          lockedCardIds: ['light.kitchen', 42, 'custom-note', 'light.kitchen'],
          onboardingCompleted: true,
        },
        version: 0,
      })
    );

    await useDashboardEntitiesStore.persist.rehydrate();

    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual([
      'light.kitchen',
      'custom-note',
    ]);
  });

  it('keeps normal sensors hidden until explicitly shown', () => {
    useDashboardEntitiesStore.getState().showEntity('sensor.kitchen_temperature');
    useDashboardEntitiesStore.getState().showEntity('binary_sensor.front_window');
    useDashboardEntitiesStore.getState().showEntity('light.kitchen');

    expect(useDashboardEntitiesStore.getState().shownSensorEntityIds).toEqual([
      'home_assistant:sensor.kitchen_temperature',
      'home_assistant:binary_sensor.front_window',
    ]);

    useDashboardEntitiesStore.getState().hideEntity('sensor.kitchen_temperature');

    expect(useDashboardEntitiesStore.getState().shownSensorEntityIds).toEqual([
      'home_assistant:binary_sensor.front_window',
    ]);
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toContain(
      'home_assistant:sensor.kitchen_temperature'
    );
  });

  it('marks sensors visible when onboarding starts with all entities', () => {
    useDashboardEntitiesStore
      .getState()
      .completeOnboarding(['light.kitchen', 'sensor.power', 'binary_sensor.motion'], false);

    expect(useDashboardEntitiesStore.getState().shownSensorEntityIds).toEqual([
      'home_assistant:sensor.power',
      'home_assistant:binary_sensor.motion',
    ]);
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual([]);
  });
});
