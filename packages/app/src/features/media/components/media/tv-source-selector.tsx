import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { ChevronDown, MonitorPlay, Music2, Play, Radio, Tv2 } from 'lucide-react';
import type { CSSProperties } from 'react';

interface TvSourceSelectorProps {
  source?: string;
  sourceList: string[];
  isSmallTvCard: boolean;
  constrainCardWidth?: boolean;
  compactCardSelector?: boolean;
  hideBadge?: boolean;
  fillAvailableWidth?: boolean;
  theme: ThemeType;
  panelStyle: CSSProperties;
  tvTextTokens: {
    titleColor: string;
    subtitleColor: string;
  };
  onSelectSource: (source: string) => void;
}

export function TvSourceSelector({
  source,
  sourceList,
  isSmallTvCard,
  constrainCardWidth = false,
  compactCardSelector = false,
  hideBadge = false,
  fillAvailableWidth = false,
  theme,
  panelStyle,
  tvTextTokens,
  onSelectSource,
}: TvSourceSelectorProps) {
  const { t } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const sourceLabel =
    source &&
    source.trim().length > 0 &&
    source !== t('media.nothingPlaying') &&
    source !== t('media.nothingPlayingDescription')
      ? source
      : 'Source';
  const useCompactCardSelector = isSmallTvCard || compactCardSelector;
  const sourceBadge = getTvSourceBadge(sourceLabel, useCompactCardSelector, theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={`flex max-w-full min-w-0 items-center rounded-full border backdrop-blur-xl ${fillAvailableWidth ? 'flex-1' : ''} ${
            isSmallTvCard
              ? 'h-8 w-[72px] gap-1 px-1'
              : useCompactCardSelector
                ? 'h-8 w-[112px] gap-1 px-2'
                : constrainCardWidth
                  ? 'h-8 w-[140px] gap-1.5 px-2.5'
                  : 'h-8 max-w-full gap-1.5 px-2.5'
          }`}
          style={panelStyle}
        >
          {hideBadge ? null : (
            <span
              className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sourceBadge.badgeClassName}`}
              aria-hidden="true"
            >
              {sourceBadge.kind === 'icon' ? (
                <sourceBadge.Icon className={`${sourceBadge.iconClassName} text-inherit`} />
              ) : (
                <span className={sourceBadge.textClassName}>{sourceBadge.shortLabel}</span>
              )}
            </span>
          )}
          <span
            className={`min-w-0 flex-1 truncate font-medium ${
              isSmallTvCard
                ? 'text-[0.63rem]'
                : useCompactCardSelector
                  ? 'text-[0.66rem]'
                  : 'text-xs'
            }`}
            style={{ color: tvTextTokens.titleColor }}
          >
            {sourceLabel}
          </span>
          <ChevronDown
            className={`shrink-0 ${useCompactCardSelector ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
            style={{ color: tvTextTokens.subtitleColor }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={`min-w-44 rounded-xl border backdrop-blur-xl ${surface.border} ${surface.panel} ${surface.textPrimary}`}
        onClick={(event) => event.stopPropagation()}
      >
        {sourceList.length > 0 ? (
          sourceList.map((entry) => (
            <DropdownMenuItem key={entry} onClick={() => onSelectSource(entry)}>
              <TvSourceMenuItemContent entry={entry} theme={theme} />
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>{sourceLabel}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type TvSourceBadge =
  | {
      kind: 'icon';
      Icon: typeof Tv2;
      badgeClassName: string;
      iconClassName: string;
    }
  | {
      kind: 'text';
      shortLabel: string;
      badgeClassName: string;
      textClassName: string;
    };

function getTvSourceBadge(sourceLabel: string, compact: boolean, theme: ThemeType): TvSourceBadge {
  const normalized = sourceLabel.trim().toLowerCase();
  const squareBadge = compact ? 'h-4.5 w-4.5' : 'h-5 w-5';
  const wideBadge = compact ? 'h-4.5 w-6' : 'h-5 w-6.5';
  const compactIconClassName = compact ? 'h-2.5 w-2.5' : 'h-3 w-3';

  if (normalized.includes('youtube')) {
    return {
      kind: 'icon',
      Icon: Play,
      badgeClassName: `${wideBadge} bg-[#ff0033] text-white`,
      iconClassName: `${compactIconClassName} fill-current`,
    };
  }

  if (normalized.includes('netflix')) {
    return {
      kind: 'text',
      shortLabel: 'N',
      badgeClassName: `${squareBadge} bg-[#0b0b0f] text-[#e50914]`,
      textClassName: `${compact ? 'text-[0.56rem]' : 'text-[0.64rem]'} font-black tracking-[-0.06em]`,
    };
  }

  if (normalized.includes('spotify')) {
    return {
      kind: 'icon',
      Icon: Music2,
      badgeClassName: `${squareBadge} bg-[#1ed760] text-[#08140c]`,
      iconClassName: compactIconClassName,
    };
  }

  if (normalized.includes('apple tv')) {
    return {
      kind: 'text',
      shortLabel: 'tv',
      badgeClassName:
        theme === 'light'
          ? `${squareBadge} border border-slate-300/90 bg-white text-black`
          : `${squareBadge} bg-white text-black`,
      textClassName: `${compact ? 'text-[0.5rem]' : 'text-[0.56rem]'} font-bold lowercase tracking-[-0.04em]`,
    };
  }

  if (normalized.includes('prime')) {
    return {
      kind: 'text',
      shortLabel: 'P',
      badgeClassName: `${squareBadge} bg-[#00a8e1] text-white`,
      textClassName: `${compact ? 'text-[0.56rem]' : 'text-[0.64rem]'} font-black`,
    };
  }

  if (normalized.includes('disney')) {
    return {
      kind: 'text',
      shortLabel: 'D+',
      badgeClassName: `${squareBadge} bg-[#0f214a] text-white`,
      textClassName: `${compact ? 'text-[0.44rem]' : 'text-[0.5rem]'} font-bold tracking-[-0.06em]`,
    };
  }

  if (normalized.includes('hulu')) {
    return {
      kind: 'text',
      shortLabel: 'H',
      badgeClassName: `${squareBadge} bg-[#1ce783] text-[#04110a]`,
      textClassName: `${compact ? 'text-[0.56rem]' : 'text-[0.64rem]'} font-black`,
    };
  }

  if (normalized.includes('plex')) {
    return {
      kind: 'text',
      shortLabel: 'P',
      badgeClassName: `${squareBadge} bg-[#121212] text-[#f9be03]`,
      textClassName: `${compact ? 'text-[0.56rem]' : 'text-[0.64rem]'} font-black`,
    };
  }

  if (normalized.includes('radio')) {
    return {
      kind: 'icon',
      Icon: Radio,
      badgeClassName: `${squareBadge} bg-[#24313f] text-white`,
      iconClassName: compactIconClassName,
    };
  }

  if (normalized.includes('chromecast')) {
    return {
      kind: 'icon',
      Icon: MonitorPlay,
      badgeClassName: `${squareBadge} bg-[#1a73e8] text-white`,
      iconClassName: compactIconClassName,
    };
  }

  return {
    kind: 'icon',
    Icon: Tv2,
    badgeClassName:
      theme === 'light'
        ? `${squareBadge} border border-slate-300/90 bg-white text-slate-700`
        : `${squareBadge} bg-white/12 text-white`,
    iconClassName: compactIconClassName,
  };
}

function TvSourceMenuItemContent({ entry, theme }: { entry: string; theme: ThemeType }) {
  const sourceBadge = getTvSourceBadge(entry, true, theme);

  return (
    <>
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sourceBadge.badgeClassName}`}
        aria-hidden="true"
      >
        {sourceBadge.kind === 'icon' ? (
          <sourceBadge.Icon className={`${sourceBadge.iconClassName} text-inherit`} />
        ) : (
          <span className={sourceBadge.textClassName}>{sourceBadge.shortLabel}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry}</span>
    </>
  );
}
