import { getDashboardClientIdentity } from '@navet/app/features/dashboard/clients/dashboard-client-identity';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type CompanionCard,
  createDashboardDefinition,
  createLegacyDashboardCollection,
  type DashboardActivationSource,
  sanitizeDashboardCollection,
} from './dashboard-collection';
import { useDashboardCollectionStore } from './dashboard-collection-store';

function createCollection(clientId: string, assignedDashboardId = 'home') {
  const home = createDashboardDefinition({ id: 'home', name: 'Home' });
  const upstairs = createDashboardDefinition({ id: 'upstairs', name: 'Upstairs' });

  return sanitizeDashboardCollection(
    {
      schemaVersion: 1,
      defaultDashboardId: 'home',
      order: ['home', 'upstairs'],
      dashboardsById: { home, upstairs },
      dashboardIdByClientId: { [clientId]: assignedDashboardId },
    },
    createLegacyDashboardCollection({ homeLayout: null })
  );
}

function installCollection(
  clientId: string,
  {
    activeDashboardId = 'home',
    activeSource = 'assignment',
    assignedDashboardId = 'home',
  }: {
    activeDashboardId?: string;
    activeSource?: DashboardActivationSource;
    assignedDashboardId?: string;
  } = {}
) {
  useDashboardCollectionStore.setState({
    collection: createCollection(clientId, assignedDashboardId),
    activeDashboardId,
    activeSource,
    pendingAssignedDashboardId: null,
    layoutHistory: { future: [], past: [] },
  });
}

describe('dashboard collection store', () => {
  let clientId: string;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    clientId = getDashboardClientIdentity().id;
    installCollection(clientId);
  });

  it('keeps companion selections with their dashboard across activation, duplication and profile reload', () => {
    const settings = {
      cameraEntityId: 'home_assistant:camera.front',
      weatherEntityId: null,
      showSecurity: false,
      cards: [
        { id: 'note', type: 'note', text: 'Evening routine' },
        { id: 'lamp', type: 'entity', entityId: 'homey:light.kitchen' },
      ] as CompanionCard[],
    };
    useDashboardCollectionStore.getState().updateCompanion('home', settings);
    useDashboardCollectionStore.getState().activateDashboard('upstairs');
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById.upstairs.companion
    ).toEqual({ showSecurity: true });
    useDashboardCollectionStore.getState().activateDashboard('home');
    expect(useDashboardCollectionStore.getState().collection.dashboardsById.home.companion).toEqual(
      settings
    );
    const copiedId = useDashboardCollectionStore.getState().duplicateDashboard('home', 'Evening');
    if (!copiedId) throw new Error('Expected dashboard duplication');
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById[copiedId].companion?.cards
    ).not.toBe(
      useDashboardCollectionStore.getState().collection.dashboardsById.home.companion?.cards
    );
    const serialized = JSON.parse(
      JSON.stringify(useDashboardCollectionStore.getState().collection)
    );
    useDashboardCollectionStore.getState().replaceCollection(serialized);
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById[copiedId].companion
    ).toEqual(settings);
  });

  it('keeps previewing separate from the device assignment until explicitly selected', () => {
    const store = useDashboardCollectionStore.getState();

    store.activateDashboard('upstairs', 'preview');

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'upstairs',
      activeSource: 'preview',
    });
    expect(useDashboardCollectionStore.getState().collection.dashboardIdByClientId[clientId]).toBe(
      'home'
    );

    useDashboardCollectionStore.getState().assignDashboard(clientId, 'upstairs');

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'upstairs',
      activeSource: 'assignment',
    });
    expect(useDashboardCollectionStore.getState().collection.dashboardIdByClientId[clientId]).toBe(
      'upstairs'
    );
  });

  it('defers a remote assignment change until the shell reports a safe navigation point', () => {
    const remoteCollection = createCollection(clientId, 'upstairs');

    useDashboardCollectionStore.getState().replaceCollection(remoteCollection);

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'home',
      activeSource: 'assignment',
      pendingAssignedDashboardId: 'upstairs',
    });

    useDashboardCollectionStore.getState().applyPendingAssignment();

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'upstairs',
      activeSource: 'assignment',
      pendingAssignedDashboardId: null,
    });
  });

  it('does not interrupt an explicit preview when a remote assignment changes', () => {
    installCollection(clientId, {
      activeDashboardId: 'upstairs',
      activeSource: 'preview',
      assignedDashboardId: 'home',
    });

    useDashboardCollectionStore
      .getState()
      .replaceCollection(createCollection(clientId, 'upstairs'));

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'upstairs',
      activeSource: 'preview',
      pendingAssignedDashboardId: null,
    });
  });

  it('honors a direct dashboard link when the shared collection arrives later', () => {
    window.history.replaceState({}, '', '/dashboard/upstairs');

    useDashboardCollectionStore.getState().replaceCollection(createCollection(clientId, 'home'));

    expect(useDashboardCollectionStore.getState()).toMatchObject({
      activeDashboardId: 'upstairs',
      activeSource: 'link',
      pendingAssignedDashboardId: null,
    });
  });

  it('remaps an active dashboard and its device assignment atomically when deleted', () => {
    installCollection(clientId, {
      activeDashboardId: 'upstairs',
      activeSource: 'assignment',
      assignedDashboardId: 'upstairs',
    });

    useDashboardCollectionStore.getState().deleteDashboard('upstairs');

    const state = useDashboardCollectionStore.getState();
    expect(state.activeDashboardId).toBe('home');
    expect(state.collection.order).toEqual(['home']);
    expect(state.collection.dashboardIdByClientId[clientId]).toBe('home');
  });

  it('keeps layout history isolated to the active dashboard', () => {
    useDashboardCollectionStore.getState().activateDashboard('upstairs', 'preview');
    useDashboardCollectionStore
      .getState()
      .updateActiveHomeLayout((layout) => ({ ...layout, cardIds: ['light.upstairs'] }));

    const state = useDashboardCollectionStore.getState();
    expect(state.collection.dashboardsById.upstairs.homeLayout.cardIds).toEqual([
      'home_assistant:light.upstairs',
    ]);
    expect(state.collection.dashboardsById.home.homeLayout.cardIds).toEqual([]);
    expect(state.layoutHistory.past).toHaveLength(1);

    state.activateDashboard('home', 'preview');

    expect(useDashboardCollectionStore.getState().layoutHistory.past).toEqual([]);
  });
});
