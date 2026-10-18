import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard, Button } from '@navet/app/components/primitives';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { RenderProfiler } from '@navet/app/components/shared/render-profiler';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { normalizeCustomCardTint } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import {
  getMapControlSurfaceTokens,
  getMapWidgetSurfaceTokens,
} from '@navet/app/components/shared/theme/map-widget-surface-tokens';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useIntegrationStore, usePrimaryColor, useThemeMode } from '@navet/app/hooks';
import { useDeferredVisibility } from '@navet/app/hooks/use-deferred-visibility';
import { normalizeResourceUrl } from '@navet/app/services/integration-resource.service';
import { integrationSelectors, settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import { MapPin } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveDashboardPerformanceProfile } from '../../hooks/use-dashboard-performance-mode';
import { MapHistoryDialog, type MapHistoryOverlay } from './map-history-dialog';
import { getCompactHomeAssistantImageUrl } from './map-image-url';
import { applyCurrentUserAvatar, mapMarkersEqual } from './map-markers';
import { getMapStyleUrl } from './map-tiles';
import type { MapMarker } from './map-types';
import { useProviderMapMarkers } from './use-provider-map-markers';
import { getDashboardWidgetSurfaceTokens } from './widget-surface-tokens';

const MapWidgetLive = lazy(async () => {
  const module = await import('./map-widget-live');
  return { default: module.MapWidgetLive };
});

export interface MapWidgetProps {
  size?: CardSize;
  tintColor?: string;
  markers?: readonly MapMarker[];
}

function requestDeferredMapReady(callback: () => void) {
  const timeoutId = window.setTimeout(callback, 1200);

  return () => {
    window.clearTimeout(timeoutId);
  };
}

function MapPlaceholder({
  baseSurface,
  cardShell,
  description,
  title,
  size,
}: {
  baseSurface: ReturnType<typeof getThemeSurfaceTokens>;
  cardShell: ReturnType<typeof getCardShellSurfaceTokens>;
  description: string;
  title: string;
  size: CardSize;
}) {
  return (
    <div
      className={`absolute inset-0 ${baseSurface.panel} ${cardShell.backdropClassName}`}
      data-map-placeholder="true"
    >
      <CardEmptyState
        title={title}
        description={description}
        icon={MapPin}
        size={size}
        className="h-full px-4"
      />
    </div>
  );
}

export const MapWidget = memo(function MapWidget({
  size = 'large',
  tintColor,
  markers: staticMarkers,
}: MapWidgetProps) {
  const theme = useThemeMode();
  const primaryColor = usePrimaryColor();
  const { t, locale } = useI18n();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MapHistoryOverlay | null>(null);
  const zoneLabel = useCallback((count: string) => t('widgets.map.zonePeople', { count }), [t]);
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const currentUser = useIntegrationStore(integrationSelectors.currentUser);
  const { disableAnimations, lowPowerMode, effectsQuality } = useSettingsStore(
    useShallow((state) => ({
      disableAnimations: state.disableAnimations,
      lowPowerMode: state.lowPowerMode,
      effectsQuality: settingsSelectors.effectsQuality(state),
    }))
  );
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection: 'home',
        deviceTier: detectDeviceTier(),
        effectsQuality,
        isEditMode: false,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: staticMarkers?.length ?? 0,
        visibleDevices: [],
      }),
    [disableAnimations, effectsQuality, lowPowerMode, staticMarkers?.length]
  );
  const shouldReduceMapEffects = !performanceProfile.allowBackdropBlur;
  const { ref: mapViewportRef, isVisible: isMapVisible } = useDeferredVisibility<HTMLDivElement>({
    freezeOnceVisible: false,
    rootMargin: '180px 0px',
  });
  const surface = getDashboardWidgetSurfaceTokens(theme, tintColor);
  const baseSurface = getThemeSurfaceTokens(theme);
  const cardShell = getCardShellSurfaceTokens(theme);
  const accentHex = normalizeCustomCardTint(tintColor) ?? getThemeColorValue(primaryColor);
  const mapStyleUrl = getMapStyleUrl(theme);
  const isSmallCard = size === 'small';
  const mapWidgetSurface = useMemo(() => {
    const tokens = getMapWidgetSurfaceTokens(theme);
    if (!shouldReduceMapEffects) {
      return tokens;
    }

    return {
      ...tokens,
      tileFilter: 'none',
      popupShadow: 'none',
    };
  }, [shouldReduceMapEffects, theme]);
  const mapControlSurface = getMapControlSurfaceTokens(theme, baseSurface, cardShell);
  const [isMapDeferredReady, setIsMapDeferredReady] = useState(false);
  const mapFrameStyle = useMemo(
    () => ({
      borderColor:
        typeof surface.panelStyle?.borderColor === 'string'
          ? surface.panelStyle.borderColor
          : undefined,
      boxShadow: 'none',
    }),
    [surface.panelStyle]
  );
  const mapInnerStyle = useMemo(
    () =>
      surface.panelStyle
        ? {
            ...surface.panelStyle,
            boxShadow: 'none',
          }
        : undefined,
    [surface.panelStyle]
  );
  const homeAssistantMarkers = useProviderMapMarkers(staticMarkers === undefined && isMapVisible);
  const markers = staticMarkers ?? homeAssistantMarkers;
  const stableResolvedMarkersRef = useRef<MapMarker[]>([]);
  const resolvedMarkers = useMemo(() => {
    const markersWithCurrentUserAvatar = applyCurrentUserAvatar(
      markers,
      currentUser,
      currentProviderId
    );
    const nextMarkers = markersWithCurrentUserAvatar.map((marker) => ({
      ...marker,
      entityPicture: marker.entityPicture
        ? (normalizeResourceUrl(
            getCompactHomeAssistantImageUrl(marker.entityPicture),
            marker.providerId ?? currentProviderId
          ) ?? undefined)
        : undefined,
    }));

    if (mapMarkersEqual(stableResolvedMarkersRef.current, nextMarkers)) {
      return stableResolvedMarkersRef.current;
    }

    stableResolvedMarkersRef.current = nextMarkers;
    return nextMarkers;
  }, [currentProviderId, currentUser, markers]);
  const activeHistory =
    history &&
    resolvedMarkers.some((marker) => marker.id === history.markerId && marker.canShowHistory)
      ? history
      : null;
  const shouldRenderLiveMap = resolvedMarkers.length > 0 && isMapVisible && isMapDeferredReady;

  const defaultCenter = useMemo<[number, number]>(() => [20, 0], []);

  useEffect(() => {
    if (resolvedMarkers.length === 0) {
      setIsMapDeferredReady(false);
      return;
    }

    if (!isMapVisible) {
      return;
    }

    return requestDeferredMapReady(() => setIsMapDeferredReady(true));
  }, [isMapVisible, resolvedMarkers.length]);

  return (
    <RenderProfiler
      id={`MapWidget:${size}`}
      metadata={{
        effectiveEffectsQuality: performanceProfile.effectiveEffectsQuality,
        reducePolling: performanceProfile.reducePolling,
      }}
    >
      <BaseCard
        size={size}
        fullBleed
        className="!shadow-none !drop-shadow-none"
        frameClassName={surface.outerFrameClassName}
        style={mapFrameStyle}
        disableDefaultSheen
        contentClassName="h-full"
      >
        <div
          ref={mapViewportRef}
          className={`${surface.innerFrameClassName} z-2 overflow-hidden rounded-[inherit] ${baseSurface.panel} ${cardShell.backdropClassName}`}
          data-testid="map-widget-viewport"
          style={mapInnerStyle}
        >
          {surface.glowStyle ? (
            <div
              className="pointer-events-none absolute inset-0"
              data-dashboard-glow="true"
              style={surface.glowStyle}
            />
          ) : null}
          {resolvedMarkers.length === 0 ? (
            <MapPlaceholder
              baseSurface={baseSurface}
              cardShell={cardShell}
              title={t('widgets.map.title')}
              description={t('widgets.map.noTrackers')}
              size={size}
            />
          ) : shouldRenderLiveMap ? (
            <Suspense
              fallback={
                <MapPlaceholder
                  baseSurface={baseSurface}
                  cardShell={cardShell}
                  title={t('widgets.map.title')}
                  description={t('widgets.map.trackerCount', { count: resolvedMarkers.length })}
                  size={size}
                />
              }
            >
              <MapWidgetLive
                accentHex={accentHex}
                defaultCenter={defaultCenter}
                isSmallCard={isSmallCard}
                mapStyleUrl={mapStyleUrl}
                mapWidgetSurface={mapWidgetSurface}
                markers={resolvedMarkers}
                paths={activeHistory?.segments}
                zoneLabel={zoneLabel}
              />
            </Suspense>
          ) : (
            <MapPlaceholder
              baseSurface={baseSurface}
              cardShell={cardShell}
              title={t('widgets.map.title')}
              description={t('widgets.map.trackerCount', { count: resolvedMarkers.length })}
              size={size}
            />
          )}
          {shouldRenderLiveMap && surface.overlayClassName ? (
            <div
              className={`pointer-events-none absolute inset-0 z-[350] ${surface.overlayClassName}`}
            />
          ) : null}
          {shouldRenderLiveMap && baseSurface.lightOverlay ? (
            <div
              className={`pointer-events-none absolute inset-0 z-[351] ${baseSurface.lightOverlay}`}
            />
          ) : null}
          {resolvedMarkers.some((marker) => marker.canShowHistory) ? (
            <div className="absolute inset-x-3 top-3 z-[450] flex flex-wrap items-center gap-2">
              <Button variant="soft" size="small" onClick={() => setHistoryOpen(true)}>
                {t('widgets.map.history')}
              </Button>
              {activeHistory ? (
                <Button
                  variant="soft"
                  size="small"
                  onClick={() => setHistory(null)}
                  aria-label={`${t('widgets.map.clearHistory')}: ${activeHistory.name}`}
                >
                  {t('widgets.map.clearHistory')}
                </Button>
              ) : null}
              {activeHistory ? (
                <span className={`text-xs ${baseSurface.textPrimary}`}>
                  {activeHistory.name} ·{' '}
                  {t('widgets.map.historyUntil', {
                    time: new Date(activeHistory.endTime).toLocaleString(locale),
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
          <div
            className={`pointer-events-auto absolute z-[450] ${mapControlSurface.attributionPositionClassName} ${mapControlSurface.attributionClassName}`}
          >
            <a
              href="https://openmaptiles.org/"
              target="_blank"
              rel="noreferrer"
              className={`whitespace-nowrap ${baseSurface.textSecondary}`}
            >
              © OpenMapTiles
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className={`whitespace-nowrap ${baseSurface.textSecondary}`}
            >
              © OpenStreetMap
            </a>
          </div>
        </div>
      </BaseCard>
      {historyOpen ? (
        <MapHistoryDialog
          markers={resolvedMarkers}
          onClose={() => setHistoryOpen(false)}
          onApply={setHistory}
        />
      ) : null}
    </RenderProfiler>
  );
});
