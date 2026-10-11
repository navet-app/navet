import type { ThemeColors, ThemeType } from '@navet/app/hooks/use-theme';
import type { CardSize } from '../card-size-selector';
import { getCardShellSurfaceTokens } from './card-shell-surface-tokens';
import {
  getCardStateSurfaceStyleTokens,
  getCardStateSurfaceTokens,
} from './card-state-surface-tokens';

/** Use the standard switch-on surface for a fully open device. */
export function getOpenDeviceCardSurface(
  theme: ThemeType,
  colors: ThemeColors['switch']['on'],
  accentColor: string,
  size: CardSize
) {
  const shell = getCardShellSurfaceTokens(theme);
  const state = getCardStateSurfaceTokens(theme, true);
  const blackSurface = getCardStateSurfaceStyleTokens({
    theme,
    isActive: true,
    baseColor: accentColor,
    borderAlphaHex: '47',
  });
  const compact = size === 'tiny' || size === 'extra-small';
  return {
    frameClassName: `${shell.rootFrameClassName} bg-linear-to-br ${colors.gradient} ${colors.border} ${state.containerClassName}`,
    style: blackSurface.cardStyle,
    disableDefaultSheen: true,
    disableDefaultLightOverlay: true,
    overlay: (
      <>
        <div
          className={`absolute inset-0 bg-linear-to-br ${colors.glow} to-transparent ${compact ? 'opacity-90' : ''}`}
        />
        {theme === 'light' ? (
          <div className={`absolute inset-0 ${compact ? 'bg-white/58' : 'bg-white/60'}`} />
        ) : null}
        {blackSurface.innerOverlayClassName ? (
          <div
            className={blackSurface.innerOverlayClassName}
            style={blackSurface.innerOverlayStyle}
          />
        ) : null}
        {shell.sheenOverlayClassName ? <div className={shell.sheenOverlayClassName} /> : null}
        {blackSurface.shineOverlayClassName ? (
          <div className={blackSurface.shineOverlayClassName} />
        ) : null}
        {state.overlayClassName ? (
          <div className={`absolute inset-0 ${state.overlayClassName}`} />
        ) : null}
      </>
    ),
  };
}
