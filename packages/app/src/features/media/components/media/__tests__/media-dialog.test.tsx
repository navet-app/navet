import { getMediaPlayerCapabilities } from '@navet/app/constants/media-player-features';
import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaDialog } from '../media-dialog';

const {
  browseMediaPlayerMock,
  playMediaMock,
  useThemeMock,
  useMediaArtworkColorsMock,
  entityRoomSelectorMock,
} = vi.hoisted(() => ({
  browseMediaPlayerMock: vi.fn(),
  playMediaMock: vi.fn(),
  useThemeMock: vi.fn(),
  useMediaArtworkColorsMock: vi.fn(),
  entityRoomSelectorMock: vi.fn((_props?: unknown) => <div>Bathroom</div>),
}));

vi.mock('@navet/app/hooks', async () => {
  const actual = await vi.importActual<typeof import('@navet/app/hooks')>('@navet/app/hooks');

  return {
    ...actual,
    useEntityProviderFeatureMatrix: () => ({
      mediaBrowse: false,
      mediaControls: false,
    }),
    useEntityProviderFeature: () => true,
    useTheme: () => useThemeMock(),
  };
});

vi.mock('@navet/app/services/integration-media-feature.service', () => ({
  integrationMediaFeatureService: {
    browseMediaPlayer: browseMediaPlayerMock,
    playMedia: playMediaMock,
    searchMediaPlayer: vi.fn(),
  },
}));

vi.mock('@navet/app/components/shared/entity-room-selector', () => ({
  EntityRoomSelector: (props: unknown) => entityRoomSelectorMock(props),
}));

vi.mock('@navet/app/features/media/hooks/use-provider-media-playback-data', () => ({
  useProviderMediaPlaybackData: () => ({
    entities: [],
    entityRegistry: [],
  }),
}));

vi.mock('../use-media-artwork-colors', async () => {
  const actual = await vi.importActual<typeof import('../use-media-artwork-colors')>(
    '../use-media-artwork-colors'
  );

  return {
    ...actual,
    useMediaArtworkColors: useMediaArtworkColorsMock,
  };
});

describe('MediaDialog', () => {
  it('keeps the header identity and browses media through the opened player', async () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });

    renderWithProviders(
      <MediaDialog
        entityId="media_player.bathroom"
        room="Bathroom"
        isOpen
        onOpenChange={vi.fn()}
        artwork="data:image/png;base64,artwork"
        entityName="Bathroom"
        entityType="Speaker"
        title="Touch"
        artist="Cigarettes After Sex"
        isPlaying
        volume={10}
        isMuted={false}
        elapsedSeconds={93}
        durationSeconds={293}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(
          4 | 8 | 16 | 32 | 2 | 512 | 32768 | 131072 | 262144
        )}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );

    expect(screen.getAllByText('Bathroom').length).toBeGreaterThanOrEqual(2);
    expect(entityRoomSelectorMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        entityId: 'media_player.bathroom',
        fallbackRoomName: 'Bathroom',
        readOnly: true,
      })
    );
    expect(screen.getAllByText('Speaker').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Edit Bathroom' })).not.toBeInTheDocument();
    const moreActions = screen.getAllByRole('button', { name: 'More actions' })[0];
    if (!moreActions) throw new Error('Missing More actions button');
    fireEvent.keyDown(moreActions, { key: 'Enter' });
    expect(screen.getByText('media_player.bathroom')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit card name' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Card name' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card name' }), { key: 'Escape' });
    fireEvent.keyDown(moreActions, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit room' }));
    expect(entityRoomSelectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityId: 'media_player.bathroom', fallbackRoomName: 'Bathroom' })
    );
    expect(screen.queryByRole('button', { name: 'Pause playback' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to controls' }));
    expect(screen.getAllByText('Touch').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cigarettes After Sex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Playback' })).not.toBeInTheDocument();
    expect(screen.queryByText('Volume')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveClass('backdrop-blur-xl', 'backdrop-blur-2xl');

    browseMediaPlayerMock.mockImplementation(async (_entityId, media) =>
      media?.mediaContentId === 'spotify:account:vishal'
        ? {
            title: 'Vishal Chauhan',
            children: [
              {
                title: 'Daily Mix',
                mediaContentId: 'spotify:playlist:daily',
                mediaContentType: 'playlist',
                mediaClass: 'playlist',
                thumbnail: '/image/ab67616d00001e02dailyMixArtwork',
                canPlay: true,
              },
            ],
          }
        : {
            title: 'Media Library',
            children: [
              {
                title: 'Vishal Chauhan',
                mediaContentId: 'spotify:account:vishal',
                mediaContentType: 'directory',
                canExpand: true,
                canPlay: false,
              },
            ],
          }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

    fireEvent.click(await screen.findByText('Vishal Chauhan'));
    expect(screen.getByTestId('spotify-browse-icon')).toBeInTheDocument();
    expect(browseMediaPlayerMock).toHaveBeenCalledWith('media_player.bathroom', {
      mediaContentId: undefined,
      mediaContentType: undefined,
    });

    expect(await screen.findByText('Daily Mix')).toBeInTheDocument();
    expect(screen.queryByTestId('spotify-browse-icon')).not.toBeInTheDocument();
    // Keep: provider display resolution completes after the browse result arrives.
    expect(await screen.findByTestId('media-browse-artwork')).toHaveAttribute(
      'src',
      'https://i.scdn.co/image/ab67616d00001e02dailyMixArtwork'
    );

    fireEvent.click(screen.getByText('Daily Mix'));
    await waitFor(() =>
      expect(playMediaMock).toHaveBeenCalledWith('media_player.bathroom', {
        mediaContentId: 'spotify:playlist:daily',
        mediaContentType: 'playlist',
      })
    );
  });

  it('keeps the seek slider visible when the media dialog is idle', () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });

    renderWithProviders(
      <MediaDialog
        entityId="media_player.living_room"
        room="Living Room"
        isOpen
        onOpenChange={vi.fn()}
        artwork={null}
        entityName="Living Room"
        entityType="Speaker"
        title="Nothing playing"
        artist=""
        isPlaying={false}
        volume={10}
        isMuted={false}
        elapsedSeconds={0}
        durationSeconds={0}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(4 | 8 | 16 | 32 | 2 | 32768 | 262144)}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );

    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
  });

  it('renders media stack settings inside the media dialog', () => {
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });
    const onUpdate = vi.fn();

    renderWithProviders(
      <MediaDialog
        entityId="media_player.living_room"
        room="Living Room"
        isOpen
        onOpenChange={vi.fn()}
        entityName="Living Room TV"
        entityType="TV"
        title="Apple TV"
        artist=""
        isPlaying={false}
        volume={10}
        isMuted={false}
        elapsedSeconds={0}
        durationSeconds={0}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack={false}
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack={false}
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(0)}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
        mediaStackSettings={{
          entityIds: ['media_player.living_room', 'media_player.speaker'],
          priorityOrder: ['media_player.speaker', 'media_player.living_room'],
          idleBehavior: 'compact',
          playerOptions: [
            {
              id: 'media_player.living_room',
              name: 'Living Room TV',
              room: 'Living Room',
              subtitle: 'TV',
            },
            {
              id: 'media_player.speaker',
              name: 'Living Room Speaker',
              room: 'Living Room',
              subtitle: 'Speaker',
            },
          ],
          onUpdate,
        }}
        initialTab="stack"
      />
    );

    expect(screen.getByText('Media players')).toBeInTheDocument();
    expect(screen.queryByText('Priority')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove: Living Room Speaker' }));
    expect(onUpdate).toHaveBeenCalledWith({
      entityIds: ['media_player.living_room'],
      priorityOrder: ['media_player.living_room'],
      idleBehavior: 'compact',
    });
  });

  it('uses the shared mobile cover sheet with balanced playback controls', () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });

    renderWithProviders(
      <MediaDialog
        entityId="media_player.living_room"
        room="Living Room"
        isOpen
        onOpenChange={vi.fn()}
        artwork="data:image/png;base64,artwork"
        entityName="Living Room"
        entityType="Speaker"
        title="Long Queue"
        artist="Artist"
        isPlaying
        volume={10}
        isMuted={false}
        elapsedSeconds={93}
        durationSeconds={293}
        supportsGrouping
        groupMembers={Array.from({ length: 12 }, (_, index) => `media_player.member_${index}`)}
        availableGroupingPlayers={Array.from({ length: 12 }, (_, index) => ({
          id: `media_player.available_${index}`,
          name: `Available ${index + 1}`,
          isAttached: false,
        }))}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(4 | 8 | 16 | 32 | 2 | 32768 | 262144)}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass(
      'flex',
      'flex-col',
      'max-h-[88vh]',
      'max-sm:!h-[80dvh]',
      'max-sm:!rounded-t-[30px]',
      'max-sm:!overflow-hidden',
      'max-sm:[&_[data-cover-sheet-inline-dismiss]]:!hidden'
    );
    const dismissButton = dialog.querySelector('[data-mobile-cover-sheet-dismiss]');
    expect(dismissButton?.parentElement).toHaveClass('absolute', 'top-3', 'right-3', 'z-30');

    const previousButton = screen.getByRole('button', { name: 'Previous track' });
    expect(previousButton).toHaveClass('!h-14', '!w-14');
    expect(previousButton.querySelector('svg')).toHaveClass('h-5', 'w-5');
    const playButton = screen.getByRole('button', { name: 'Pause playback' });
    expect(playButton).toHaveClass('!h-16', '!w-16');
    expect(playButton.querySelector('svg')).toHaveClass('h-6', 'w-6');
    expect(screen.getByRole('button', { name: 'Linear playback' })).toHaveClass('!h-11', '!w-11');
    expect(screen.getByRole('button', { name: 'Repeat off' })).toHaveClass('!h-11', '!w-11');

    const dialogBody = document.body.querySelector('.media-dialog-body');
    expect(dialogBody).toHaveClass(
      'h-full',
      'max-h-full',
      'min-h-0',
      'touch-pan-y',
      'overflow-x-hidden',
      'overflow-y-auto',
      'overscroll-contain',
      '[-webkit-overflow-scrolling:touch]'
    );
  });

  it('opens speaker grouping from a single control and closes when toggled again', () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });
    const onDetachGroupMember = vi.fn();

    renderWithProviders(
      <MediaDialog
        entityId="media_player.bathroom"
        room="Bathroom"
        isOpen
        onOpenChange={vi.fn()}
        artwork="data:image/png;base64,artwork"
        entityName="Bathroom"
        entityType="Speaker"
        title="Touch"
        artist="Cigarettes After Sex"
        isPlaying
        volume={10}
        isMuted={false}
        elapsedSeconds={93}
        durationSeconds={293}
        supportsGrouping
        groupMembers={['media_player.bathroom', 'media_player.kitchen']}
        availableGroupingPlayers={[
          { id: 'media_player.kitchen', name: 'Kitchen', isAttached: true },
          { id: 'media_player.living_room', name: 'Living Room', isAttached: false },
        ]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(4 | 8 | 16 | 32 | 2 | 32768 | 262144)}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={onDetachGroupMember}
      />
    );

    expect(screen.queryByRole('button', { name: 'Playback' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Group Speakers' }));

    expect(screen.getAllByText('Touch').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach Bathroom' })).toHaveClass('w-full');
    expect(screen.getByRole('button', { name: 'Detach Kitchen' })).toHaveClass('w-full');
    expect(screen.getByRole('button', { name: 'Detach Bathroom' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Detach Kitchen' }));
    expect(onDetachGroupMember).toHaveBeenCalledWith('media_player.kitchen');
    fireEvent.click(screen.getByRole('button', { name: 'Detach Bathroom' }));
    expect(onDetachGroupMember).toHaveBeenCalledWith('media_player.bathroom');

    fireEvent.click(screen.getByRole('button', { name: 'Group Speakers' }));

    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
  });

  it('defaults TVs to remote controls when the current source looks like video playback', () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });

    renderWithProviders(
      <MediaDialog
        entityId="media_player.living_room_tv"
        room="Living Room"
        deviceClass="tv"
        remoteAvailable
        isOpen
        onOpenChange={vi.fn()}
        artwork={null}
        entityName="LG webOS TV"
        entityType="TV"
        title="LG webOS TV"
        artist=""
        isPlaying
        volume={9}
        isMuted={false}
        elapsedSeconds={0}
        durationSeconds={0}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(128 | 4 | 8 | 16 | 32)}
        source="YouTube"
        sourceList={['YouTube', 'Netflix']}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onRemoteCommand={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'TV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByText('Cigarettes After Sex')).not.toBeInTheDocument();
  });

  it('defaults TVs to playback controls when the current source looks like music playback', () => {
    entityRoomSelectorMock.mockClear();
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: 'rgb(32, 32, 35)',
      vibrant: 'rgb(80, 80, 86)',
      darkMuted: 'rgb(18, 18, 20)',
      highlight: 'rgb(242, 242, 245)',
      gradientEnd: 'rgb(10, 10, 12)',
    });

    renderWithProviders(
      <MediaDialog
        entityId="media_player.living_room_tv"
        room="Living Room"
        deviceClass="tv"
        remoteAvailable
        isOpen
        onOpenChange={vi.fn()}
        artwork={null}
        entityName="LG webOS TV"
        entityType="TV"
        title="Touch"
        artist="Cigarettes After Sex"
        isPlaying
        volume={9}
        isMuted={false}
        elapsedSeconds={93}
        durationSeconds={293}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        capabilities={getMediaPlayerCapabilities(4 | 8 | 16 | 32 | 2)}
        source="Spotify"
        sourceList={['Spotify']}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onRemoteCommand={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'TV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getAllByText('Touch').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cigarettes After Sex').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('exposes only supported shuffle and repeat controls (%s, %s)', (canShuffle, canRepeat) => {
    useThemeMock.mockReturnValue({ theme: 'dark' });
    useMediaArtworkColorsMock.mockReturnValue({
      dominant: '#202023',
      vibrant: '#505056',
      darkMuted: '#121214',
      highlight: '#f2f2f5',
      gradientEnd: '#0a0a0c',
    });
    const toggleShuffle = vi.fn();
    const cycleRepeat = vi.fn();
    renderWithProviders(
      <MediaDialog
        entityId="media_player.bathroom"
        room="Bathroom"
        isOpen
        onOpenChange={vi.fn()}
        artwork="data:image/png;base64,artwork"
        entityName="Bathroom"
        entityType="Speaker"
        title="Touch"
        artist="Cigarettes After Sex"
        isPlaying
        volume={10}
        isMuted={false}
        elapsedSeconds={93}
        durationSeconds={293}
        supportsGrouping={false}
        groupMembers={[]}
        availableGroupingPlayers={[]}
        onPrevious={vi.fn()}
        canPreviousTrack
        onTogglePlay={vi.fn()}
        onNext={vi.fn()}
        canNextTrack
        shuffleEnabled={false}
        repeatMode="off"
        onToggleShuffle={toggleShuffle}
        onCycleRepeat={cycleRepeat}
        capabilities={{ ...getMediaPlayerCapabilities(0), canShuffle, canRepeat }}
        sourceList={[]}
        onSelectSource={vi.fn()}
        soundModeList={[]}
        onSelectSoundMode={vi.fn()}
        onSeek={vi.fn()}
        onClearPlaylist={vi.fn()}
        onToggleMute={vi.fn()}
        onVolumeChange={vi.fn()}
        onVolumeInteractionStart={vi.fn()}
        onVolumeInteractionEnd={vi.fn()}
        onAttachGroupMember={vi.fn()}
        onDetachGroupMember={vi.fn()}
      />
    );
    const shuffle = screen.queryByRole('button', { name: 'Linear playback' });
    const repeat = screen.queryByRole('button', { name: 'Repeat off' });
    expect(Boolean(shuffle)).toBe(canShuffle);
    expect(Boolean(repeat)).toBe(canRepeat);
    if (shuffle) fireEvent.click(shuffle);
    if (repeat) fireEvent.click(repeat);
    expect(toggleShuffle).toHaveBeenCalledTimes(canShuffle ? 1 : 0);
    expect(cycleRepeat).toHaveBeenCalledTimes(canRepeat ? 1 : 0);
  });
});
