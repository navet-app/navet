import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalendarCardSources } from '../use-calendar-card-sources';

const { state } = vi.hoisted(() => ({ state: { currentProviderId: 'homey' } }));
const family = {
  id: 'home_assistant:calendar.family',
  name: 'Family',
  events: [],
  canCreate: true,
  available: true,
};
const holidays = { ...family, id: 'home_assistant:calendar.holidays', canCreate: false };
const collections: Record<string, unknown[]> = {
  home_assistant: [
    {
      id: 'home_assistant:calendar.navet_overview',
      sourceIds: [family.id, holidays.id],
      sources: [family, holidays],
    },
  ],
  homey: [],
  openhab: [],
};

vi.mock('@navet/app/hooks', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  usePersistedState: (_key: string, initial: unknown) => useState(initial),
  useProviderCalendarDevicesCollection: (providerId?: string) =>
    collections[providerId ?? state.currentProviderId] ?? [],
}));
vi.mock('@navet/app/utils/visibility-aware-scheduler', () => ({
  subscribeVisibilityAwareTask: () => () => undefined,
}));

describe('useCalendarCardSources provider ownership', () => {
  beforeEach(() => {
    state.currentProviderId = 'homey';
  });

  it('keeps selected writable HA sources when the current provider changes', () => {
    const { result, rerender } = renderHook(() =>
      useCalendarCardSources('home_assistant:calendar.navet_overview')
    );
    const writableIds = () =>
      result.current.availableCalendars
        .filter(
          (source) => result.current.selectedCalendarIds.includes(source.id) && source.canCreate
        )
        .map((source) => source.id);
    expect(result.current.selectedCalendarIds).toEqual([family.id, holidays.id]);
    expect(writableIds()).toEqual([family.id]);
    state.currentProviderId = 'openhab';
    rerender();
    expect(writableIds()).toEqual([family.id]);
    act(() => result.current.setSelectedCalendarIds([holidays.id]));
    expect(writableIds()).toEqual([]);
  });

  it('resolves legacy HA card IDs without taking sources from the current provider', () => {
    const { result } = renderHook(() => useCalendarCardSources('calendar.family'));
    expect(result.current.selectedCalendarIds).toEqual([family.id]);
    expect(result.current.availableCalendars).toEqual([
      expect.objectContaining(family),
      expect.objectContaining(holidays),
    ]);
    act(() => result.current.setSelectedCalendarIds(['calendar.holidays']));
    expect(result.current.selectedCalendarIds).toEqual([holidays.id]);
  });

  it('does not offer HA calendars for a card owned by another provider', () => {
    state.currentProviderId = 'home_assistant';
    const { result } = renderHook(() => useCalendarCardSources('openhab:calendar.family'));
    expect(result.current.availableCalendars).toEqual([]);
  });
});
