import { describe, expect, it } from 'vitest';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  deleteDashboardFromCollection,
  getCompanionCards,
  resolveDashboard,
  resolveDashboardNavigationRooms,
  sanitizeDashboardCollection,
  sanitizeDashboardCompanion,
} from './dashboard-collection';

describe('dashboard collection contract', () => {
  it('migrates the existing Home layout into one stable dashboard without changing its cards', () => {
    const collection = createLegacyDashboardCollection({
      homeLayout: {
        mode: 'flow',
        showHero: true,
        cardIds: ['light.upstairs', 'custom-note'],
        sections: [],
        cardSectionAssignments: {},
      },
      cardSizes: {
        'light.upstairs': 'small',
        'light.downstairs': 'large',
        'custom-note': 'medium',
      },
      customCards: [
        {
          id: 'custom-note',
          type: 'note',
          size: 'medium',
          room: '__home__',
          createdAt: 1,
        },
      ],
    });

    expect(collection.order).toEqual(['home']);
    expect(collection.defaultDashboardId).toBe('home');
    expect(collection.dashboardsById.home.homeLayout.cardIds).toEqual([
      'home_assistant:light.upstairs',
      'custom-note',
    ]);
    expect(collection.dashboardsById.home.homeCardSizes).toEqual({
      'home_assistant:light.upstairs': 'small',
      'custom-note': 'medium',
    });
    expect(collection.dashboardsById.home.homeCustomCards).toHaveLength(1);
    expect(collection.dashboardsById.home.homeRoomNames).toBeNull();
  });

  it('resolves direct links before previews, device assignments, and the workspace default', () => {
    const home = createDashboardDefinition({ id: 'home', name: 'Home' });
    const upstairs = createDashboardDefinition({ id: 'upstairs', name: 'Upstairs' });
    const wall = createDashboardDefinition({ id: 'wall', name: 'Wall' });
    const collection = sanitizeDashboardCollection(
      {
        schemaVersion: 1,
        defaultDashboardId: 'home',
        order: ['home', 'upstairs', 'wall'],
        dashboardsById: { home, upstairs, wall },
        dashboardIdByClientId: { sonoff: 'wall' },
      },
      createLegacyDashboardCollection({ homeLayout: null })
    );

    expect(
      resolveDashboard(collection, {
        clientId: 'sonoff',
        previewDashboardId: 'upstairs',
        directDashboardId: 'home',
      })
    ).toEqual({ dashboardId: 'home', source: 'link' });
    expect(
      resolveDashboard(collection, { clientId: 'sonoff', previewDashboardId: 'upstairs' })
    ).toEqual({ dashboardId: 'upstairs', source: 'preview' });
    expect(resolveDashboard(collection, { clientId: 'sonoff' })).toEqual({
      dashboardId: 'wall',
      source: 'assignment',
    });
  });

  it('builds an upstairs lights dashboard from room selection without one-by-one card setup', () => {
    const dashboard = createDashboardDefinition({
      id: 'upstairs',
      name: 'Upstairs lights',
      source: {
        kind: 'rooms',
        roomNames: ['Bedroom', 'Landing'],
        include: 'lights',
        devices: [
          { id: 'homey:light.bed', room: 'Bedroom', type: 'lights', size: 'small' },
          { id: 'openhab:light.landing', room: 'Landing', type: 'lights', size: 'medium' },
          { id: 'homey:sensor.bed', room: 'Bedroom', type: 'sensors', size: 'small' },
          { id: 'homey:light.kitchen', room: 'Kitchen', type: 'lights', size: 'small' },
        ],
      },
    });

    expect(dashboard.homeLayout.cardIds).toEqual(['homey:light.bed', 'openhab:light.landing']);
    expect(dashboard.homeCardSizes).toEqual({
      'homey:light.bed': 'small',
      'openhab:light.landing': 'medium',
    });
    expect(dashboard.homeRoomNames).toEqual(['Bedroom', 'Landing']);
    expect(
      resolveDashboardNavigationRooms(
        ['Kitchen', 'Bedroom', 'Landing', 'Outside'],
        dashboard.homeRoomNames
      )
    ).toEqual(['Bedroom', 'Landing']);
  });

  it('sanitizes room scope and preserves it when copying a dashboard', () => {
    const fallback = createLegacyDashboardCollection({ homeLayout: null });
    const scoped = createDashboardDefinition({
      id: 'upstairs',
      name: 'Upstairs',
      source: {
        kind: 'rooms',
        roomNames: [' Living Room ', 'Office', 'living room', 'All'],
        include: 'common',
        devices: [],
      },
    });
    const collection = sanitizeDashboardCollection(
      {
        schemaVersion: 1,
        defaultDashboardId: 'upstairs',
        order: ['upstairs'],
        dashboardsById: { upstairs: scoped },
        dashboardIdByClientId: {},
      },
      fallback
    );
    const copy = createDashboardDefinition({
      id: 'upstairs-copy',
      name: 'Upstairs copy',
      source: { kind: 'copy', dashboard: collection.dashboardsById.upstairs },
    });

    expect(collection.dashboardsById.upstairs.homeRoomNames).toEqual(['Living Room', 'Office']);
    expect(copy.homeRoomNames).toEqual(['Living Room', 'Office']);
    expect(
      resolveDashboardNavigationRooms(['living room', 'Kitchen', 'Office'], copy.homeRoomNames)
    ).toEqual(['living room', 'Office']);
  });

  it('atomically remaps the default and every assigned display when deleting a dashboard', () => {
    const home = createDashboardDefinition({ id: 'home', name: 'Home' });
    const upstairs = createDashboardDefinition({ id: 'upstairs', name: 'Upstairs' });
    const collection = sanitizeDashboardCollection(
      {
        schemaVersion: 1,
        defaultDashboardId: 'upstairs',
        order: ['home', 'upstairs'],
        dashboardsById: { home, upstairs },
        dashboardIdByClientId: { sonoff: 'upstairs', phone: 'home' },
      },
      createLegacyDashboardCollection({ homeLayout: null })
    );

    const next = deleteDashboardFromCollection(collection, 'upstairs');

    expect(next.defaultDashboardId).toBe('home');
    expect(next.order).toEqual(['home']);
    expect(next.dashboardIdByClientId).toEqual({ sonoff: 'home', phone: 'home' });
    expect(next.dashboardsById.upstairs).toBeUndefined();
  });
});

// Companion configuration is additive to schema 1 and contains entity IDs, never resource URLs.
describe('dashboard companion configuration', () => {
  it('defaults old dashboards without replacing their Home layout', () => {
    const legacy = createLegacyDashboardCollection({ homeLayout: { cardIds: ['light.kitchen'] } });
    delete legacy.dashboardsById.home.companion;
    const restored = sanitizeDashboardCollection(legacy, legacy).dashboardsById.home;
    expect(restored.companion).toEqual({ showSecurity: true });
    expect(restored.homeLayout.cardIds).toEqual(['home_assistant:light.kitchen']);
  });
  it('preserves explicit hidden selections and rejects malformed settings', () => {
    expect(
      sanitizeDashboardCompanion({
        cameraEntityId: null,
        weatherEntityId: 'homey:weather.outside',
        showSecurity: false,
      })
    ).toEqual({
      cameraEntityId: null,
      weatherEntityId: 'homey:weather.outside',
      showSecurity: false,
    });
    expect(
      sanitizeDashboardCompanion({ cameraEntityId: [], weatherEntityId: 42, showSecurity: 'yes' })
    ).toEqual({ showSecurity: true });
  });
  it('accepts entity references without allowing a snapshot URL into shared selections', () => {
    expect(
      sanitizeDashboardCompanion({
        cameraEntityId: 'https://user:secret@example.com/snapshot',
        weatherEntityId: null,
      })
    ).toEqual({ weatherEntityId: null, showSecurity: true });
  });
  it('copies selections independently when duplicating a dashboard', () => {
    const source = createDashboardDefinition({ id: 'home', name: 'Home' });
    source.companion = {
      cameraEntityId: 'home_assistant:camera.front',
      weatherEntityId: null,
      showSecurity: true,
    };
    const copy = createDashboardDefinition({
      name: 'Evening',
      source: { kind: 'copy', dashboard: source },
    });
    expect(copy.companion).toEqual(source.companion);
    expect(copy.companion).not.toBe(source.companion);
  });
});

describe('ordered companion cards', () => {
  it('retains legacy automatic, hidden and explicit source choices until edited', () => {
    expect(
      getCompanionCards({
        cameraEntityId: null,
        weatherEntityId: 'homey:weather.outside',
        showSecurity: false,
      })
    ).toEqual([
      { id: 'greeting', type: 'greeting' },
      { id: 'clock', type: 'clock' },
      { id: 'weather', type: 'weather', entityId: 'homey:weather.outside' },
    ]);
    expect(getCompanionCards({ showSecurity: true, cards: [] })).toEqual([]);
  });

  it('preserves calendar sources and household chores through sanitization', () => {
    const cards = [
      { id: 'agenda', type: 'calendar', entityId: 'home_assistant:calendar.home' },
      { id: 'chores', type: 'chores' },
    ];
    const sanitized = sanitizeDashboardCompanion({ cards, showSecurity: false });
    expect(sanitized.cards).toEqual(cards);
    expect(
      getCompanionCards(sanitizeDashboardCompanion(JSON.parse(JSON.stringify(sanitized))))
    ).toEqual(cards);
  });

  it('rejects malformed identities, duplicate cards and URL sources while bounding note content', () => {
    const settings = sanitizeDashboardCompanion({
      cards: [
        { id: 'one', type: 'note', text: 'a'.repeat(5000) },
        { id: 'one', type: 'clock' },
        { id: 'two', type: 'entity', entityId: 'https://user:secret@example.com' },
        { id: 'three', type: 'entity', entityId: 'homey:light.kitchen', size: 'large' },
        { id: 'four', type: 'iframe' },
      ],
    });
    expect(settings.cards).toEqual([
      { id: 'one', type: 'note', text: 'a'.repeat(4000) },
      { id: 'three', type: 'entity', entityId: 'homey:light.kitchen' },
    ]);
  });
});
