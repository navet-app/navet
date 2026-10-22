import { arrayMove } from '@dnd-kit/sortable';
import { useHeaderDateTime } from '@navet/app/components/layout/use-header-datetime';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { readNavetAlarmEntity, readNavetCameraState } from '@navet/app/core/navet-device-state';
import { getAlarmStateLabel } from '@navet/app/features/security/utils/alarm-state-label';
import {
  formatWeatherConditionLabel,
  WeatherIcon,
} from '@navet/app/features/weather/components/weather-card/weather-icon';
import { useI18n, useIntegrationStore, useProviderResource, useTheme } from '@navet/app/hooks';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { useEditModeStore, useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import type { NavetEntity } from '@navet/core/types';
import { ArrowUpRight, CameraOff, Lock, Plus, Shield } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  type CompanionCard,
  DEFAULT_DASHBOARD_COMPANION,
  getCompanionCards,
} from '../dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import {
  CompanionAddCardDialog,
  CompanionCardEditor,
  CompanionEditorList,
  useCompanionCardLabel,
} from './companion-editor';
import { CompanionEntityRow } from './companion-entity-row';

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
export function DashboardCompanion({ editing: controlledEditing }: { editing?: boolean } = {}) {
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const editing = controlledEditing ?? storeEditing;
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const setConfiguring = useDashboardCollectionStore(
    (state) => state.setCompanionCustomizationOpen
  );
  const dashboard = useDashboardCollectionStore(
    (state) => state.collection.dashboardsById[state.activeDashboardId]
  );
  const updateCompanion = useDashboardCollectionStore((state) => state.updateCompanion);
  const [adding, setAdding] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  useEffect(() => {
    setConfiguring(adding || editingCardId !== null);
  }, [adding, editingCardId, setConfiguring]);
  useEffect(() => {
    if (!editing) {
      setAdding(false);
      setEditingCardId(null);
    }
  }, [editing]);
  const cardLabel = useCompanionCardLabel();
  const settings = dashboard?.companion ?? DEFAULT_DASHBOARD_COMPANION;
  const cards = useMemo(() => getCompanionCards(settings), [settings]);
  const entities = useIntegrationStore(
    useShallow((state) =>
      state.selectedProviderIds.flatMap((id) =>
        Object.values(state.providerEntitiesByProviderId[id] ?? {})
      )
    )
  );
  useEffect(
    () => () => {
      setConfiguring(false);
      setAdding(false);
      setEditingCardId(null);
    },
    [dashboard?.id, setConfiguring]
  );
  const update = (next: CompanionCard[]) => {
    if (!dashboard) return;
    // Keep the existing source-selection contract available to other dashboard surfaces.
    const weather = next.find(
      (card) =>
        card.type === 'weather' ||
        (card.type === 'entity' &&
          entities.find((entity) => entity.canonicalId === card.entityId)?.type === 'weather')
    );
    const camera = next.find(
      (card) =>
        card.type === 'camera' ||
        (card.type === 'entity' &&
          entities.find((entity) => entity.canonicalId === card.entityId)?.type === 'camera')
    );
    updateCompanion(dashboard.id, {
      ...settings,
      cards: next,
      weatherEntityId: weather ? weather.entityId : null,
      cameraEntityId: camera ? camera.entityId : null,
      showSecurity: next.some(
        (card) =>
          card.type === 'security' ||
          (card.type === 'entity' &&
            Boolean(
              entities.find((entity) => entity.canonicalId === card.entityId)?.attributes.alarmState
            ))
      ),
    });
  };
  const label = (card: CompanionCard) =>
    entities.find((entity) => entity.canonicalId === card.entityId)?.name ?? cardLabel(card.type);
  const content = (card: CompanionCard) => {
    if (card.type === 'clock') return <CompanionClock />;
    if (card.type === 'greeting') return <CompanionGreeting text={card.text} />;
    if (card.type === 'note')
      return <p className="whitespace-pre-wrap break-words text-sm">{card.text}</p>;
    if (card.type === 'chores')
      return (
        <Suspense fallback={null}>
          <CompanionChores editing={editing} />
        </Suspense>
      );
    if (card.type === 'security') {
      const security = entities.filter(
        (entity) => entity.type === 'lock' || Boolean(entity.attributes.alarmState)
      );
      return security.length ? (
        <div className="space-y-2">
          {security.map((entity) => (
            <CompanionSecurityRow key={entity.canonicalId} entity={entity} />
          ))}
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
    if (!entity)
      return (
        <p className={`text-sm ${surface.textMuted}`}>
          {t('sidebar.companion.unavailable', { name: label(card) })}
        </p>
      );
    if (card.type === 'camera' || entity.type === 'camera') {
      if (readNavetCameraState(entity)?.isStreamCapable)
        return (
          <Suspense fallback={<CompanionCamera entity={entity} />}>
            <CompanionCameraFeed key={entity.canonicalId} entity={entity} editing={editing} />
          </Suspense>
        );
      return <CompanionCamera key={entity.canonicalId} entity={entity} />;
    }
    if (card.type === 'calendar' || entity.type === 'calendar')
      return (
        <Suspense fallback={null}>
          <CompanionCalendar key={entity.canonicalId} entity={entity} editing={editing} />
        </Suspense>
      );
    if (card.type === 'weather' || entity.type === 'weather')
      return <CompanionWeather entity={entity} />;
    if (entity.type === 'lock' || entity.attributes.alarmState)
      return <CompanionSecurityRow entity={entity} />;
    return <CompanionEntityRow key={entity.canonicalId} entity={entity} editing={editing} />;
  };
  const items = cards.map((card, index) =>
    editing ? (
      <CompanionCardEditor
        key={card.id}
        open={editingCardId === card.id}
        onOpenChange={(open) => setEditingCardId(open ? card.id : null)}
        card={card}
        label={label(card)}
        index={index}
        count={cards.length}
        entities={entities}
        onChange={(next) => update(cards.map((item) => (item.id === card.id ? next : item)))}
        onMove={(to) => update(arrayMove(cards, index, to))}
        onRemove={() => update(cards.filter((item) => item.id !== card.id))}
      >
        {content(card)}
      </CompanionCardEditor>
    ) : (
      <div
        key={card.id}
        className={
          index > 0 && !(card.type === 'clock' && cards[index - 1]?.type === 'greeting')
            ? card.type === 'entity' && cards[index - 1]?.type === 'entity'
              ? 'mt-1'
              : 'mt-4'
            : undefined
        }
      >
        {content(card)}
      </div>
    )
  );
  return (
    <section
      aria-label={t('sidebar.companion.title')}
      className={editing ? 'space-y-5' : undefined}
    >
      <div className={editing ? 'flex items-center justify-between gap-2' : 'sr-only'}>
        <h2 className={`text-sm font-medium ${surface.textSecondary}`}>
          {t('sidebar.companion.title')}
        </h2>
        {editing ? (
          <Button
            variant="ghost"
            size="compact"
            disabled={cards.length >= 64}
            leading={<Plus className="h-4 w-4" />}
            onClick={() => setAdding(true)}
          >
            {t('sidebar.companion.addCard')}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <CompanionEditorList cards={cards} onChange={update}>
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
          onAdd={(card) => {
            update([...cards, card]);
            if (card.type === 'note' || card.type === 'greeting') setEditingCardId(card.id);
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

function CompanionWeather({ entity }: { entity: NavetEntity }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const unit = useSettingsStore((state) => state.temperatureUnit);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = connected && entity.availability === 'available';
  const value = entity.attributes.temperature;
  const sourceUnit = entity.attributes.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const condition =
    typeof entity.attributes.condition === 'string'
      ? entity.attributes.condition
      : String(entity.primaryState ?? '');
  return (
    <div className="min-w-0">
      <p className={`truncate text-xs ${surface.textMuted}`}>{entity.name}</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xl font-medium tabular-nums">
          {available && typeof value === 'number' && Number.isFinite(value)
            ? formatTemperatureFromSourceUnit(value, sourceUnit, unit)
            : '—'}
        </p>
        <WeatherIcon condition={condition} className="h-9 w-9 shrink-0" />
      </div>
      <p className={`text-sm ${surface.textSecondary}`}>
        {available ? formatWeatherConditionLabel(condition) : t('common.unavailable')}
      </p>
    </div>
  );
}

function CompanionCamera({ entity }: { entity: NavetEntity }) {
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!src}
        className="block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2"
        aria-label={t('sidebar.companion.openCamera', { name: entity.name })}
      >
        <span className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
          <span className="truncate">{entity.name}</span>
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
        isOpen={open}
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

function CompanionSecurityRow({ entity }: { entity: NavetEntity }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const navigate = useNavigationStore((state) => state.setActiveSection);
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
    <button
      type="button"
      onClick={() => navigate('security')}
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg text-left ${surface.hoverBg}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${surface.textMuted}`} />
      <span className="min-w-0 flex-1 truncate text-xs">{entity.name}</span>
      <span className="max-w-[55%] text-right text-xs font-medium">{label}</span>
    </button>
  );
}
