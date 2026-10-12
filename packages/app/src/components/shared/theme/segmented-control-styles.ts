import type { ThemeType } from '@navet/app/hooks/use-theme';
import { getRoundControlStyles } from './round-control-styles';
import { getThemeSurfaceTokens } from './theme-surface-tokens';

/** The device mode selector is the reference for card-dialog tabs. */
export function getSegmentedControlStyles(theme: ThemeType) {
  const surface = getThemeSurfaceTokens(theme);
  return {
    shell: `min-w-0 gap-1 rounded-full border p-1 ${surface.border}`,
    option:
      'relative flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-xs',
    button: getRoundControlStyles(theme).softButton,
  };
}

export function getSegmentedControlSelectionStyle(color: string) {
  return { border: `1px solid ${color}`, backgroundColor: `${color}12` };
}

/** Preserve the appearance of tabs outside card dialogs. */
export function getTabSelectionStyle(color: string) {
  return {
    borderColor: `${color}55`,
    backgroundColor: `${color}12`,
    boxShadow: `inset 0 0 0 1px ${color}22`,
  };
}
