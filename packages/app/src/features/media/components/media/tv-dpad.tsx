import { getMediaControlSurfaceTokens } from '@navet/app/components/shared/theme/media-widget-surface-tokens';
import type { TvRemoteAction } from '@navet/app/features/media/tv-remote-commands';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { type CSSProperties, useLayoutEffect, useRef } from 'react';
import { TvControlButton } from './tv-control-button';

type TvDpadLayoutConfig = {
  shell: string;
  outerInset: string;
  innerInset: string;
  buttonSize: 'small' | 'large';
  centerSize: 'small' | 'medium' | 'large';
  edgeInset: number;
  centerClassName: string;
  crosshairMarginPx: number;
  edgeIconClassName: string;
  centerOkTextClassName: string;
};

const TV_DPAD_LAYOUT_DEFAULT = {
  shell: 'h-[104px] w-[104px] rounded-[22px]',
  outerInset: 'inset-0',
  innerInset: 'inset-[27px]',
  buttonSize: 'small' as const,
  centerSize: 'medium' as const,
  edgeInset: 0,
  centerClassName: 'h-9 w-9',
  crosshairMarginPx: 32,
  edgeIconClassName: 'h-4 w-4',
  centerOkTextClassName: '!text-xs !font-semibold',
} as const;

const TV_DPAD_LAYOUT_LARGE_CARD = {
  shell: 'h-[136px] w-[136px] rounded-[28px]',
  outerInset: 'inset-0',
  innerInset: 'inset-[35px]',
  buttonSize: 'large' as const,
  centerSize: 'large' as const,
  edgeInset: 0,
  centerClassName: 'h-11 w-11',
  crosshairMarginPx: 42,
  edgeIconClassName: 'h-5 w-5',
  centerOkTextClassName: '!text-xs !font-semibold',
} as const;

export function getTvDpadLayout(
  size: 'small' | 'medium' | 'medium-vertical' | 'large' | 'extra-large'
): TvDpadLayoutConfig {
  if (size === 'large' || size === 'extra-large') {
    return TV_DPAD_LAYOUT_LARGE_CARD;
  }
  return TV_DPAD_LAYOUT_DEFAULT;
}

interface TvDpadProps {
  theme: ThemeType;
  remoteAvailable: boolean;
  style: CSSProperties;
  shellStyle: CSSProperties;
  layout: TvDpadLayoutConfig;
  onRemoteCommand: (action: TvRemoteAction) => void;
}

export function TvDpad({
  theme,
  remoteAvailable,
  style,
  shellStyle,
  layout,
  onRemoteCommand,
}: TvDpadProps) {
  const { t } = useI18n();
  const d = layout;
  const padRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const buttons = pad.querySelectorAll('button');
    const direction = buttons[0];
    const center = buttons[4];
    if (!direction || !center) return;
    const separateTargets = () => {
      if (!pad.clientWidth || !pad.clientHeight) return;
      // Keep the shell and center fixed. Move cardinal buttons outward only
      // when their actual rendered sizes would intersect the center target.
      const x = Math.min(
        d.edgeInset,
        (pad.clientWidth - center.offsetWidth) / 2 - direction.offsetWidth
      );
      const y = Math.min(
        d.edgeInset,
        (pad.clientHeight - center.offsetHeight) / 2 - direction.offsetHeight
      );
      pad.style.setProperty('--tv-dpad-edge-x', `${x}px`);
      pad.style.setProperty('--tv-dpad-edge-y', `${y}px`);
    };
    separateTargets();
    const observer = new ResizeObserver(separateTargets);
    observer.observe(pad);
    observer.observe(direction);
    observer.observe(center);
    return () => observer.disconnect();
  }, [d.edgeInset]);
  const mediaControlSurface = getMediaControlSurfaceTokens(theme);

  const iconClassName = mediaControlSurface.iconClassName;
  const disabled = !remoteAvailable;
  const crosshairStyle = {
    backgroundColor: mediaControlSurface.crosshairBg,
  };

  return (
    <div ref={padRef} className={`relative shrink-0 ${d.shell}`}>
      <div
        className={`pointer-events-none absolute ${d.outerInset} rounded-full border`}
        style={shellStyle}
      />
      <div
        className={`pointer-events-none absolute ${d.innerInset} rounded-full border`}
        style={shellStyle}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          borderColor: mediaControlSurface.buttonBorder.replace('0.1', '0.05'),
        }}
      />

      <div className="absolute inset-0">
        <TvControlButton
          theme={theme}
          size={d.buttonSize}
          label={t('media.remote.up')}
          disabled={disabled}
          className="absolute left-1/2 -translate-x-1/2"
          style={{ ...style, top: `var(--tv-dpad-edge-y, ${d.edgeInset}px)` }}
          iconClassName={iconClassName}
          onPress={() => onRemoteCommand('up')}
        >
          <ChevronUp className={d.edgeIconClassName} />
        </TvControlButton>
        <TvControlButton
          theme={theme}
          size={d.buttonSize}
          label={t('media.remote.left')}
          disabled={disabled}
          style={{ ...style, left: `var(--tv-dpad-edge-x, ${d.edgeInset}px)` }}
          className="absolute top-1/2 -translate-y-1/2"
          iconClassName={iconClassName}
          onPress={() => onRemoteCommand('left')}
        >
          <ChevronLeft className={d.edgeIconClassName} />
        </TvControlButton>
        <TvControlButton
          theme={theme}
          size={d.buttonSize}
          label={t('media.remote.right')}
          disabled={disabled}
          style={{ ...style, right: `var(--tv-dpad-edge-x, ${d.edgeInset}px)` }}
          className="absolute top-1/2 -translate-y-1/2"
          iconClassName={iconClassName}
          onPress={() => onRemoteCommand('right')}
        >
          <ChevronRight className={d.edgeIconClassName} />
        </TvControlButton>
        <TvControlButton
          theme={theme}
          size={d.buttonSize}
          label={t('media.remote.down')}
          disabled={disabled}
          style={{ ...style, bottom: `var(--tv-dpad-edge-y, ${d.edgeInset}px)` }}
          className="absolute left-1/2 -translate-x-1/2"
          iconClassName={iconClassName}
          onPress={() => onRemoteCommand('down')}
        >
          <ChevronDown className={d.edgeIconClassName} />
        </TvControlButton>
        <TvControlButton
          theme={theme}
          size={d.centerSize}
          label={t('media.remote.select')}
          disabled={disabled}
          style={style}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${d.centerClassName}`}
          iconClassName={`${iconClassName} ${d.centerOkTextClassName}`}
          onPress={() => onRemoteCommand('select')}
        >
          OK
        </TvControlButton>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 w-px -translate-x-1/2 -translate-y-1/2"
        style={{
          ...crosshairStyle,
          opacity: 0.4,
          height: `calc(100% - ${d.crosshairMarginPx}px)`,
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2"
        style={{
          ...crosshairStyle,
          opacity: 0.4,
          width: `calc(100% - ${d.crosshairMarginPx}px)`,
        }}
      />
    </div>
  );
}
