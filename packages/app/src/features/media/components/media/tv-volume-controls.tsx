import type { TvRemoteAction } from '@navet/app/features/media/tv-remote-commands';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { ChevronDown, ChevronUp, Minus, Plus, Volume2, VolumeX } from 'lucide-react';
import type { CSSProperties } from 'react';
import { TvControlButton } from './tv-control-button';

interface TvVolumeControlsProps {
  orientation?: 'horizontal' | 'vertical';
  theme: ThemeType;
  isMuted: boolean;
  volume: number;
  canSetVolume: boolean;
  canMuteVolume: boolean;
  controlStyle: CSSProperties;
  iconClassName: string;
  tvIconClass: string;
  tvControlClusterGap: string;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onVolumeInteractionStart: () => void;
  onVolumeInteractionEnd: () => void;
}

export function TvVolumeControls({
  orientation = 'horizontal',
  theme,
  isMuted,
  volume,
  canSetVolume,
  canMuteVolume,
  controlStyle,
  iconClassName,
  tvIconClass,
  tvControlClusterGap,
  onToggleMute,
  onVolumeChange,
  onVolumeInteractionStart,
  onVolumeInteractionEnd,
}: TvVolumeControlsProps) {
  const { t } = useI18n();

  const updateVolume = (nextVolume: number) => {
    onVolumeInteractionStart();
    onVolumeChange(nextVolume);
    onVolumeInteractionEnd();
  };

  const handleVolumeUp = () => updateVolume(Math.min(100, volume + 10));
  const handleVolumeDown = () => updateVolume(Math.max(0, volume - 10));

  if (!canSetVolume && !canMuteVolume) {
    return null;
  }

  const down = canSetVolume ? (
    <TvControlButton
      theme={theme}
      size="small"
      label={t('media.volumeDown')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={handleVolumeDown}
    >
      <Minus className={tvIconClass} />
    </TvControlButton>
  ) : null;
  const mute = canMuteVolume ? (
    <TvControlButton
      theme={theme}
      size="small"
      label={isMuted ? t('media.unmuteVolume') : t('media.muteVolume')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={onToggleMute}
    >
      {isMuted ? <VolumeX className={tvIconClass} /> : <Volume2 className={tvIconClass} />}
    </TvControlButton>
  ) : null;
  const up = canSetVolume ? (
    <TvControlButton
      theme={theme}
      size="small"
      label={t('media.volumeUp')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={handleVolumeUp}
    >
      <Plus className={tvIconClass} />
    </TvControlButton>
  ) : null;
  return (
    <div
      className={`flex min-w-0 items-center ${tvControlClusterGap} ${orientation === 'vertical' ? 'flex-col' : ''}`}
    >
      {orientation === 'vertical' ? up : down}
      {mute}
      {orientation === 'vertical' ? down : up}
    </div>
  );
}

interface TvChannelControlsProps {
  orientation?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  theme: ThemeType;
  remoteAvailable: boolean;
  controlStyle: CSSProperties;
  iconClassName: string;
  tvIconClass: string;
  tvControlClusterGap: string;
  onRemoteCommand: (action: TvRemoteAction) => void;
}

export function TvChannelControls({
  orientation = 'horizontal',
  showLabels = false,
  theme,
  remoteAvailable,
  controlStyle,
  iconClassName,
  tvIconClass,
  tvControlClusterGap,
  onRemoteCommand,
}: TvChannelControlsProps) {
  const { t } = useI18n();
  if (!remoteAvailable) {
    return null;
  }

  const down = (
    <TvControlButton
      theme={theme}
      size="small"
      label={t('media.remote.channelDown')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={() => onRemoteCommand('channelDown')}
    >
      {showLabels ? (
        <span className="text-xs">{t('media.remote.channelDownShort')}</span>
      ) : (
        <ChevronDown className={tvIconClass} />
      )}
    </TvControlButton>
  );
  const up = (
    <TvControlButton
      theme={theme}
      size="small"
      label={t('media.remote.channelUp')}
      style={controlStyle}
      iconClassName={iconClassName}
      onPress={() => onRemoteCommand('channelUp')}
    >
      {showLabels ? (
        <span className="text-xs">{t('media.remote.channelUpShort')}</span>
      ) : (
        <ChevronUp className={tvIconClass} />
      )}
    </TvControlButton>
  );
  return (
    <div
      className={`flex min-w-0 items-center ${tvControlClusterGap} ${orientation === 'vertical' ? 'flex-col' : ''}`}
    >
      {orientation === 'vertical' ? up : down}
      {orientation === 'vertical' ? down : up}
    </div>
  );
}
