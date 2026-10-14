import { OPENFREEMAP_LIGHT_STYLE_URL } from '@navet/app/constants';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapWidgetLive } from '../map-widget-live';

const { addControlMock, mapInstances, mapRemoveMock } = vi.hoisted(() => ({
  addControlMock: vi.fn(),
  mapInstances: [] as Array<Record<string, unknown>>,
  mapRemoveMock: vi.fn(),
}));

vi.mock('maplibre-gl', () => {
  class MapMock {
    addControl = addControlMock;
    addImage = vi.fn();
    addLayer = vi.fn();
    addSource = vi.fn();
    fitBounds = vi.fn();
    getLayer = vi.fn(() => undefined);
    getSource = vi.fn(() => undefined);
    hasImage = vi.fn(() => false);
    jumpTo = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    off = vi.fn();
    once = vi.fn();
    remove = mapRemoveMock;
    removeLayer = vi.fn();
    removeSource = vi.fn();
    setMissingStyleImageResolver = vi.fn();

    constructor(options: Record<string, unknown>) {
      Object.assign(this, { options });
      mapInstances.push(this as unknown as Record<string, unknown>);
    }
  }

  return {
    LngLatBounds: class {
      extend = vi.fn();
    },
    Map: MapMock,
    Marker: class {
      element: HTMLElement;
      constructor({ element }: { element: HTMLElement }) {
        this.element = element;
      }
      setLngLat() {
        return this;
      }
      setPopup() {
        return this;
      }
      addTo(map: { options: { container: HTMLElement } }) {
        map.options.container.append(this.element);
        return this;
      }
      remove() {
        this.element.remove();
      }
    },
    Popup: class {
      setDOMContent() {
        return this;
      }
    },
  };
});

describe('MapWidgetLive', () => {
  beforeEach(() => {
    addControlMock.mockClear();
    mapInstances.length = 0;
    mapRemoveMock.mockClear();
  });

  it('mounts and cleans up the keyless OpenFreeMap vector map', () => {
    const { unmount } = render(
      <MapWidgetLive
        accentHex="#f97316"
        defaultCenter={[20, 0]}
        isSmallCard={false}
        mapStyleUrl={OPENFREEMAP_LIGHT_STYLE_URL}
        mapWidgetSurface={{
          popupBg: '#fff',
          popupBorder: '#ddd',
          popupShadow: 'none',
          popupText: '#111',
          tileFilter: 'none',
          tileOpacity: '1',
        }}
        markers={[]}
      />
    );

    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0].options).toEqual(
      expect.objectContaining({
        attributionControl: false,
        style: OPENFREEMAP_LIGHT_STYLE_URL,
      })
    );
    expect(addControlMock).not.toHaveBeenCalled();

    unmount();
    expect(mapRemoveMock).toHaveBeenCalledOnce();
  });
  it('draws a zone radius and recorded segments while keeping markers keyboard accessible', () => {
    render(
      <MapWidgetLive
        accentHex="#f97316"
        defaultCenter={[20, 0]}
        isSmallCard={false}
        mapStyleUrl={OPENFREEMAP_LIGHT_STYLE_URL}
        mapWidgetSurface={{
          popupBg: '#fff',
          popupBorder: '#ddd',
          popupShadow: 'none',
          popupText: '#111',
          tileFilter: 'none',
          tileOpacity: '1',
        }}
        markers={[
          {
            id: 'zone.home',
            kind: 'zone',
            name: 'Home',
            latitude: 55,
            longitude: 13,
            state: '1',
            radiusMeters: 100,
          },
        ]}
        paths={[
          [
            { latitude: 55, longitude: 13, timestamp: '2026-10-14T10:00:00Z' },
            { latitude: 55.1, longitude: 13.1, timestamp: '2026-10-14T10:05:00Z' },
          ],
        ]}
      />
    );
    const marker = screen.getByRole('button', { name: 'Home, 1' });
    const click = vi.fn();
    marker.addEventListener('click', click);
    fireEvent.keyDown(marker, { key: 'Enter' });
    expect(click).toHaveBeenCalledOnce();
    const calls = (mapInstances[0].addSource as ReturnType<typeof vi.fn>).mock.calls;
    const circle = calls.find(([id]) => id === 'navet-map-zones')?.[1].data.features[0].geometry;
    expect(circle.type).toBe('Polygon');
    expect(circle.coordinates[0]).toHaveLength(49);
    expect(circle.coordinates[0][0][0]).toBeGreaterThan(13);
    const path = calls.find(([id]) => id === 'navet-map-history')?.[1].data.features[0].geometry;
    expect(path).toEqual({
      type: 'LineString',
      coordinates: [
        [13, 55],
        [13.1, 55.1],
      ],
    });
    expect(mapInstances[0].fitBounds).toHaveBeenCalled();
  });
});
