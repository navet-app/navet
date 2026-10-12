import { CardDialogTabList, CardDialogTabTrigger } from '@navet/app/components/patterns';
import { CardDialogOverflowMenu } from '@navet/app/components/patterns/card-dialog-overflow-menu';
import { Button } from '@navet/app/components/primitives/button';
import { ModalSurface } from '@navet/app/components/primitives/modal-surface';
import { SheetSurface, SheetSurfaceHeader } from '@navet/app/components/primitives/sheet-surface';
import { TabPanel, Tabs } from '@navet/app/components/primitives/tabs';
import { EntityHelperControls } from '@navet/app/components/shared/device-editor/entity-helper-controls';
import { EntityRoomSelector } from '@navet/app/components/shared/entity-room-selector';
import { useEntityProviderFeature, useI18n, useMediaQuery } from '@navet/app/hooks';
import * as Popover from '@radix-ui/react-popover';
import { ArrowLeft, Layers3, ListMusic, MapPin, Sliders, Speaker, Tv2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaDialogProps } from './media-dialog.types';
import { MediaDialogBrowser } from './media-dialog-browser';
import {
  MediaDialogArtwork,
  MediaDialogGrouping,
  MediaDialogHeader,
  MediaDialogPlaybackControls,
  MediaDialogTvControls,
  MediaDialogUpNext,
  MediaDialogVolumeControl,
} from './media-dialog-sections';
import { MediaStackDialogSettings } from './media-stack-dialog-settings';
import type { MediaDialogController } from './use-media-dialog-controller';

interface MediaDialogContentProps extends MediaDialogProps {
  controller: MediaDialogController;
}

type TvDialogMode = 'tv' | 'playback';

const MUSIC_SOURCE_KEYWORDS = [
  'spotify',
  'youtube music',
  'apple music',
  'tidal',
  'deezer',
  'amazon music',
  'plexamp',
  'qobuz',
] as const;

const VIDEO_SOURCE_KEYWORDS = [
  'youtube',
  'netflix',
  'disney+',
  'disney plus',
  'prime video',
  'amazon prime',
  'apple tv',
  'hulu',
  'plex',
  'max',
  'hbo',
  'samsung tv plus',
] as const;

function includesKnownKeyword(value: string, keywords: readonly string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function resolveTvDialogMode(params: {
  artist: string;
  entityName: string;
  source?: string;
  title: string;
}): TvDialogMode {
  const normalizedArtist = params.artist.trim().toLowerCase();
  const normalizedEntityName = params.entityName.trim().toLowerCase();
  const normalizedSource = params.source?.trim().toLowerCase() ?? '';
  const normalizedTitle = params.title.trim().toLowerCase();
  const hasArtist = normalizedArtist.length > 0 && normalizedArtist !== normalizedSource;
  const hasDistinctTitle =
    normalizedTitle.length > 0 &&
    normalizedTitle !== normalizedEntityName &&
    normalizedTitle !== normalizedSource;
  const sourceLooksLikeMusic = includesKnownKeyword(normalizedSource, MUSIC_SOURCE_KEYWORDS);
  const sourceLooksLikeVideo = includesKnownKeyword(normalizedSource, VIDEO_SOURCE_KEYWORDS);

  if (sourceLooksLikeMusic && (hasArtist || hasDistinctTitle)) {
    return 'playback';
  }

  if (sourceLooksLikeVideo) {
    return 'tv';
  }

  if (hasArtist && hasDistinctTitle) {
    return 'playback';
  }

  return 'tv';
}

export function MediaDialogContent({
  artist,
  artwork,
  availableGroupingPlayers,
  capabilities,
  controller,
  deviceClass,
  durationSeconds,
  entityName,
  entityType,
  elapsedSeconds,
  entityId,
  initialTab,
  room,
  mediaStackSettings,
  groupMembers,
  groupingPlayerSubtitle,
  isMuted,
  isOpen,
  isPlaying,
  onArtworkError,
  onAttachGroupMember,
  onCycleRepeat,
  onDetachGroupMember,
  onNext,
  onOpenChange,
  onPrevious,
  onRemoteCommand,
  onSeek,
  canNextTrack,
  canPreviousTrack,
  canSeek,
  canTogglePlayback = true,
  onSelectSource,
  onToggleMute,
  onTogglePlay,
  onToggleShuffle,
  onVolumeChange,
  onVolumeInteractionEnd,
  onVolumeInteractionStart,
  repeatMode,
  remoteAvailable = false,
  shuffleEnabled,
  source,
  sourceList,
  supportsGrouping,
  title,
  upNextTitle,
  volume,
}: MediaDialogContentProps) {
  const { t } = useI18n();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const groupingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isTvDevice = deviceClass?.trim().toLowerCase() === 'tv';
  const defaultTvDialogMode = useMemo(
    () => resolveTvDialogMode({ artist, entityName, source, title }),
    [artist, entityName, source, title]
  );
  const defaultTab = useMemo(() => {
    if (initialTab) {
      return initialTab;
    }

    return isTvDevice ? defaultTvDialogMode : 'playback';
  }, [defaultTvDialogMode, initialTab, isTvDevice]);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [titleEditing, setTitleEditing] = useState(false);
  const [editingRoom, setEditingRoom] = useState(false);
  const [isGroupingPickerOpen, setIsGroupingPickerOpen] = useState(false);
  const supportsMediaBrowse = useEntityProviderFeature(entityId, 'mediaBrowse');
  const canBrowseMedia = capabilities.canBrowseMedia && supportsMediaBrowse;
  const hasGroupingControls = supportsGrouping;
  const shouldRenderTabs = isTvDevice || Boolean(mediaStackSettings);
  const groupingLabel = t('media.group.action');
  const groupingTrigger = hasGroupingControls ? (
    <button
      ref={groupingTriggerRef}
      type="button"
      aria-label={groupingLabel}
      aria-pressed={isGroupingPickerOpen}
      aria-expanded={isGroupingPickerOpen}
      aria-haspopup="dialog"
      onClick={() => setIsGroupingPickerOpen((current) => !current)}
      className={`relative inline-flex h-[38px] items-center justify-center gap-2 rounded-full border px-3 transition-colors ${
        controller.surface.border
      } ${
        isGroupingPickerOpen
          ? controller.isGlass
            ? 'bg-white/16'
            : 'bg-white/12'
          : controller.isGlass
            ? 'bg-white/8 hover:bg-white/12'
            : 'bg-white/[0.05] hover:bg-white/[0.09]'
      }`}
      style={controller.readableForeground.titleStyle}
    >
      <Speaker className="h-[0.95rem] w-[0.95rem]" />
      <span className="text-xs font-medium leading-none tracking-[0.01em]">{groupingLabel}</span>
      {groupMembers.length > 1 ? (
        <span
          className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.62rem] font-semibold"
          style={{
            backgroundColor: controller.palette.vibrant,
            color: controller.readableForeground.titleColor,
          }}
        >
          {groupMembers.length}
        </span>
      ) : null}
    </button>
  ) : null;
  const groupingPanel = supportsGrouping ? (
    <MediaDialogGrouping
      availableGroupingPlayers={availableGroupingPlayers}
      controller={controller}
      entityId={entityId}
      entityName={entityName}
      entitySubtitle={groupingPlayerSubtitle}
      groupMembers={groupMembers}
      onAttachGroupMember={onAttachGroupMember}
      onDetachGroupMember={onDetachGroupMember}
    />
  ) : null;

  const musicPlaybackPanel = (
    <div className="space-y-6 pt-2 md:space-y-7 md:pt-3">
      <MediaDialogArtwork
        artist={artist}
        artwork={artwork}
        controller={controller}
        onArtworkError={onArtworkError}
        title={title}
      />
      <MediaDialogPlaybackControls
        artist={artist}
        title={title}
        controller={controller}
        isPlaying={isPlaying}
        canNextTrack={canNextTrack}
        canPreviousTrack={canPreviousTrack}
        canShuffle={capabilities.canShuffle}
        canRepeat={capabilities.canRepeat}
        canSeek={canSeek ?? capabilities.canSeek}
        canTogglePlayback={canTogglePlayback}
        durationSeconds={durationSeconds}
        elapsedSeconds={elapsedSeconds}
        onCycleRepeat={onCycleRepeat}
        onNext={onNext}
        onPrevious={onPrevious}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        onToggleShuffle={onToggleShuffle}
        repeatMode={repeatMode}
        shuffleEnabled={shuffleEnabled}
      />
      <MediaDialogVolumeControl
        controller={controller}
        canMuteVolume={capabilities.canMuteVolume}
        canSetVolume={capabilities.canSetVolume}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        onVolumeChange={onVolumeChange}
        onVolumeInteractionEnd={onVolumeInteractionEnd}
        onVolumeInteractionStart={onVolumeInteractionStart}
        volume={volume}
      />
      {upNextTitle ? <MediaDialogUpNext controller={controller} title={upNextTitle} /> : null}
    </div>
  );
  const tvControlsPanel = (
    <div className="space-y-5 pt-2 md:space-y-6 md:pt-3">
      <MediaDialogTvControls
        controller={controller}
        source={source}
        sourceList={sourceList}
        isPlaying={isPlaying}
        remoteAvailable={remoteAvailable}
        canSetVolume={capabilities.canSetVolume}
        canMuteVolume={capabilities.canMuteVolume}
        canSelectSource={capabilities.canSelectSource}
        isMuted={isMuted}
        volume={volume}
        onToggleMute={onToggleMute}
        onVolumeChange={onVolumeChange}
        onVolumeInteractionEnd={onVolumeInteractionEnd}
        onVolumeInteractionStart={onVolumeInteractionStart}
        onSelectSource={onSelectSource}
        onRemoteCommand={onRemoteCommand}
        onTogglePlay={onTogglePlay}
      />
    </div>
  );
  const stackSettingsPanel = mediaStackSettings ? (
    <MediaStackDialogSettings controller={controller} settings={mediaStackSettings} />
  ) : null;
  const browserPanel = canBrowseMedia ? (
    <MediaDialogBrowser
      canPlayMedia={capabilities.canPlayMedia}
      canSearchMedia={capabilities.canSearchMedia}
      controller={controller}
      entityId={entityId}
      isActive={activeTab === 'browse'}
    />
  ) : null;
  const speakerQuickActions =
    !isTvDevice && !mediaStackSettings ? (
      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        {hasGroupingControls ? (
          <>
            <Popover.Root open={isGroupingPickerOpen} onOpenChange={setIsGroupingPickerOpen}>
              <Popover.Anchor asChild>{groupingTrigger}</Popover.Anchor>
              {groupingPanel && !isPhone ? (
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    align="center"
                    sideOffset={10}
                    className="z-[920] w-[min(19.5rem,calc(100vw-2.5rem))] outline-none"
                    onWheel={(event) => event.stopPropagation()}
                    onTouchMove={(event) => event.stopPropagation()}
                    onInteractOutside={(event) => {
                      if (
                        groupingTriggerRef.current &&
                        event.target instanceof Node &&
                        groupingTriggerRef.current.contains(event.target)
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    {groupingPanel}
                    <Popover.Arrow
                      width={18}
                      height={10}
                      className={
                        controller.isGlass
                          ? 'fill-slate-700/90 stroke-white/22 [stroke-width:1.25] drop-shadow-[0_-2px_6px_rgba(0,0,0,0.22)]'
                          : 'fill-[rgba(24,24,27,0.96)] stroke-[rgba(161,161,170,0.18)] [stroke-width:1.25] drop-shadow-[0_-2px_6px_rgba(0,0,0,0.28)]'
                      }
                    />
                  </Popover.Content>
                </Popover.Portal>
              ) : null}
            </Popover.Root>
            {groupingPanel && isPhone ? (
              <SheetSurface
                isOpen={isGroupingPickerOpen}
                onOpenChange={setIsGroupingPickerOpen}
                title={t('media.group.title')}
                description={entityName}
                accentColor={controller.palette.vibrant}
                bodyClassName="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              >
                <div className="space-y-4">
                  <SheetSurfaceHeader
                    title={t('media.group.title')}
                    description={entityName}
                    closeLabel={t('common.closeDialog')}
                    onClose={() => setIsGroupingPickerOpen(false)}
                  />
                  {groupingPanel}
                </div>
              </SheetSurface>
            ) : null}
          </>
        ) : null}
        {browserPanel ? (
          <button
            type="button"
            aria-label={t('media.browse')}
            aria-pressed={activeTab === 'browse'}
            onClick={() =>
              setActiveTab((current) => (current === 'browse' ? 'playback' : 'browse'))
            }
            className={`inline-flex h-[38px] items-center justify-center gap-2 rounded-full border px-3 transition-colors ${
              controller.surface.border
            } ${
              activeTab === 'browse'
                ? controller.isGlass
                  ? 'bg-white/16'
                  : 'bg-white/12'
                : controller.isGlass
                  ? 'bg-white/8 hover:bg-white/12'
                  : 'bg-white/[0.05] hover:bg-white/[0.09]'
            }`}
            style={controller.readableForeground.titleStyle}
          >
            <ListMusic className="h-[0.95rem] w-[0.95rem]" />
            <span className="text-xs font-medium leading-none tracking-[0.01em]">
              {t('media.browse')}
            </span>
          </button>
        ) : null}
      </div>
    ) : null;

  useEffect(() => {
    setActiveTab((current) => {
      if (mediaStackSettings && current === 'stack') {
        return current;
      }

      if (isTvDevice) {
        if (current === 'group') {
          return current;
        }

        if (current === 'stack' && mediaStackSettings) {
          return current;
        }

        return defaultTvDialogMode;
      }

      if (mediaStackSettings) {
        return current === 'tv' ? 'stack' : current;
      }

      return current === 'tv' || current === 'stack' ? 'playback' : current;
    });
  }, [defaultTab, defaultTvDialogMode, entityId, isTvDevice, mediaStackSettings]);

  useEffect(() => {
    setIsGroupingPickerOpen(false);
    setTitleEditing(false);
    setEditingRoom(false);
  }, [entityId, isOpen, supportsGrouping]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const menu = (
    <CardDialogOverflowMenu
      theme={controller.theme}
      entityId={entityId}
      sections={[{ key: 'room', label: t('dashboard.roomsWorkspace.editRoom'), icon: MapPin }]}
      onSectionChange={() => {
        setTitleEditing(false);
        setEditingRoom(true);
      }}
      onEditName={() => {
        setEditingRoom(false);
        setTitleEditing(true);
      }}
    />
  );

  return (
    <ModalSurface
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={entityName}
      titleInContent
      description={entityType}
      mobileCoverSheet
      mobileCoverSheetActions={menu}
      bodyClassName="media-dialog-body relative flex h-full max-h-full min-h-0 flex-1 touch-pan-y flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-6 pt-6 pb-10 [-webkit-overflow-scrolling:touch] max-sm:px-3.5 max-sm:pt-2 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] md:px-7 md:pt-6 md:pb-10"
      shellBodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      overlayClassName={`animate-in fade-in ${controller.surface.dialogBackdrop}`}
      contentClassName="flex h-auto max-h-[88vh] min-h-0 w-[min(92vw,27rem)] flex-col overflow-hidden max-sm:!overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      contentStyle={controller.dialogSurfaceStyle}
    >
      <div className="relative space-y-6">
        <MediaDialogHeader
          controller={controller}
          entityName={entityName}
          entityType={entityType}
          entityId={entityId}
          room={room}
          menu={menu}
          titleEditing={titleEditing}
          onTitleEditingChange={setTitleEditing}
        />

        <div className="relative">
          {editingRoom ? (
            <div className="space-y-4">
              <Button
                variant="soft"
                size="compact"
                leading={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setEditingRoom(false)}
              >
                {t('common.backToControls')}
              </Button>
              <EntityRoomSelector entityId={entityId} fallbackRoomName={room} />
            </div>
          ) : shouldRenderTabs ? (
            <Tabs value={activeTab} defaultValue={defaultTab} onValueChange={setActiveTab}>
              <TabPanel value="tv" className="mt-0">
                {tvControlsPanel}
              </TabPanel>
              <TabPanel value="playback" className="mt-0">
                {musicPlaybackPanel}
              </TabPanel>
              {stackSettingsPanel ? (
                <TabPanel value="stack" className="mt-0">
                  {stackSettingsPanel}
                </TabPanel>
              ) : null}

              <div className="flex justify-center pt-1">
                <CardDialogTabList>
                  {isTvDevice ? (
                    <CardDialogTabTrigger
                      active={activeTab === 'tv'}
                      className="min-w-[4.75rem] justify-center rounded-full"
                      icon={Tv2}
                      onClick={() => setActiveTab('tv')}
                      style={controller.readableForeground.titleStyle}
                    >
                      {t('media.type.tv')}
                    </CardDialogTabTrigger>
                  ) : null}
                  <CardDialogTabTrigger
                    active={activeTab === 'playback'}
                    className="min-w-[5.5rem] justify-center rounded-full"
                    icon={Sliders}
                    onClick={() => setActiveTab('playback')}
                    style={controller.readableForeground.titleStyle}
                  >
                    {t('media.tabs.playback')}
                  </CardDialogTabTrigger>
                  {stackSettingsPanel ? (
                    <CardDialogTabTrigger
                      active={activeTab === 'stack'}
                      className="min-w-[5.5rem] justify-center rounded-full"
                      icon={Layers3}
                      onClick={() => setActiveTab('stack')}
                      style={controller.readableForeground.titleStyle}
                    >
                      {t('dashboard.addCard.templates.mediaStack.name')}
                    </CardDialogTabTrigger>
                  ) : null}
                </CardDialogTabList>
              </div>
            </Tabs>
          ) : mediaStackSettings ? (
            stackSettingsPanel
          ) : activeTab === 'browse' && browserPanel ? (
            browserPanel
          ) : (
            musicPlaybackPanel
          )}
          {editingRoom ? null : speakerQuickActions}
          {!editingRoom && isOpen ? <EntityHelperControls entityId={entityId} /> : null}
        </div>
      </div>
    </ModalSurface>
  );
}
