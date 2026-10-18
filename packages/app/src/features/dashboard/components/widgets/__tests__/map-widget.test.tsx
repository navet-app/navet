import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapMarker } from '../map-types';
import { MapWidget } from '../map-widget';

const { useProviderMapMarkersMock } = vi.hoisted(() => ({
  useProviderMapMarkersMock: vi.fn(() => []),
}));

vi.mock('../map-widget-live', () => ({
  MapWidgetLive: ({ markers }: { markers: MapMarker[] }) => (
    <div data-testid="live-map" data-marker-picture={markers[0]?.entityPicture ?? ''} />
  ),
}));

vi.mock('../use-provider-map-markers', () => ({
  useProviderMapMarkers: useProviderMapMarkersMock,
}));

const MARKERS: MapMarker[] = [
  {
    id: 'person.vishal',
    name: 'Vishal',
    latitude: 59.33,
    longitude: 18.06,
    state: 'home',
    entityPicture: '/api/image/serve/person-vishal/512x512',
  },
];
const MARKERS_WITHOUT_PICTURE = MARKERS.map(
  ({ entityPicture: _entityPicture, ...marker }) => marker
);

describe('MapWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    useProviderMapMarkersMock.mockClear();
    useProviderMapMarkersMock.mockReturnValue([]);
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      currentUser: null,
    });
  });

  it('renders the placeholder immediately before mounting the live map', () => {
    renderWithProviders(<MapWidget markers={MARKERS} />);

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Locations: 1')).toBeInTheDocument();
    expect(screen.getByTestId('map-widget-viewport').className).toContain('rounded-[inherit]');
    expect(screen.getByRole('link', { name: '© OpenMapTiles' })).toHaveAttribute(
      'href',
      'https://openmaptiles.org/'
    );
    expect(screen.getByRole('link', { name: '© OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright'
    );
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    expect(useProviderMapMarkersMock).toHaveBeenLastCalledWith(false);
  });

  it('mounts the live map after the defer timeout without requiring interaction', async () => {
    renderWithProviders(<MapWidget markers={MARKERS} />);

    act(() => {
      vi.advanceTimersByTime(1_200);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('live-map')).toBeInTheDocument();
  });

  it('passes the matching signed-in user profile photo to the live marker', async () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentUser: {
        id: 'user-vishal',
        name: 'Vishal Gupta',
        avatarUrl: 'https://images.example.com/vishal.png',
      },
    });
    renderWithProviders(<MapWidget markers={MARKERS_WITHOUT_PICTURE} />);

    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('live-map')).toHaveAttribute(
      'data-marker-picture',
      'https://images.example.com/vishal.png'
    );
  });

  it('subscribes to provider markers only while a dynamic map is near the viewport', () => {
    let observerCallback: IntersectionObserverCallback | null = null;

    class TrackingIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      disconnect() {}
      observe() {}
    }

    vi.stubGlobal('IntersectionObserver', TrackingIntersectionObserver);
    renderWithProviders(<MapWidget />);

    expect(useProviderMapMarkersMock).toHaveBeenLastCalledWith(false);

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(useProviderMapMarkersMock).toHaveBeenLastCalledWith(true);

    act(() => {
      observerCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(useProviderMapMarkersMock).toHaveBeenLastCalledWith(false);
  });
});
