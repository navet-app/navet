import { BaseCard } from '@navet/app/components/primitives';
import { type CardSize, getCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import type { CompanionRowPresentation } from '@navet/app/components/shared/companion-row-presentation';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getCardStateSurfaceTokens } from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { useEffectiveEffectsQuality } from '@navet/app/components/shared/theme/effective-effects-quality';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import type { NavetMediaCapabilities } from '@navet/app/core/navet-device-state';
import { LightCardTableRow } from '@navet/app/features/lighting/components/light-card/light-card-table-row';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { ThemeMode } from '@navet/app/stores/theme-store';
import type { CSSProperties, ReactNode } from 'react';
import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';
import type { MediaDialogMediaStackSettings } from '../media/media-dialog.types';
import { MediaLargeView } from '../media/media-large-view';
import { MediaMediumVerticalView } from '../media/media-medium-vertical-view';
import { MediaMediumView } from '../media/media-medium-view';
import { MediaSmallView } from '../media/media-small-view';
import { MediaTvView } from '../media/media-tv-view';
import {
  getMediaArtworkPaletteSource,
  useMediaArtworkColors,
  withAlpha,
} from '../media/use-media-artwork-colors';
import { useStableMediaArtwork } from '../media/use-stable-media-artwork';
import { getMediaEntityTypeKey } from './get-media-entity-type-key';
import { resolveMediaPlayerName } from './resolve-media-player-name';
import { useMediaCardController } from './use-media-card-controller';

const ignoreRowBrightness = () => {};

const MediaDialog = lazy(async () => {
  const module = await import('../media/media-dialog');
  return { default: module.MediaDialog };
});

function MediaStackContainer({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? (
    <div className="relative h-full w-full overflow-visible">{children}</div>
  ) : (
    children
  );
}

function getActiveTvShellBg(theme: ThemeMode) {
  if (theme === 'light') {
    return 'bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white';
  }

  if (theme === 'glass') {
    return '';
  }

  if (theme === 'black') {
    return 'bg-gradient-to-br from-fuchsia-950/45 via-black to-black';
  }

  return 'bg-gradient-to-br from-violet-950/90 via-fuchsia-950/75 to-zinc-950';
}

function getActiveTvShellBorder(theme: ThemeMode) {
  if (theme === 'light') {
    return 'border-fuchsia-200/80';
  }

  if (theme === 'glass') {
    return 'border-fuchsia-400/20';
  }

  if (theme === 'black') {
    return 'border-fuchsia-500/35';
  }

  return 'border-fuchsia-500/25';
}

function getActiveTvGlowClassName(theme: ThemeMode) {
  return theme === 'light'
    ? 'bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.12),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.1),transparent_48%)]'
    : 'bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.14),transparent_44%)]';
}

function getActiveTvShellStyle(theme: ThemeMode): CSSProperties | undefined {
  if (theme !== 'glass') {
    return undefined;
  }

  return {
    background:
      'linear-gradient(135deg, rgba(217,70,239,0.34) 0%, rgba(126,34,206,0.2) 52%, rgba(255,255,255,0.08) 100%)',
    borderColor: 'rgba(244,114,182,0.38)',
  };
}

interface MediaCardProps {
  companion?: CompanionRowPresentation;
  id: string;
  name: string;
  room: string;
  title: string;
  artist: string;
  album?: string;
  entityType?: string;
  deviceClass?: string;
  source?: string;
  sourceList?: string[];
  entityPicture?: string;
  state: 'playing' | 'paused' | 'idle' | 'off';
  volume: number;
  isMuted: boolean;
  elapsedSeconds?: number;
  durationSeconds?: number;
  positionUpdatedAt?: string;
  mediaCapabilities?: NavetMediaCapabilities;
  supportsGrouping?: boolean;
  supportsPreviousTrack?: boolean;
  supportsNextTrack?: boolean;
  groupMembers?: string[];
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  mediaStackAppearance?: boolean;
  mediaStackCount?: number;
  mediaStackSettings?: MediaDialogMediaStackSettings;
  onDerivedBackgroundChange?: (entityId: string, backgroundColor: string) => void;
  openSettingsRequestKey?: number;
  disableTransportPlayback?: boolean;
  hideTransportControls?: boolean;
  onTogglePlayback?: () => void;
  /**
   * When true, TV remote UI (D-pad, channel keys) renders as if a `remote.*` entity exists.
   * Use in Storybook where HA is not connected; ignored for non-TV cards.
   */
  simulateTvRemote?: boolean;
}

export const MediaCard = memo(function MediaCard({
  id,
  name,
  room: _room,
  title,
  artist,
  album,
  entityType,
  deviceClass,
  source: initialSource,
  sourceList: initialSourceList,
  entityPicture,
  state,
  volume: initialVolume,
  isMuted: initialMuted,
  elapsedSeconds: initialElapsedSeconds,
  durationSeconds: initialDurationSeconds,
  positionUpdatedAt: initialPositionUpdatedAt,
  mediaCapabilities: initialMediaCapabilities,
  supportsGrouping: initialSupportsGrouping,
  supportsPreviousTrack: initialSupportsPreviousTrack,
  supportsNextTrack: initialSupportsNextTrack,
  groupMembers: initialGroupMembers,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  mediaStackAppearance = false,
  mediaStackCount,
  mediaStackSettings,
  onDerivedBackgroundChange,
  openSettingsRequestKey = 0,
  disableTransportPlayback = false,
  hideTransportControls = false,
  onTogglePlayback,
  simulateTvRemote = false,
  companion,
}: MediaCardProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const effectsQuality = useEffectiveEffectsQuality();
  const isLowEffects = effectsQuality === 'low';
  const mediaEntityTypeKey = getMediaEntityTypeKey(entityType, deviceClass);
  const mediaEntityTypeLabel = t(mediaEntityTypeKey);
  const resolvedPlayerName = resolveMediaPlayerName({
    entityId: id,
    entityName: name,
    room: _room,
    entityType,
  });
  const cardShell = getCardShellSurfaceTokens(theme, undefined, effectsQuality);
  const surface = getThemeSurfaceTokens(theme, effectsQuality);
  const mediaSize = getCompactCardSize(size);
  const {
    albumArt: resolvedAlbumArt,
    artworkResource,
    clearPlaylist,
    currentPlayerIdentifier,
    cycleRepeat,
    closeDialog,
    durationSeconds,
    displayArtist,
    displayTitle,
    elapsedSeconds,
    handleArtworkError,
    handleNext,
    handlePrevious,
    handleVolumeChange,
    groupMembers,
    isOff,
    isPlaybackActive,
    isPlaying,
    isMuted,
    isOpen,
    mediaCapabilities,
    openDialog,
    remoteAvailable,
    repeatMode,
    seekTo,
    selectSource,
    selectSoundMode,
    availableGroupingPlayers,
    attachGroupMember,
    detachGroupMember,
    canNextTrack,
    canPreviousTrack,
    canTogglePlayback,
    shuffleEnabled,
    soundMode,
    soundModeList,
    source,
    sourceList,
    supportsGrouping,
    startVolumeInteraction,
    endVolumeInteraction,
    sendRemoteCommand,
    toggleTvPower,
    toggleShuffle,
    toggleMute,
    togglePlay,
    upNextTitle,
    volume,
  } = useMediaCardController({
    entityId: id,
    entityName: resolvedPlayerName,
    deviceClass,
    entityPicture,
    artworkKey: [entityPicture, title, artist].filter(Boolean).join('::'),
    initialTitle: title,
    initialArtist: artist,
    initialAlbum: album,
    initialSource,
    initialSourceList,
    initialState: state,
    initialVolume,
    initialMuted,
    initialElapsedSeconds,
    initialDurationSeconds,
    initialPositionUpdatedAt,
    initialMediaCapabilities,
    initialSupportsGrouping,
    initialSupportsPreviousTrack,
    initialSupportsNextTrack,
    initialGroupMembers,
  });
  const stableArtwork = useStableMediaArtwork(resolvedAlbumArt);
  const stackPaletteArtwork = getMediaArtworkPaletteSource(stableArtwork, artworkResource);
  const stackPalette = useMediaArtworkColors(
    stackPaletteArtwork,
    theme,
    id,
    `${displayTitle}::${displayArtist}`
  );
  const reportDerivedBackground = useCallback(
    (backgroundColor: string) => onDerivedBackgroundChange?.(id, backgroundColor),
    [id, onDerivedBackgroundChange]
  );

  const isSmall = mediaSize === 'small';
  const isMedium = mediaSize === 'medium';
  const isMediumVertical = mediaSize === 'medium-vertical';
  const isLarge = mediaSize === 'large';
  const isTv = deviceClass?.toLowerCase() === 'tv';
  const isSpotifyAccountCard =
    !isTv &&
    [id, name, resolvedPlayerName]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => value.toLowerCase().includes('spotify'));
  const effectiveHideTransportControls =
    hideTransportControls || (isSpotifyAccountCard && (source?.trim().length ?? 0) > 0);
  const useSpotifyConnectPresentation =
    isLarge && isSpotifyAccountCard && effectiveHideTransportControls;
  const tvRemoteAvailable = simulateTvRemote === true ? true : remoteAvailable;
  const isGlass = theme === 'glass';
  const hasArtwork = Boolean(resolvedAlbumArt);
  const isActiveTv = isTv && !isOff;
  const isActiveMediaSurface = isActiveTv || isPlaybackActive;
  const stateSurface = getCardStateSurfaceTokens(theme, isActiveMediaSurface);
  const [dialogInitialTab, setDialogInitialTab] = useState<string | undefined>(undefined);
  const inactiveShellBorder = surface.border;
  const cardBorder =
    theme === 'glass' && !isOff && !isActiveTv
      ? surface.border
      : hasArtwork
        ? 'border-transparent'
        : surface.border;
  const cardShadow = '';
  const activeTvShellBg = getActiveTvShellBg(theme);
  const activeTvShellBorder = getActiveTvShellBorder(theme);
  const shellBg = isOff
    ? ''
    : isActiveTv
      ? activeTvShellBg
      : isGlass
        ? surface.panel
        : hasArtwork
          ? theme === 'light'
            ? 'bg-white'
            : 'bg-zinc-950'
          : theme === 'light'
            ? ''
            : '';
  const backgroundClassName = theme === 'glass' ? shellBg || surface.panel : shellBg;
  const shellBorder = isOff ? inactiveShellBorder : isActiveTv ? activeTvShellBorder : cardBorder;
  const shellBlur = hasArtwork && !isOff ? '' : cardShell.backdropClassName;
  const shellOverlayClassName = isOff ? null : stateSurface.overlayClassName;
  const tvOnGlowClassName = isActiveTv && !isLowEffects ? getActiveTvGlowClassName(theme) : null;
  const activeTvShellStyle = isActiveTv ? getActiveTvShellStyle(theme) : undefined;
  const mediaIdentityProps = {
    entityId: id,
    artwork: resolvedAlbumArt,
    artworkResource,
    onArtworkError: handleArtworkError,
    entityName: mediaStackCount ? `${resolvedPlayerName} +${mediaStackCount}` : resolvedPlayerName,
    entityTypeKey: mediaEntityTypeKey,
    title: displayTitle,
    artist: displayArtist,
    isActive: isActiveMediaSurface,
    isPlaying,
    volume,
    isMuted,
    theme,
    onDerivedBackgroundChange: onDerivedBackgroundChange ? reportDerivedBackground : undefined,
  };
  const mediaControlProps = {
    hideTransportControls: effectiveHideTransportControls,
    onOpenDialog: openDialog,
    onSeek: seekTo,
    canSeek: effectiveHideTransportControls ? false : (mediaCapabilities?.canSeek ?? false),
    onCycleRepeat: cycleRepeat,
    onToggleShuffle: toggleShuffle,
    canRepeat: effectiveHideTransportControls ? false : (mediaCapabilities?.canRepeat ?? false),
    canShuffle: effectiveHideTransportControls ? false : (mediaCapabilities?.canShuffle ?? false),
    onToggleMute: toggleMute,
    onPrevious: handlePrevious,
    canPreviousTrack: effectiveHideTransportControls ? false : canPreviousTrack,
    onTogglePlay: onTogglePlayback ?? togglePlay,
    canTogglePlayback:
      effectiveHideTransportControls || disableTransportPlayback ? false : canTogglePlayback,
    onNext: handleNext,
    canNextTrack: effectiveHideTransportControls ? false : canNextTrack,
    repeatMode,
    shuffleEnabled,
    onVolumeChange: handleVolumeChange,
    onVolumeInteractionStart: startVolumeInteraction,
    onVolumeInteractionEnd: endVolumeInteraction,
  };
  const cardInteraction = useEntityCardInteractionController({
    ariaLabel: resolvedPlayerName,
    isEditMode,
    onToggle: isTv ? toggleTvPower : undefined,
    onOpenControls: () => {
      setDialogInitialTab(undefined);
      openDialog();
    },
    onOpenSettings: () => {
      setDialogInitialTab(mediaStackSettings ? 'stack' : undefined);
      openDialog();
    },
  });
  useEditModeSettingsRequest(id, openDialog, isEditMode);
  useEffect(() => {
    if (openSettingsRequestKey > 0) {
      setDialogInitialTab(mediaStackSettings ? 'stack' : undefined);
      openDialog();
    }
  }, [mediaStackSettings, openDialog, openSettingsRequestKey]);

  const stackLayerColors =
    theme === 'light'
      ? ['rgba(226, 232, 240, 0.96)', 'rgba(241, 245, 249, 0.9)']
      : theme === 'black'
        ? ['rgba(63, 63, 70, 0.98)', 'rgba(39, 39, 42, 0.94)']
        : ['rgba(82, 82, 91, 0.98)', 'rgba(63, 63, 70, 0.94)'];
  const visibleStackLayerCount = Math.min(2, Math.max(1, mediaStackCount ?? 2));
  const stackLayerShadows =
    mediaStackCount || isLowEffects
      ? []
      : [`0 -26px 0 -14px ${stackLayerColors[0]}`, `0 -44px 0 -22px ${stackLayerColors[1]}`].slice(
          0,
          visibleStackLayerCount
        );
  const stackShellStyle: CSSProperties = mediaStackAppearance
    ? {
        ...activeTvShellStyle,
        boxShadow: [...stackLayerShadows, activeTvShellStyle?.boxShadow].filter(Boolean).join(', '),
      }
    : (activeTvShellStyle ?? {});
  const stackBadge =
    mediaStackAppearance && !mediaStackCount ? (
      <div className="pointer-events-none absolute right-3 top-3 z-[1]">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] ${surface.textPrimary}`}
          style={{
            backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.84)' : 'rgba(24,24,27,0.58)',
            borderColor: theme === 'light' ? 'rgba(24,24,27,0.08)' : 'rgba(255,255,255,0.14)',
          }}
        >
          {t('widgets.mediaStack.badge')}
        </span>
      </div>
    ) : null;
  const stackLayerSurfaceClassName =
    backgroundClassName ||
    (theme === 'light' ? 'bg-white' : theme === 'black' ? 'bg-black' : 'bg-zinc-950');
  const stackLayerBackground = isLowEffects
    ? stackPalette.darkMuted
    : `radial-gradient(circle at 18% 14%, ${withAlpha(
        stackPalette.highlight,
        0.2
      )} 0%, transparent 34%), linear-gradient(165deg, ${withAlpha(
        stackPalette.dominant,
        0.72
      )} 0%, ${withAlpha(stackPalette.dominant, 0.62)} 42%, ${withAlpha(
        stackPalette.gradientEnd,
        0.68
      )} 100%)`;

  return (
    <>
      {companion ? (
        <LightCardTableRow
          compact
          name={resolvedPlayerName}
          isOn={!isOff}
          brightness={0}
          supportsBrightness={false}
          showToggle={false}
          isEditMode={isEditMode}
          disabled={companion.disabled}
          toggleDisabled={!(isOff ? mediaCapabilities?.canTurnOn : mediaCapabilities?.canTurnOff)}
          stateLabel={companion.value === t('common.unavailable') ? companion.value : ''}
          secondaryText={
            isOff ? undefined : [displayTitle, displayArtist].filter(Boolean).join(' · ')
          }
          cardInteraction={{
            settingsButtonProps: {
              type: 'button',
              'aria-label': t('entityCardInteraction.openSettings', { name: resolvedPlayerName }),
              onClick: openDialog,
            },
          }}
          iconButtonProps={{
            'aria-label': t('entityCardInteraction.toggle', { name: resolvedPlayerName }),
            onClick: toggleTvPower,
          }}
          onBrightnessChange={ignoreRowBrightness}
          onBrightnessCommit={ignoreRowBrightness}
        />
      ) : (
        <MediaStackContainer enabled={Boolean(mediaStackCount)}>
          {mediaStackCount && mediaStackCount > 1 ? (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-5 -top-3.5 bottom-4 rounded-[24px] border ${stackLayerSurfaceClassName}`}
              style={{
                zIndex: 0,
                background: stackLayerBackground,
                borderColor:
                  theme === 'light' ? 'rgba(148,163,184,0.26)' : 'rgba(255,255,255,0.09)',
                boxShadow: isLowEffects ? 'none' : '0 14px 30px -16px rgba(0,0,0,0.72)',
              }}
            />
          ) : null}
          {mediaStackCount ? (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-2.5 -top-1.5 bottom-2 rounded-[24px] border ${stackLayerSurfaceClassName}`}
              style={{
                zIndex: 0,
                background: stackLayerBackground,
                borderColor:
                  theme === 'light' ? 'rgba(148,163,184,0.34)' : 'rgba(255,255,255,0.12)',
                boxShadow: isLowEffects ? 'none' : '0 9px 22px -13px rgba(0,0,0,0.62)',
              }}
            />
          ) : null}
          <BaseCard
            size={size}
            {...cardInteraction.cardProps}
            interactive={!isEditMode}
            className={`relative z-[1] ${isEditMode ? '' : 'cursor-pointer'}`}
            backgroundClassName={backgroundClassName}
            frameClassName={`${cardShell.rootFrameClassName} ${shellBorder} ${cardShadow} ${shellBlur} ${stateSurface.containerClassName}`}
            style={stackShellStyle}
            disableDefaultSheen
            overlay={
              <>
                {shellOverlayClassName ? (
                  <div className={`absolute inset-0 ${shellOverlayClassName}`} />
                ) : null}
                {tvOnGlowClassName ? (
                  <div className={`absolute inset-0 ${tvOnGlowClassName}`} />
                ) : null}
              </>
            }
            contentClassName="h-full"
          >
            <div className="relative h-full flex flex-col">
              {stackBadge}
              {isTv ? (
                <MediaTvView
                  size={mediaSize}
                  playerName={resolvedPlayerName}
                  source={source}
                  sourceList={sourceList}
                  isOn={!isOff}
                  isPlaying={isPlaying}
                  volume={volume}
                  isMuted={isMuted}
                  theme={theme}
                  onDerivedBackgroundChange={
                    onDerivedBackgroundChange ? reportDerivedBackground : undefined
                  }
                  remoteAvailable={tvRemoteAvailable}
                  canSetVolume={mediaCapabilities?.canSetVolume ?? false}
                  canMuteVolume={mediaCapabilities?.canMuteVolume ?? false}
                  canSelectSource={mediaCapabilities?.canSelectSource ?? false}
                  onTogglePlay={onTogglePlayback ?? togglePlay}
                  onToggleMute={toggleMute}
                  onVolumeChange={handleVolumeChange}
                  onVolumeInteractionStart={startVolumeInteraction}
                  onVolumeInteractionEnd={endVolumeInteraction}
                  onSelectSource={selectSource}
                  onRemoteCommand={sendRemoteCommand}
                  onOpenDialog={openDialog}
                />
              ) : isSmall ? (
                <MediaSmallView
                  {...mediaIdentityProps}
                  {...mediaControlProps}
                  elapsedSeconds={elapsedSeconds}
                  durationSeconds={durationSeconds}
                />
              ) : isMedium ? (
                <MediaMediumView
                  {...mediaIdentityProps}
                  {...mediaControlProps}
                  elapsedSeconds={elapsedSeconds}
                  durationSeconds={durationSeconds}
                />
              ) : isMediumVertical ? (
                <MediaMediumVerticalView
                  {...mediaIdentityProps}
                  {...mediaControlProps}
                  elapsedSeconds={elapsedSeconds}
                  durationSeconds={durationSeconds}
                />
              ) : isLarge ? (
                <MediaLargeView
                  {...mediaIdentityProps}
                  {...mediaControlProps}
                  hideHeader={useSpotifyConnectPresentation}
                  fallbackArtworkIcon={useSpotifyConnectPresentation ? 'spotify' : 'disc'}
                  elapsedSeconds={elapsedSeconds}
                  durationSeconds={durationSeconds}
                />
              ) : null}
            </div>
          </BaseCard>
        </MediaStackContainer>
      )}

      {isOpen && (
        <Suspense fallback={null}>
          <MediaDialog
            entityId={id}
            room={_room}
            deviceClass={deviceClass}
            initialTab={dialogInitialTab}
            mediaStackSettings={mediaStackSettings}
            remoteAvailable={tvRemoteAvailable}
            isOpen={isOpen}
            onOpenChange={(open) => {
              if (!open) {
                setDialogInitialTab(undefined);
              }
              closeDialog(open);
            }}
            artwork={resolvedAlbumArt}
            artworkResource={artworkResource}
            onArtworkError={handleArtworkError}
            entityName={resolvedPlayerName}
            entityType={mediaEntityTypeLabel}
            title={displayTitle}
            artist={displayArtist}
            isPlaying={isPlaying}
            volume={volume}
            isMuted={isMuted}
            elapsedSeconds={elapsedSeconds}
            durationSeconds={durationSeconds}
            supportsGrouping={supportsGrouping}
            groupMembers={groupMembers}
            availableGroupingPlayers={availableGroupingPlayers}
            groupingPlayerSubtitle={currentPlayerIdentifier}
            onPrevious={handlePrevious}
            canPreviousTrack={canPreviousTrack}
            onTogglePlay={onTogglePlayback ?? togglePlay}
            onNext={handleNext}
            canNextTrack={canNextTrack}
            shuffleEnabled={shuffleEnabled}
            repeatMode={repeatMode}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeat}
            upNextTitle={upNextTitle}
            onToggleMute={toggleMute}
            onVolumeChange={handleVolumeChange}
            onVolumeInteractionStart={startVolumeInteraction}
            onVolumeInteractionEnd={endVolumeInteraction}
            onAttachGroupMember={attachGroupMember}
            onDetachGroupMember={detachGroupMember}
            source={source}
            sourceList={sourceList}
            onSelectSource={selectSource}
            onRemoteCommand={sendRemoteCommand}
            capabilities={mediaCapabilities}
            canTogglePlayback={
              effectiveHideTransportControls || disableTransportPlayback ? false : canTogglePlayback
            }
            canSeek={effectiveHideTransportControls ? false : (mediaCapabilities?.canSeek ?? false)}
            soundMode={soundMode}
            soundModeList={soundModeList}
            onSelectSoundMode={selectSoundMode}
            onSeek={seekTo}
            onClearPlaylist={clearPlaylist}
          />
        </Suspense>
      )}
    </>
  );
});
