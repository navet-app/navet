import {
  getMediaPlayerCapabilities,
  MEDIA_PLAYER_FEATURES,
} from '@navet/app/constants/media-player-features';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { mediaCatalog } from '@navet/app/features/media/catalog/media-catalog';
import type { PlatformEntityRegistryEntry } from '@navet/app/platform/provider-feature-models';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { setMediaQueryMatch, setVisualViewportSize } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import type { MediaDevice } from '@navet/app/types/device.types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MediaDashboard,
  resolveMediaBrowserThumbnailUrl,
  resolveMusicAssistantThumbnailSourceUrl,
} from '../media-dashboard';

describe('media browser thumbnails', () => {
  it.each([
    '/api/image',
    '/api/media_player_proxy/media_player.kitchen?token=user',
    'https://cdn.example.test/cover.jpg',
  ])('preserves %s for provider resolution', (thumbnail) => {
    expect(
      resolveMediaBrowserThumbnailUrl({
        title: 'Album',
        mediaContentId: 'album:1',
        mediaContentType: 'album',
        thumbnail,
      })
    ).toBe(thumbnail);
  });

  it.each([
    'javascript:alert(1)',
    '//untrusted.test/image',
    '/%2Fexternal.test/image',
    '/api/../private',
    '/api/\\private',
  ])('rejects unsafe thumbnail %s', (thumbnail) => {
    expect(
      resolveMediaBrowserThumbnailUrl({
        title: 'Album',
        mediaContentId: 'album:1',
        mediaContentType: 'album',
        thumbnail,
      })
    ).toBeNull();
  });
});

describe('resolveMusicAssistantThumbnailSourceUrl', () => {
  it('uses the public source image embedded in a Music Assistant imageproxy URL', () => {
    expect(
      resolveMusicAssistantThumbnailSourceUrl(
        'http://music-assistant.local:8095/imageproxy?provider=spotify&size=500&path=https%253A%252F%252Fi.scdn.co%252Fimage%252Fab67616d0000b273cover'
      )
    ).toBe('https://i.scdn.co/image/ab67616d0000b273cover');
  });

  it('does not unwrap unsafe or unrelated thumbnail URLs', () => {
    expect(
      resolveMusicAssistantThumbnailSourceUrl(
        'http://music-assistant.local:8095/imageproxy?path=javascript%253Aalert(1)'
      )
    ).toBeNull();
    expect(
      resolveMusicAssistantThumbnailSourceUrl('https://cdn.example.test/cover.jpg')
    ).toBeNull();
  });
});

const {
  browseMediaPlayerMock,
  dispatchEntityCommandMock,
  liveMediaEntityMock,
  mediaEntityRegistryMock,
  playMediaMock,
  seekMediaMock,
  selectSourceMock,
} = vi.hoisted(() => ({
  browseMediaPlayerMock: vi.fn().mockResolvedValue({
    title: 'Library',
    children: [
      {
        title: 'Daily Mix',
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
        mediaClass: 'playlist',
        canPlay: true,
      },
    ],
  }),
  dispatchEntityCommandMock: vi.fn().mockResolvedValue({ accepted: true }),
  liveMediaEntityMock: vi.fn(),
  mediaEntityRegistryMock: vi.fn(() => [] as PlatformEntityRegistryEntry[]),
  playMediaMock: vi.fn().mockResolvedValue(undefined),
  seekMediaMock: vi.fn().mockResolvedValue(undefined),
  selectSourceMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@navet/app/services/integration-media-feature.service', () => ({
  integrationMediaFeatureService: {
    browseMediaPlayer: browseMediaPlayerMock,
    playMedia: playMediaMock,
    selectMediaPlayerSource: selectSourceMock,
    seekMediaPlayer: seekMediaMock,
  },
}));

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: dispatchEntityCommandMock,
}));

vi.mock('@navet/app/features/media/hooks/use-provider-media-playback-data', () => ({
  useProviderMediaEntity: liveMediaEntityMock,
  useProviderMediaCompanionEntity: vi.fn(() => undefined),
  useProviderMediaEntityRegistry: mediaEntityRegistryMock,
  useProviderMediaPlayerEntities: vi.fn(() => null),
}));

const mediaCapabilities = getMediaPlayerCapabilities(
  MEDIA_PLAYER_FEATURES.PAUSE |
    MEDIA_PLAYER_FEATURES.PLAY |
    MEDIA_PLAYER_FEATURES.PLAY_MEDIA |
    MEDIA_PLAYER_FEATURES.SELECT_SOURCE |
    MEDIA_PLAYER_FEATURES.BROWSE_MEDIA |
    MEDIA_PLAYER_FEATURES.VOLUME_SET
);
const mediaCapabilitiesWithoutBrowse = getMediaPlayerCapabilities(
  MEDIA_PLAYER_FEATURES.PAUSE |
    MEDIA_PLAYER_FEATURES.PLAY |
    MEDIA_PLAYER_FEATURES.PLAY_MEDIA |
    MEDIA_PLAYER_FEATURES.SELECT_SOURCE |
    MEDIA_PLAYER_FEATURES.VOLUME_SET
);

function createMediaDevice(overrides: Partial<MediaDevice> = {}): MediaDevice & { type: 'media' } {
  return {
    id: 'media_player.spotify',
    name: 'Spotify Vishal Chauhan',
    room: 'Kitchen',
    size: 'medium',
    title: 'Spotify Vishal Chauhan',
    artist: '',
    album: '',
    entityType: 'Media Player',
    state: 'idle',
    volume: 24,
    isMuted: false,
    source: undefined,
    sourceList: ['Kitchen', 'Living Room'],
    mediaCapabilities,
    supportsGrouping: false,
    supportsPreviousTrack: false,
    supportsNextTrack: false,
    groupMembers: [],
    type: 'media',
    ...overrides,
  };
}

describe('MediaDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mediaEntityRegistryMock.mockReturnValue([]);
    browseMediaPlayerMock.mockResolvedValue({
      title: 'Library',
      children: [
        {
          title: 'Daily Mix',
          mediaContentId: 'spotify:playlist:daily',
          mediaContentType: 'playlist',
          mediaClass: 'playlist',
          canPlay: true,
        },
      ],
    });
    liveMediaEntityMock.mockReturnValue(undefined);
    useThemeStore.getState().setTheme('glass');
  });

  it('uses opaque media source tiles in dark theme', async () => {
    useThemeStore.getState().setTheme('dark');
    browseMediaPlayerMock.mockResolvedValue({
      title: 'Media Library',
      children: [
        {
          title: 'Albums',
          mediaContentId: 'spotify:directory:albums',
          mediaContentType: 'album',
          mediaClass: 'directory',
          canExpand: true,
          canPlay: false,
        },
      ],
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    const sourceTile = await screen.findByRole('button', { name: /^Albums/ });
    expect(sourceTile).toHaveClass('bg-[rgba(24,24,27,0.97)]');
    expect(sourceTile).toHaveClass('rounded-[24px]');
    expect(sourceTile).not.toHaveClass('backdrop-blur-xl', 'bg-white/[0.04]');
    expect(screen.getByTestId('media-library-directory-icon')).toHaveClass(
      'bg-[rgba(39,39,42,0.94)]'
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders safely while no media devices are available', () => {
    const { container } = renderWithProviders(<MediaDashboard devices={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows browse without source selection for an idle Spotify account', async () => {
    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    await waitFor(() => expect(screen.getByText('Daily Mix')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Browse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load media browser' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Select an output before starting playback.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume playback' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coming next')).not.toBeInTheDocument();
  });

  it('shows an active browsable provider in Now Playing', async () => {
    const spotifyAccount = createMediaDevice();
    const musicAssistant = createMediaDevice({
      id: 'media_player.mass_bathroom',
      name: 'Music Assistant Bathroom',
      room: 'Bathroom',
      state: 'playing',
      title: 'The Silence',
      artist: 'Manchester Orchestra',
      source: 'Music Assistant',
      groupMembers: ['media_player.mass_bathroom', 'media_player.mass_living_room'],
    });
    const sonosOutput = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      state: 'playing',
      source: 'Spotify',
      sourceList: ['Spotify'],
    });
    const browseHelper = createMediaDevice({
      id: 'media_player.browse',
      name: 'Browse',
      state: 'playing',
      title: 'Browse',
      artist: '',
      album: '',
      source: undefined,
      entityPicture: undefined,
      durationSeconds: undefined,
    });

    renderWithProviders(
      <MediaDashboard devices={[spotifyAccount, browseHelper, sonosOutput, musicAssistant]} />
    );

    expect(await screen.findByText('The Silence')).toBeVisible();
    expect(screen.getByText('Manchester Orchestra')).toBeVisible();
    expect(screen.getByText('Music Assistant')).toBeVisible();
    expect(screen.queryByText('2 speakers')).not.toBeInTheDocument();
    expect(screen.queryByText('Music Assistant Bathroom +1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Group Speakers')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.mass_bathroom', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );
  });

  it('remembers an idle media session and replays its media identifier when Home Assistant clears it', async () => {
    const browseHelper = createMediaDevice({
      id: 'media_player.browse',
      name: 'Browse',
      state: 'playing',
      title: 'Browse',
      artist: '',
      album: '',
      entityPicture: undefined,
      durationSeconds: undefined,
    });
    const bathroom = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      room: 'Bathroom',
      state: 'idle',
      title: 'The Reservoir',
      artist: 'Small Forward',
      entityPicture: '/api/media_player_proxy/media_player.bathroom',
      elapsedSeconds: 2,
      durationSeconds: 308,
      positionUpdatedAt: '2026-07-13T12:00:00.000Z',
      mediaContentId: 'spotify:track:the-reservoir',
      mediaContentType: 'music',
      mediaCapabilities: { ...mediaCapabilities, canSeek: true },
    });
    const view = renderWithProviders(<MediaDashboard devices={[browseHelper, bathroom]} />);

    expect(screen.getByText('The Reservoir')).toBeInTheDocument();
    expect(screen.getByText('Small Forward')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bathroom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume playback' })).toBeEnabled();

    view.unmount();
    renderWithProviders(
      <MediaDashboard
        devices={[
          browseHelper,
          {
            ...bathroom,
            title: 'Bathroom',
            artist: '',
            entityPicture: undefined,
            elapsedSeconds: undefined,
            durationSeconds: undefined,
            positionUpdatedAt: undefined,
            mediaContentId: undefined,
            mediaContentType: undefined,
          },
        ]}
      />
    );

    expect(screen.getByText('The Reservoir')).toBeInTheDocument();
    expect(screen.getByText('Small Forward')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bathroom' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume playback' }));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: 'spotify:track:the-reservoir',
        mediaContentType: 'music',
      })
    );
    expect(seekMediaMock).toHaveBeenCalledWith('media_player.bathroom', 2);
    expect(dispatchEntityCommandMock).not.toHaveBeenCalled();
  });

  it('identifies opaque Music Assistant players from the entity registry', async () => {
    const spotifyAccount = createMediaDevice();
    const musicAssistant = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      room: 'Bathroom',
      state: 'playing',
      title: 'Strawberries',
      artist: 'Caamp',
      source: undefined,
      mediaCapabilities: mediaCapabilitiesWithoutBrowse,
      groupMembers: ['media_player.bathroom', 'media_player.living_room'],
    });
    const browseHelper = createMediaDevice({
      id: 'media_player.browse',
      name: 'Browse',
      state: 'idle',
      title: 'Browse',
      artist: '',
      source: undefined,
    });
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom', platform: 'music_assistant' },
    ]);

    renderWithProviders(
      <MediaDashboard devices={[spotifyAccount, browseHelper, musicAssistant]} />
    );

    expect(await screen.findByText('Strawberries')).toBeVisible();
    expect(screen.getByText('Music Assistant')).toBeVisible();
    expect(screen.queryByText('2 speakers')).not.toBeInTheDocument();
    expect(screen.queryByText('Bathroom +1')).not.toBeInTheDocument();
  });

  it('routes Now Playing transport through the matching physical player instead of its media-library wrapper', async () => {
    const musicAssistant = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      room: 'Bathroom',
      state: 'playing',
      title: "Don't Let Me Go",
      artist: 'Cigarettes After Sex',
      source: 'Spotify',
      mediaContentId: 'spotify://track/dont-let-me-go',
      mediaContentType: 'music',
    });
    const physicalPlayer = createMediaDevice({
      id: 'media_player.bathroom_bathroom',
      name: 'Bathroom',
      room: 'Bathroom',
      state: 'playing',
      title: "Don't Let Me Go",
      artist: 'Cigarettes After Sex',
      source: 'Spotify Connect',
      mediaContentId: 'x-sonos-spotify:dont-let-me-go',
      mediaContentType: 'music',
    });
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom', platform: 'music_assistant' },
      { entityId: 'media_player.bathroom_bathroom', platform: 'sonos' },
    ]);

    renderWithProviders(<MediaDashboard devices={[musicAssistant, physicalPlayer]} />);

    expect(screen.getByText('Music Assistant')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }));

    await waitFor(() =>
      expect(dispatchEntityCommandMock).toHaveBeenCalledWith({
        type: 'play_pause',
        entityId: 'media_player.bathroom_bathroom',
      })
    );
  });

  it('collapses mirrored wrapper and output playback into a room stack', async () => {
    const onPromotedEntitiesChange = vi.fn();
    const mirroredDevices = [
      ['media_player.bathroom_wrapper', 'Bathroom'],
      ['media_player.bathroom', 'Bathroom'],
      ['media_player.living_room_wrapper', 'Living Room'],
      ['media_player.living_room', 'Living Room'],
    ].map(([id, room]) =>
      createMediaDevice({
        id,
        name: room,
        room,
        state: 'playing',
        title: 'Strawberries',
        artist: 'Caamp',
        source: 'Spotify',
        groupMembers: ['media_player.bathroom_wrapper', 'media_player.living_room_wrapper'],
      })
    );
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom_wrapper', platform: 'music_assistant' },
      { entityId: 'media_player.living_room_wrapper', platform: 'music_assistant' },
    ]);

    renderWithProviders(
      <MediaDashboard
        devices={mirroredDevices}
        onPromotedEntitiesChange={onPromotedEntitiesChange}
      />
    );

    expect(await screen.findByText('Music Assistant')).toBeVisible();
    expect(screen.queryByText('2 speakers')).not.toBeInTheDocument();
    expect(screen.getByText('Bathroom +1')).toBeVisible();
    await waitFor(() =>
      expect(onPromotedEntitiesChange).toHaveBeenCalledWith([
        'media_player.bathroom',
        'media_player.bathroom_wrapper',
        'media_player.living_room',
        'media_player.living_room_wrapper',
      ])
    );
  });

  it('does not keep a stack after Music Assistant removes group membership', async () => {
    const onPromotedEntitiesChange = vi.fn();
    const ungroupedDevices = ['Bathroom', 'Living Room'].map((name) =>
      createMediaDevice({
        id: `media_player.${name.toLowerCase().replace(' ', '_')}`,
        name,
        room: name,
        state: name === 'Bathroom' ? 'playing' : 'paused',
        title: 'Strawberries',
        artist: 'Caamp',
        groupMembers: [],
      })
    );
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom', platform: 'music_assistant' },
      { entityId: 'media_player.living_room', platform: 'music_assistant' },
    ]);

    renderWithProviders(
      <MediaDashboard
        devices={ungroupedDevices}
        onPromotedEntitiesChange={onPromotedEntitiesChange}
      />
    );

    await waitFor(() =>
      expect(onPromotedEntitiesChange).toHaveBeenCalledWith(['media_player.bathroom'])
    );
    expect(screen.queryByText('Bathroom +1')).not.toBeInTheDocument();
  });

  it('ignores stale Music Assistant grouping during direct single-speaker playback', async () => {
    const staleMembers = ['media_player.bathroom_ma', 'media_player.living_room_ma'];
    const devices = [
      createMediaDevice({
        id: 'media_player.bathroom',
        name: 'Bathroom',
        room: 'Bathroom',
        state: 'playing',
        title: 'AirPlay track',
        artist: 'Phone',
        source: 'AirPlay',
        groupMembers: ['media_player.bathroom', 'media_player.bathroom_ma'],
      }),
      createMediaDevice({
        id: 'media_player.bathroom_ma',
        name: 'Bathroom',
        room: 'Bathroom',
        state: 'paused',
        title: 'AirPlay track',
        artist: 'Phone',
        groupMembers: staleMembers,
      }),
      createMediaDevice({
        id: 'media_player.living_room_ma',
        name: 'Living Room',
        room: 'Living Room',
        state: 'paused',
        title: 'AirPlay track',
        artist: 'Phone',
        groupMembers: staleMembers,
      }),
    ];
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom', platform: 'sonos' },
      { entityId: 'media_player.bathroom_ma', platform: 'music_assistant' },
      { entityId: 'media_player.living_room_ma', platform: 'music_assistant' },
    ]);

    renderWithProviders(<MediaDashboard devices={devices} />);

    expect(await screen.findByText('AirPlay track')).toBeVisible();
    expect(screen.queryByText('Bathroom +1')).not.toBeInTheDocument();
    expect(screen.queryByText('2 speakers')).not.toBeInTheDocument();
  });

  it('publishes native AirPlay group members so their individual cards can be hidden', async () => {
    const onPromotedEntitiesChange = vi.fn();
    const groupMembers = ['media_player.bathroom', 'media_player.living_room'];
    const devices = ['Bathroom', 'Living Room'].map((name) =>
      createMediaDevice({
        id: `media_player.${name.toLowerCase().replace(' ', '_')}`,
        name,
        room: name,
        state: 'playing',
        title: 'Grouped AirPlay track',
        artist: 'Phone',
        source: 'AirPlay',
        groupMembers,
      })
    );
    mediaEntityRegistryMock.mockReturnValue([
      { entityId: 'media_player.bathroom', platform: 'sonos' },
      { entityId: 'media_player.living_room', platform: 'sonos' },
    ]);

    renderWithProviders(
      <MediaDashboard devices={devices} onPromotedEntitiesChange={onPromotedEntitiesChange} />
    );

    expect(await screen.findByText('Bathroom +1')).toBeVisible();
    await waitFor(() =>
      expect(onPromotedEntitiesChange).toHaveBeenCalledWith([
        'media_player.bathroom',
        'media_player.living_room',
      ])
    );
  });

  it('keeps a paused AirPlay group selected and stacked until membership changes', async () => {
    const onPromotedEntitiesChange = vi.fn();
    const groupMembers = ['media_player.bathroom', 'media_player.living_room'];
    const groupedDevices = ['Bathroom', 'Living Room'].map((name) =>
      createMediaDevice({
        id: `media_player.${name.toLowerCase().replace(' ', '_')}`,
        name,
        room: name,
        state: 'paused',
        title: 'Paused AirPlay track',
        artist: 'Phone',
        source: 'AirPlay',
        groupMembers,
        mediaContentId: 'https://example.test/paused-airplay-track.mp3',
        mediaContentType: 'music',
      })
    );
    const browseHelper = createMediaDevice({
      id: 'media_player.browse',
      name: 'Browse',
      state: 'playing',
      title: 'Browse',
      artist: '',
    });

    const view = renderWithProviders(
      <MediaDashboard
        devices={[browseHelper, ...groupedDevices]}
        onPromotedEntitiesChange={onPromotedEntitiesChange}
      />
    );

    expect(await screen.findByText('Bathroom +1')).toBeVisible();
    expect(screen.getByText('Paused AirPlay track')).toBeVisible();
    await waitFor(() =>
      expect(onPromotedEntitiesChange).toHaveBeenCalledWith([
        'media_player.bathroom',
        'media_player.living_room',
      ])
    );

    view.rerender(
      <MediaDashboard
        devices={[
          browseHelper,
          ...groupedDevices.map((device) => ({
            ...device,
            state: 'idle' as const,
            title: device.name,
            artist: '',
            entityPicture: undefined,
            mediaContentId: undefined,
            mediaContentType: undefined,
          })),
        ]}
        onPromotedEntitiesChange={onPromotedEntitiesChange}
      />
    );

    expect(await screen.findByText('Bathroom +1')).toBeVisible();
    expect(screen.getByText('Paused AirPlay track')).toBeVisible();
  });

  it('loads provider media browser items and plays playable results', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            state: 'playing',
            title: 'Olalla',
            artist: 'Blanco White',
            source: 'Kitchen',
          }),
        ]}
      />
    );

    await waitFor(() => expect(screen.getByText('Daily Mix')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Daily Mix'));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.spotify', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('explains restricted Spotify speaker playback and recommends Music Assistant', async () => {
    const toastError = vi.spyOn(toast, 'error').mockImplementation(() => 'toast-id');
    playMediaMock.mockRejectedValueOnce(
      new Error('UPnP Error 800 received from media_player.bathroom')
    );

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    fireEvent.click(await screen.findByText('Daily Mix'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Spotify does not allow Web API playback control on this device. For Sonos and some Chromecast targets, use Music Assistant in Home Assistant to play this item from Navet.'
      )
    );
  });

  it('plays browsed media when the live entity capability snapshot is stale', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            mediaCapabilities: getMediaPlayerCapabilities(MEDIA_PLAYER_FEATURES.BROWSE_MEDIA),
          }),
        ]}
      />
    );

    fireEvent.click(await screen.findByText('Daily Mix'));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.spotify', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('shows a back button after entering a browsable media directory', async () => {
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:playlists') {
        return {
          title: 'Playlists',
          children: [
            {
              title: 'Daily Mix',
              mediaContentId: 'spotify:playlist:daily',
              mediaContentType: 'playlist',
              mediaClass: 'playlist',
              canPlay: true,
            },
          ],
        };
      }

      return {
        title: 'Library',
        children: [
          {
            title: 'Playlists',
            mediaContentId: 'spotify:directory:playlists',
            mediaContentType: 'playlist',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    await waitFor(() => expect(screen.getByText('Playlists')).toBeInTheDocument());
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Playlists'));

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.spotify', {
        mediaContentId: 'spotify:directory:playlists',
        mediaContentType: 'playlist',
      })
    );
    await waitFor(() => expect(screen.getByText('Daily Mix')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenLastCalledWith('media_player.spotify', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );
  });

  it('shows item-count badges for browsable media directories', async () => {
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:playlists') {
        return {
          title: 'Playlists',
          children: [
            { title: 'Daily Mix 1', mediaContentId: 'spotify:playlist:1', canPlay: true },
            { title: 'Daily Mix 2', mediaContentId: 'spotify:playlist:2', canPlay: true },
            { title: 'Daily Mix 3', mediaContentId: 'spotify:playlist:3', canPlay: true },
          ],
        };
      }
      if (media?.mediaContentId === 'spotify:directory:albums') {
        return { title: 'Albums', children: [] };
      }

      return {
        title: 'Library',
        children: [
          {
            title: 'Playlists',
            mediaContentId: 'spotify:directory:playlists',
            mediaContentType: 'playlist',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
          {
            title: 'Albums',
            mediaContentId: 'spotify:directory:albums',
            mediaContentType: 'album',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    expect(await screen.findByLabelText('3 items')).toBeInTheDocument();
    expect(await screen.findByLabelText('0 items')).toBeInTheDocument();
  });

  it('aligns now playing and media-library cards to the dashboard grid', async () => {
    setVisualViewportSize(1700, 900);
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:albums') {
        return {
          title: 'Albums',
          children: Array.from({ length: 20 }, (_, index) => ({
            title:
              index === 0 ? 'Colly Strings - Union Chapel, London, England' : `Album ${index + 1}`,
            mediaContentId: `spotify:album:${index + 1}`,
            mediaContentType: 'album',
            mediaClass: 'album',
            artist: index === 0 ? 'Manchester Orchestra' : undefined,
            canPlay: true,
          })),
        };
      }

      return {
        title: 'Media Library',
        children: [
          {
            title: 'Albums',
            mediaContentId: 'spotify:directory:albums',
            mediaContentType: 'album',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    expect(screen.getByRole('heading', { name: 'Spotify' })).toBeInTheDocument();
    expect(screen.queryByText('1 media player')).not.toBeInTheDocument();
    const dashboardLayout = screen.getByTestId('media-dashboard-layout');
    expect(dashboardLayout).toHaveStyle({
      gridTemplateColumns: 'repeat(16, minmax(80px, 1fr))',
    });
    expect(dashboardLayout.children[0]).toHaveClass('order-1');
    expect(screen.getByTestId('media-browser-panel')).toHaveStyle({
      gridColumn: 'span 12 / span 12',
    });
    expect(screen.getByTestId('media-browser-panel')).toHaveClass('order-2');
    expect(screen.getByTestId('media-now-playing-card')).toHaveStyle({ height: '368px' });
    const directoryGrid = await screen.findByTestId('media-browser-directory-grid');
    expect(directoryGrid).toHaveClass('grid-cols-[repeat(auto-fill,minmax(150px,1fr))]');
    const albumDirectory = screen.getByRole('button', { name: /^Albums/ });
    expect(albumDirectory).toHaveClass('w-full', 'min-h-[72px]');
    expect(screen.getByTestId('media-library-directory-icon')).toHaveClass('h-9', 'w-9');
    expect(screen.getByTestId('media-library-directory-icon').querySelector('svg')).toHaveClass(
      'h-5',
      'w-5'
    );
    expect(screen.getByText('Albums')).toHaveClass('line-clamp-2');
    fireEvent.click(await screen.findByText('Albums'));
    expect(await screen.findByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    const albumGrid = screen.getByTestId('media-browser-compact-grid');
    expect(albumGrid).not.toHaveAttribute('style');
    expect(albumGrid.children).toHaveLength(20);
    expect(screen.getByText('Colly Strings - Union Chapel, London, England')).toHaveClass(
      'line-clamp-2'
    );
    expect(screen.getByText('Manchester Orchestra')).toHaveClass(
      'w-full',
      'whitespace-normal',
      'break-words'
    );
    expect(screen.getByText('Manchester Orchestra')).not.toHaveClass('truncate');
  });

  it('shows large directory collections in the virtual table automatically', async () => {
    await browseMediaPlayerMock.withImplementation(
      async (_entityId, media) => {
        if (media?.mediaContentId) {
          return { title: media.mediaContentId, children: [] };
        }

        return {
          title: 'Radio browser',
          children: Array.from({ length: 245 }, (_, index) => ({
            title: `Radio folder ${index + 1}`,
            mediaContentId: `radio:folder:${index + 1}`,
            mediaContentType: 'directory',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          })),
        };
      },
      async () => {
        renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

        expect(screen.queryByTestId('media-browser-directory-grid')).not.toBeInTheDocument();
        expect(await screen.findByTestId('media-browser-virtual-table-shell')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show less' })).not.toBeInTheDocument();

        await act(async () => {
          fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
            target: { value: 'Radio folder 245' },
          });
        });
        expect(screen.getByText('Radio folder 245')).toBeInTheDocument();
        const browseCount = browseMediaPlayerMock.mock.calls.length;
        const originalTimePreference = useSettingsStore.getState().use24HourTime;
        try {
          await act(async () => {
            useSettingsStore.setState({ use24HourTime: !originalTimePreference });
          });
          expect(browseMediaPlayerMock).toHaveBeenCalledTimes(browseCount);
          expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Radio folder 245');
          expect(screen.getByText('Radio folder 245')).toBeInTheDocument();
        } finally {
          act(() => useSettingsStore.setState({ use24HourTime: originalTimePreference }));
        }
      }
    );
  }, 10_000);

  it('uses a compact single-row media rail below 900px', async () => {
    setMediaQueryMatch('(max-width: 899px)', true);
    localStorage.setItem(
      STORAGE_KEYS.mediaDefaultViews,
      JSON.stringify({
        'media_player.spotify': {
          title: 'Recently played',
          mediaClass: 'directory',
          mediaContentId: 'spotify:directory:recently-played',
          mediaContentType: 'track',
          canExpand: true,
          canPlay: false,
        },
      })
    );
    browseMediaPlayerMock.mockResolvedValue({
      title: 'Recently played',
      children: Array.from({ length: 10 }, (_, index) => ({
        title: `Track ${index + 1}`,
        mediaContentId: `spotify:track:${index + 1}`,
        mediaContentType: 'track',
        mediaClass: 'track',
        canPlay: true,
      })),
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    const mobileGrid = await screen.findByTestId('media-browser-compact-grid');
    expect(mobileGrid).not.toHaveAttribute('style');
    expect(mobileGrid).toHaveClass('overflow-x-auto');
    expect(mobileGrid.children).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
  });

  it('persists a media folder as the default view and opens it on the next visit', async () => {
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:recently-played') {
        return {
          title: 'Recently played',
          children: [
            {
              title: 'Bed Head',
              mediaContentId: 'spotify:track:bed-head',
              mediaContentType: 'track',
              mediaClass: 'track',
              canPlay: true,
            },
          ],
        };
      }

      return {
        title: 'Media Library',
        children: [
          {
            title: 'Recently played',
            mediaContentId: 'spotify:directory:recently-played',
            mediaContentType: 'track',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });

    const firstVisit = renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    fireEvent.click(await screen.findByText('Recently played'));
    expect(await screen.findByRole('heading', { name: 'Recently played' })).toBeInTheDocument();
    const saveDefaultViewButton = screen.getByRole('button', {
      name: 'Set Recently played as default view',
    });
    expect(saveDefaultViewButton).toHaveTextContent(/^$/);
    expect(saveDefaultViewButton).not.toHaveClass('rounded-full');
    fireEvent.click(saveDefaultViewButton);

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEYS.mediaDefaultViews)).toContain(
        'spotify:directory:recently-played'
      )
    );

    firstVisit.unmount();
    browseMediaPlayerMock.mockClear();
    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.spotify', {
        mediaContentId: 'spotify:directory:recently-played',
        mediaContentType: 'track',
      })
    );
    expect(await screen.findByRole('heading', { name: 'Recently played' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove default view' })).toBeInTheDocument();
  });

  it('keeps collections with 29 items in the tile layout', async () => {
    localStorage.setItem(
      STORAGE_KEYS.mediaDefaultViews,
      JSON.stringify({
        'media_player.spotify': {
          title: 'Recently played',
          mediaClass: 'directory',
          mediaContentId: 'spotify:directory:recently-played',
          mediaContentType: 'track',
          canExpand: true,
          canPlay: false,
        },
      })
    );
    browseMediaPlayerMock.mockResolvedValue({
      title: 'Recently played',
      children: Array.from({ length: 29 }, (_, index) => ({
        title: `Track ${index + 1}`,
        mediaContentId: `spotify:track:${index + 1}`,
        mediaContentType: 'track',
        mediaClass: 'track',
        canPlay: true,
      })),
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    const tileGrid = await screen.findByTestId('media-browser-compact-grid');
    expect(tileGrid.children).toHaveLength(29);
    expect(screen.queryByTestId('media-browser-virtual-table-shell')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
  });

  it('removes duplicate entries from recently played while preserving their order', async () => {
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:recently-played') {
        return {
          title: 'Recently played',
          children: [
            {
              title: 'The Grocery',
              mediaContentId: 'spotify:track:the-grocery',
              mediaContentType: 'track',
              mediaClass: 'track',
              canPlay: true,
            },
            {
              title: 'Angel Of Death',
              mediaContentId: 'spotify:track:angel-of-death',
              mediaContentType: 'track',
              mediaClass: 'track',
              canPlay: true,
            },
            {
              title: 'The Grocery',
              mediaContentId: 'spotify:track:the-grocery',
              mediaContentType: 'track',
              mediaClass: 'track',
              canPlay: true,
            },
          ],
        };
      }

      return {
        title: 'Media Library',
        children: [
          {
            title: 'Recently played',
            mediaContentId: 'spotify:directory:recently-played',
            mediaContentType: 'track',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    fireEvent.click(await screen.findByText('Recently played'));

    expect(await screen.findByRole('heading', { name: 'Recently played' })).toBeInTheDocument();
    expect(screen.getAllByText('The Grocery')).toHaveLength(1);
    expect(screen.getAllByText('Angel Of Death')).toHaveLength(1);
  });

  it('allows Home Assistant media browsing when the provider supports browse but the entity snapshot is stale', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            mediaCapabilities: mediaCapabilitiesWithoutBrowse,
          }),
        ]}
      />
    );

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.spotify', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );
  });

  it('leaves the browser area blank when neither the entity nor provider supports browsing', () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            id: 'homey:media_player.spotify',
            mediaCapabilities: mediaCapabilitiesWithoutBrowse,
          }),
        ]}
      />
    );

    expect(
      screen.queryByText('This player or provider did not expose a media browser.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load media browser' })).not.toBeInTheDocument();
  });

  it('shows the browser empty state when browsing fails', async () => {
    browseMediaPlayerMock.mockRejectedValue(new Error('Browse failed'));

    renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    await waitFor(() =>
      expect(
        screen.getByText('No browsable media was exposed for this player right now.')
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Load media browser' })).not.toBeInTheDocument();
  });

  it('uses live Spotify media title and artist for the Spotify Connect artwork text', () => {
    liveMediaEntityMock.mockReturnValue({
      state: 'playing',
      attributes: {
        media_title: 'Above the Clouds of Pompeii',
        media_artist: "Bear's Den",
        media_album_name: 'Islands',
        entity_picture: '/api/media_player_proxy/media_player.spotify',
      },
    });

    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            state: 'playing',
            title: 'Above the Clouds of Pompeii',
            album: 'Islands',
            entityPicture: '/stale-artwork.jpg',
          }),
        ]}
      />
    );

    expect(screen.getByText('Above the Clouds of Pompeii')).toBeInTheDocument();
    expect(screen.getByText("Bear's Den")).toBeInTheDocument();
    expect(screen.queryByText('Islands')).not.toBeInTheDocument();
  });

  it('uses the selected output player artwork when Spotify playback is delegated', () => {
    liveMediaEntityMock.mockImplementation((entityId: string) =>
      entityId === 'media_player.bathroom'
        ? {
            state: 'playing',
            attributes: {
              media_title: 'Warning Signs',
              media_artist: 'Band of Horses',
              entity_picture: '/api/media_player_proxy/media_player.bathroom',
            },
          }
        : { state: 'idle', attributes: {} }
    );

    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            id: 'media_player.spotify',
            name: 'Spotify Premium',
          }),
          createMediaDevice({
            id: 'media_player.bathroom',
            name: 'Bathroom',
            state: 'playing',
            source: undefined,
            sourceList: [],
          }),
        ]}
      />
    );

    expect(screen.getByText('Warning Signs')).toBeInTheDocument();
    expect(screen.getByText('Band of Horses')).toBeInTheDocument();
    expect(screen.queryByTestId('spotify-connect-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bathroom' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Spotify output' })).not.toBeInTheDocument();
  });

  it('retains a paused Spotify output in the shared Now Playing card after its live session clears', () => {
    const spotifyAccount = createMediaDevice({
      id: 'media_player.spotify',
      name: 'Spotify Premium',
      source: 'Kitchen',
    });
    const kitchen = createMediaDevice({
      id: 'media_player.kitchen',
      name: 'Kitchen',
      sourceList: ['Spotify Connect'],
      title: 'Kitchen',
    });
    const bathroom = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      state: 'paused',
      sourceList: ['Spotify Connect'],
      title: 'The Gold',
      artist: 'Manchester Orchestra',
      entityPicture: '/api/media_player_proxy/media_player.bathroom',
      elapsedSeconds: 214,
      positionUpdatedAt: '2026-07-13T12:00:00.000Z',
      mediaContentId: 'spotify:track:the-gold',
      mediaContentType: 'music',
    });
    const view = renderWithProviders(
      <MediaDashboard devices={[spotifyAccount, kitchen, bathroom]} />
    );

    expect(screen.getByText('The Gold')).toBeInTheDocument();
    expect(screen.getByText('Manchester Orchestra')).toBeInTheDocument();
    expect(screen.queryByTestId('spotify-connect-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bathroom' })).toBeInTheDocument();

    view.rerender(
      <MediaDashboard
        devices={[
          spotifyAccount,
          kitchen,
          {
            ...bathroom,
            state: 'idle',
            title: 'Bathroom',
            artist: '',
            entityPicture: undefined,
            elapsedSeconds: undefined,
            positionUpdatedAt: undefined,
            mediaContentId: undefined,
            mediaContentType: undefined,
          },
        ]}
      />
    );

    expect(screen.getByText('The Gold')).toBeInTheDocument();
    expect(screen.getByText('Manchester Orchestra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bathroom' })).toBeInTheDocument();
  });

  it('uses an idle speaker for media browsing instead of the Spotify account', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            id: 'media_player.kitchen',
            name: 'Kitchen',
            source: undefined,
            sourceList: ['Spotify'],
          }),
          createMediaDevice({
            id: 'media_player.spotify',
            name: 'Spotify Premium',
            source: 'iPhone',
            sourceList: ['iPhone'],
          }),
        ]}
      />
    );

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.kitchen', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );

    expect(screen.queryByText('Play on')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spotify-connect-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument();
  });

  it('does not render a speaker selector in the media library header', () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({ id: 'media_player.spotify', name: 'Spotify Premium' }),
          createMediaDevice({
            id: 'media_player.bathroom',
            name: 'Bathroom',
            groupMembers: undefined,
            source: undefined,
            sourceList: [],
          }),
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Spotify output' })).not.toBeInTheDocument();
  });

  it('does not show transport play for dormant Spotify', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            state: 'idle',
            source: undefined,
            sourceList: [],
          }),
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Resume playback' })).not.toBeInTheDocument();
    expect(dispatchEntityCommandMock).not.toHaveBeenCalled();
  });

  it('retargets media browsing and playback to the selected Spotify Connect speaker', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            id: 'media_player.spotify',
            name: 'Spotify Premium',
            source: undefined,
            sourceList: [],
          }),
          createMediaDevice({
            id: 'media_player.living_room',
            name: 'Living Room',
            source: 'Spotify Connect',
            sourceList: [],
          }),
        ]}
      />
    );

    expect(screen.queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Living Room' })).toBeInTheDocument();

    expect(selectSourceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Living Room' }));

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.living_room', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );

    fireEvent.click(screen.getByText('Daily Mix'));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.living_room', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('uses the active Spotify Connect speaker as the initial media library target', async () => {
    renderWithProviders(
      <MediaDashboard
        devices={[
          createMediaDevice({
            id: 'media_player.spotify',
            name: 'Spotify Premium',
            source: 'Bathroom',
          }),
          createMediaDevice({
            id: 'media_player.bathroom',
            name: 'Bathroom',
            state: 'playing',
            source: 'Spotify Connect',
            sourceList: ['Spotify Connect'],
          }),
        ]}
      />
    );

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );

    fireEvent.click(await screen.findByText('Daily Mix'));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('follows a newly active speaker when playing a recently browsed track', async () => {
    browseMediaPlayerMock.mockImplementation(async (_entityId, media) => {
      if (media?.mediaContentId === 'spotify:directory:recently-played') {
        return {
          title: 'Recently played',
          children: [
            {
              title: 'Bed Head',
              mediaContentId: 'spotify:track:bed-head',
              mediaContentType: 'track',
              mediaClass: 'track',
              canPlay: true,
            },
          ],
        };
      }

      return {
        title: 'Media Library',
        children: [
          {
            title: 'Recently played',
            mediaContentId: 'spotify:directory:recently-played',
            mediaContentType: 'track',
            mediaClass: 'directory',
            canExpand: true,
            canPlay: false,
          },
        ],
      };
    });
    const spotifyAccount = createMediaDevice({
      id: 'media_player.spotify',
      name: 'Spotify Premium',
      source: 'Living Room',
    });
    const livingRoom = createMediaDevice({
      id: 'media_player.living_room',
      name: 'Living Room',
      state: 'idle',
      source: 'Spotify Connect',
      sourceList: ['Spotify Connect'],
    });
    const bathroom = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      state: 'idle',
      source: 'Spotify Connect',
      sourceList: ['Spotify Connect'],
    });
    const view = renderWithProviders(
      <MediaDashboard devices={[spotifyAccount, livingRoom, bathroom]} />
    );

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.living_room', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );

    view.rerender(
      <MediaDashboard
        devices={[
          { ...spotifyAccount, source: 'Bathroom' },
          livingRoom,
          {
            ...bathroom,
            state: 'playing',
            title: 'The Silence',
            artist: 'Manchester Orchestra',
          },
        ]}
      />
    );

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );
    fireEvent.click(await screen.findByText('Recently played'));
    fireEvent.click(await screen.findByText('Bed Head'));

    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: 'spotify:track:bed-head',
        mediaContentType: 'track',
      })
    );
  });

  it('keeps media browsing on a speaker with blank source metadata', async () => {
    const spotifyDevice = createMediaDevice({
      id: 'media_player.spotify',
      name: 'Spotify Premium',
      source: undefined,
    });
    const idleBathroom = createMediaDevice({
      id: 'media_player.bathroom',
      name: 'Bathroom',
      state: 'idle',
      source: undefined,
      sourceList: [],
    });
    const view = renderWithProviders(<MediaDashboard devices={[spotifyDevice, idleBathroom]} />);

    await waitFor(() =>
      expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: undefined,
        mediaContentType: undefined,
      })
    );
    view.rerender(
      <MediaDashboard
        devices={[
          spotifyDevice,
          {
            ...idleBathroom,
            state: 'playing',
          },
        ]}
      />
    );

    fireEvent.click(await screen.findByText('Daily Mix'));
    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('prefers Spotify artist metadata over incorrect provider labels in recently played rows', async () => {
    const spotifyTrackId = '1234567890123456789012';
    const spotifyMetadata = {
      title: 'Bed Head',
      artistName: 'Manchester Orchestra',
      albumTitle: 'The Million Masks Of God',
      artworkUrls: ['https://i.scdn.co/image/ab67616d00001e02bedheadart'],
    };
    vi.spyOn(mediaCatalog, 'resolveItem').mockImplementation(async (item) => ({
      openArtwork: { artworkUrls: [] },
      spotifyMetadata:
        item.mediaContentId === `spotify:track:${spotifyTrackId}`
          ? spotifyMetadata
          : { artworkUrls: [] },
    }));
    vi.spyOn(mediaCatalog, 'resolveSpotifyTrack').mockResolvedValue(spotifyMetadata);
    localStorage.setItem(
      STORAGE_KEYS.mediaDefaultViews,
      JSON.stringify({
        'media_player.spotify': {
          title: 'Recently played',
          mediaClass: 'directory',
          mediaContentId: 'spotify:directory:recently-played',
          mediaContentType: 'track',
          canExpand: true,
          canPlay: false,
        },
      })
    );
    browseMediaPlayerMock.mockResolvedValue({
      title: 'Recently played',
      children: [
        {
          title: 'Bed Head',
          mediaContentId: `spotify:track:${spotifyTrackId}`,
          mediaContentType: 'track',
          mediaClass: 'track',
          thumbnail: '/image/ab67616d00001e02bedheadart',
          artist: 'Deer',
          canPlay: true,
        },
        ...Array.from({ length: 29 }, (_, index) => ({
          title: `Track ${index + 2}`,
          mediaContentId: `provider:track:${index + 2}`,
          mediaContentType: 'track',
          mediaClass: 'track',
          canPlay: true,
        })),
      ],
    });

    const { container } = renderWithProviders(<MediaDashboard devices={[createMediaDevice()]} />);

    expect(await screen.findByText('Manchester Orchestra')).toBeInTheDocument();
    expect(screen.queryByText('Deer')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://i.scdn.co/image/ab67616d00001e02bedheadart'
    );

    const trackSearch = await screen.findByRole('searchbox', { name: 'Search' });
    fireEvent.change(trackSearch, { target: { value: 'Manchester Orchestra' } });

    expect(await screen.findByText('Bed Head')).toBeInTheDocument();
    expect(screen.queryByText('Track 2')).not.toBeInTheDocument();
  });
});
