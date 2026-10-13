import { CALENDAR_EVENTS_REFRESH_INTERVAL } from '@navet/app/constants';
import { mapCalendarSources } from '@navet/app/hooks/device-mappers';
import { useI18n } from '@navet/app/i18n';
import type {
  PlatformCalendarDevice,
  PlatformCalendarEvent,
} from '@navet/app/platform/provider-feature-models';
import {
  integrationCalendarFeatureService,
  subscribeCalendarChanges,
} from '@navet/app/services/integration-calendar-feature.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { UNKNOWN_ROOM_LABEL } from '@navet/app/utils/device-location';
import { createProviderScopedId } from '@navet/app/utils/provider-ids';
import { areStringArraysEqual } from '@navet/app/utils/structural-equality';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveProviderFeatureEntityName,
  resolveProviderFeatureEntityRoom,
} from './provider-feature-entity-labels';
import { useIntegrationStore, useProviderId } from './use-integration-store';
import {
  useHydratingProviderCollection,
  useProviderCollectionData,
} from './use-provider-collection-lifecycle';
import {
  useProviderEntityRegistryEntries,
  useProviderEntitySnapshotsByPrefix,
} from './use-provider-entity';
import { useProviderFeature } from './use-provider-feature-support';

const EMPTY_CALENDAR_EVENTS: Record<string, PlatformCalendarEvent[]> = {};
const EMPTY_CALENDAR_DEVICES: PlatformCalendarDevice[] = [];
const EMPTY_CALENDAR_ENTITY_IDS: string[] = [];
const CALENDAR_ENTITY_PREFIXES = ['calendar.'] as const;

export function useProviderCalendarDevices(
  providerId?: IntegrationProviderId,
  options?: { enabled?: boolean }
): PlatformCalendarDevice[] {
  const enabled = options?.enabled ?? true;
  const resolvedProviderId = useProviderId(providerId);
  const entitiesHydrated = useIntegrationStore(
    (state) =>
      (state.providerRuntime[resolvedProviderId] ?? state.providerRuntime[state.currentProviderId])
        .entitiesHydrated
  );
  const supportsCalendar = useProviderFeature('calendar', resolvedProviderId) && enabled;
  const entities = useProviderEntitySnapshotsByPrefix(CALENDAR_ENTITY_PREFIXES, {
    providerId: resolvedProviderId,
    enabled: supportsCalendar,
  });
  const entityRegistry = useProviderEntityRegistryEntries({
    providerId: resolvedProviderId,
    enabled: supportsCalendar,
  });
  const { locale, t } = useI18n();
  const use24HourTime = useSettingsStore(settingsSelectors.use24HourTime);

  const calendarEntityIds = useMemo(() => {
    if (!supportsCalendar || !entities) {
      return EMPTY_CALENDAR_ENTITY_IDS;
    }

    return Object.keys(entities)
      .filter((entityId) => entityId.startsWith('calendar.'))
      .sort((left, right) => left.localeCompare(right));
  }, [entities, supportsCalendar]);
  const stableCalendarEntityIdsRef = useRef<string[]>(EMPTY_CALENDAR_ENTITY_IDS);
  const stableCalendarEntityIds = useMemo(() => {
    if (areStringArraysEqual(stableCalendarEntityIdsRef.current, calendarEntityIds)) {
      return stableCalendarEntityIdsRef.current;
    }

    stableCalendarEntityIdsRef.current = calendarEntityIds;
    return calendarEntityIds;
  }, [calendarEntityIds]);

  const entityRegistryMap = useMemo(
    () => new Map(entityRegistry.map((entry) => [entry.entityId, entry])),
    [entityRegistry]
  );
  const [eventsRevision, setEventsRevision] = useState(0);
  useEffect(
    () =>
      subscribeCalendarChanges((entityId) => {
        if (
          stableCalendarEntityIds.some(
            (id) => createProviderScopedId(resolvedProviderId, id) === entityId
          )
        ) {
          setEventsRevision((revision) => revision + 1);
        }
      }),
    [resolvedProviderId, stableCalendarEntityIds]
  );
  const loadEvents = useCallback(async () => {
    void eventsRevision;
    const entries = await Promise.all(
      stableCalendarEntityIds.map(async (entityId) => {
        const events = await integrationCalendarFeatureService
          .getEvents(createProviderScopedId(resolvedProviderId, entityId))
          .catch(() => []);
        return [entityId, events] as const;
      })
    );
    return Object.fromEntries(entries);
  }, [resolvedProviderId, stableCalendarEntityIds, eventsRevision]);
  const deferredCalendarEvents = useProviderCollectionData({
    providerId: resolvedProviderId,
    enabled: supportsCalendar && stableCalendarEntityIds.length > 0,
    interval: CALENDAR_EVENTS_REFRESH_INTERVAL,
    empty: EMPTY_CALENDAR_EVENTS,
    load: loadEvents,
  });

  const resolvedDevices = useMemo<PlatformCalendarDevice[]>(() => {
    if (!entities || stableCalendarEntityIds.length === 0) {
      return EMPTY_CALENDAR_DEVICES;
    }

    const calendarSources: PlatformCalendarDevice['sources'] = [];
    for (const entityId of stableCalendarEntityIds) {
      const entity = entities[entityId];
      if (!entity) {
        continue;
      }

      const scopedEntityId = createProviderScopedId(resolvedProviderId, entityId);
      calendarSources.push(
        ...mapCalendarSources(
          scopedEntityId,
          entity,
          resolveProviderFeatureEntityName(entityId, entity, entityRegistryMap.get(entityId)?.name),
          resolveProviderFeatureEntityRoom(entity),
          {
            calendarEvents: deferredCalendarEvents,
            eventLookupId: entityId,
            locale,
            t,
            use24HourTime,
          }
        ).map((source) => ({
          ...source,
          ...integrationCalendarFeatureService.getCapabilities?.(scopedEntityId),
        }))
      );
    }

    if (calendarSources.length === 0) {
      return EMPTY_CALENDAR_DEVICES;
    }

    const roomSet = new Set(calendarSources.map((source) => source.room).filter(Boolean));
    const fallbackEventColors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-indigo-500',
    ] as const;
    const singleRoom =
      roomSet.size === 1 ? ((roomSet.values().next().value as string | undefined) ?? null) : null;
    const combinedEvents = calendarSources
      .flatMap((source, index) =>
        source.events.map((event) => ({
          ...event,
          color:
            event.color || fallbackEventColors[index % fallbackEventColors.length] || 'bg-blue-500',
        }))
      )
      .sort((left, right) => {
        const leftKey = left.sortKey ?? left.startTime;
        const rightKey = right.sortKey ?? right.startTime;
        return leftKey.localeCompare(rightKey);
      })
      .slice(0, 12);

    return [
      {
        id: createProviderScopedId(resolvedProviderId, 'calendar.navet_overview'),
        name: t('calendar.defaultTitle'),
        room: singleRoom ?? UNKNOWN_ROOM_LABEL,
        size: 'medium',
        sourceIds: calendarSources.map((source) => source.id),
        sources: calendarSources,
        events: combinedEvents,
      },
    ];
  }, [
    resolvedProviderId,
    deferredCalendarEvents,
    entities,
    entityRegistryMap,
    locale,
    stableCalendarEntityIds,
    t,
    use24HourTime,
  ]);

  return useHydratingProviderCollection(
    resolvedProviderId,
    resolvedDevices,
    supportsCalendar,
    entitiesHydrated,
    EMPTY_CALENDAR_DEVICES
  );
}

export const useProviderCalendarDevicesCollection = useProviderCalendarDevices;
