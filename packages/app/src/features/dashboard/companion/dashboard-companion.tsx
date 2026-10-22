import { arrayMove } from '@dnd-kit/sortable';
import { useHeaderDateTime } from '@navet/app/components/layout/use-header-datetime';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import {
  companionEntityDisabledClassName,
  companionEntityIconClassName,
  companionEntityNameTypography,
  companionEntityRowClassName,
  companionEntityValueClassName,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getDeviceTypeIcon } from '@navet/app/constants/device-type-icons';
import { readNavetAlarmEntity, readNavetCameraState } from '@navet/app/core/navet-device-state';
import { getAlarmStateLabel } from '@navet/app/features/security/utils/alarm-state-label';
import {
  formatWeatherConditionLabel,
  WeatherIcon,
} from '@navet/app/features/weather/components/weather-card/weather-icon';
import { useI18n, useIntegrationStore, useProviderResource, useTheme } from '@navet/app/hooks';
import {
  useCalendarDevicesCollection,
  useWeatherDevicesCollection,
} from '@navet/app/hooks/use-devices';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { useEditModeStore, useSettingsStore } from '@navet/app/stores';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import {
  formatTemperatureFromSourceUnit,
  formatTemperatureValueFromSourceUnit,
  normalizeTemperatureUnit,
} from '@navet/app/utils/temperature';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import type { NavetEntity } from '@navet/core/types';
import { ArrowUpRight, CameraOff, Lock, Plus, Shield } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  type CompanionCard,
  getCompanionCards,
  isRoomCompanionSelected,
  type NavetDashboardDefinition,
  resolveDashboardCompanion,
} from '../dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import {
  CompanionAddCardDialog,
  CompanionCardEditor,
  CompanionEditorList,
  useCompanionCardLabel,
} from './companion-editor';
import { CompanionEntityDetails } from './companion-entity-details';
import { CompanionEntityRow } from './companion-entity-row';
import { CompanionPanelScope } from './companion-panel-scope';
import { CompanionRowLoading } from './companion-row-loading';
import { useCompanionRoomScope } from './use-companion-room-scope';

const CompanionCalendar = lazy(async () => {
  const module = await import('./companion-calendar');
  return { default: module.CompanionCalendar };
});
const CompanionChores = lazy(async () => {
  const module = await import('./companion-chores');
  return { default: module.CompanionChores };
});
const CompanionCameraFeed = lazy(async () => {
  const module = await import('./companion-camera-feed');
  return { default: module.CompanionCameraFeed };
});

// Content is dashboard-owned; panel tools appear only during dashboard customization.
export function DashboardCompanion({
  editing: controlledEditing,
  onDone,
}: {
  editing?: boolean;
  onDone?: () => void;
} = {}) {
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const setEditMode = useEditModeStore((state) => state.setEditMode);
  const editing = controlledEditing ?? storeEditing;
  const dashboard = useDashboardCollectionStore(
    (state) => state.collection.dashboardsById[state.activeDashboardId]
  );
  const { roomId, roomName } = useCompanionRoomScope(editing);

  return (
    <DashboardCompanionContent
      key={`${dashboard?.id}:${roomId ?? 'common'}`}
      dashboard={dashboard}
      roomId={roomId}
      roomName={roomName}
      editing={editing}
      onDone={onDone ?? (() => setEditMode(false))}
    />
  );
}

function DashboardCompanionContent({
  dashboard,
  roomId,
  roomName,
  editing,
  onDone,
}: {
  dashboard: NavetDashboardDefinition | undefined;
  roomId: string | null;
  roomName: string;
  editing: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const setConfiguring = useDashboardCollectionStore(
    (state) => state.setCompanionCustomizationOpen
  );
  const updateCompanion = useDashboardCollectionStore((state) => state.updateCompanion);
  const updateRoomCompanion = useDashboardCollectionStore((state) => state.updateRoomCompanion);
  const [adding, setAdding] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const pendingAddedId = useRef<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const selectedRoomId = isRoomCompanionSelected(dashboard, roomId) ? roomId : null;
  useEffect(() => {
    setConfiguring(adding || editingCardId !== null);
  }, [adding, editingCardId, setConfiguring]);
  useEffect(() => {
    setAdding(false);
    setEditingCardId(null);
  }, [editing, selectedRoomId]);
  useEffect(() => {
    if (adding || editingCardId || !pendingAddedId.current) return;
    const frame = requestAnimationFrame(() => {
      const item = panelRef.current?.querySelector(
        `[data-companion-card-id="${pendingAddedId.current}"]`
      );
      item?.scrollIntoView?.({ block: 'nearest' });
      pendingAddedId.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [adding, editingCardId]);
  const cardLabel = useCompanionCardLabel();
  const settings = resolveDashboardCompanion(dashboard, roomId);
  const choresEnabled = useSettingsStore((state) => state.choresEnabled);
  const cards = useMemo(() => getCompanionCards(settings), [settings]);
  const indexedEntities = useIntegrationStore(
    useShallow((state) =>
      state.selectedProviderIds.flatMap((id) =>
        Object.values(state.providerEntitiesByProviderId[id] ?? {})
      )
    )
  );
  const weatherDevices = useWeatherDevicesCollection();
  const calendarDevices = useCalendarDevicesCollection();
  const hydratingProviderIds = useIntegrationStore(
    useShallow((state) =>
      state.selectedProviderIds.filter(
        (id) =>
          state.providerRuntime[id]?.connected &&
          state.providerRuntime[id]?.entitiesHydrated === false
      )
    )
  );
  // Some providers expose weather and calendars only through feature collections.
  // Adapt individual sources so selection, editing and details share one source list.
  const entities = useMemo(() => {
    const sources = new Map(indexedEntities.map((entity) => [entity.canonicalId, entity]));
    for (const weather of weatherDevices) {
      const identity = parseProviderScopedId(weather.id);
      if (!identity) continue;
      if (sources.has(weather.id)) continue;
      sources.set(weather.id, {
        id: weather.id,
        canonicalId: weather.id,
        providerId: identity.providerId,
        externalId: identity.nativeId,
        type: 'weather',
        name: weather.name,
        room: weather.room,
        primaryState: weather.condition,
        availability:
          weather.condition === 'unavailable' || weather.condition === 'unknown'
            ? weather.condition
            : 'available',
        capabilities: [],
        attributes: { ...weather },
      });
    }
    for (const calendar of calendarDevices) {
      for (const source of calendar.sources?.length ? calendar.sources : [calendar]) {
        const identity = parseProviderScopedId(source.id);
        if (!identity || sources.has(source.id)) continue;
        const available = !('available' in source) || source.available !== false;
        sources.set(source.id, {
          id: source.id,
          canonicalId: source.id,
          providerId: identity.providerId,
          externalId: identity.nativeId,
          type: 'calendar',
          name: source.name,
          room: source.room,
          primaryState: available ? 'on' : 'unavailable',
          availability: available ? 'available' : 'unavailable',
          capabilities: [],
          attributes: {},
        });
      }
    }
    return [...sources.values()];
  }, [indexedEntities, weatherDevices, calendarDevices]);
  useEffect(
    () => () => {
      setConfiguring(false);
      setAdding(false);
      setEditingCardId(null);
    },
    [dashboard?.id, setConfiguring]
  );
  const update = (next: CompanionCard[]) => {
    if (!dashboard || !editing) return;
    // Keep the existing source-selection contract available to other dashboard surfaces.
    const isSource = (
      card: CompanionCard,
      type: 'weather' | 'camera',
      previous: string | null | undefined
    ) => {
      if (card.type === type) return true;
      if (card.type !== 'entity') return false;
      const entity = entities.find((item) => item.canonicalId === card.entityId);
      // Missing provider metadata does not remove a still-configured source.
      return entity ? entity.type === type : Boolean(card.entityId && card.entityId === previous);
    };
    const weather = next.find((card) => isSource(card, 'weather', settings.weatherEntityId));
    const camera = next.find((card) => isSource(card, 'camera', settings.cameraEntityId));
    const nextSettings = {
      ...settings,
      cards: next,
      weatherEntityId: weather ? weather.entityId : null,
      cameraEntityId: camera ? camera.entityId : null,
      showSecurity: next.some((card) => {
        if (card.type === 'security') return true;
        if (card.type !== 'entity') return false;
        const entity = entities.find((item) => item.canonicalId === card.entityId);
        if (entity) return Boolean(entity.attributes.alarmState);
        // Retain compatibility visibility while an existing source's metadata is offline.
        return (
          settings.showSecurity &&
          cards.some((previous) => previous.id === card.id && previous.entityId === card.entityId)
        );
      }),
    };
    if (selectedRoomId) updateRoomCompanion(dashboard.id, selectedRoomId, nextSettings);
    else updateCompanion(dashboard.id, nextSettings);
  };
  const label = (card: CompanionCard) =>
    entities.find((entity) => entity.canonicalId === card.entityId)?.name ?? cardLabel(card.type);
  const individuallySelectedIds = new Set(cards.map((card) => card.entityId).filter(Boolean));
  const securityEntities = entities.filter(
    (entity) => entity.type === 'lock' || Boolean(entity.attributes.alarmState)
  );
  const summarySecurityEntities = securityEntities.filter(
    (entity) => !individuallySelectedIds.has(entity.canonicalId)
  );
  const content = (card: CompanionCard) => {
    if (card.type === 'clock') return <CompanionClock />;
    if (card.type === 'greeting') return <CompanionGreeting text={card.text} />;
    if (card.type === 'note')
      return <p className="whitespace-pre-wrap break-words text-sm">{card.text}</p>;
    if (card.type === 'chores')
      return (
        <Suspense fallback={<CompanionRowLoading name={cardLabel('chores')} />}>
          <CompanionChores editing={editing} />
        </Suspense>
      );
    if (card.type === 'security') {
      if (!securityEntities.length && hydratingProviderIds.length)
        return <CompanionRowLoading name={cardLabel('security')} />;
      const security = summarySecurityEntities;
      return security.length ? (
        <div className="space-y-1">
          {security.map((entity) =>
            hydratingProviderIds.includes(entity.providerId) ? (
              <CompanionRowLoading
                key={entity.canonicalId}
                name={entity.name}
                icon={getDeviceTypeIcon(entity.type)}
              />
            ) : (
              <CompanionSecurityRow key={entity.canonicalId} entity={entity} editing={editing} />
            )
          )}
        </div>
      ) : (
        <p className={`text-sm ${surface.textMuted}`}>
          {t('sidebar.companion.unavailable', { name: cardLabel('security') })}
        </p>
      );
    }
    const entity = card.entityId
      ? entities.find(
          (entity) =>
            entity.canonicalId === card.entityId &&
            (card.type === 'entity' || entity.type === card.type)
        )
      : entities.find((entity) => entity.type === card.type);
    const sourceProviderId =
      entity?.providerId ??
      (card.entityId ? parseProviderScopedId(card.entityId)?.providerId : undefined);
    if (
      sourceProviderId
        ? hydratingProviderIds.includes(sourceProviderId)
        : !entity && hydratingProviderIds.length > 0
    )
      return (
        <CompanionRowLoading
          name={label(card)}
          icon={getDeviceTypeIcon(entity?.type ?? card.type)}
        />
      );
    if (!entity)
      return (
        <p className={`text-sm ${surface.textMuted}`}>
          {t('sidebar.companion.unavailable', { name: label(card) })}
        </p>
      );
    if (card.type === 'camera' || entity.type === 'camera') {
      if (readNavetCameraState(entity)?.isStreamCapable)
        return (
          <Suspense
            fallback={
              <div
                className={`flex aspect-video items-center overflow-hidden rounded-xl px-3 ${surface.subtleBg}`}
              >
                <CompanionRowLoading name={entity.name} icon={getDeviceTypeIcon('camera')} />
              </div>
            }
          >
            <CompanionCameraFeed key={entity.canonicalId} entity={entity} editing={editing} />
          </Suspense>
        );
      return <CompanionCamera key={entity.canonicalId} entity={entity} editing={editing} />;
    }
    if (card.type === 'calendar' || entity.type === 'calendar')
      return (
        <Suspense
          fallback={<CompanionRowLoading name={entity.name} icon={getDeviceTypeIcon('calendar')} />}
        >
          <CompanionCalendar key={entity.canonicalId} entity={entity} editing={editing} />
        </Suspense>
      );
    if (card.type === 'weather' || entity.type === 'weather')
      return <CompanionWeather entity={entity} editing={editing} />;
    if (entity.type === 'lock' || entity.attributes.alarmState)
      return <CompanionSecurityRow entity={entity} editing={editing} />;
    return <CompanionEntityRow key={entity.canonicalId} entity={entity} editing={editing} />;
  };
  const groupType = (card: CompanionCard) =>
    card.type === 'entity'
      ? (entities.find((entity) => entity.canonicalId === card.entityId)?.type ?? card.type)
      : card.type;
  const groups: CompanionCard[][] = [];
  const sourceId = (card: CompanionCard) =>
    card.entityId ?? entities.find((entity) => entity.type === groupType(card))?.canonicalId;
  const groupedSourceIds = new Set<string>();
  for (const card of cards) {
    const type = groupType(card);
    // Keep configured summaries editable so reordering serializes every saved card.
    if (
      !editing &&
      card.type === 'security' &&
      securityEntities.length &&
      !summarySecurityEntities.length
    )
      continue;
    if (card.entityId || type === 'camera' || type === 'weather') {
      const id = sourceId(card);
      if (id && groupedSourceIds.has(id)) continue;
      if (id) groupedSourceIds.add(id);
    }
    const group =
      type === 'camera' || type === 'weather'
        ? groups.find((items) => groupType(items[0]) === type)
        : undefined;
    if (group) group.push(card);
    else groups.push([card]);
  }
  const items = groups.map((group, index) => {
    const card = group[0];
    if (card.type === 'chores' && !choresEnabled) return null;
    const previous = groups[index - 1]?.[0];
    const groupedSources = groupType(card) === 'camera' || groupType(card) === 'weather';
    const sameType = previous !== undefined && groupType(card) === groupType(previous);
    const sharesGroup = (card.type === 'clock' && previous?.type === 'greeting') || sameType;
    const divider = index > 0 && !sharesGroup;
    return editing ? (
      <CompanionCardEditor
        key={card.id}
        className={divider ? `border-t pt-5 ${surface.dividerBorder}` : undefined}
        open={editingCardId === card.id}
        onOpenChange={(open) => setEditingCardId(open ? card.id : null)}
        card={groupedSources ? { ...card, type: groupType(card) as 'camera' | 'weather' } : card}
        label={groupedSources ? cardLabel(groupType(card) as 'camera' | 'weather') : label(card)}
        index={index}
        count={groups.length}
        entities={entities}
        groupCards={groupedSources ? group : undefined}
        onRemoveCard={(id) => {
          const removed = cards.find((item) => item.id === id);
          update(
            cards.filter(
              (item) =>
                item.id !== id &&
                !(
                  removed &&
                  groupedSources &&
                  sourceId(removed) &&
                  sourceId(item) === sourceId(removed)
                )
            )
          );
        }}
        onChange={(next) => update(cards.map((item) => (item.id === next.id ? next : item)))}
        onMove={(to) => update(arrayMove(groups, index, to).flat())}
        onRemove={() =>
          update(
            cards.filter((item) =>
              groupedSources
                ? groupType(item) !== groupType(card)
                : !group.some((member) => member.id === item.id)
            )
          )
        }
      >
        <div className="space-y-4">
          {group.map((item) => (
            <div key={item.id} data-companion-card-id={item.id}>
              {content(item)}
            </div>
          ))}
        </div>
      </CompanionCardEditor>
    ) : (
      <div
        key={card.id}
        data-companion-card-id={card.id}
        className={
          divider
            ? `mt-4 border-t pt-4 ${surface.dividerBorder}`
            : sameType
              ? card.type === 'entity' && previous?.type === 'entity'
                ? 'mt-1'
                : 'mt-4'
              : undefined
        }
      >
        <div className="space-y-4">
          {group.map((item) => (
            <div key={item.id} data-companion-card-id={item.id}>
              {content(item)}
            </div>
          ))}
        </div>
      </div>
    );
  });
  return (
    <section
      ref={panelRef}
      aria-label={t('sidebar.companion.title')}
      className={editing ? 'space-y-5' : undefined}
    >
      {editing ? (
        <>
          <div
            className={`sticky top-0 z-30 -mx-5 -mt-4 flex items-center justify-end gap-3 border-r px-5 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] ${surface.border} ${surface.shellPanel}`}
          >
            <Button
              variant="secondary"
              size="compact"
              disabled={cards.length >= 64}
              leading={<Plus className="h-4 w-4" />}
              onClick={() => setAdding(true)}
            >
              {t('sidebar.companion.addCard')}
            </Button>
            <Button variant="primary" size="compact" onClick={onDone}>
              {t('common.done')}
            </Button>
          </div>
          {dashboard ? (
            <div className="flex min-w-0">
              <CompanionPanelScope dashboard={dashboard} roomId={roomId} roomName={roomName} />
            </div>
          ) : null}
        </>
      ) : null}
      {editing ? (
        <CompanionEditorList cards={cards} groups={groups} onChange={update}>
          <div className="space-y-5">{items}</div>
        </CompanionEditorList>
      ) : (
        <div>{items}</div>
      )}
      {!cards.length ? (
        <p className={`text-sm ${surface.textMuted}`}>{t('sidebar.companion.empty')}</p>
      ) : null}
      {editing && cards.length >= 64 ? (
        <p className={`text-sm ${surface.textMuted}`}>{t('sidebar.companion.limit')}</p>
      ) : null}
      {adding && editing ? (
        <CompanionAddCardDialog
          entities={entities}
          cards={cards}
          onRemove={(ids) => update(cards.filter((card) => !ids.includes(card.id)))}
          remainingCapacity={64 - cards.length}
          onAdd={(added) => {
            pendingAddedId.current = added.at(-1)?.id ?? null;
            update([...cards, ...added]);
            const card = added[0];
            if (card && (card.type === 'note' || card.type === 'greeting'))
              setEditingCardId(card.id);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

function CompanionClock() {
  const { formattedDate, formattedTime } = useHeaderDateTime();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  return (
    <div>
      <p className="text-3xl font-medium tracking-tight tabular-nums">{formattedTime}</p>
      <p className={`mt-1 text-xs ${surface.textMuted}`}>{formattedDate}</p>
    </div>
  );
}

function CompanionGreeting({ text }: { text?: string }) {
  const { t } = useI18n();
  const { greetingKey } = useHeaderDateTime();
  const user = useIntegrationStore(integrationSelectors.currentUser);
  const titleMode = useSettingsStore((state) => state.headerTitleMode);
  const customText = useSettingsStore((state) => state.headerCustomText);
  return (
    <p className="break-words text-sm">
      {text?.trim() ||
        (titleMode === 'custom_text' && customText.trim()
          ? customText
          : t(greetingKey, { name: user?.name?.trim().split(/\s+/)[0] || t('header.guestName') }))}
    </p>
  );
}

function CompanionWeather({ entity, editing }: { entity: NavetEntity; editing: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const unit = useSettingsStore((state) => state.temperatureUnit);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = connected && entity.availability === 'available';
  const value = entity.attributes.temperature;
  const sourceUnit = normalizeTemperatureUnit(entity.attributes.temperatureUnit) ?? 'celsius';
  const range = [
    [
      'H',
      entity.attributes.highTemp,
      normalizeTemperatureUnit(entity.attributes.highTempUnit) ?? sourceUnit,
    ],
    [
      'L',
      entity.attributes.lowTemp,
      normalizeTemperatureUnit(entity.attributes.lowTempUnit) ?? sourceUnit,
    ],
  ] as const;
  const rangeLabel = available
    ? range
        .flatMap(([label, temperature, temperatureUnit]) =>
          typeof temperature === 'number' && Number.isFinite(temperature)
            ? [
                `${label}:${formatTemperatureValueFromSourceUnit(temperature, temperatureUnit, unit)}°`,
              ]
            : []
        )
        .join(' ')
    : '';
  const condition =
    typeof entity.attributes.condition === 'string'
      ? entity.attributes.condition
      : String(entity.primaryState ?? '');
  return (
    <div className="flow-root">
      <CompanionEntityDetails
        entity={entity}
        editing={editing}
        className="-my-2 block min-w-0 py-2"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span
              className={`block truncate ${companionEntityNameTypography} ${surface.textMuted}`}
            >
              {entity.name}
            </span>
            <span className="block text-2xl font-medium tabular-nums">
              {available && typeof value === 'number' && Number.isFinite(value)
                ? formatTemperatureFromSourceUnit(value, sourceUnit, unit)
                : '—'}
            </span>
            {rangeLabel ? (
              <span className={`block text-xs tabular-nums ${surface.textSecondary}`}>
                {rangeLabel}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 max-w-[50%] flex-col items-end gap-0.5">
            <WeatherIcon condition={condition} className="h-9 w-9 shrink-0" />
            <span className="break-words text-right text-xs font-medium">
              {available ? formatWeatherConditionLabel(condition) : t('common.unavailable')}
            </span>
          </span>
        </span>
      </CompanionEntityDetails>
    </div>
  );
}

function CompanionCamera({ entity, editing = false }: { entity: NavetEntity; editing?: boolean }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = connected && entity.availability === 'available';
  const picture =
    entity.resources?.camera_snapshot?.path ?? readNavetCameraState(entity)?.entityPicture;
  const pictureUrl = useResourceUrl(available ? picture : null, entity.providerId);
  const resource = useProviderResource({
    deviceId: available && !picture ? entity.canonicalId : '',
    kind: 'camera_snapshot',
    providerId: entity.providerId,
    fallbackPicture: readNavetCameraState(entity)?.entityPicture,
  });
  const [open, setOpen] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedUrl = pictureUrl ?? (resource?.kind === 'image' ? resource.url : undefined);
  useEffect(() => {
    if (!failedUrl) return;
    if (!available || resolvedUrl !== failedUrl) {
      setFailedUrl(null);
      return;
    }
    // Retry stable snapshot URLs after transient errors; suspend retries in hidden tabs.
    return subscribeVisibilityAwareTask(() => setFailedUrl(null), 30000);
  }, [available, failedUrl, resolvedUrl]);
  const src = available && resolvedUrl !== failedUrl ? resolvedUrl : undefined;
  const fallback = (
    <div
      role="status"
      className={`flex aspect-video items-center justify-center gap-2 rounded-xl text-xs ${surface.subtleBg} ${surface.textMuted}`}
    >
      <CameraOff className="h-5 w-5" />
      {t('common.unavailable')}
    </div>
  );
  return (
    <div className={`space-y-2 ${editing || !available ? companionEntityDisabledClassName : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!src || editing}
        className="block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2"
        aria-label={t('sidebar.companion.openCamera', { name: entity.name })}
      >
        <span className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
          <span className={`truncate ${companionEntityNameTypography}`}>{entity.name}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0" />
        </span>
        {src ? (
          <img
            src={src}
            alt={entity.name}
            onError={() => setFailedUrl(src)}
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : (
          fallback
        )}
      </button>
      <BaseCardDialog
        variant="modal"
        isOpen={open && Boolean(available) && !editing}
        onOpenChange={setOpen}
        title={entity.name}
        theme={theme}
      >
        <div className="p-4">
          {src ? (
            <img
              src={src}
              alt={entity.name}
              onError={() => setFailedUrl(src)}
              className="w-full rounded-xl"
            />
          ) : (
            fallback
          )}
        </div>
      </BaseCardDialog>
    </div>
  );
}

function CompanionSecurityRow({ entity, editing }: { entity: NavetEntity; editing: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const alarm = readNavetAlarmEntity(entity);
  const state = entity.primaryState;
  const label =
    !connected || entity.availability !== 'available'
      ? t('common.unavailable')
      : alarm
        ? getAlarmStateLabel(alarm.state, t)
        : state === 'locked'
          ? t('security.locked')
          : state === 'unlocked'
            ? t('security.unlocked')
            : t('common.unavailable');
  const Icon = alarm ? Shield : Lock;
  return (
    <CompanionEntityDetails
      entity={entity}
      editing={editing}
      className={companionEntityRowClassName}
    >
      <Icon aria-hidden="true" className={`${companionEntityIconClassName} ${surface.textMuted}`} />
      <span className={`min-w-0 flex-1 break-words ${companionEntityNameTypography}`}>
        {entity.name}
      </span>
      <span className={companionEntityValueClassName}>{label}</span>
    </CompanionEntityDetails>
  );
}
