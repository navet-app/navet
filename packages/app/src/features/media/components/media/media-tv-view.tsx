import { CardActionRow } from '@navet/app/components/patterns/card-action-row';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getMediaTVViewSurfaceTokens } from '@navet/app/components/shared/theme/media-tv-view-surface-tokens';
import type { TvRemoteAction } from '@navet/app/features/media/tv-remote-commands';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { ChevronsUpDown, Tv2, Volume2, VolumeX } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { TvControlButton } from './tv-control-button';
import { getTvDpadLayout, TvDpad } from './tv-dpad';
import { TvSourceSelector } from './tv-source-selector';
import { TvTransportControls } from './tv-transport-controls';
import { TvChannelControls, TvVolumeControls } from './tv-volume-controls';
import {
  type MediaDerivedColorsReporter,
  useReportMediaDerivedColors,
} from './use-report-media-derived-colors';

interface MediaTvViewProps {
  size: CardSize;
  playerName: string;
  source?: string;
  sourceList: string[];
  isOn: boolean;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  theme: ThemeType;
  onDerivedBackgroundChange?: MediaDerivedColorsReporter;
  remoteAvailable: boolean;
  canSetVolume: boolean;
  canMuteVolume: boolean;
  canSelectSource: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onVolumeInteractionStart: () => void;
  onVolumeInteractionEnd: () => void;
  onSelectSource: (source: string) => void;
  onRemoteCommand: (action: TvRemoteAction) => void;
  onOpenDialog: () => void;
}

export function MediaTvView({
  size,
  playerName,
  source,
  sourceList,
  isOn,
  isPlaying,
  volume,
  isMuted,
  theme,
  onDerivedBackgroundChange,
  remoteAvailable,
  canSetVolume,
  canMuteVolume,
  canSelectSource,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onVolumeInteractionStart,
  onVolumeInteractionEnd,
  onSelectSource,
  onRemoteCommand,
  onOpenDialog,
}: MediaTvViewProps) {
  const { t } = useI18n();
  const tvSurface = getMediaTVViewSurfaceTokens(theme, isOn);
  const tvTextTokens = getCardReadableTextTokens({
    theme,
    tone: isOn ? 'pink' : 'neutral',
    baseColor: tvSurface.tvBaseColor,
    backgroundColor: tvSurface.tvBackgroundColor,
  });
  useReportMediaDerivedColors(onDerivedBackgroundChange, tvSurface.tvBackgroundColor);
  const isSmallTvCard = size === 'small';
  const isMediumVerticalTv = size === 'medium-vertical';
  const isCompactCardSourceSelector = isSmallTvCard || isMediumVerticalTv;
  const constrainCardSourceSelector =
    size === 'small' || size === 'medium' || size === 'medium-vertical';
  const tvDpadLayout = isMediumVerticalTv
    ? {
        ...getTvDpadLayout('medium'),
        shell: 'h-[92px] w-[92px] rounded-[20px]',
        innerInset: 'inset-[23px]',
        centerClassName: 'h-8 w-8',
        crosshairMarginPx: 28,
        edgeIconClassName: 'h-3.5 w-3.5',
      }
    : getTvDpadLayout(size as 'small' | 'medium' | 'medium-vertical' | 'large' | 'extra-large');
  const [smallControls, setSmallControls] = useState<'volume' | 'channel' | null>(null);
  const smallControlsId = useId();
  const smallControlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSmallTvCard || !smallControls) return;
    let timer: ReturnType<typeof setTimeout>;
    const dismiss = (restoreFocus = false) => {
      clearTimeout(timer);
      setSmallControls(null);
      if (restoreFocus)
        requestAnimationFrame(() => {
          const label = t(
            smallControls === 'volume' ? 'media.tv.volumeControls' : 'media.tv.channelControls'
          );
          [...(smallControlsRef.current?.querySelectorAll('button') ?? [])]
            .find((button) => button.ariaLabel === label)
            ?.focus();
        });
    };
    // Match the light card's three-second temporary adjustment mode, renewed on interaction.
    const scheduleReset = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => dismiss(smallControlsRef.current?.contains(document.activeElement)),
        3000
      );
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !smallControlsRef.current?.contains(event.target))
        dismiss();
      else scheduleReset();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss(true);
      } else if (event.target instanceof Node && smallControlsRef.current?.contains(event.target)) {
        scheduleReset();
      }
    };
    const controls = smallControlsRef.current;
    scheduleReset();
    controls?.addEventListener('click', scheduleReset);
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      controls?.removeEventListener('click', scheduleReset);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isSmallTvCard, smallControls, t]);
  /** 6px standard gap between TV control buttons */
  const tvControlClusterGap = 'gap-1.5';
  const tvSectionStackGap = isSmallTvCard || isMediumVerticalTv ? 'gap-2' : 'gap-3';
  const tvIconClass = isSmallTvCard ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const tvCardActionRowSize = isSmallTvCard ? 'small' : 'medium';
  const iconClassName = tvSurface.iconClassName;
  const showRemoteControls = remoteAvailable;
  const showVolumeControls = canSetVolume || canMuteVolume;
  const showChannelControls = remoteAvailable;
  const showSourceSelector = canSelectSource;

  const controlStyle: CSSProperties = tvSurface.controlStyle;
  const panelStyle: CSSProperties = tvSurface.panelStyle;
  const navShellStyle: CSSProperties = tvSurface.navShellStyle;

  const tvSettingsButton = (
    <CardSettingsActionButton
      theme={theme}
      size={isSmallTvCard ? 'small' : 'medium'}
      variant="soft"
      onClick={(event) => {
        event.stopPropagation();
        setSmallControls(null);
        onOpenDialog();
      }}
    />
  );

  const tvMuteButton = canMuteVolume ? (
    <TvControlButton
      theme={theme}
      label={isMuted ? t('media.unmuteVolume') : t('media.muteVolume')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={onToggleMute}
    >
      {isMuted ? <VolumeX className={tvIconClass} /> : <Volume2 className={tvIconClass} />}
    </TvControlButton>
  ) : null;

  const volumeControls = (
    <TvVolumeControls
      theme={theme}
      orientation="vertical"
      isMuted={isMuted}
      volume={volume}
      canSetVolume={canSetVolume}
      canMuteVolume={false}
      controlStyle={controlStyle}
      iconClassName={iconClassName}
      tvIconClass={tvIconClass}
      tvControlClusterGap={tvControlClusterGap}
      onToggleMute={onToggleMute}
      onVolumeChange={onVolumeChange}
      onVolumeInteractionStart={onVolumeInteractionStart}
      onVolumeInteractionEnd={onVolumeInteractionEnd}
    />
  );
  const channelControls = (
    <TvChannelControls
      theme={theme}
      orientation="vertical"
      showLabels
      remoteAvailable={remoteAvailable}
      controlStyle={controlStyle}
      iconClassName={iconClassName}
      tvIconClass={tvIconClass}
      tvControlClusterGap={tvControlClusterGap}
      onRemoteCommand={onRemoteCommand}
    />
  );
  const utilityControls =
    showVolumeControls || showChannelControls ? (
      <div className={`flex min-w-0 items-start ${tvControlClusterGap}`}>
        {volumeControls}
        {channelControls}
        {tvMuteButton}
      </div>
    ) : null;

  const header = (
    <EntityCardHeader
      title={playerName}
      subtitle={t('media.type.tv')}
      layout="eyebrow-first"
      size={size}
      tone={isOn ? 'pink' : 'neutral'}
      accentColor={isOn ? '#d946ef' : null}
      titleClassName="text-left"
      subtitleClassName="text-left"
      leading={
        <EntityCardHeaderIcon
          IconComponent={Tv2}
          isActive={isOn}
          size={size}
          tone={isOn ? 'pink' : 'neutral'}
        />
      }
    />
  );

  const sourceSelector = showSourceSelector ? (
    <TvSourceSelector
      source={source}
      sourceList={sourceList}
      isSmallTvCard={isSmallTvCard || size === 'medium'}
      fillAvailableWidth={size === 'medium'}
      constrainCardWidth={constrainCardSourceSelector}
      compactCardSelector={isCompactCardSourceSelector}
      theme={theme}
      panelStyle={panelStyle}
      tvTextTokens={tvTextTokens}
      onSelectSource={onSelectSource}
    />
  ) : null;

  const transportControls = (
    <TvTransportControls
      theme={theme}
      isPlaying={isPlaying}
      remoteAvailable={remoteAvailable}
      controlStyle={controlStyle}
      iconClassName={iconClassName}
      tvIconClass={tvIconClass}
      onRemoteCommand={onRemoteCommand}
      onTogglePlay={onTogglePlay}
    />
  );

  const quickRow = (
    <CardActionRow
      theme={theme}
      size={tvCardActionRowSize}
      className="[&>div:first-child]:min-w-fit"
      leftContent={transportControls}
      rightContent={
        <div className={`flex min-w-0 items-center ${tvControlClusterGap}`}>
          {sourceSelector}
          {tvSettingsButton}
        </div>
      }
    />
  );

  const renderDpadOverlay = () =>
    showRemoteControls ? (
      <div className="pointer-events-none absolute right-0 top-0 z-20 flex justify-end">
        <div className="pointer-events-auto">
          <TvDpad
            theme={theme}
            remoteAvailable={remoteAvailable}
            style={controlStyle}
            shellStyle={navShellStyle}
            layout={tvDpadLayout}
            onRemoteCommand={onRemoteCommand}
          />
        </div>
      </div>
    ) : null;

  const renderDpadInline = () =>
    showRemoteControls ? (
      <TvDpad
        theme={theme}
        remoteAvailable={remoteAvailable}
        style={controlStyle}
        shellStyle={navShellStyle}
        layout={tvDpadLayout}
        onRemoteCommand={onRemoteCommand}
      />
    ) : null;

  if (size === 'medium') {
    return (
      <div data-tv-card-root className="relative flex h-full flex-col">
        {renderDpadOverlay()}
        <div className={showRemoteControls ? 'pr-28' : ''}>{header}</div>
        <div className="relative flex min-h-0 flex-1">
          <div className={`flex min-w-0 flex-1 flex-col ${showRemoteControls ? 'pr-28' : ''}`}>
            <div data-tv-control-viewport className="mt-auto overflow-auto">
              <div className={`flex w-max items-start ${tvControlClusterGap}`}>
                <TvVolumeControls
                  theme={theme}
                  orientation="vertical"
                  isMuted={isMuted}
                  volume={volume}
                  canSetVolume={canSetVolume}
                  canMuteVolume={false}
                  controlStyle={controlStyle}
                  iconClassName={iconClassName}
                  tvIconClass={tvIconClass}
                  tvControlClusterGap={tvControlClusterGap}
                  onToggleMute={onToggleMute}
                  onVolumeChange={onVolumeChange}
                  onVolumeInteractionStart={onVolumeInteractionStart}
                  onVolumeInteractionEnd={onVolumeInteractionEnd}
                />
                <TvChannelControls
                  theme={theme}
                  orientation="vertical"
                  showLabels
                  remoteAvailable={remoteAvailable}
                  controlStyle={controlStyle}
                  iconClassName={iconClassName}
                  tvIconClass={tvIconClass}
                  tvControlClusterGap={tvControlClusterGap}
                  onRemoteCommand={onRemoteCommand}
                />
                <div className={`grid grid-cols-3 ${tvControlClusterGap}`}>
                  {tvMuteButton ?? <span aria-hidden="true" />}
                  {transportControls}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] ${tvControlClusterGap}`}
        >
          {/* Match the volume, channel, mute and menu columns; source begins below Home. */}
          {[0, 1, 2, 3].map((column) => (
            <span key={column} aria-hidden="true" className="navet-card-action-control" />
          ))}
          <div className={`pointer-events-auto flex min-w-0 items-center ${tvControlClusterGap}`}>
            {sourceSelector}
            {tvSettingsButton}
          </div>
        </div>
      </div>
    );
  }

  if (isSmallTvCard) {
    return (
      <div data-tv-card-root className="relative flex h-full flex-col">
        {header}
        <div className="flex min-h-0 flex-1 flex-col justify-end">
          <div ref={smallControlsRef} className={`flex items-end ${tvControlClusterGap}`}>
            {smallControls === 'volume' && showVolumeControls ? (
              <div id={smallControlsId} className={`flex items-end ${tvControlClusterGap}`}>
                <TvVolumeControls
                  theme={theme}
                  isMuted={isMuted}
                  volume={volume}
                  canSetVolume={canSetVolume}
                  orientation="vertical"
                  canMuteVolume={false}
                  controlStyle={controlStyle}
                  iconClassName={iconClassName}
                  tvIconClass={tvIconClass}
                  tvControlClusterGap={tvControlClusterGap}
                  onToggleMute={onToggleMute}
                  onVolumeChange={onVolumeChange}
                  onVolumeInteractionStart={onVolumeInteractionStart}
                  onVolumeInteractionEnd={onVolumeInteractionEnd}
                />
                {tvMuteButton}
              </div>
            ) : null}
            {smallControls === 'channel' && showChannelControls ? (
              <div id={smallControlsId}>
                <TvChannelControls
                  theme={theme}
                  orientation="vertical"
                  showLabels
                  remoteAvailable={remoteAvailable}
                  controlStyle={controlStyle}
                  iconClassName={iconClassName}
                  tvIconClass={tvIconClass}
                  tvControlClusterGap={tvControlClusterGap}
                  onRemoteCommand={onRemoteCommand}
                />
              </div>
            ) : null}
            {!smallControls && showVolumeControls ? (
              <TvControlButton
                theme={theme}
                label={t('media.tv.volumeControls')}
                aria-expanded={smallControls === 'volume'}
                aria-controls={smallControls === 'volume' ? smallControlsId : undefined}
                style={controlStyle}
                iconClassName={iconClassName}
                onPress={() =>
                  setSmallControls((current) => (current === 'volume' ? null : 'volume'))
                }
              >
                <Volume2 className={tvIconClass} />
              </TvControlButton>
            ) : null}
            {!smallControls && showChannelControls ? (
              <TvControlButton
                theme={theme}
                label={t('media.tv.channelControls')}
                aria-expanded={smallControls === 'channel'}
                aria-controls={smallControls === 'channel' ? smallControlsId : undefined}
                style={controlStyle}
                iconClassName={iconClassName}
                onPress={() =>
                  setSmallControls((current) => (current === 'channel' ? null : 'channel'))
                }
              >
                <ChevronsUpDown className={tvIconClass} />
              </TvControlButton>
            ) : null}
            <div className="ml-auto">{tvSettingsButton}</div>
          </div>
        </div>
      </div>
    );
  }

  if (size === 'medium-vertical') {
    return (
      <div data-tv-card-root className="relative flex h-full flex-col">
        {header}
        <div className={`flex min-h-0 flex-1 flex-col ${tvSectionStackGap}`}>
          <div className="relative h-32 shrink-0">
            <div className="absolute inset-0 flex items-center justify-center">
              {renderDpadInline()}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 [&_button]:pointer-events-auto [&>div]:h-full [&>div]:justify-between">
              {volumeControls}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 [&_button]:pointer-events-auto [&>div]:h-full [&>div]:justify-between">
              {channelControls}
            </div>
          </div>
          <div
            className={`grid grid-cols-[auto_minmax(0,1fr)_auto] justify-items-center ${tvControlClusterGap}`}
          >
            {transportControls}
            {tvMuteButton}
          </div>
          <div className={`mt-auto flex min-w-0 items-center ${tvControlClusterGap}`}>
            {sourceSelector}
            {tvSettingsButton}
          </div>
        </div>
      </div>
    );
  }

  if (size === 'large' || size === 'extra-large') {
    return (
      <div data-tv-card-root className="relative flex h-full flex-col">
        {header}
        <div
          data-tv-control-viewport
          className="relative flex min-h-0 flex-1 flex-col gap-8 overflow-auto"
        >
          <div className="flex min-h-fit flex-1 items-end justify-center pb-1 pt-1">
            <div className={`flex shrink-0 items-center justify-center ${tvControlClusterGap}`}>
              <div className={`flex flex-col ${tvControlClusterGap}`}>
                {volumeControls}
                {tvMuteButton}
              </div>
              {renderDpadInline()}
              {channelControls}
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 flex-col gap-4">{quickRow}</div>
        </div>
      </div>
    );
  }

  return (
    <div data-tv-card-root className="relative flex h-full flex-col">
      {renderDpadOverlay()}
      {showRemoteControls ? <div className="pr-28">{header}</div> : header}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col pr-28">
          <div className="mt-auto flex flex-col gap-3">{utilityControls}</div>
        </div>
      </div>
      <div className={isSmallTvCard ? 'pt-2' : 'pt-3'}>{quickRow}</div>
    </div>
  );
}
