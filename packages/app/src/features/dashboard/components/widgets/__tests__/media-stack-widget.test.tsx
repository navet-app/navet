import { renderWithProviders } from '@navet/app/test/render';
import type { DeviceCollection } from '@navet/app/types/device.types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaStackWidget } from '../media-stack-widget';

const { useAreaRoomsMock, useDeviceCollectionsByKeysMock, mediaCardMock, mediaDialogMock } =
  vi.hoisted(() => ({
    useAreaRoomsMock: vi.fn(),
    useDeviceCollectionsByKeysMock: vi.fn(),
    mediaCardMock: vi.fn(),
    mediaDialogMock: vi.fn(),
  }));

vi.mock('@navet/app/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@navet/app/hooks')>();

  return {
    ...actual,
    useAreaRooms: useAreaRoomsMock,
    useDeviceCollectionsByKeys: useDeviceCollectionsByKeysMock,
  };
});

vi.mock('@navet/app/features/media', () => ({
  MediaCard: (props: { id: string; title: string }) => {
    mediaCardMock(props);
    return <div>{`media-card:${props.id}:${props.title}`}</div>;
  },
}));

vi.mock('@navet/app/features/media/components/media/media-dialog', () => ({
  MediaDialog: (props: { isOpen: boolean }) => {
    mediaDialogMock(props);
    return props.isOpen ? <div aria-label="Stack settings" role="dialog" /> : null;
  },
}));

function createMediaCollection(
  stateOverrides: Array<Record<string, unknown>> = []
): DeviceCollection {
  return {
    lights: [],
    fans: [],
    hvac: [],
    climate: [],
    media: stateOverrides.map((overrides, index) => ({
      id: (overrides.id as string) ?? `media_player.device_${index}`,
      name: (overrides.name as string) ?? `Device ${index}`,
      room: (overrides.room as string) ?? 'Living Room',
      size: 'medium' as const,
      title: (overrides.title as string) ?? 'Nothing playing',
      artist: (overrides.artist as string) ?? 'Ready to play',
      state: (overrides.state as 'playing' | 'paused' | 'idle' | 'off') ?? 'off',
      volume: (overrides.volume as number) ?? 0,
      isMuted: (overrides.isMuted as boolean) ?? false,
      entityType: (overrides.entityType as string | undefined) ?? 'TV',
      deviceClass: (overrides.deviceClass as string | undefined) ?? 'tv',
      source: overrides.source as string | undefined,
      sourceList: overrides.sourceList as string[] | undefined,
      entityPicture: overrides.entityPicture as string | undefined,
      elapsedSeconds: overrides.elapsedSeconds as number | undefined,
      durationSeconds: overrides.durationSeconds as number | undefined,
      positionUpdatedAt: overrides.positionUpdatedAt as string | undefined,
      mediaCapabilities: overrides.mediaCapabilities as never,
      supportsGrouping: overrides.supportsGrouping as boolean | undefined,
      supportsPreviousTrack: overrides.supportsPreviousTrack as boolean | undefined,
      supportsNextTrack: overrides.supportsNextTrack as boolean | undefined,
      supportedFeatures: overrides.supportedFeatures as number | undefined,
      groupMembers: overrides.groupMembers as string[] | undefined,
    })),
    weather: [],
    switches: [],
    timers: [],
    counters: [],
    valves: [],
    remotes: [],
    helpers: [],
    covers: [],
    locks: [],
    scenes: [],
    persons: [],
    sensors: [],
    vacuums: [],
    calendars: [],
    cameras: [],
    'grouped-sensors': [],
  };
}

describe('MediaStackWidget', () => {
  beforeEach(() => {
    useAreaRoomsMock.mockReturnValue(['Living Room', 'Office']);
    useDeviceCollectionsByKeysMock.mockReturnValue(
      createMediaCollection([
        {
          id: 'media_player.living_room_tv',
          name: 'Living Room TV',
          state: 'paused',
          title: 'Apple TV',
        },
        {
          id: 'media_player.living_room_speaker',
          name: 'Living Room Speaker',
          state: 'playing',
          title: 'Jazz FM',
          deviceClass: 'speaker',
          entityType: 'Speaker',
        },
      ])
    );
    mediaCardMock.mockReset();
    mediaDialogMock.mockReset();
  });

  it('shows a non-interactive legacy empty state when no players are selected', () => {
    renderWithProviders(<MediaStackWidget onUpdate={vi.fn()} />);

    expect(screen.getByText('No media players selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Media players' })).not.toBeInTheDocument();
  });

  it('only supplies media players available to this stack', () => {
    renderWithProviders(
      <MediaStackWidget
        onUpdate={vi.fn()}
        availableEntityIds={['media_player.living_room_tv']}
        data={{
          entityIds: ['media_player.living_room_tv'],
          priorityOrder: ['media_player.living_room_tv'],
          idleBehavior: 'compact',
        }}
      />
    );

    expect(mediaCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaStackSettings: expect.objectContaining({
          playerOptions: [expect.objectContaining({ id: 'media_player.living_room_tv' })],
        }),
      })
    );
  });

  it('forwards edit settings to the visible media card with stack settings', () => {
    const data = {
      entityIds: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
      priorityOrder: ['media_player.living_room_speaker', 'media_player.living_room_tv'],
      idleBehavior: 'compact' as const,
    };
    const onUpdate = vi.fn();
    const { rerender } = renderWithProviders(
      <MediaStackWidget onUpdate={onUpdate} data={data} openSettingsRequestKey={0} />
    );

    rerender(<MediaStackWidget onUpdate={onUpdate} data={data} openSettingsRequestKey={1} />);

    expect(mediaCardMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'media_player.living_room_speaker',
        openSettingsRequestKey: 1,
        mediaStackSettings: expect.objectContaining({
          entityIds: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
        }),
      })
    );
  });

  it('renders the most relevant active player', () => {
    renderWithProviders(
      <MediaStackWidget
        data={{
          entityIds: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
          priorityOrder: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
          idleBehavior: 'compact',
        }}
      />
    );

    expect(
      screen.getByText('media-card:media_player.living_room_speaker:Jazz FM')
    ).toBeInTheDocument();
    expect(mediaCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'media_player.living_room_speaker',
      })
    );
  });

  it('shows side indicators and switches players with a vertical swipe or arrow keys', () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(
      <MediaStackWidget
        data={{
          entityIds: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
          priorityOrder: ['media_player.living_room_tv', 'media_player.living_room_speaker'],
          idleBehavior: 'compact',
        }}
      />
    );

    const stack = container.querySelector('[data-media-stack]');
    expect(stack).not.toBeNull();
    const dots = container.querySelectorAll('[data-media-stack] [data-active]');
    expect(dots).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Media players:/ })).not.toBeInTheDocument();
    fireEvent.touchStart(stack as Element, { touches: [{ clientX: 80, clientY: 120 }] });
    fireEvent.touchMove(stack as Element, { touches: [{ clientX: 82, clientY: 40 }] });
    expect(container.querySelector('[data-media-stack-card]')).toHaveStyle({
      transform: 'translate3d(0, -80px, 0)',
    });
    fireEvent.touchEnd(stack as Element, { changedTouches: [{ clientX: 82, clientY: 40 }] });
    act(() => vi.advanceTimersByTime(220));
    expect(screen.getByText('media-card:media_player.living_room_tv:Apple TV')).toBeInTheDocument();
    fireEvent.touchStart(stack as Element, { touches: [{ clientX: 80, clientY: 40 }] });
    fireEvent.touchMove(stack as Element, { touches: [{ clientX: 82, clientY: 120 }] });
    fireEvent.touchEnd(stack as Element, { changedTouches: [{ clientX: 82, clientY: 120 }] });
    act(() => vi.advanceTimersByTime(220));
    expect(
      screen.getByText('media-card:media_player.living_room_speaker:Jazz FM')
    ).toBeInTheDocument();
    fireEvent.keyDown(stack as Element, { key: 'ArrowDown' });
    expect(screen.getByText('media-card:media_player.living_room_tv:Apple TV')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows a compact fallback when none of the selected players is active', () => {
    useDeviceCollectionsByKeysMock.mockReturnValue(
      createMediaCollection([
        { id: 'media_player.living_room_tv', name: 'Living Room TV', state: 'off' },
      ])
    );

    renderWithProviders(
      <MediaStackWidget
        data={{
          entityIds: ['media_player.living_room_tv'],
          priorityOrder: ['media_player.living_room_tv'],
          idleBehavior: 'compact',
        }}
      />
    );

    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
    expect(screen.queryByText(/media-card:/)).not.toBeInTheDocument();
  });

  it('opens stack settings from edit mode while the compact idle fallback is shown', async () => {
    useDeviceCollectionsByKeysMock.mockReturnValue(
      createMediaCollection([
        { id: 'media_player.living_room_tv', name: 'Living Room TV', state: 'off' },
      ])
    );
    const data = {
      entityIds: ['media_player.living_room_tv'],
      priorityOrder: ['media_player.living_room_tv'],
      idleBehavior: 'compact' as const,
    };
    const onUpdate = vi.fn();
    const { rerender } = renderWithProviders(
      <MediaStackWidget data={data} onUpdate={onUpdate} openSettingsRequestKey={0} />
    );

    rerender(<MediaStackWidget data={data} onUpdate={onUpdate} openSettingsRequestKey={1} />);

    expect(await screen.findByRole('dialog', { name: 'Stack settings' })).toBeInTheDocument();
    await waitFor(() =>
      expect(mediaDialogMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: true,
          mediaStackSettings: expect.objectContaining({
            entityIds: ['media_player.living_room_tv'],
          }),
        })
      )
    );

    useDeviceCollectionsByKeysMock.mockReturnValue(
      createMediaCollection([
        {
          id: 'media_player.living_room_tv',
          name: 'Living Room TV',
          state: 'playing',
        },
      ])
    );
    rerender(<MediaStackWidget data={data} onUpdate={onUpdate} openSettingsRequestKey={1} />);

    expect(screen.getByRole('dialog', { name: 'Stack settings' })).toBeInTheDocument();
  });

  it('hides the widget when idle behavior is hidden and nothing is active', () => {
    useDeviceCollectionsByKeysMock.mockReturnValue(
      createMediaCollection([
        {
          id: 'media_player.living_room_tv',
          name: 'Living Room TV',
          state: 'off',
        },
      ])
    );

    const { queryByText } = renderWithProviders(
      <MediaStackWidget
        data={{
          entityIds: ['media_player.living_room_tv'],
          priorityOrder: ['media_player.living_room_tv'],
          idleBehavior: 'hidden',
        }}
      />
    );

    expect(queryByText(/media-card:/)).not.toBeInTheDocument();
    expect(screen.getByText('Selected media players unavailable')).toBeInTheDocument();
  });
});
