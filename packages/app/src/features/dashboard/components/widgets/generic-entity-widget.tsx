import { BaseCard } from '@navet/app/components/primitives';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useIntegrationStore, useTheme } from '@navet/app/hooks';
import {
  type AppLanguage,
  defaultTranslate,
  getLocaleForLanguage,
  type TranslateFn,
  type TranslationKey,
} from '@navet/app/i18n';
import { integrationSelectors } from '@navet/app/stores/selectors';
import type { DashboardEntityView } from '@navet/ui/dashboard-entity-view';
import { Activity, CircleAlert, CircleHelp, CircleSlash } from 'lucide-react';

export interface GenericEntityWidgetData {
  entityId?: string;
}

interface GenericEntityWidgetProps {
  size: CardSize;
  data?: GenericEntityWidgetData;
  language?: AppLanguage;
  t?: TranslateFn;
}

// Provider view records are replaced when their entities change. Share alias work across cards
// and store notifications while letting old snapshots be collected.
const entityViewAliases = new WeakMap<object, Map<string, DashboardEntityView>>();

function findEntityViewByAlias(
  viewsByProviderId: ReturnType<typeof integrationSelectors.providerEntityViewsByProviderId>,
  entityId: string
) {
  let aliases = entityViewAliases.get(viewsByProviderId);
  if (!aliases) {
    aliases = new Map<string, DashboardEntityView>();
    for (const providerViews of Object.values(viewsByProviderId)) {
      for (const view of Object.values(providerViews)) {
        for (const alias of [view.id, view.externalId, view.canonicalId]) {
          if (alias && !aliases.has(alias)) {
            aliases.set(alias, view);
          }
        }
      }
    }
    entityViewAliases.set(viewsByProviderId, aliases);
  }

  return aliases.get(entityId) ?? null;
}

function formatEntityState(value: unknown, t: TranslateFn) {
  if (value === null || value === undefined || value === '') {
    return t('widgets.generic.unknown');
  }

  if (typeof value === 'boolean') {
    return value ? t('common.on') : t('common.off');
  }

  return String(value);
}

const ENTITY_TYPE_KEYS: Record<string, TranslationKey> = {
  light: 'deviceType.light',
  lights: 'deviceType.light',
  climate: 'deviceType.climate',
  hvac: 'deviceType.hvac',
  media: 'deviceType.media',
  weather: 'deviceType.weather',
  switch: 'deviceType.switch',
  switches: 'deviceType.switch',
  cover: 'deviceType.cover',
  covers: 'deviceType.cover',
  lock: 'deviceType.lock',
  locks: 'deviceType.lock',
  scene: 'deviceType.scene',
  scenes: 'deviceType.scene',
  automation: 'deviceType.automation',
  person: 'deviceType.person',
  persons: 'deviceType.person',
  sensor: 'deviceType.sensor',
  sensors: 'deviceType.sensor',
  script: 'deviceType.script',
  helper: 'deviceType.helper',
  helpers: 'deviceType.helper',
  timer: 'deviceType.timer',
  timers: 'deviceType.timer',
  counter: 'deviceType.counter',
  counters: 'deviceType.counter',
  valve: 'deviceType.valve',
  valves: 'deviceType.valve',
  remote: 'deviceType.remote',
  remotes: 'deviceType.remote',
  vacuum: 'deviceType.vacuum',
  calendar: 'deviceType.calendar',
  camera: 'deviceType.camera',
  cameras: 'deviceType.camera',
};

function formatEntityType(type: string | undefined, t: TranslateFn) {
  if (!type) {
    return t('widgets.generic.entity');
  }

  const translationKey = ENTITY_TYPE_KEYS[type];
  if (translationKey) return t(translationKey);

  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLastUpdated(value: string | undefined, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getAvailabilityMeta(availability: string | undefined, t: TranslateFn) {
  switch (availability) {
    case 'available':
      return {
        label: t('widgets.generic.available'),
        Icon: Activity,
        className: 'text-emerald-300',
      };
    case 'unavailable':
      return {
        label: t('widgets.generic.unavailable'),
        Icon: CircleSlash,
        className: 'text-amber-300',
      };
    case 'unknown':
      return {
        label: t('widgets.generic.unknown'),
        Icon: CircleHelp,
        className: 'text-white/55',
      };
    default:
      return {
        label: t('widgets.generic.unknown'),
        Icon: CircleAlert,
        className: 'text-white/55',
      };
  }
}

export function GenericEntityWidget({
  size,
  data,
  language = 'en',
  t = defaultTranslate,
}: GenericEntityWidgetProps) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const entityId = data?.entityId;
  const entity = useIntegrationStore((state) => {
    if (!entityId) {
      return null;
    }

    const directEntity = integrationSelectors.providerEntityViewsByCanonicalId(state)[entityId];
    if (directEntity) {
      return directEntity;
    }

    return findEntityViewByAlias(
      integrationSelectors.providerEntityViewsByProviderId(state),
      entityId
    );
  });

  const availability = getAvailabilityMeta(entity?.availability, t);
  const AvailabilityIcon = availability.Icon;
  const lastUpdated = formatLastUpdated(entity?.lastUpdated, getLocaleForLanguage(language));
  const entityType = formatEntityType(entity?.type, t);

  return (
    <BaseCard size={size} className="overflow-hidden">
      <div className="flex h-full min-h-0 flex-col justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={`truncate text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${surface.textSecondary}`}
            >
              {entityType}
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold ${availability.className}`}
            >
              <AvailabilityIcon className="h-3 w-3" aria-hidden="true" />
              {availability.label}
            </span>
          </div>
          <h3 className={`truncate text-sm font-semibold ${surface.textPrimary}`}>
            {entity?.name ?? entityId ?? t('widgets.generic.entity')}
          </h3>
          {entity?.room ? (
            <p className={`mt-1 truncate text-xs ${surface.textSecondary}`}>{entity.room}</p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className={`truncate text-2xl font-semibold ${surface.textPrimary}`}>
            {formatEntityState(entity?.primaryState, t)}
          </div>
          <div className={`mt-1 truncate text-[0.7rem] ${surface.textMuted}`}>
            {lastUpdated ?? entity?.externalId ?? entity?.canonicalId ?? entityId}
          </div>
        </div>
      </div>
    </BaseCard>
  );
}
