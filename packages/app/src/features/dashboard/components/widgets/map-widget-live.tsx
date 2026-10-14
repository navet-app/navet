import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapWidgetSurfaceTokens } from '@navet/app/components/shared/theme/map-widget-surface-tokens';
import type { PlatformLocationPoint } from '@navet/core/provider-feature-models';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  Popup as MapLibrePopup,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { MapMarker } from './map-types';

const EMPTY_PATHS: readonly PlatformLocationPoint[][] = [];
const ZONE_SOURCE_ID = 'navet-map-zones';
const PATH_SOURCE_ID = 'navet-map-history';
const ACCURACY_SOURCE_ID = 'navet-map-accuracy';
const ACCURACY_FILL_LAYER_ID = 'navet-map-accuracy-fill';
const ACCURACY_LINE_LAYER_ID = 'navet-map-accuracy-line';
const ACCURACY_CIRCLE_POINT_COUNT = 48;
const METERS_PER_LATITUDE_DEGREE = 111_320;

interface AccuracyFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, never>;
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

function createMarkerElement(marker: MapMarker, accentHex: string) {
  const size = 36;
  const isHome = marker.state === 'home';
  const wrapper = document.createElement('div');
  const pin = document.createElement('div');
  const dot = document.createElement('div');

  wrapper.setAttribute('aria-label', `${marker.name}, ${marker.state}`);
  wrapper.setAttribute('role', 'button');
  wrapper.tabIndex = 0;
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      wrapper.click();
    }
  });
  Object.assign(wrapper.style, {
    cursor: 'pointer',
    height: `${size + 8}px`,
    width: `${size}px`,
  });
  Object.assign(pin.style, {
    alignItems: 'center',
    backdropFilter: 'blur(4px)',
    background: marker.entityPicture ? 'transparent' : isHome ? accentHex : 'rgba(30,30,40,0.85)',
    border: `1px solid ${isHome ? accentHex : 'rgba(255,255,255,0.35)'}`,
    borderRadius: '50%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
    display: 'flex',
    height: `${size}px`,
    justifyContent: 'center',
    overflow: 'hidden',
    width: `${size}px`,
  });
  Object.assign(dot.style, {
    background: isHome ? accentHex : 'rgba(255,255,255,0.45)',
    borderRadius: '50%',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    height: '6px',
    margin: '-2px auto 0',
    width: '6px',
  });

  if (marker.entityPicture) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = marker.entityPicture;
    Object.assign(image.style, {
      borderRadius: '50%',
      height: '100%',
      objectFit: 'cover',
      width: '100%',
    });
    pin.append(image);
  } else {
    const initials = marker.name
      .split(' ')
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
    const label = document.createElement('span');
    label.textContent = initials;
    Object.assign(label.style, {
      color: '#fff',
      fontSize: '12px',
      fontWeight: '700',
      lineHeight: '1',
    });
    pin.append(label);
  }

  wrapper.append(pin, dot);
  return wrapper;
}

function createPopupElement(marker: MapMarker, zoneLabel?: (count: string) => string) {
  const content = document.createElement('div');
  const title = document.createElement('div');
  const state = document.createElement('div');

  content.style.minWidth = '120px';
  title.textContent = marker.name;
  Object.assign(title.style, { fontWeight: '700', marginBottom: '2px' });
  state.textContent = marker.kind === 'zone' && zoneLabel ? zoneLabel(marker.state) : marker.state;
  Object.assign(state.style, {
    fontSize: '12px',
    opacity: '0.7',
    textTransform: 'capitalize',
  });
  content.append(title, state);

  if (typeof marker.gpsAccuracy === 'number') {
    const accuracy = document.createElement('div');
    accuracy.textContent = `±${marker.gpsAccuracy} m`;
    Object.assign(accuracy.style, { fontSize: '11px', marginTop: '2px', opacity: '0.55' });
    content.append(accuracy);
  }

  return content;
}

function createAccuracyFeatureCollection(markers: readonly MapMarker[]): AccuracyFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.flatMap((marker) => {
      if (!(typeof marker.gpsAccuracy === 'number' && marker.gpsAccuracy > 0)) {
        return [];
      }

      const latitudeRadius = marker.gpsAccuracy / METERS_PER_LATITUDE_DEGREE;
      const longitudeScale = Math.max(Math.cos((marker.latitude * Math.PI) / 180), 0.01);
      const longitudeRadius = latitudeRadius / longitudeScale;
      const coordinates: number[][] = [];

      for (let index = 0; index <= ACCURACY_CIRCLE_POINT_COUNT; index += 1) {
        const angle = (index / ACCURACY_CIRCLE_POINT_COUNT) * Math.PI * 2;
        coordinates.push([
          marker.longitude + Math.cos(angle) * longitudeRadius,
          marker.latitude + Math.sin(angle) * latitudeRadius,
        ]);
      }

      return [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [coordinates],
          },
        },
      ];
    }),
  };
}

function addAccuracyLayers(map: MapLibreMap, markers: readonly MapMarker[], accentHex: string) {
  const data = createAccuracyFeatureCollection(markers);
  map.addSource(ACCURACY_SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: ACCURACY_FILL_LAYER_ID,
    type: 'fill',
    source: ACCURACY_SOURCE_ID,
    paint: {
      'fill-color': accentHex,
      'fill-opacity': 0.08,
    },
  });
  map.addLayer({
    id: ACCURACY_LINE_LAYER_ID,
    type: 'line',
    source: ACCURACY_SOURCE_ID,
    paint: {
      'line-color': accentHex,
      'line-width': 1,
    },
  });
}

interface MapWidgetLiveProps {
  accentHex: string;
  defaultCenter: [number, number];
  isSmallCard: boolean;
  mapStyleUrl: string;
  mapWidgetSurface: MapWidgetSurfaceTokens;
  markers: readonly MapMarker[];
  paths?: readonly PlatformLocationPoint[][];
  zoneLabel?: (count: string) => string;
}

export function MapWidgetLive({
  accentHex,
  defaultCenter,
  isSmallCard,
  mapStyleUrl,
  mapWidgetSurface,
  markers,
  paths = EMPTY_PATHS,
  zoneLabel,
}: MapWidgetLiveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const map = new MapLibreMap({
      attributionControl: false,
      center: [defaultCenter[1], defaultCenter[0]],
      container,
      maxZoom: 19,
      minZoom: 1,
      style: mapStyleUrl,
      zoom: 4,
    });
    mapRef.current = map;
    map.setMissingStyleImageResolver((imageId) => {
      if (!map.hasImage(imageId)) {
        map.addImage(imageId, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [defaultCenter, isSmallCard, mapStyleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    let renderedMarkers: MapLibreMarker[] = [];
    const renderMapContent = () => {
      renderedMarkers = markers.map((marker) =>
        new MapLibreMarker({
          anchor: 'bottom',
          element: createMarkerElement(marker, accentHex),
        })
          .setLngLat([marker.longitude, marker.latitude])
          .setPopup(
            new MapLibrePopup({ offset: 24 }).setDOMContent(createPopupElement(marker, zoneLabel))
          )
          .addTo(map)
      );
      addAccuracyLayers(map, markers, accentHex);
      map.addSource(ZONE_SOURCE_ID, {
        type: 'geojson',
        data: createAccuracyFeatureCollection(
          markers
            .filter((marker) => marker.kind === 'zone')
            .map((marker) => ({ ...marker, gpsAccuracy: marker.radiusMeters }))
        ),
      });
      map.addLayer({
        id: `${ZONE_SOURCE_ID}-fill`,
        type: 'fill',
        source: ZONE_SOURCE_ID,
        paint: { 'fill-color': accentHex, 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: `${ZONE_SOURCE_ID}-line`,
        type: 'line',
        source: ZONE_SOURCE_ID,
        paint: { 'line-color': accentHex, 'line-width': 1, 'line-opacity': 0.5 },
      });
      map.addSource(PATH_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: paths
            .filter((segment) => segment.length > 1)
            .map((segment) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: segment.map((point) => [point.longitude, point.latitude]),
              },
            })),
        },
      });
      map.addLayer({
        id: `${PATH_SOURCE_ID}-line`,
        type: 'line',
        source: PATH_SOURCE_ID,
        paint: { 'line-color': accentHex, 'line-width': 2, 'line-opacity': 0.8 },
      });

      if (
        markers.length === 1 &&
        paths.length === 0 &&
        !(markers[0].radiusMeters && markers[0].kind === 'zone')
      ) {
        map.jumpTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 13 });
      } else if (markers.length > 0 || paths.length > 0) {
        const bounds = new LngLatBounds();
        for (const marker of markers) bounds.extend([marker.longitude, marker.latitude]);
        const zoneExtent = createAccuracyFeatureCollection(
          markers
            .filter((marker) => marker.kind === 'zone')
            .map((marker) => ({ ...marker, gpsAccuracy: marker.radiusMeters }))
        );
        for (const feature of zoneExtent.features)
          for (const ring of feature.geometry.coordinates)
            for (const coordinate of ring) bounds.extend([coordinate[0], coordinate[1]]);
        for (const segment of paths)
          for (const point of segment) bounds.extend([point.longitude, point.latitude]);
        map.fitBounds(bounds, { duration: 0, maxZoom: 15, padding: 32 });
      }
    };

    if (map.isStyleLoaded()) {
      renderMapContent();
    } else {
      map.once('style.load', renderMapContent);
    }

    return () => {
      map.off('style.load', renderMapContent);
      for (const marker of renderedMarkers) {
        marker.remove();
      }
      renderedMarkers = [];

      if (mapRef.current === map) {
        for (const id of [
          `${PATH_SOURCE_ID}-line`,
          `${ZONE_SOURCE_ID}-line`,
          `${ZONE_SOURCE_ID}-fill`,
        ]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [PATH_SOURCE_ID, ZONE_SOURCE_ID]) {
          if (map.getSource(id)) map.removeSource(id);
        }
        if (map.getLayer(ACCURACY_LINE_LAYER_ID)) {
          map.removeLayer(ACCURACY_LINE_LAYER_ID);
        }
        if (map.getLayer(ACCURACY_FILL_LAYER_ID)) {
          map.removeLayer(ACCURACY_FILL_LAYER_ID);
        }
        if (map.getSource(ACCURACY_SOURCE_ID)) {
          map.removeSource(ACCURACY_SOURCE_ID);
        }
      }
    };
  }, [accentHex, isSmallCard, mapStyleUrl, markers, paths, zoneLabel]);

  return (
    <>
      <div
        ref={containerRef}
        className="dashboard-map-widget h-full w-full overflow-hidden rounded-[inherit]"
      />

      <style>{`
        .dashboard-map-widget,
        .dashboard-map-widget.maplibregl-map,
        .dashboard-map-widget .maplibregl-canvas-container,
        .dashboard-map-widget .maplibregl-canvas {
          border-radius: inherit;
          overflow: hidden;
        }

        .dashboard-map-widget .maplibregl-canvas {
          opacity: ${mapWidgetSurface.tileOpacity};
          filter: ${mapWidgetSurface.tileFilter};
        }

        .dashboard-map-widget .maplibregl-popup-content,
        .dashboard-map-widget .maplibregl-popup-tip {
          background: ${mapWidgetSurface.popupBg};
          color: ${mapWidgetSurface.popupText};
          border: 1px solid ${mapWidgetSurface.popupBorder};
          box-shadow: ${mapWidgetSurface.popupShadow};
        }

        .dashboard-map-widget .maplibregl-popup-content {
          border-radius: 12px;
        }
      `}</style>
    </>
  );
}
